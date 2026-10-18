"""Admin do assistente, base de conhecimento pela API, revisao e historico (docs/PLANO_IA.md)."""

import json

import pytest

from app.services import assistant_admin_service
from app.services.assistant_admin_service import AdminRequiredError, AssistantAdminService
from app.services.assistant_config_store import AssistantConfigStore
from app.services.assistant_history_service import AssistantHistoryService
from backend.app.api.deps import get_assistant_admin_service
from core.exceptions import ValidationException
from test_assistant_tools import tools  # noqa: F401  (fixture: catalogo + produtos de teste)

PASSWORD = "turbina-segura"


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    for name in ("ANTHROPIC_API_KEY", "GROQ_API_KEY", "GEMINI_API_KEY"):
        monkeypatch.delenv(name, raising=False)
    assistant_admin_service._SESSIONS.clear()
    yield
    assistant_admin_service._SESSIONS.clear()


def _admin(tmp_path, role="publisher"):
    store = AssistantConfigStore(str(tmp_path / "assistente_config.json"))
    return AssistantAdminService(config_store=store, role_reader=lambda: role, sleep=lambda s: None)


def test_only_the_publisher_machine_can_be_admin(tmp_path):
    consumer = _admin(tmp_path, role="consumer")
    assert consumer.status() == {"maquina_publicadora": False, "senha_definida": False, "autenticado": False, "pin_whatsapp_definido": False}
    # Outra maquina tem senha e login proprios (para o robo reserva do WhatsApp)...
    consumer.set_password(PASSWORD)
    token = consumer.login(PASSWORD)["token"]
    consumer.require_local(token)
    # ...mas ensinar e revisar continua so na publicadora.
    with pytest.raises(AdminRequiredError, match="máquina publicadora"):
        consumer.require(token)


def test_password_login_and_sessions(tmp_path):
    admin = _admin(tmp_path)
    with pytest.raises(ValidationException):
        admin.set_password("123")
    with pytest.raises(ValidationException, match="Defina a senha"):
        admin.login(PASSWORD)

    admin.set_password(PASSWORD)
    raw = (tmp_path / "assistente_config.json").read_text(encoding="utf-8")
    assert PASSWORD not in raw and '"hash"' in raw  # so o hash fica salvo

    with pytest.raises(AdminRequiredError, match="Senha incorreta"):
        admin.login("errada")
    token = admin.login(PASSWORD)["token"]
    admin.require(token)
    assert admin.status(token)["autenticado"] is True
    with pytest.raises(AdminRequiredError):
        admin.require(None)

    # Trocar a senha exige a atual e derruba as sessoes.
    with pytest.raises(AdminRequiredError, match="Senha atual"):
        admin.set_password("nova-senha-1")
    admin.set_password("nova-senha-1", PASSWORD)
    with pytest.raises(AdminRequiredError):
        admin.require(token)

    token = admin.login("nova-senha-1")["token"]
    admin.logout(token)
    with pytest.raises(AdminRequiredError):
        admin.require(token)

    # A senha de admin sobrevive a mudancas na configuracao da IA.
    AssistantConfigStore(str(tmp_path / "assistente_config.json")).update(provedor="nenhum")
    assert admin.status()["senha_definida"] is True


def test_review_reappears_when_asked_again(tmp_path):
    history = AssistantHistoryService(str(tmp_path / "historico.db"))
    calls = [{"ferramenta": "buscar_por_codigo", "codigo": "53279887101", "temos_em_estoque": False}]
    result = {"resposta": "não temos", "modo": "busca_direta"}
    history.record(canal="app", autor=None, pergunta="tem a 7101?", historico=[], result=result, consultas=calls)
    (item,) = history.review_items()
    assert item["codigo"] == "53279887101" and item["vezes"] == 1

    history.mark_reviewed(["53279887101"])
    assert history.review_items() == []

    history.record(canal="whatsapp", autor="5551999", pergunta="e a 7101?", historico=[], result=result, consultas=calls)
    (again,) = history.review_items()
    assert again["exemplo"] == "e a 7101?"


def test_admin_flow_through_the_api(client, tools):  # noqa: F811
    client.app.dependency_overrides[get_assistant_admin_service] = lambda: AssistantAdminService(
        role_reader=lambda: "publisher", sleep=lambda s: None
    )
    try:
        status = client.get("/assistente/admin/status").json()["data"]
        assert status == {"maquina_publicadora": True, "senha_definida": False, "autenticado": False, "pin_whatsapp_definido": False}

        rule = {"codigo_a": "5327-988-7101", "codigo_b": "5327-988-7116", "tipo": "similar", "observacao": "muda o atuador"}
        denied = client.post("/assistente/conhecimento", json=rule)
        assert denied.status_code == 403
        assert denied.json()["error"]["code"] == "admin_necessario"

        assert client.post("/assistente/admin/senha", json={"senha_nova": PASSWORD}).status_code == 200
        assert client.post("/assistente/admin/login", json={"senha": "errada"}).status_code == 403
        token = client.post("/assistente/admin/login", json={"senha": PASSWORD}).json()["data"]["token"]
        auth = {"X-Admin-Token": token}

        # O chefe pergunta por um codigo que nao temos: vai para "Para revisar", com sugestao.
        first = client.post("/assistente/chat", json={"mensagem": "tem a 5327-988-7101?", "canal": "whatsapp", "autor": "5551999"})
        assert first.status_code == 200
        assert "não encontrei" in first.json()["data"]["resposta"]
        (item,) = client.get("/assistente/revisao", headers=auth).json()["data"]
        assert item["codigo"] == "53279887101"
        assert item["sugestoes"] == []  # so o mesmo inicio de codigo nao e motivo

        # "E igual a 7116?": a pergunta responde a relacao e a 7116 vira a sugestao da revisao.
        asked = client.post("/assistente/chat", json={"mensagem": "a 5327-988-7101 é igual a 5327-988-7116?"})
        assert "não sei dizer se são iguais" in asked.json()["data"]["resposta"]
        (item,) = client.get("/assistente/revisao", headers=auth).json()["data"]
        assert [s["nome"] for s in item["sugestoes"]] == ["TURBO K27 - 53279887116"]

        # "Nao serve" tira so a sugestao: o codigo continua na lista para ensinar o que serve.
        refused = {"codigo_a": "53279887101", "codigo_b": "53279887116", "tipo": "diferente"}
        assert client.post("/assistente/conhecimento", json=refused, headers=auth).status_code == 201
        (item,) = client.get("/assistente/revisao", headers=auth).json()["data"]
        assert item["codigo"] == "53279887101" and item["sugestoes"] == []

        # O admin ensina; o codigo sai da revisao e a proxima resposta ja usa a regra.
        created = client.post("/assistente/conhecimento", json=rule, headers=auth)
        assert created.status_code == 201, created.text
        assert client.get("/assistente/revisao", headers=auth).json()["data"] == []
        second = client.post("/assistente/chat", json={"mensagem": "tem a 5327-988-7101?"}).json()["data"]
        assert "*TURBO K27 - 53279887116* — 3 em Passo Fundo (similar: muda o atuador)" in second["resposta"]
        assert [p["nome"] for p in second["produtos"]] == ["TURBO K27 - 53279887116"]

        # Qualquer um le a base; so o admin muda.
        rules = client.get("/assistente/conhecimento").json()["data"]
        assert [(r["codigo_a"], r["tipo"]) for r in rules] == [("5327-988-7101", "similar")]

        # Historico: lista, correcao e exportacao em JSONL (sem o telefone).
        conversations = client.get("/assistente/historico", headers=auth).json()["data"]
        assert [c["pergunta"] for c in conversations] == [
            "tem a 5327-988-7101?", "a 5327-988-7101 é igual a 5327-988-7116?", "tem a 5327-988-7101?"
        ]
        assert conversations[-1]["autor"] == "5551999"
        assert conversations[-1]["consultas"][0]["ferramenta"] == "buscar_por_codigo"
        assert conversations[1]["consultas"][0]["ferramenta"] == "comparar_codigos"
        fix = client.put(
            f"/assistente/historico/{conversations[-1]['id']}/correcao",
            json={"resposta_correta": "Temos a similar 7116 (muda o atuador)."},
            headers=auth,
        )
        assert fix.status_code == 200
        assert client.put("/assistente/historico/9999/correcao", json={"resposta_correta": "x"}, headers=auth).status_code == 404

        exported = client.get("/assistente/historico/exportar", headers=auth)
        assert exported.status_code == 200
        lines = [json.loads(line) for line in exported.text.splitlines()]
        assert len(lines) == 3
        assert lines[0]["resposta_correta"] == "Temos a similar 7116 (muda o atuador)."
        assert all("autor" not in line for line in lines)

        rule_id = created.json()["data"]["id"]
        assert client.delete(f"/assistente/conhecimento/{rule_id}", headers=auth).status_code == 200
        assert client.delete(f"/assistente/conhecimento/{rule_id}", headers=auth).status_code == 404
    finally:
        client.app.dependency_overrides.clear()

    # Sem o override, esta maquina de teste e "consumidora": entra (robo reserva do WhatsApp), mas nao ensina.
    login = client.post("/assistente/admin/login", json={"senha": PASSWORD})
    assert login.status_code == 200
    auth = {"X-Admin-Token": login.json()["data"]["token"]}
    denied = client.post("/assistente/conhecimento", json=rule, headers=auth)
    assert denied.status_code == 403
    assert "máquina publicadora" in denied.json()["error"]["message"]
