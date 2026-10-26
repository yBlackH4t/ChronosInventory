"""
Senha do servidor local (porta 8765): sem ela, qualquer aparelho do Wi-Fi baixava o banco
inteiro (auditoria 2026-10, P1 #5). A senha e a mesma em todas as maquinas e, desde a
auditoria de seguranca de 2026-10-18, o servidor so liga com senha.
"""

import json
import socket

import pytest
import requests

from app.services import local_share_service as share_module
from app.services.local_share_service import (
    BLOCKED_MESSAGE,
    MISSING_TOKEN_MESSAGE,
    TOKEN_HEADER,
    WRONG_TOKEN_MESSAGE,
    LocalShareService,
)
from core.exceptions import ValidationException
from core.utils.file_utils import FileUtils

TOKEN = "segredo-da-loja"


def _free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def _set_token(client, token):
    return client.put("/backup/base-oficial/config", json={"role": "publisher", "server_token": token})


@pytest.fixture
def server(client):
    LocalShareService.reset_guards()
    assert _set_token(client, TOKEN).status_code == 200
    port = _free_port()
    share = LocalShareService()
    share.start_server(machine_label="PC-PUBLICADOR", publisher_name="Admin", port=port)
    try:
        yield f"http://127.0.0.1:{port}", share
    finally:
        share.stop_server()
        LocalShareService.reset_guards()


def test_server_does_not_start_without_password(client):
    share = LocalShareService()
    with pytest.raises(ValidationException) as error:
        share.start_server(machine_label="PC", publisher_name="", port=_free_port())
    assert str(error.value) == MISSING_TOKEN_MESSAGE
    assert not share.is_running()

    # Ligar o servidor pela tela sem senha tambem explica o que falta.
    response = client.post("/backup/base-oficial-servidor/iniciar")
    assert response.status_code == 400
    assert MISSING_TOKEN_MESSAGE in response.text
    assert not share.is_running()


def test_password_protects_everything_but_the_connection_test(client, server):
    url, share = server
    status = client.get("/backup/base-oficial/status")
    assert status.json()["data"]["server_token_set"] is True
    assert TOKEN not in status.text  # a senha nunca volta para a tela

    # Sem a senha (ou errada): nada do estoque sai.
    for headers in ({}, {TOKEN_HEADER: "chute"}):
        for route in ("official/manifest", "official/download", "compare/manifest", "compare/download", "knowledge"):
            assert requests.get(f"{url}/{route}", headers=headers, timeout=5).status_code == 401
    LocalShareService.reset_guards()
    # Com a senha: passa (404 porque nada foi publicado).
    assert requests.get(f"{url}/official/manifest", headers={TOKEN_HEADER: TOKEN}, timeout=5).status_code == 404

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

    # Maquina sem senha nenhuma tambem recebe a explicacao.
    empty = LocalShareService()
    empty.configured_token = lambda: ""
    with pytest.raises(ValidationException, match="pede senha"):
        empty.fetch_remote_status(url)


def test_health_does_not_reveal_if_a_password_would_match(server):
    url, _ = server
    anonymous = requests.get(f"{url}/health", timeout=5)
    assert anonymous.status_code == 200
    assert "senha_ok" not in anonymous.json()
    assert anonymous.json()["senha_exigida"] is True
    # Senha errada no /health: 401, nao um "senha_ok: false".
    assert requests.get(f"{url}/health", headers={TOKEN_HEADER: "chute"}, timeout=5).status_code == 401
    assert requests.get(f"{url}/health", headers={TOKEN_HEADER: TOKEN}, timeout=5).json()["senha_ok"] is True


def test_ip_is_blocked_after_five_wrong_passwords(server):
    url, share = server
    for _ in range(5):
        assert requests.get(f"{url}/official/manifest", headers={TOKEN_HEADER: "chute"}, timeout=5).status_code == 401
    # Bloqueado: nem a senha certa entra por 5 minutos.
    blocked = requests.get(f"{url}/official/manifest", headers={TOKEN_HEADER: TOKEN}, timeout=5)
    assert blocked.status_code == 429
    with pytest.raises(ValidationException) as error:
        share.fetch_remote_manifest(url, "official")
    assert str(error.value) == BLOCKED_MESSAGE


def test_block_expires_and_failures_outside_the_window_do_not_count():
    LocalShareService.reset_guards()
    try:
        ip = "192.168.0.77"
        for i in range(4):
            LocalShareService._register_auth_failure(ip, now=1000.0 + i)
        LocalShareService._register_auth_failure(ip, now=1000.0 + 400)  # a 1a ja saiu da janela
        assert not LocalShareService._is_blocked(ip, now=1401.0)
        for i in range(5):
            LocalShareService._register_auth_failure(ip, now=2000.0 + i)
        assert LocalShareService._is_blocked(ip, now=2010.0)
        assert not LocalShareService._is_blocked(ip, now=2004.0 + 301)
    finally:
        LocalShareService.reset_guards()


def test_password_rules(client, server):
    assert _set_token(client, "123").status_code == 400  # curta demais
    assert _set_token(client, TOKEN).json()["data"]["server_token_set"] is True
    # Salvar outras configuracoes sem mandar a senha mantem a senha.
    kept = client.put("/backup/base-oficial/config", json={"role": "publisher", "machine_label": "PC-NOVO"})
    assert kept.json()["data"]["server_token_set"] is True
    # "" tira a senha; com o servidor desligado na configuracao, pode.
    assert _set_token(client, "").json()["data"]["server_token_set"] is False
    # Ligar o servidor sem senha nao pode.
    enabled = client.put(
        "/backup/base-oficial/config", json={"role": "publisher", "server_enabled": True, "server_token": ""}
    )
    assert enabled.status_code == 400
    assert MISSING_TOKEN_MESSAGE in enabled.text


def test_password_is_stored_protected_and_old_plain_files_are_migrated(client):
    path = FileUtils.get_official_base_config_path()
    assert _set_token(client, TOKEN).status_code == 200
    raw = open(path, encoding="utf-8").read()
    assert TOKEN not in raw
    assert "server_token_protegida" in raw
    assert LocalShareService().configured_token() == TOKEN

    # Arquivo de versao antiga (senha em texto puro): continua valendo e e regravado protegido.
    data = json.loads(raw)
    data.pop("server_token_protegida")
    data["server_token"] = "senha-antiga-123"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f)
    assert LocalShareService().configured_token() == "senha-antiga-123"  # consumidor le igual
    migrated = open(path, encoding="utf-8").read()
    assert "senha-antiga-123" not in migrated
    assert client.get("/backup/base-oficial/status").json()["data"]["server_token_set"] is True
    assert LocalShareService().configured_token() == "senha-antiga-123"


def test_snapshot_download_has_a_size_limit(server, tmp_path, monkeypatch):
    url, share = server
    latest = share.get_official_paths()["latest_zip"]
    import os

    os.makedirs(os.path.dirname(latest), exist_ok=True)
    with open(latest, "wb") as f:
        f.write(b"x" * 4096)
    monkeypatch.setattr(share_module, "MAX_SNAPSHOT_BYTES", 1024)
    target = tmp_path / "baixado.zip"
    with pytest.raises(ValidationException, match="download foi cancelado"):
        share.download_remote_snapshot(url, "official", str(target))
    assert not target.exists()

    monkeypatch.setattr(share_module, "MAX_SNAPSHOT_BYTES", 10_000)
    share.download_remote_snapshot(url, "official", str(target))
    assert target.stat().st_size == 4096
