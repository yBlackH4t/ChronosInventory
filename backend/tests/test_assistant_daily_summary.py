"""
Resumo diario na "Mensagem para mim" (docs/PLANO_IA.md, Fase 4): o que zerou, o que mais saiu
e o que perguntaram ao assistente e nao temos.
"""

from datetime import datetime
from types import SimpleNamespace

from app.services.assistant_admin_service import AssistantAdminService
from app.services.assistant_config_store import AssistantConfigStore
from app.services.assistant_daily_summary_service import AssistantDailySummaryService
from app.services.whatsapp_service import WhatsAppService
from backend.app.api.deps import get_assistant_admin_service
from core.exceptions import ValidationException

CANOAS = 11


def _product(client, name, quantity):
    created = client.post("/produtos", json={"nome": name, "inventories": {CANOAS: quantity}})
    assert created.status_code == 201
    return created.json()["data"]["id"]


def _sale(client, product_id, quantity):
    movement = {"tipo": "SAIDA", "produto_id": product_id, "quantidade": quantity, "origem_location_id": CANOAS}
    assert client.post("/movimentacoes", json=movement).status_code == 201


def test_summary_text_with_real_movements_and_questions(client):
    zeroed = _product(client, "TURBO HOLSET HX35 3539370", 2)
    busy = _product(client, "TURBO GARRETT 466646-5041S", 10)
    _sale(client, zeroed, 2)
    _sale(client, busy, 3)
    # O chefe perguntou duas vezes por uma que nao temos.
    for _ in range(2):
        assert client.post("/assistente/chat", json={"mensagem": "tem a 5327-988-7210?"}).status_code == 200

    text = AssistantDailySummaryService().build_text()

    lines = text.splitlines()
    assert lines[0].startswith("*Resumo do estoque — ")
    assert "*Zeraram desde ontem:*" in lines
    assert "• TURBO HOLSET HX35 3539370 (saíram 2)" in lines
    assert "*Mais saíram nos últimos 7 dias:*" in lines
    assert "• TURBO GARRETT 466646-5041S — 3" in lines
    assert "*Perguntaram e não temos (7 dias):*" in lines
    assert "• 53279887210 — 2x" in lines


def test_summary_settings_and_schedule(tmp_path):
    store = AssistantConfigStore(str(tmp_path / "cfg.json"))
    morning = datetime(2026, 10, 12, 7, 59)
    summary = AssistantDailySummaryService(config_store=store, clock=lambda: morning)
    assert summary.settings() == {"ativo": False, "hora": "08:00", "ultimo_envio": None}
    assert summary.due() is False  # desligado

    summary.update_settings(ativo=True, hora="08:00")
    assert summary.due() is False  # ainda nao deu a hora
    assert summary.due(datetime(2026, 10, 12, 8, 0)) is True
    summary.mark_sent(datetime(2026, 10, 12, 8, 0))
    assert summary.due(datetime(2026, 10, 12, 18, 0)) is False  # ja saiu hoje
    assert summary.due(datetime(2026, 10, 13, 8, 1)) is True  # outro dia

    try:
        summary.update_settings(hora="8h")
        raise AssertionError("hora invalida deveria falhar")
    except ValidationException:
        pass


def test_whatsapp_sends_the_summary_once_when_due(tmp_path):
    sent = []

    class Summary:
        def __init__(self):
            self.done = False

        def due(self):
            return not self.done

        def build_text(self):
            return "*Resumo do estoque — hoje*"

        def mark_sent(self):
            self.done = True

    summary = Summary()
    service = WhatsAppService(
        transport_factory=lambda path, **kw: SimpleNamespace(start=lambda: None, stop=lambda: None),
        bridge_factory=lambda transport: SimpleNamespace(),
        config_store=AssistantConfigStore(str(tmp_path / "cfg.json")),
        session_dir=str(tmp_path),
        summary_factory=lambda: summary,
    )
    service.start()
    service._transport.send_to_self = sent.append
    assert service.send_summary_if_due() is False  # ainda nao conectou

    service._on_state("conectado")
    assert service.send_summary_if_due() is True
    assert service.send_summary_if_due() is False  # uma vez por dia
    assert sent == ["*Resumo do estoque — hoje*"]
    service.stop(remember=False)


def test_summary_routes(client):
    preview = client.get("/assistente/resumo")
    assert preview.status_code == 200
    data = preview.json()["data"]
    assert data["texto"].startswith("*Resumo do estoque — ") and data["ativo"] is False

    assert client.put("/assistente/resumo", json={"ativo": True}).status_code == 403  # so o admin
    client.app.dependency_overrides[get_assistant_admin_service] = lambda: AssistantAdminService(
        role_reader=lambda: "publisher", sleep=lambda s: None
    )
    try:
        client.post("/assistente/admin/senha", json={"senha_nova": "senha-de-teste-123"})
        token = client.post("/assistente/admin/login", json={"senha": "senha-de-teste-123"}).json()["data"]["token"]
        updated = client.put("/assistente/resumo", json={"ativo": True, "hora": "07:30"}, headers={"X-Admin-Token": token})
        assert updated.status_code == 200
        assert (updated.json()["data"]["ativo"], updated.json()["data"]["hora"]) == (True, "07:30")
    finally:
        client.app.dependency_overrides.clear()
