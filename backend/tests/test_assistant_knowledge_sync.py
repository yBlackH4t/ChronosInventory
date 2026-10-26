"""
Conhecimento do especialista entre as maquinas (docs/PLANO_IA.md, Fase 2c): a publicadora
publica um JSON pequeno na pasta compartilhada e no servidor local; as outras recebem e
trocam as regras locais pelas publicadas.

As duas "maquinas" dividem o banco do teste: para simular a outra maquina, as regras
locais sao apagadas antes de receber.
"""

import json
import socket

import requests

from app.services import assistant_knowledge_sync_service as sync_module
from app.services.assistant_admin_service import AssistantAdminService
from app.services.assistant_knowledge_sync_service import (
    KNOWLEDGE_FILENAME,
    NO_DESTINATION,
    NO_SOURCE,
    AssistantKnowledgeSyncService,
)
from app.services.local_share_service import LocalShareService
from backend.app.api.deps import get_assistant_admin_service, get_assistant_knowledge_sync_service
from core.database.repositories.knowledge_repository import KnowledgeRepository
from test_assistant_tools import tools  # noqa: F401  (fixture: catalogo + produtos de teste)

RULE = ("5327-988-7101", "5327-988-7116", "similar", "muda o atuador")


def _service(tmp_path, name, **config):
    defaults = {
        "role": "consumer",
        "official_base_dir": "",
        "remote_server_url": "",
        "server_enabled": False,
        "machine_label": "PC-ADMIN",
        "publisher_name": "Admin",
    }
    return AssistantKnowledgeSyncService(
        config_reader=lambda: {**defaults, **config},
        local_share=LocalShareService(),
        state_path=str(tmp_path / f"{name}_estado.json"),
        run_async=lambda fn: fn(),
    )


def _free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def test_publisher_publishes_to_the_shared_folder_and_the_local_server(tools, tmp_path, monkeypatch):  # noqa: F811
    folder = tmp_path / "compartilhada"
    publisher = _service(tmp_path, "publicadora", role="publisher", official_base_dir=str(folder), server_enabled=True)
    tools.knowledge.add_rule(*RULE)
    monkeypatch.setattr(sync_module, "_now", lambda: "2026-10-10T08:00:00")

    status = publisher.sync()

    assert (status["papel"], status["fonte"], status["total_regras"], status["erro"]) == (
        "publisher",
        "servidor e pasta",
        1,
        None,
    )
    published = json.loads((folder / "latest" / KNOWLEDGE_FILENAME).read_text(encoding="utf-8"))
    assert (published["maquina"], published["total_regras"], published["publicado_em"]) == (
        "PC-ADMIN",
        1,
        "2026-10-10T08:00:00",
    )
    assert published["regras"][0]["codigo_a"] == "5327-988-7101" and published["regras"][0]["tipo"] == "SIMILAR"
    with open(LocalShareService().get_knowledge_path(), encoding="utf-8") as f:
        assert json.load(f) == published  # o servidor local entrega o mesmo arquivo

    # Backend reaberto com as mesmas regras: a data da versao continua a mesma.
    monkeypatch.setattr(sync_module, "_now", lambda: "2026-10-10T09:00:00")
    again = publisher.sync()
    assert (again["publicado_em"], again["verificado_em"]) == ("2026-10-10T08:00:00", "2026-10-10T09:00:00")
    # Regra nova: versao nova.
    tools.knowledge.add_rule("4031196", "4044318", "diferente")
    assert publisher.sync()["publicado_em"] == "2026-10-10T09:00:00"


def test_publisher_without_folder_or_server_explains(tools, tmp_path):  # noqa: F811
    status = _service(tmp_path, "publicadora", role="publisher").sync()
    assert status["fonte"] is None and status["erro"] == NO_DESTINATION
    assert status["configurado"] is False  # a tela mostra "nao configurado", nao uma falha
    folder = _service(tmp_path, "publicadora", role="publisher", official_base_dir=str(tmp_path / "pasta"))
    assert folder.status()["configurado"] is True
    assert _service(tmp_path, "filial").status()["configurado"] is False
    assert _service(tmp_path, "filial", remote_server_url="http://pc-admin:8765").status()["configurado"] is True


def test_other_machine_receives_from_the_shared_folder(tools, tmp_path):  # noqa: F811
    folder = tmp_path / "compartilhada"
    publisher = _service(tmp_path, "publicadora", role="publisher", official_base_dir=str(folder))
    branch = _service(tmp_path, "filial", official_base_dir=str(folder))
    repository = KnowledgeRepository()
    tools.knowledge.add_rule(*RULE)
    publisher.sync()

    # A outra maquina tem o proprio banco, ainda sem a regra.
    repository.replace_all([])
    assert "similar" not in tools.search_by_code("5327-988-7101")["texto_pronto"]

    status = branch.sync()
    assert (status["papel"], status["fonte"], status["total_regras"], status["maquina"], status["erro"]) == (
        "consumer",
        "pasta",
        1,
        "PC-ADMIN",
        None,
    )
    assert "(similar: muda o atuador)" in tools.search_by_code("5327-988-7101")["texto_pronto"]

    # Arquivo alterado ou cortado no caminho: nada muda nesta maquina.
    path = folder / "latest" / KNOWLEDGE_FILENAME
    data = json.loads(path.read_text(encoding="utf-8"))
    data["regras"][0]["tipo"] = "IGUAL"
    path.write_text(json.dumps(data), encoding="utf-8")
    failed = branch.sync()
    assert "incompleto ou alterado" in failed["erro"]
    assert [r["tipo"] for r in repository.all_rules()] == ["SIMILAR"]

    # O admin ensina mais uma: chega na proxima sincronizacao.
    tools.knowledge.add_rule("4031196", "4044318", "diferente")
    publisher.sync()
    repository.replace_all([])
    assert branch.sync()["total_regras"] == 2
    assert len(repository.all_rules()) == 2


def test_other_machine_receives_from_the_publisher_server(client, tools, tmp_path):  # noqa: F811
    # O servidor so liga com senha; a "outra maquina" do teste le a mesma senha do arquivo.
    assert client.put("/backup/base-oficial/config", json={"role": "publisher", "server_token": "senha-da-loja"}).status_code == 200
    port = _free_port()
    server_url = f"http://127.0.0.1:{port}"
    share = LocalShareService()
    publisher = _service(tmp_path, "publicadora", role="publisher", server_enabled=True)
    tools.knowledge.add_rule(*RULE)
    share.start_server(machine_label="PC-ADMIN", publisher_name="Admin", port=port)
    try:
        assert share.fetch_remote_status(server_url)["knowledge_available"] is False
        publisher.sync()
        assert share.fetch_remote_status(server_url)["knowledge_available"] is True

        KnowledgeRepository().replace_all([])
        status = _service(tmp_path, "filial", remote_server_url=server_url).sync()
        assert (status["fonte"], status["total_regras"], status["maquina"], status["erro"]) == (
            "servidor",
            1,
            "PC-ADMIN",
            None,
        )
        assert len(KnowledgeRepository().all_rules()) == 1
    finally:
        share.stop_server()


def test_knowledge_follows_the_server_password(client, tools, tmp_path):  # noqa: F811
    port = _free_port()
    server_url = f"http://127.0.0.1:{port}"
    share = LocalShareService()
    tools.knowledge.add_rule(*RULE)
    _service(tmp_path, "publicadora", role="publisher", server_enabled=True).sync()
    assert client.put("/backup/base-oficial/config", json={"role": "publisher", "server_token": "senha-da-loja"}).status_code == 200
    share.start_server(machine_label="PC-ADMIN", publisher_name="Admin", port=port)
    try:
        assert requests.get(f"{server_url}/knowledge", timeout=5).status_code == 401  # aparelho qualquer do Wi-Fi
        KnowledgeRepository().replace_all([])
        # A outra maquina da empresa tem a mesma senha e recebe normalmente.
        status = _service(tmp_path, "filial", remote_server_url=server_url).sync()
        assert (status["fonte"], status["total_regras"], status["erro"]) == ("servidor", 1, None)
    finally:
        share.stop_server()


def test_server_off_falls_back_to_the_shared_folder(tools, tmp_path):  # noqa: F811
    folder = tmp_path / "compartilhada"
    tools.knowledge.add_rule(*RULE)
    _service(tmp_path, "publicadora", role="publisher", official_base_dir=str(folder)).sync()
    KnowledgeRepository().replace_all([])

    branch = _service(
        tmp_path, "filial", remote_server_url=f"http://127.0.0.1:{_free_port()}", official_base_dir=str(folder)
    )
    status = branch.sync()
    assert (status["fonte"], status["total_regras"], status["erro"]) == ("pasta", 1, None)


def test_problems_are_explained_and_change_nothing(tools, tmp_path):  # noqa: F811
    tools.knowledge.add_rule(*RULE)
    assert _service(tmp_path, "sem_fonte").sync()["erro"] == NO_SOURCE

    folder = tmp_path / "compartilhada"
    (folder / "latest").mkdir(parents=True)
    branch = _service(tmp_path, "filial", official_base_dir=str(folder))
    assert "ainda não tem" in branch.sync()["erro"]

    (folder / "latest" / KNOWLEDGE_FILENAME).write_text(
        json.dumps({"formato": 2, "regras": [], "sha256": ""}), encoding="utf-8"
    )
    assert "mais novo" in branch.sync()["erro"]
    assert len(KnowledgeRepository().all_rules()) == 1


def test_sync_endpoints_and_publishing_after_the_admin_teaches(client, tools, tmp_path):  # noqa: F811
    status = client.get("/assistente/conhecimento/sincronizacao").json()["data"]
    assert (status["papel"], status["total_regras"], status["erro"]) == ("consumer", 0, None)
    assert client.post("/assistente/conhecimento/sincronizar").json()["data"]["erro"] == NO_SOURCE

    folder = tmp_path / "compartilhada"
    published = folder / "latest" / KNOWLEDGE_FILENAME
    client.app.dependency_overrides[get_assistant_admin_service] = lambda: AssistantAdminService(
        role_reader=lambda: "publisher", sleep=lambda s: None
    )
    client.app.dependency_overrides[get_assistant_knowledge_sync_service] = lambda: _service(
        tmp_path, "publicadora", role="publisher", official_base_dir=str(folder)
    )
    try:
        assert client.post("/assistente/admin/senha", json={"senha_nova": "senha-de-teste-123"}).status_code == 200
        token = client.post("/assistente/admin/login", json={"senha": "senha-de-teste-123"}).json()["data"]["token"]
        auth = {"X-Admin-Token": token}
        rule = {"codigo_a": RULE[0], "codigo_b": RULE[1], "tipo": RULE[2], "observacao": RULE[3]}

        created = client.post("/assistente/conhecimento", json=rule, headers=auth).json()["data"]
        assert json.loads(published.read_text(encoding="utf-8"))["total_regras"] == 1

        assert client.delete(f"/assistente/conhecimento/{created['id']}", headers=auth).status_code == 200
        assert json.loads(published.read_text(encoding="utf-8"))["total_regras"] == 0
    finally:
        client.app.dependency_overrides.clear()


def test_examples_sync_validates_before_replacing_knowledge(tools, tmp_path):  # noqa: F811
    from app.services.assistant_examples_service import AssistantExamplesService

    folder = tmp_path / "shared"
    publisher = _service(tmp_path, "publisher", role="publisher", official_base_dir=str(folder))
    consumer = _service(tmp_path, "consumer", official_base_dir=str(folder))
    publisher.examples = AssistantExamplesService(str(tmp_path / "publisher" / "examples.json"))
    consumer.examples = AssistantExamplesService(str(tmp_path / "consumer" / "examples.json"))
    values = [{"pergunta": "baleia", "consulta": "Scania 440 DC13"}]
    publisher.examples.replace(values)
    tools.knowledge.add_rule(*RULE)
    publisher.sync()
    assert consumer.sync()["total_exemplos"] == 1
    assert consumer.examples.list() == values
    path = folder / "latest" / KNOWLEDGE_FILENAME
    payload = json.loads(path.read_text(encoding="utf-8"))
    payload["exemplos"][0]["consulta"] = "alterado"
    path.write_text(json.dumps(payload), encoding="utf-8")
    KnowledgeRepository().replace_all([])
    assert consumer.sync()["erro"]
    assert consumer.examples.list() == values
    assert KnowledgeRepository().export_rules() == []
