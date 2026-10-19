"""Dados do Painel em blocos (2.6.1): tendencia de produtos com saldo e numeros do assistente."""

from datetime import date, timedelta

from app.services.assistant_config_store import AssistantConfigStore
from app.services.whatsapp_service import WhatsAppService
from backend.app.api.deps import get_whatsapp_service
from core.database.connection import DatabaseConnection


def _create_product(client, nome, inventories):
    response = client.post("/produtos", json={"nome": nome, "inventories": inventories})
    assert response.status_code == 201, response.text
    return response.json()["data"]["id"]


def _move(client, **payload):
    response = client.post("/movimentacoes", json=payload)
    assert response.status_code in (200, 201), response.text


def _days_ago(days: int) -> str:
    return (date.today() - timedelta(days=days)).isoformat() + "T10:00:00"


def _set_dates(sql: str, when: str, *params) -> None:
    conn = DatabaseConnection().get_connection()
    try:
        conn.execute(sql, (when.replace("T", " "), *params))
        conn.commit()
    finally:
        conn.close()


def test_stock_count_history_walks_back_from_today(client):
    # Hoje: A com 1 (vendeu 2 ha 3 dias), B zerou ontem, C com 4 em PF (transferido de Canoas).
    a = _create_product(client, "TURBINA A", {11: 3})
    b = _create_product(client, "TURBINA B", {11: 1})
    c = _create_product(client, "TURBINA C", {11: 4})
    # Cadastro (estoque inicial) ha 10 dias; a D foi cadastrada ha 2 dias e zerou hoje.
    _set_dates("UPDATE movimentacoes SET data_hora = ?", _days_ago(10))
    d = _create_product(client, "TURBINA D", {11: 1})
    _set_dates("UPDATE movimentacoes SET data_hora = ? WHERE produto_id = ?", _days_ago(2), d)
    _move(client, tipo="SAIDA", produto_id=d, quantidade=1, origem_location_id=11, data=_days_ago(0))
    _move(client, tipo="SAIDA", produto_id=a, quantidade=2, origem_location_id=11, data=_days_ago(3))
    _move(client, tipo="SAIDA", produto_id=b, quantidade=1, origem_location_id=11, data=_days_ago(1))
    _move(
        client,
        tipo="TRANSFERENCIA",
        produto_id=c,
        quantidade=4,
        origem_location_id=11,
        destino_location_id=12,
        data=_days_ago(2),
    )

    resp = client.get("/analytics/stock/count-history?days=7")
    assert resp.status_code == 200, resp.text
    points = resp.json()["data"]
    assert [p["date"] for p in points][-1] == date.today().isoformat()
    assert len(points) == 7
    by_day = {p["date"]: (p["com_saldo"], p["zerados"]) for p in points}
    # No total, a transferencia nao muda nada. A B zerou ontem e a D hoje; antes de ser
    # cadastrada (ha 2 dias) a D nao conta nem como zerada.
    assert by_day[date.today().isoformat()] == (2, 2)
    assert by_day[(date.today() - timedelta(days=1)).isoformat()] == (3, 1)
    assert by_day[(date.today() - timedelta(days=2)).isoformat()] == (4, 0)
    assert by_day[(date.today() - timedelta(days=3)).isoformat()] == (3, 0)

    # O ultimo ponto bate com o resumo de hoje.
    summary = client.get("/analytics/stock/summary").json()["data"]
    assert points[-1]["zerados"] == summary["zerados"]

    # Em Canoas, a C saiu ha 2 dias (transferencia para PF), a B ontem e a D hoje.
    canoas = client.get("/analytics/stock/count-history?days=7&location_id=11").json()["data"]
    canoas_by_day = {p["date"]: (p["com_saldo"], p["zerados"]) for p in canoas}
    assert canoas_by_day[date.today().isoformat()] == (1, 3)
    assert canoas_by_day[(date.today() - timedelta(days=1)).isoformat()] == (2, 2)
    assert canoas_by_day[(date.today() - timedelta(days=2)).isoformat()] == (3, 1)
    assert canoas_by_day[(date.today() - timedelta(days=3)).isoformat()] == (3, 0)

    assert client.get("/analytics/stock/count-history?days=1").status_code == 422


def test_assistant_panel_counts_without_admin(client, tmp_path):
    service = WhatsAppService(
        config_store=AssistantConfigStore(str(tmp_path / "cfg.json")),
        session_dir=str(tmp_path),
    )
    client.app.dependency_overrides[get_whatsapp_service] = lambda: service
    try:
        empty = client.get("/assistente/painel")
        assert empty.status_code == 200, empty.text
        assert empty.json()["data"] == {
            "perguntas_hoje": 0,
            "para_revisar": 0,
            "rascunhos": 0,
            "whatsapp_estado": "parado",
            "whatsapp_ativo": False,
        }

        # Uma pergunta por um codigo que nao temos: conta hoje e vai para "Para revisar".
        asked = client.post("/assistente/chat", json={"mensagem": "tem a 5327-988-7101?"})
        assert asked.status_code == 200, asked.text
        data = client.get("/assistente/painel").json()["data"]
        assert data["perguntas_hoje"] == 1
        assert data["para_revisar"] == 1
        # So numeros: nada das conversas sai sem login.
        assert set(data) == {"perguntas_hoje", "para_revisar", "rascunhos", "whatsapp_estado", "whatsapp_ativo"}
    finally:
        client.app.dependency_overrides.pop(get_whatsapp_service, None)
