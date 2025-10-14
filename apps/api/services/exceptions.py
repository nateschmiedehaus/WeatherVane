"""Service-level exceptions for the API layer."""
from __future__ import annotations

from typing import Sequence


class SchemaValidationError(Exception):
    """Raised when a payload violates a JSON schema contract."""

    def __init__(
        self,
        message: str,
        *,
        schema: str,
        tenant_id: str | None = None,
        path: Sequence[object] | None = None,
        reason: str | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.schema = schema
        self.tenant_id = tenant_id
        self.path = tuple(path or ())
        self.reason = reason

    def to_detail(self) -> dict[str, object]:
        detail: dict[str, object] = {
            "message": self.message,
            "schema": self.schema,
        }
        if self.tenant_id:
            detail["tenant_id"] = self.tenant_id
        if self.path:
            detail["path"] = list(self.path)
        if self.reason:
            detail["reason"] = self.reason
        return detail


__all__ = ["SchemaValidationError"]
