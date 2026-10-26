from types import SimpleNamespace

from app.services.assistant_admin_service import AssistantAdminService
from app.services.assistant_examples_service import AssistantExamplesService
from backend.app.api.deps import get_assistant_admin_service, get_assistant_knowledge_sync_service


def test_examples_require_publisher_admin_and_publish_after_approval(client, tmp_path):
    published = []
    service = SimpleNamespace(examples=AssistantExamplesService(str(tmp_path / "examples.json")),
                              publish_in_background=lambda: published.append(True))
    client.app.dependency_overrides[get_assistant_admin_service] = lambda: AssistantAdminService(
        role_reader=lambda: "publisher", sleep=lambda seconds: None)
    client.app.dependency_overrides[get_assistant_knowledge_sync_service] = lambda: service
    try:
        values = [{"pergunta": "baleia", "consulta": "Scania 440 DC13"}]
        assert client.put("/assistente/exemplos", json=values).status_code == 403
        client.post("/assistente/admin/senha", json={"senha_nova": "senha-local-teste"})
        token = client.post("/assistente/admin/login", json={"senha": "senha-local-teste"}).json()["data"]["token"]
        headers = {"X-Admin-Token": token}
        assert client.put("/assistente/exemplos", json=values, headers=headers).json()["data"] == values
        assert client.get("/assistente/exemplos", headers=headers).json()["data"] == values
        assert published == [True]
        assert client.put("/assistente/exemplos", json=values * 2, headers=headers).status_code == 400
        assert service.examples.list() == values
    finally:
        client.app.dependency_overrides.clear()
