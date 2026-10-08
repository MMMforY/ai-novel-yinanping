from typing import Literal

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

Operation = Literal["create", "rewrite", "continue"]
ChangeMode = Literal["minimal", "reasonable", "new-world"]


def utf16_length(text: str) -> int:
    """Browser Range offsets use UTF-16 units, including two units for emoji."""
    return sum(2 if ord(char) > 0xFFFF else 1 for char in text)


def bounded(text: str, maximum: int) -> str:
    if utf16_length(text) > maximum or any(0xD800 <= ord(c) <= 0xDFFF for c in text):
        raise ValueError("text exceeds limit or contains invalid Unicode")
    return text


class Context(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    before: str
    selected: str
    after: str
    background: str
    genres: list[str]

    @field_validator("before", "after")
    @classmethod
    def body_limit(cls, value: str) -> str:
        return bounded(value, 120_000)

    @field_validator("selected")
    @classmethod
    def selection_limit(cls, value: str) -> str:
        return bounded(value, 2_000)

    @field_validator("background")
    @classmethod
    def background_limit(cls, value: str) -> str:
        return bounded(value, 1_200)

    @field_validator("genres")
    @classmethod
    def genre_limit(cls, values: list[str]) -> list[str]:
        if len(values) > 3:
            raise ValueError("too many genres")
        return [bounded(value, 10) for value in values]

    @model_validator(mode="after")
    def combined_limit(self):
        if sum(utf16_length(v) for v in (self.before, self.selected, self.after)) > 120_000:
            raise ValueError("combined context exceeds limit")
        return self


class GenerationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    operation: Operation
    versionId: str | None = None
    title: str
    intent: str
    mode: ChangeMode
    context: Context

    @field_validator("title")
    @classmethod
    def title_limit(cls, value: str) -> str:
        return bounded(value, 80)

    @field_validator("intent")
    @classmethod
    def intent_limit(cls, value: str) -> str:
        return bounded(value, 600)

    @field_validator("versionId")
    @classmethod
    def version_limit(cls, value: str | None):
        return bounded(value, 100) if value is not None else None

    @model_validator(mode="after")
    def required_intent(self):
        if self.operation != "continue" and not self.intent.strip():
            raise ValueError("intent is required")
        if self.operation == "rewrite" and not self.context.selected.strip():
            raise ValueError("selection is required")
        return self


class GenerationResult(BaseModel):
    title: str
    text: str
    mode: Literal["demo", "live"]
    model: str | None = None


class ServiceConfig(BaseModel):
    mode: Literal["demo", "live"]
    ready: bool
    message: str
    contextChars: int


class ErrorResult(BaseModel):
    error: str
