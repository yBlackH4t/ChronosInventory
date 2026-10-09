from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from app.services.assistant_chat_service import AssistantChatService, AssistantUnavailableError
from backend.app.api.deps import get_assistant_chat_service
from backend.app.api.responses import fail, ok
from backend.app.schemas.assistant import AssistantConfigIn, AssistantConfigOut, ChatIn, ChatOut
from backend.app.schemas.common import SuccessResponse

router = APIRouter(prefix="/assistente", tags=["assistente"])


@router.post("/chat", response_model=SuccessResponse[ChatOut])
def chat(
    payload: ChatIn,
    request: Request,
    service: AssistantChatService = Depends(get_assistant_chat_service),
):
    if not payload.mensagem.strip():
        return fail(422, "validation_error", "Digite uma pergunta.", None, getattr(request.state, "request_id", ""))
    try:
        result = service.chat(payload.mensagem, [item.model_dump() for item in payload.historico])
    except AssistantUnavailableError as exc:
        return fail(503, "assistente_indisponivel", str(exc), None, getattr(request.state, "request_id", ""))
    return ok(ChatOut(**result))


@router.get("/config", response_model=SuccessResponse[AssistantConfigOut])
def get_config(service: AssistantChatService = Depends(get_assistant_chat_service)):
    return ok(AssistantConfigOut(**service.status()))


@router.put("/config", response_model=SuccessResponse[AssistantConfigOut])
def update_config(
    payload: AssistantConfigIn,
    service: AssistantChatService = Depends(get_assistant_chat_service),
):
    service.config_store.update(api_key=payload.api_key, modelo=payload.modelo, esforco=payload.esforco)
    return ok(AssistantConfigOut(**service.status()))
