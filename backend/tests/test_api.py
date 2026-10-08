import asyncio
import json
import unittest

import httpx
from fastapi.testclient import TestClient
from pydantic import ValidationError

from backend.app import GenerationBudget, create_app, generate_with_disconnect
from backend.contracts import GenerationRequest, utf16_length
from backend.model import ModelAdapter, ModelError, build_messages
from backend.settings import Settings

PAYLOAD = {
    "operation": "rewrite", "versionId": "parent", "title": "雨停之前", "intent": "让她活下来", "mode": "minimal",
    "context": {"before": "苏晚站在渡口。", "selected": "栈桥断开了。", "after": "她没能回来。", "background": "", "genres": []},
}
LIVE = Settings(base_url="http://provider.test/v1", model="fixture", api_key="private-fixture-key")


class ApiTests(unittest.TestCase):
    def test_demo_all_operations_and_schema(self):
        with TestClient(create_app(Settings())) as client:
            self.assertEqual(client.get("/api/health").json()["status"], "ok")
            self.assertEqual(client.get("/api/config").json()["mode"], "demo")
            self.assertIn("/api/generate", client.get("/api/openapi.json").json()["paths"])
            for operation, wish in [("rewrite", "让她活下来"), ("create", "我想看未来来信"), ("continue", "")]:
                response = client.post("/api/generate", json={**PAYLOAD, "operation": operation, "intent": wish})
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()["mode"], "demo")
                self.assertTrue(response.json()["text"])

    def test_partial_configuration_never_falls_back(self):
        with TestClient(create_app(Settings(model="configured"))) as client:
            self.assertFalse(client.get("/api/config").json()["ready"])
            response = client.post("/api/generate", json=PAYLOAD)
            self.assertEqual(response.status_code, 503)
            self.assertNotIn("text", response.json())

    def test_live_protocol_and_private_key_isolation(self):
        received = {}
        def provider(request):
            received["auth"] = request.headers["authorization"]
            received["payload"] = json.loads(request.content)
            self.assertEqual(request.url.path, "/v1/chat/completions")
            return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps({"title": "岸上", "text": "她抓住了救生绳。"}, ensure_ascii=False)}}]})
        with TestClient(create_app(LIVE, httpx.MockTransport(provider))) as client:
            response = client.post("/api/generate", json=PAYLOAD)
            self.assertEqual(response.json()["mode"], "live")
            self.assertNotIn(LIVE.api_key, response.text + client.get("/api/config").text)
        self.assertEqual(received["auth"], "Bearer " + LIVE.api_key)
        prompt = json.loads(received["payload"]["messages"][1]["content"])
        self.assertEqual(prompt["currentVersionId"], "parent")
        self.assertEqual(prompt["selectedPosition"]["start"], utf16_length(PAYLOAD["context"]["before"]))

    def test_provider_error_and_bad_output_never_return_demo(self):
        for reply in [httpx.Response(401, text=LIVE.api_key), httpx.Response(200, json={"choices": []})]:
            with TestClient(create_app(LIVE, httpx.MockTransport(lambda _request: reply))) as client:
                response = client.post("/api/generate", json=PAYLOAD)
                self.assertEqual(response.status_code, 502)
                self.assertNotIn(LIVE.api_key, response.text)
                self.assertNotIn("text", response.json())

    def test_origin_cors_body_size_and_validation(self):
        with TestClient(create_app(Settings())) as client:
            self.assertEqual(client.post("/api/generate", json=PAYLOAD, headers={"Origin": "https://other.test"}).status_code, 403)
            response = client.options("/api/generate", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type"})
            self.assertEqual(response.headers["access-control-allow-origin"], "http://localhost:5173")
            self.assertEqual(client.post("/api/generate", content="bad").status_code, 415)
            self.assertEqual(client.post("/api/generate", content="x" * 512_001, headers={"Content-Type": "application/json"}).status_code, 413)
            response = client.post("/api/generate", json={**PAYLOAD, "intent": ""})
            self.assertEqual(response.status_code, 400)
            self.assertEqual(set(response.json()), {"error"})

    def test_rate_budget_has_recoverable_response(self):
        with TestClient(create_app(Settings(requests_per_minute=1))) as client:
            self.assertEqual(client.post("/api/generate", json=PAYLOAD).status_code, 200)
            response = client.post("/api/generate", json=PAYLOAD)
            self.assertEqual(response.status_code, 429)
            self.assertEqual(response.headers["retry-after"], "60")

    def test_utf16_position_survives_context_windowing(self):
        body = GenerationRequest.model_validate({**PAYLOAD, "context": {**PAYLOAD["context"], "before": "😀" + "前" * 100_000}})
        messages = build_messages(body, 6_000)
        prompt = json.loads(messages[1]["content"])
        self.assertEqual(prompt["selectedPosition"]["start"], 100_002)
        self.assertLessEqual(sum(utf16_length(m["content"]) for m in messages), 6_000)
        with self.assertRaises(ValidationError):
            GenerationRequest.model_validate({**PAYLOAD, "intent": "😀" * 301})


class AsyncTests(unittest.IsolatedAsyncioTestCase):
    async def test_timeout_reports_error(self):
        async def hanging(_request):
            await asyncio.sleep(1)
            return httpx.Response(200)
        async with httpx.AsyncClient(transport=httpx.MockTransport(hanging)) as client:
            adapter = ModelAdapter(Settings(base_url=LIVE.base_url, model=LIVE.model, api_key=LIVE.api_key, timeout_seconds=.01), client)
            with self.assertRaisesRegex(ModelError, "超时"):
                await adapter.generate(GenerationRequest.model_validate(PAYLOAD))

    async def test_disconnection_cancels_upstream_and_releases_slot(self):
        cancelled = asyncio.Event()
        class Adapter:
            async def generate(self, _body):
                try:
                    await asyncio.sleep(30)
                finally:
                    cancelled.set()
        class Request:
            async def is_disconnected(self):
                await asyncio.sleep(.01)
                return True
        budget = GenerationBudget(Settings(max_concurrent=1))
        with self.assertRaises(ModelError):
            async with budget.slot():
                await generate_with_disconnect(Request(), Adapter(), None)
        self.assertTrue(cancelled.is_set())
        self.assertEqual(budget.active, 0)

    async def test_concurrency_rejects_without_queueing_or_leaking_slots(self):
        budget = GenerationBudget(Settings(max_concurrent=1))
        async with budget.slot():
            with self.assertRaises(ModelError):
                async with budget.slot():
                    self.fail("must not enter second slot")
        self.assertEqual(budget.active, 0)
