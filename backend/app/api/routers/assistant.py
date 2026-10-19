from __future__ import annotations

import json
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.services.assistant_admin_service import AssistantAdminService
from app.services.assistant_chat_service import AssistantChatService
from app.services.assistant_common import AssistantUnavailableError
from app.services.assistant_daily_summary_service import AssistantDailySummaryService
from app.services.assistant_history_service import AssistantHistoryService
from app.services.assistant_knowledge_service import AssistantKnowledgeService
from app.services.assistant_knowledge_sync_service import AssistantKnowledgeSyncService
from app.services.assistant_vision_service import MAX_IMAGE_BYTES, AssistantVisionService
from app.services.whatsapp_service import WhatsAppService
from backend.app.api.deps import (
    get_assistant_admin_service,
    get_assistant_chat_service,
    get_assistant_daily_summary_service,
    get_assistant_history_service,
    get_assistant_knowledge_service,
    get_assistant_knowledge_sync_service,
    get_assistant_vision_service,
    get_whatsapp_service,
)
from backend.app.api.responses import fail, ok
from backend.app.schemas.assistant import (
    AdminLoginIn,
    AdminLoginOut,
    AdminPasswordIn,
    AdminWhatsAppPinIn,
    AdminStatusOut,
    AssistantConfigIn,
    AssistantConfigOut,
    AssistantPanelOut,
    ChatHistoryItemIn,
    ChatIn,
    ChatOut,
    ConversationOut,
    CorrectionIn,
    DailySummaryIn,
    DailySummaryOut,
    KnowledgeRuleIn,
    KnowledgeRuleOut,
    KnowledgeSyncOut,
    ProposalOut,
    ReviewItemOut,
    WhatsAppStatusOut,
)
from backend.app.schemas.common import SuccessResponse
from core.catalog.normalization import canonical_code

router = APIRouter(prefix="/assistente", tags=["assistente"])

# Sessao do admin (devolvida por POST /assistente/admin/login).
ADMIN_TOKEN_HEADER = "X-Admin-Token"


def _request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "")


def _admin_token(request: Request) -> Optional[str]:
    return request.headers.get(ADMIN_TOKEN_HEADER)


# ----------------------------------------------------------------------
# Conversa e configuracao da IA
# ----------------------------------------------------------------------


@router.post("/chat", response_model=SuccessResponse[ChatOut])
def chat(
    payload: ChatIn,
    request: Request,
    service: AssistantChatService = Depends(get_assistant_chat_service),
    admin: AssistantAdminService = Depends(get_assistant_admin_service),
):
    if not payload.mensagem.strip():
        return fail(422, "validation_error", "Digite uma pergunta.", None, _request_id(request))
    status = admin.status(_admin_token(request))
    # Sempre responde: se a IA falhar, a busca direta responde e `aviso` explica.
    result = service.chat(
        payload.mensagem,
        [item.model_dump() for item in payload.historico],
        canal=payload.canal,
        autor=payload.autor,
        # "igual" depois de "nao sei": regra na hora para o admin da publicadora; senao, proposta.
        pode_ensinar=bool(status["autenticado"] and status["maquina_publicadora"]),
    )
    return ok(ChatOut(**result))


@router.post("/chat/foto", response_model=SuccessResponse[ChatOut])
def chat_photo(
    request: Request,
    foto: UploadFile = File(...),
    mensagem: str = Form(default="", max_length=1000),
    historico: str = Form(default="[]", max_length=200_000),
    service: AssistantChatService = Depends(get_assistant_chat_service),
    vision: AssistantVisionService = Depends(get_assistant_vision_service),
):
    """Foto da plaqueta: le os codigos e pergunta como se a pessoa tivesse digitado."""
    try:
        reading = vision.read_as_question(foto.file.read(MAX_IMAGE_BYTES + 1))
    except AssistantUnavailableError as exc:
        return fail(422, "foto_ilegivel", str(exc), None, _request_id(request))
    try:
        items = [ChatHistoryItemIn(**item).model_dump() for item in json.loads(historico or "[]")][-40:]
    except (ValueError, TypeError):
        return fail(422, "validation_error", "Histórico inválido.", None, _request_id(request))
    question = "\n".join(part for part in (mensagem.strip(), reading) if part)
    result = service.chat(question, items, canal="app")
    return ok(ChatOut(**result, leitura_foto=reading))


@router.get("/config", response_model=SuccessResponse[AssistantConfigOut])
def get_config(service: AssistantChatService = Depends(get_assistant_chat_service)):
    return ok(AssistantConfigOut(**service.status()))


@router.put("/config", response_model=SuccessResponse[AssistantConfigOut])
def update_config(
    payload: AssistantConfigIn,
    service: AssistantChatService = Depends(get_assistant_chat_service),
):
    service.config_store.update(
        provedor=payload.provedor, api_key=payload.api_key, modelo=payload.modelo, esforco=payload.esforco
    )
    return ok(AssistantConfigOut(**service.status()))


# ----------------------------------------------------------------------
# Admin (maquina publicadora + senha)
# ----------------------------------------------------------------------


@router.get("/admin/status", response_model=SuccessResponse[AdminStatusOut])
def admin_status(request: Request, admin: AssistantAdminService = Depends(get_assistant_admin_service)):
    return ok(AdminStatusOut(**admin.status(_admin_token(request))))


@router.post("/admin/senha", response_model=SuccessResponse[AdminStatusOut])
def admin_set_password(
    payload: AdminPasswordIn,
    request: Request,
    admin: AssistantAdminService = Depends(get_assistant_admin_service),
):
    admin.set_password(payload.senha_nova, payload.senha_atual)
    return ok(AdminStatusOut(**admin.status(_admin_token(request))))


@router.post("/admin/pin-whatsapp", response_model=SuccessResponse[AdminStatusOut])
def admin_set_whatsapp_pin(
    payload: AdminWhatsAppPinIn,
    request: Request,
    admin: AssistantAdminService = Depends(get_assistant_admin_service),
):
    """PIN de /aprovar e /recusar pelo WhatsApp (admin logado na publicadora). pin vazio remove."""
    admin.require(_admin_token(request))
    admin.set_whatsapp_pin(payload.pin)
    return ok(AdminStatusOut(**admin.status(_admin_token(request))))


@router.post("/admin/login", response_model=SuccessResponse[AdminLoginOut])
def admin_login(payload: AdminLoginIn, admin: AssistantAdminService = Depends(get_assistant_admin_service)):
    return ok(AdminLoginOut(**admin.login(payload.senha)))


@router.post("/admin/logout", response_model=SuccessResponse[AdminStatusOut])
def admin_logout(request: Request, admin: AssistantAdminService = Depends(get_assistant_admin_service)):
    admin.logout(_admin_token(request))
    return ok(AdminStatusOut(**admin.status(None)))


# ----------------------------------------------------------------------
# Base de conhecimento do especialista
# ----------------------------------------------------------------------


@router.get("/conhecimento", response_model=SuccessResponse[list[KnowledgeRuleOut]])
def list_knowledge(
    busca: Optional[str] = Query(default=None, max_length=60),
    limite: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    knowledge: AssistantKnowledgeService = Depends(get_assistant_knowledge_service),
):
    return ok([KnowledgeRuleOut(**r) for r in knowledge.list_rules(busca, limite, offset)])


@router.get("/conhecimento/sincronizacao", response_model=SuccessResponse[KnowledgeSyncOut])
def knowledge_sync_status(sync: AssistantKnowledgeSyncService = Depends(get_assistant_knowledge_sync_service)):
    """Publicadora: quando publicou para as outras maquinas. Outras: de onde e quando receberam."""
    return ok(KnowledgeSyncOut(**sync.status()))


@router.post("/conhecimento/sincronizar", response_model=SuccessResponse[KnowledgeSyncOut])
def knowledge_sync_now(sync: AssistantKnowledgeSyncService = Depends(get_assistant_knowledge_sync_service)):
    """"Sincronizar agora": publica de novo (publicadora) ou recebe a versao publicada (outras)."""
    return ok(KnowledgeSyncOut(**sync.sync()))


@router.post("/conhecimento", response_model=SuccessResponse[KnowledgeRuleOut], status_code=201)
def add_knowledge(
    payload: KnowledgeRuleIn,
    request: Request,
    admin: AssistantAdminService = Depends(get_assistant_admin_service),
    knowledge: AssistantKnowledgeService = Depends(get_assistant_knowledge_service),
    history: AssistantHistoryService = Depends(get_assistant_history_service),
    sync: AssistantKnowledgeSyncService = Depends(get_assistant_knowledge_sync_service),
):
    admin.require(_admin_token(request))
    rule = knowledge.add_rule(payload.codigo_a, payload.codigo_b, payload.tipo, payload.observacao)
    # Ensinou o que serve (igual/similar): o codigo sai da lista "Para revisar". "Nao serve" so
    # tira aquela sugestao; o codigo continua na lista ate o admin ensinar o que serve ou concluir.
    if rule["tipo"] != "diferente":
        history.mark_reviewed([canonical_code(payload.codigo_a), canonical_code(payload.codigo_b)])
    sync.publish_in_background()  # vale nas outras maquinas tambem
    return ok(KnowledgeRuleOut(**rule), status_code=201)


@router.delete("/conhecimento/{rule_id}", response_model=SuccessResponse[dict])
def delete_knowledge(
    rule_id: int,
    request: Request,
    admin: AssistantAdminService = Depends(get_assistant_admin_service),
    knowledge: AssistantKnowledgeService = Depends(get_assistant_knowledge_service),
    sync: AssistantKnowledgeSyncService = Depends(get_assistant_knowledge_sync_service),
):
    admin.require(_admin_token(request))
    if not knowledge.remove_rule(rule_id):
        return fail(404, "not_found", "Regra não encontrada.", None, _request_id(request))
    sync.publish_in_background()
    return ok({"removido": True})


# ----------------------------------------------------------------------
# Revisao ("Para revisar") e historico
# ----------------------------------------------------------------------


@router.get("/revisao", response_model=SuccessResponse[list[ReviewItemOut]])
def review_list(
    request: Request,
    admin: AssistantAdminService = Depends(get_assistant_admin_service),
    knowledge: AssistantKnowledgeService = Depends(get_assistant_knowledge_service),
    history: AssistantHistoryService = Depends(get_assistant_history_service),
):
    admin.require(_admin_token(request))
    items = []
    for item in history.review_items():
        relations = knowledge.relations(item["codigo"])
        item["conhecimento"] = [
            {"codigo": r["codigo"], "relacao": "igual", "obs": r.get("obs")} for r in relations["iguais"]
        ] + [{"codigo": r["codigo"], "relacao": "similar", "obs": r.get("obs")} for r in relations["similares"]]
        item["sugestoes"] = knowledge.suggestions(item["codigo"], asked_with=item.pop("comparado_com", []))
        items.append(ReviewItemOut(**item))
    return ok(items)


@router.get("/painel", response_model=SuccessResponse[AssistantPanelOut])
def assistant_panel(
    history: AssistantHistoryService = Depends(get_assistant_history_service),
    whatsapp: WhatsAppService = Depends(get_whatsapp_service),
):
    """
    So contagens para o Painel, sem login: perguntas de hoje, codigos para revisar,
    respostas do WhatsApp esperando revisao e o estado do robo. O conteudo continua so
    para o admin.
    """
    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0).isoformat(timespec="seconds")
    robot = whatsapp.panel_status()
    return ok(
        AssistantPanelOut(
            perguntas_hoje=history.count_since(today),
            para_revisar=len(history.review_items(limit=1000)),
            rascunhos=robot["rascunhos"],
            whatsapp_estado=robot["estado"],
            whatsapp_ativo=robot["ativo"],
        )
    )


@router.post("/revisao/{codigo}/concluir", response_model=SuccessResponse[dict])
def review_done(
    codigo: str,
    request: Request,
    admin: AssistantAdminService = Depends(get_assistant_admin_service),
    history: AssistantHistoryService = Depends(get_assistant_history_service),
):
    admin.require(_admin_token(request))
    history.mark_reviewed([canonical_code(codigo)])
    return ok({"concluido": True})


@router.get("/historico", response_model=SuccessResponse[list[ConversationOut]])
def list_history(
    request: Request,
    limite: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    admin: AssistantAdminService = Depends(get_assistant_admin_service),
    history: AssistantHistoryService = Depends(get_assistant_history_service),
):
    admin.require(_admin_token(request))
    return ok([ConversationOut(**c) for c in history.list_conversations(limite, offset)])


@router.get("/historico/exportar")
def export_history(
    request: Request,
    admin: AssistantAdminService = Depends(get_assistant_admin_service),
    history: AssistantHistoryService = Depends(get_assistant_history_service),
):
    admin.require(_admin_token(request))
    return StreamingResponse(
        history.export_jsonl(),
        media_type="application/x-ndjson; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="assistente_historico.jsonl"'},
    )


@router.put("/historico/{conversa_id}/correcao", response_model=SuccessResponse[dict])
def correct_answer(
    conversa_id: int,
    payload: CorrectionIn,
    request: Request,
    admin: AssistantAdminService = Depends(get_assistant_admin_service),
    history: AssistantHistoryService = Depends(get_assistant_history_service),
):
    admin.require(_admin_token(request))
    if not history.set_correction(conversa_id, payload.resposta_correta, payload.observacao):
        return fail(404, "not_found", "Conversa não encontrada.", None, _request_id(request))
    return ok({"corrigido": True})


# ----------------------------------------------------------------------
# Propostas de regra mandadas pelo WhatsApp (/ensinar)
# ----------------------------------------------------------------------


class ProposalSuggestIn(BaseModel):
    codigo_a: str
    codigo_b: str
    tipo: str
    observacao: Optional[str] = None
    autor: Optional[str] = None


@router.post("/propostas", status_code=201)
def suggest_proposal(payload: ProposalSuggestIn):
    """"Sugerir ao admin" (qualquer maquina): vai para a publicadora, onde o admin aprova."""
    from app.services.assistant_proposal_service import AssistantProposalService

    return ok(AssistantProposalService().submit(payload.model_dump()), status_code=201)


@router.get("/propostas", response_model=SuccessResponse[list[ProposalOut]])
def list_proposals(
    request: Request,
    status: Optional[str] = Query(default="pendente", pattern="^(pendente|aprovada|recusada|todas)$"),
    admin: AssistantAdminService = Depends(get_assistant_admin_service),
    history: AssistantHistoryService = Depends(get_assistant_history_service),
):
    admin.require(_admin_token(request))
    rows = history.list_proposals(None if status == "todas" else status)
    return ok([ProposalOut(**row) for row in rows])


@router.post("/propostas/{proposal_id}/aprovar", response_model=SuccessResponse[KnowledgeRuleOut])
def approve_proposal(
    proposal_id: int,
    request: Request,
    admin: AssistantAdminService = Depends(get_assistant_admin_service),
    knowledge: AssistantKnowledgeService = Depends(get_assistant_knowledge_service),
    history: AssistantHistoryService = Depends(get_assistant_history_service),
    sync: AssistantKnowledgeSyncService = Depends(get_assistant_knowledge_sync_service),
):
    admin.require(_admin_token(request))
    proposal = history.get_proposal(proposal_id)
    if not proposal or proposal["status"] != "pendente":
        return fail(404, "not_found", "Proposta pendente não encontrada.", None, _request_id(request))
    rule = knowledge.add_rule(proposal["codigo_a"], proposal["codigo_b"], proposal["tipo"], proposal["observacao"])
    history.decide_proposal(proposal_id, "aprovada")
    if rule["tipo"] != "diferente":  # como no ensinar pela tela: "nao serve" mantem o codigo na revisao
        history.mark_reviewed([canonical_code(proposal["codigo_a"]), canonical_code(proposal["codigo_b"])])
    sync.publish_in_background()
    return ok(KnowledgeRuleOut(**rule))


@router.post("/propostas/{proposal_id}/recusar", response_model=SuccessResponse[dict])
def reject_proposal(
    proposal_id: int,
    request: Request,
    admin: AssistantAdminService = Depends(get_assistant_admin_service),
    history: AssistantHistoryService = Depends(get_assistant_history_service),
):
    admin.require(_admin_token(request))
    if not history.decide_proposal(proposal_id, "recusada"):
        return fail(404, "not_found", "Proposta pendente não encontrada.", None, _request_id(request))
    return ok({"recusada": True})


# ----------------------------------------------------------------------
# WhatsApp (modo copiloto). So o admin desta maquina (senha local): o QR code conecta o WhatsApp
# da empresa. Vale tambem numa maquina que nao publica a base: e o PC reserva do robo, que so
# responde quando o principal (a publicadora) nao esta respondendo.
# ----------------------------------------------------------------------


@router.get("/resumo", response_model=SuccessResponse[DailySummaryOut])
def daily_summary(summary: AssistantDailySummaryService = Depends(get_assistant_daily_summary_service)):
    """Resumo de hoje (o mesmo que vai na "Mensagem para mim") e a configuracao do envio."""
    return ok(DailySummaryOut(texto=summary.build_text(), **summary.settings()))


@router.put("/resumo", response_model=SuccessResponse[DailySummaryOut])
def update_daily_summary(
    payload: DailySummaryIn,
    request: Request,
    admin: AssistantAdminService = Depends(get_assistant_admin_service),
    summary: AssistantDailySummaryService = Depends(get_assistant_daily_summary_service),
):
    admin.require_local(_admin_token(request))
    settings = summary.update_settings(ativo=payload.ativo, hora=payload.hora)
    return ok(DailySummaryOut(texto=summary.build_text(), **settings))


@router.get("/whatsapp/status", response_model=SuccessResponse[WhatsAppStatusOut])
def whatsapp_status(
    request: Request,
    admin: AssistantAdminService = Depends(get_assistant_admin_service),
    whatsapp: WhatsAppService = Depends(get_whatsapp_service),
):
    admin.require_local(_admin_token(request))
    return ok(WhatsAppStatusOut(**whatsapp.status()))


class WhatsAppReviewIn(BaseModel):
    revisar: bool


class WhatsAppDraftSendIn(BaseModel):
    texto: Optional[str] = None


@router.put("/whatsapp/revisao", response_model=SuccessResponse[WhatsAppStatusOut])
def whatsapp_set_review(
    payload: WhatsAppReviewIn,
    request: Request,
    admin: AssistantAdminService = Depends(get_assistant_admin_service),
    whatsapp: WhatsAppService = Depends(get_whatsapp_service),
):
    """Liga/desliga "revisar antes de enviar"."""
    admin.require_local(_admin_token(request))
    return ok(WhatsAppStatusOut(**whatsapp.set_review(payload.revisar)))


@router.get("/whatsapp/rascunhos")
def whatsapp_drafts(
    request: Request,
    admin: AssistantAdminService = Depends(get_assistant_admin_service),
    whatsapp: WhatsAppService = Depends(get_whatsapp_service),
):
    admin.require_local(_admin_token(request))
    return ok(whatsapp.list_drafts())


@router.post("/whatsapp/rascunhos/{draft_id}/enviar")
def whatsapp_send_draft(
    draft_id: int,
    payload: WhatsAppDraftSendIn,
    request: Request,
    admin: AssistantAdminService = Depends(get_assistant_admin_service),
    whatsapp: WhatsAppService = Depends(get_whatsapp_service),
):
    admin.require_local(_admin_token(request))
    if not whatsapp.send_draft(draft_id, payload.texto):
        return fail(404, "not_found", "Esse rascunho não existe mais (já foi enviado, descartado ou o WhatsApp reiniciou).", None, _request_id(request))
    return ok({"enviado": True})


@router.delete("/whatsapp/rascunhos/{draft_id}")
def whatsapp_discard_draft(
    draft_id: int,
    request: Request,
    admin: AssistantAdminService = Depends(get_assistant_admin_service),
    whatsapp: WhatsAppService = Depends(get_whatsapp_service),
):
    admin.require_local(_admin_token(request))
    if not whatsapp.discard_draft(draft_id):
        return fail(404, "not_found", "Esse rascunho não existe mais.", None, _request_id(request))
    return ok({"descartado": True})


@router.post("/whatsapp/iniciar", response_model=SuccessResponse[WhatsAppStatusOut])
def whatsapp_start(
    request: Request,
    admin: AssistantAdminService = Depends(get_assistant_admin_service),
    whatsapp: WhatsAppService = Depends(get_whatsapp_service),
):
    admin.require_local(_admin_token(request))
    return ok(WhatsAppStatusOut(**whatsapp.start()))


@router.post("/whatsapp/parar", response_model=SuccessResponse[WhatsAppStatusOut])
def whatsapp_stop(
    request: Request,
    admin: AssistantAdminService = Depends(get_assistant_admin_service),
    whatsapp: WhatsAppService = Depends(get_whatsapp_service),
):
    admin.require_local(_admin_token(request))
    return ok(WhatsAppStatusOut(**whatsapp.stop()))


@router.post("/whatsapp/desconectar", response_model=SuccessResponse[WhatsAppStatusOut])
def whatsapp_logout(
    request: Request,
    admin: AssistantAdminService = Depends(get_assistant_admin_service),
    whatsapp: WhatsAppService = Depends(get_whatsapp_service),
):
    admin.require_local(_admin_token(request))
    return ok(WhatsAppStatusOut(**whatsapp.logout()))
