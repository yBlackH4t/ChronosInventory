from __future__ import annotations

from typing import Any, Optional
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse


def ok(data: Any, meta: Optional[object] = None, status_code: int = 200) -> JSONResponse:
    payload = {
        "data": data,
        "meta": meta,
    }
    return JSONResponse(status_code=status_code, content=jsonable_encoder(payload))


def fail(status_code: int, code: str, message: str, details: Optional[object] = None, request_id: Optional[str] = None) -> JSONResponse:
    payload = {
        "error": {
            "code": code,
            "message": message,
            "details": details,
        }
    }
    response = JSONResponse(status_code=status_code, content=jsonable_encoder(payload))
    if request_id:
        response.headers["X-Request-ID"] = request_id
    return response
