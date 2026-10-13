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
        assert proposal["autor"] == "João" and proposal["codigo_b"] == "53279887210"

        # Proposta invalida e recusada pela publicadora, com o motivo.
        with pytest.raises(ValidationException):
            server.send_remote_proposal(f"http://127.0.0.1:{port}", {**RULE, "tipo": "parecido"})
    finally:
        server.stop_server()

    # Pela API desta maquina (sem fonte configurada): fica aqui.
    response = client.post("/assistente/propostas", json=RULE)
    assert response.status_code == 201, response.text
