"""
Senha do servidor local (porta 8765): sem ela, qualquer aparelho do Wi-Fi baixava o banco
inteiro (auditoria 2026-10, P1 #5). A senha e a mesma em todas as maquinas; sem senha
configurada o servidor continua aberto, como antes.
"""

import socket

import pytest
import requests

from app.services.local_share_service import TOKEN_HEADER, WRONG_TOKEN_MESSAGE, LocalShareService
from core.exceptions import ValidationException


def _free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


@pytest.fixture
def server(client):
    port = _free_port()
    share = LocalShareService()
    share.start_server(machine_label="PC-PUBLICADOR", publisher_name="Admin", port=port)
    try:
        yield f"http://127.0.0.1:{port}", share
    finally:
        share.stop_server()


def _set_token(client, token):
    return client.put("/backup/base-oficial/config", json={"role": "publisher", "server_token": token})


def test_without_password_the_server_stays_open(client, server):
    url, share = server
    assert requests.get(f"{url}/official/manifest", timeout=5).status_code == 404  # aberto, nada publicado
    health = share.fetch_remote_status(url)
    assert (health["senha_exigida"], health["senha_ok"]) == (False, True)
    assert client.get("/backup/base-oficial/status").json()["data"]["server_token_set"] is False


def test_password_protects_everything_but_the_connection_test(client, server):
    url, share = server
    configured = _set_token(client, "segredo-da-loja")
    assert configured.status_code == 200
    data = configured.json()["data"]
    assert data["server_token_set"] is True
    assert "segredo-da-loja" not in configured.text  # a senha nunca volta para a tela

    # Sem a senha (ou errada): nada do estoque sai.
    for headers in ({}, {TOKEN_HEADER: "chute"}):
        for route in ("official/manifest", "official/download", "compare/manifest", "compare/download"):
            assert requests.get(f"{url}/{route}", headers=headers, timeout=5).status_code == 401
    # Com a senha: passa (404 porque nada foi publicado).
    assert requests.get(f"{url}/official/manifest", headers={TOKEN_HEADER: "segredo-da-loja"}, timeout=5).status_code == 404

    # Esta maquina manda a propria senha sozinha.
    health = share.fetch_remote_status(url)
    assert (health["senha_exigida"], health["senha_ok"]) == (True, True)

    # Outra maquina com a senha diferente recebe uma explicacao, nao um erro tecnico.
    other = LocalShareService()
    other.configured_token = lambda: "senha-de-outra-loja"
    with pytest.raises(ValidationException, match="pede senha"):
        other.fetch_remote_status(url)
    with pytest.raises(ValidationException) as error:
        other.fetch_remote_manifest(url, "official")
    assert str(error.value) == WRONG_TOKEN_MESSAGE


def test_password_rules(client, server):
    assert _set_token(client, "123").status_code == 400  # curta demais
    assert _set_token(client, "segredo-da-loja").json()["data"]["server_token_set"] is True
    # Salvar outras configuracoes sem mandar a senha mantem a senha.
    kept = client.put("/backup/base-oficial/config", json={"role": "publisher", "machine_label": "PC-NOVO"})
    assert kept.json()["data"]["server_token_set"] is True
    # "" tira a senha: o servidor volta a ficar aberto.
    assert _set_token(client, "").json()["data"]["server_token_set"] is False
