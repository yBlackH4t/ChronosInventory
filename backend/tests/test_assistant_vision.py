"""
Foto da plaqueta (docs/PLANO_IA.md, Fase 4): o modelo que le imagem transcreve os codigos e a
pergunta segue como se a pessoa tivesse digitado. Sem rede: o Groq e simulado.
"""

import base64
import io
from types import SimpleNamespace

import pytest
from PIL import Image

from app.services.assistant_common import AssistantUnavailableError
from app.services.assistant_config_store import AssistantConfigStore
from app.services.assistant_vision_service import VISION_MODEL, AssistantVisionService, parse_codes
from backend.app.api.deps import get_assistant_vision_service
from test_assistant_tools import tools  # noqa: F401  (fixture: catalogo + produtos de teste)

GROQ_KEY = "gsk_chave-de-teste-visao"


def _png(width=320, height=120):
    out = io.BytesIO()
    Image.new("RGB", (width, height), (200, 200, 200)).save(out, "PNG")
    return out.getvalue()


class FakePost:
    def __init__(self, content="466646-5041S", status=200):
        self.content, self.status, self.calls = content, status, []

    def __call__(self, url, headers=None, json=None, timeout=None):
        self.calls.append(SimpleNamespace(url=url, headers=headers, json=json))
        body = {"choices": [{"message": {"content": self.content}}]}
        return SimpleNamespace(status_code=self.status, json=lambda: body)


def _vision(tmp_path, post, key=GROQ_KEY):
    store = AssistantConfigStore(str(tmp_path / "cfg.json"))
    if key:
        store.update(provedor="groq", api_key=key)
    return AssistantVisionService(config_store=store, http_post=post)


def test_reads_the_codes_from_the_photo(tmp_path):
    post = FakePost("<think>vejo uma plaqueta</think>\nASSEMBLY No. 4031196\n20993930\nHX55W")
    codes = _vision(tmp_path, post).read_codes(_png())

    assert codes == ["ASSEMBLY No. 4031196", "20993930"]  # o modelo da turbina sozinho nao e codigo
    (call,) = post.calls
    assert call.headers == {"Authorization": f"Bearer {GROQ_KEY}"}
    assert call.json["model"] == VISION_MODEL
    image = call.json["messages"][0]["content"][1]["image_url"]["url"]
    assert image.startswith("data:image/png;base64,")


def test_big_photos_are_shrunk_before_sending(tmp_path):
    post = FakePost()
    _vision(tmp_path, post).read_codes(_png(4000, 3000))
    url = post.calls[0].json["messages"][0]["content"][1]["image_url"]["url"]
    assert url.startswith("data:image/jpeg;base64,")
    sent = Image.open(io.BytesIO(base64.b64decode(url.split(",", 1)[1])))
    assert max(sent.size) == 1600


@pytest.mark.parametrize(
    "post, key, message",
    [
        (FakePost("NADA"), GROQ_KEY, "Não consegui ler o código"),
        (FakePost(status=429), GROQ_KEY, "Limite gratuito"),
        (FakePost(), None, "Sem chave do Groq"),
    ],
)
def test_problems_are_explained(tmp_path, post, key, message):
    with pytest.raises(AssistantUnavailableError, match=message):
        _vision(tmp_path, post, key=key).read_codes(_png())


def test_parse_codes_keeps_only_lines_with_codes():
    assert parse_codes("- 466646-5041S\n* `53279887116`\nGarrett\n466646-5041S") == ["466646-5041S", "53279887116"]


def test_photo_in_the_app_chat(client, tools):  # noqa: F811
    class Reader:
        def __init__(self, error=None):
            self.error = error

        def read_as_question(self, image):
            if self.error:
                raise self.error
            return "Foto da plaqueta: 4031196"

    client.app.dependency_overrides[get_assistant_vision_service] = lambda: Reader()
    try:
        response = client.post(
            "/assistente/chat/foto",
            files={"foto": ("placa.jpg", b"\xff\xd8 foto", "image/jpeg")},
            data={"mensagem": "temos?", "historico": "[]"},
        )
        assert response.status_code == 200, response.text
        data = response.json()["data"]
        assert data["leitura_foto"] == "Foto da plaqueta: 4031196"
        assert data["resposta"].startswith("*4031196*: temos.")

        client.app.dependency_overrides[get_assistant_vision_service] = lambda: Reader(
            AssistantUnavailableError("Não consegui ler o código na foto.")
        )
        failed = client.post("/assistente/chat/foto", files={"foto": ("placa.jpg", b"\xff\xd8", "image/jpeg")})
        assert failed.status_code == 422
        assert failed.json()["error"]["code"] == "foto_ilegivel"
    finally:
        client.app.dependency_overrides.clear()
