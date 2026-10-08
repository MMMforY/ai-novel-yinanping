import asyncio
import time
from collections import deque
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from fastapi.responses import JSONResponse

from .contracts import ErrorResult, GenerationRequest, GenerationResult, ServiceConfig
from .model import ModelAdapter, ModelError
from .settings import Settings


class RequestBoundary:
    """Bound request memory before JSON parsing, and validate explicit origins."""
    def __init__(self, app, origins):
        self.app, self.origins = app, origins

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["path"] != "/api/generate" or scope["method"] != "POST":
            return await self.app(scope, receive, send)
        headers = dict(scope["headers"])
        origin = headers.get(b"origin", b"").decode("latin1")
        if origin and origin not in self.origins:
            return await JSONResponse({"error": "这个页面来源未被允许。"}, status_code=403)(scope, receive, send)
        if not headers.get(b"content-type", b"").lower().startswith(b"application/json"):
            return await JSONResponse({"error": "请使用 JSON 请求。"}, status_code=415)(scope, receive, send)
        chunks, size = [], 0
        while True:
            event = await receive()
            if event["type"] == "http.disconnect":
                return
            size += len(event.get("body", b""))
            if size > 512_000:
                return await JSONResponse({"error": "输入过大，本次请求最多支持 500KB。"}, status_code=413)(scope, receive, send)
            chunks.append(event)
            if not event.get("more_body"):
                break

        async def replay():
            return chunks.pop(0) if chunks else await receive()

        await self.app(scope, replay, send)


class GenerationBudget:
    def __init__(self, settings):
        self.settings, self.active, self.recent = settings, 0, deque()

    @asynccontextmanager
    async def slot(self):
        now = time.monotonic()
        while self.recent and self.recent[0] <= now - 60:
            self.recent.popleft()
        if self.active >= self.settings.max_concurrent:
            raise ModelError("正在生成的故事较多，请稍后重试。", 429)
        if len(self.recent) >= self.settings.requests_per_minute:
            raise ModelError("本分钟的生成次数已达上限，请稍后重试。", 429)
        self.recent.append(now)
        self.active += 1
        try:
            yield
        finally:
            self.active -= 1


async def generate_with_disconnect(request, adapter, body):
    stopping = asyncio.Event()
    async def disconnected():
        while not stopping.is_set():
            await asyncio.sleep(.1)
            if await request.is_disconnected():
                return

    task = asyncio.create_task(adapter.generate(body))
    watcher = asyncio.create_task(disconnected())
    try:
        done, _ = await asyncio.wait({task, watcher}, return_when=asyncio.FIRST_COMPLETED)
        if watcher in done and task not in done:
            raise ModelError("已取消这次生成。", 499)
        return await task
    finally:
        stopping.set()
        for pending in (task, watcher):
            if not pending.done():
                pending.cancel()
        await asyncio.gather(task, watcher, return_exceptions=True)


def create_app(settings: Settings | None = None, transport=None):
    settings = settings or Settings.from_env()

    @asynccontextmanager
    async def lifespan(app):
        async with httpx.AsyncClient(
            transport=transport, follow_redirects=False,
            limits=httpx.Limits(max_connections=8, max_keepalive_connections=4),
        ) as client:
            app.state.adapter = ModelAdapter(settings, client)
            yield

    app = FastAPI(
        title="迭页生成 API", version="1.0.0", lifespan=lifespan,
        description="故事和世界线由浏览器管理；本服务处理创建、改写和续写，密钥仅在服务端使用。",
        docs_url="/api/docs", redoc_url=None, openapi_url="/api/openapi.json",
    )
    app.state.budget = GenerationBudget(settings)
    app.add_middleware(RequestBoundary, origins=settings.origins)
    app.add_middleware(CORSMiddleware, allow_origins=list(settings.origins),
                       allow_methods=["GET", "POST"], allow_headers=["Content-Type"])

    @app.exception_handler(RequestValidationError)
    async def invalid_input(_request, _error):
        return JSONResponse({"error": "输入超出范围或格式不正确。故事和输入已保留。"}, status_code=400)

    @app.exception_handler(ModelError)
    async def model_failure(_request, error):
        return JSONResponse({"error": error.message}, status_code=error.status,
                            headers={"Retry-After": "60"} if error.status == 429 else None)

    @app.exception_handler(Exception)
    async def internal_error(_request, _error):
        return JSONResponse({"error": "服务遇到问题，请稍后重试。"}, status_code=500)

    @app.get("/api/health", summary="检查服务存活")
    async def health():
        return {"status": "ok", "service": "dieye", "release": settings.release,
                "mode": settings.config().mode}

    @app.get("/api/config", response_model=ServiceConfig, summary="读取模型配置状态")
    async def config():
        return settings.config()

    @app.post(
        "/api/generate", response_model=GenerationResult, response_model_exclude_none=True,
        summary="创建、改写或续写小说正文",
        responses={status: {"model": ErrorResult} for status in (400, 403, 413, 415, 429, 499, 502, 503)},
    )
    async def generate(body: GenerationRequest, request: Request):
        if not settings.config().ready:
            raise ModelError(settings.config().message, 503)
        async with app.state.budget.slot():
            return await generate_with_disconnect(request, app.state.adapter, body)

    def openapi():
        if not app.openapi_schema:
            schema = get_openapi(title=app.title, version=app.version, description=app.description, routes=app.routes)
            schema["paths"]["/api/generate"]["post"]["responses"].pop("422", None)
            app.openapi_schema = schema
        return app.openapi_schema

    app.openapi = openapi
    return app


load_dotenv(Path(__file__).resolve().parents[1] / ".env")
app = create_app()
