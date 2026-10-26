""""Sugerir ao admin": o colega propoe pelo Chronos do PC dele e a proposta chega na publicadora."""

import socket

import pytest

from app.services.assistant_history_service import AssistantHistoryService
from app.services.assistant_proposal_service import AssistantProposalService, normalize_proposal
from app.services.local_share_service import LocalShareService
from core.exceptions import ValidationException

RULE = {"codigo_a": "5327-988-7101", "codigo_b": "53279887210", "tipo": "igual", "observacao": "  muda a etiqueta ", "autor": "João"}


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def test_proposal_is_validated():
    assert normalize_proposal(RULE)["observacao"] == "muda a etiqueta"
    with pytest.raises(ValidationException, match="não parece um código"):
        normalize_proposal({**RULE, "codigo_b": "HX55"})
    with pytest.raises(ValidationException, match="mesmo"):
        normalize_proposal({**RULE, "codigo_b": "53279887101"})
    with pytest.raises(ValidationException, match="Tipo inválido"):
        normalize_proposal({**RULE, "tipo": "parecido"})


def test_publisher_keeps_the_suggestion_here(tmp_path):
    history = AssistantHistoryService(str(tmp_path / "historico.db"))
    service = AssistantProposalService(history=history, config_reader=lambda: {"role": "publisher"})
    assert service.submit(RULE)["destino"] == "esta_maquina"
    (proposal,) = history.list_proposals("pendente")
    assert (proposal["codigo_a"], proposal["tipo"], proposal["autor"]) == ("5327-988-7101", "igual", "João")


def test_other_machine_sends_it_to_the_publisher_server(client):
    LocalShareService.reset_guards()
    # O servidor so liga com senha; a "outra maquina" do teste le a mesma senha do arquivo.
    assert client.put("/backup/base-oficial/config", json={"role": "publisher", "server_token": "senha-da-loja"}).status_code == 200
    port = _free_port()
    server = LocalShareService()
    server.start_server("publicadora", "Guilherme", port)
    try:
        sender = AssistantProposalService(
            config_reader=lambda: {"role": "consumer", "remote_server_url": f"http://127.0.0.1:{port}"}
        )
        result = sender.submit(RULE)
        assert result["destino"] == "publicadora" and result["id"]
        (proposal,) = AssistantHistoryService().list_proposals("pendente")
        # O autor enviado pela rede e ignorado: vale o IP de quem mandou.
        assert proposal["autor"] == "PC 127.0.0.1" and proposal["codigo_b"] == "53279887210"

        # Proposta invalida e recusada pela publicadora, com o motivo.
        with pytest.raises(ValidationException):
            server.send_remote_proposal(f"http://127.0.0.1:{port}", {**RULE, "tipo": "parecido"})
    finally:
        server.stop_server()

    # Pela API desta maquina (sem fonte configurada): fica aqui.
    response = client.post("/assistente/propostas", json=RULE)
    assert response.status_code == 201, response.text


def test_remote_proposals_need_the_password_and_are_rate_limited(client, monkeypatch):
    import requests

    from app.services import local_share_service as share_module
    from app.services.local_share_service import TOKEN_HEADER

    LocalShareService.reset_guards()
    assert client.put("/backup/base-oficial/config", json={"role": "publisher", "server_token": "senha-da-loja"}).status_code == 200
    port = _free_port()
    server = LocalShareService()
    server.start_server("publicadora", "Guilherme", port)
    url = f"http://127.0.0.1:{port}/proposals"
    try:
        assert requests.post(url, json=RULE, timeout=5).status_code == 401  # sem senha
        monkeypatch.setattr(share_module, "MAX_PROPOSALS_PER_HOUR", 2)
        headers = {TOKEN_HEADER: "senha-da-loja"}
        assert requests.post(url, json={**RULE, "autor": "Admin"}, headers=headers, timeout=5).status_code == 200
        assert requests.post(url, json=RULE, headers=headers, timeout=5).status_code == 200
        assert requests.post(url, json=RULE, headers=headers, timeout=5).status_code == 429
        authors = {p["autor"] for p in AssistantHistoryService().list_proposals("pendente")}
        assert authors == {"PC 127.0.0.1"}
    finally:
        server.stop_server()
        LocalShareService.reset_guards()
