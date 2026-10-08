import os
from dataclasses import dataclass
from typing import Mapping
from urllib.parse import urlsplit

from .contracts import ServiceConfig


def integer(env: Mapping[str, str], name: str, default: int, minimum: int, maximum: int) -> int:
    try:
        return max(minimum, min(maximum, int(env.get(name, str(default)))))
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    base_url: str = ""
    model: str = ""
    api_key: str = ""
    allow_no_key: bool = False
    context_chars: int = 18_000
    output_tokens: int = 1_800
    token_parameter: str = "max_tokens"
    timeout_seconds: float = 90
    origins: tuple[str, ...] = (
        "http://localhost:5173", "http://127.0.0.1:5173",
        "http://localhost:18787", "http://127.0.0.1:18787",
    )
    max_concurrent: int = 2
    requests_per_minute: int = 60
    release: str = "development"

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None):
        env = os.environ if env is None else env
        return cls(
            base_url=env.get("LLM_BASE_URL", "").strip(),
            model=env.get("LLM_MODEL", "").strip(),
            api_key=env.get("LLM_API_KEY", "").strip(),
            allow_no_key=env.get("LLM_ALLOW_NO_KEY") == "true",
            context_chars=integer(env, "LLM_CONTEXT_CHARS", 18_000, 6_000, 80_000),
            output_tokens=integer(env, "LLM_MAX_OUTPUT_TOKENS", 1_800, 300, 6_000),
            token_parameter="max_completion_tokens" if env.get("LLM_TOKEN_PARAMETER") == "max_completion_tokens" else "max_tokens",
            timeout_seconds=integer(env, "LLM_TIMEOUT_MS", 90_000, 1_000, 180_000) / 1000,
            origins=tuple(s.strip() for s in env.get("SITE_ORIGINS", ",".join(cls.origins)).split(",") if s.strip()),
            max_concurrent=integer(env, "MAX_CONCURRENT_GENERATIONS", 2, 1, 8),
            requests_per_minute=integer(env, "GENERATION_REQUESTS_PER_MINUTE", 60, 1, 600),
            release=env.get("APP_RELEASE", "development"),
        )

    def config(self) -> ServiceConfig:
        configured = bool(self.base_url or self.model or self.api_key or self.allow_no_key)
        if not configured:
            return ServiceConfig(mode="demo", ready=True, message="演示模式 · 使用预设故事片段", contextChars=self.context_chars)
        try:
            url = urlsplit(self.base_url)
            valid_url = url.scheme in ("http", "https") and bool(url.hostname) and not (url.username or url.password or url.query or url.fragment)
        except ValueError:
            valid_url = False
        ready = valid_url and bool(self.model) and bool(self.api_key or self.allow_no_key)
        return ServiceConfig(
            mode="live", ready=ready, contextChars=self.context_chars,
            message="模型配置已就绪 · 生成时请求模型服务" if ready else "模型配置不完整，请检查服务地址、模型名和密钥。",
        )
