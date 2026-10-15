"""Ponte WhatsApp do assistente em modo copiloto (docs/PLANO_IA.md, Fase 3), com WhatsApp falso."""

import json
from types import SimpleNamespace

import pytest

from app.services import assistant_admin_service
from app.services.assistant_admin_service import AssistantAdminService
from app.services.assistant_common import AssistantUnavailableError
from app.services.assistant_config_store import AssistantConfigStore
from app.services.assistant_history_service import AssistantHistoryService
from app.services.assistant_transcription_service import AssistantTranscriptionService
from app.services.whatsapp_bridge_service import ERROR_REACTION, HELP_TEXT, WaMessage, WhatsAppBridge
from app.services.whatsapp_service import WhatsAppService
from backend.app.api.deps import get_assistant_admin_service, get_whatsapp_service

BOSS = "5551999990000@s.whatsapp.net"
ME = "5551988887777@s.whatsapp.net"


class FakeTransport:
    def __init__(self):
        self.replies, self.reactions, self.to_self = [], [], []
        self.audio, self.images = {}, {}

    def is_self_chat(self, chat):
        return chat == ME

    def reply(self, target, text):
        self.replies.append((target.id, text))
        return f"sent-{len(self.replies)}"

    def react(self, target, emoji):
        self.reactions.append((target.id, emoji))

    def send_to_self(self, text):
        self.to_self.append(text)
        return f"self-{len(self.to_self)}"

    def download_audio(self, message):
        return self.audio[message.id]

    def download_image(self, message):
        return self.images[message.id]


class FakeChat:
    def __init__(self, answer="Sim. *TURBINA HOLSET HX55W 4031196* — 2 em Canoas", error=None):
        self.answer, self.error, self.calls = answer, error, []

    def chat(self, mensagem, historico, canal="app", autor=None):
        self.calls.append({"mensagem": mensagem, "historico": historico, "canal": canal, "autor": autor})
        if self.error:
            raise self.error
        return {"resposta": self.answer}


class FakeTranscriber:
    def __init__(self, text="temos essa daí?", error=None):
        self.text, self.error, self.calls = text, error, 0

    def transcribe(self, audio):
        self.calls += 1
        if self.error:
            raise self.error
        return self.text


class FakeVision:
    def __init__(self, codes="466646-5041S", error=None):
        self.codes, self.error, self.calls = codes, error, 0

    def read_as_question(self, image):
        self.calls += 1
        if self.error:
            raise self.error
        return f"Foto da plaqueta: {self.codes}"


class Clock:
    def __init__(self):
        self.now = 1_000_000.0

    def __call__(self):
        return self.now


@pytest.fixture()
def setup(tmp_path):
    transport, chat, transcriber, clock = FakeTransport(), FakeChat(), FakeTranscriber(), Clock()
    vision = FakeVision()
    history = AssistantHistoryService(str(tmp_path / "historico.db"))
    bridge = WhatsAppBridge(
        transport,
        chat_service=chat,
        transcriber=transcriber,
        history=history,
        clock=clock,
        run_async=lambda f: f(),
        vision=vision,
    )
    return SimpleNamespace(
        bridge=bridge, transport=transport, chat=chat, transcriber=transcriber, clock=clock, history=history, vision=vision
    )


def _msg(s, chat, mid, sender, from_me=False, text=None, audio=False, dt=0, image=False):
    s.clock.now += dt
    message = WaMessage(
        chat=chat, id=mid, sender=sender, from_me=from_me, timestamp=s.clock.now, text=text, is_audio=audio, is_image=image
    )
    if audio:
        s.transport.audio[mid] = b"OggS..."
    if image:
        s.transport.images[mid] = b"\xff\xd8 jpeg"
    s.bridge.handle(message)
    return message


def _react(s, chat, target_id, emoji="🤖", from_me=True):
    s.bridge.handle(
        WaMessage(chat=chat, id=f"r-{target_id}", sender=ME, from_me=from_me, timestamp=s.clock.now, reaction_to=target_id, reaction=emoji)
    )


def test_review_before_sending_turns_the_answer_into_a_draft(setup):
    s = setup
    s.bridge.review_enabled = lambda: True
    _msg(s, BOSS, "m1", BOSS, text="tem a 4031196?")
    _react(s, BOSS, "m1")

    # Nada vai para o cliente: o rascunho aparece no app e na "Mensagem para mim".
    assert s.transport.replies == []
    assert s.transport.reactions == [("m1", "📝")]
    (draft,) = s.bridge.list_drafts()
    assert draft["pergunta"] == "tem a 4031196?" and draft["texto"].startswith("Sim.")
    assert "/enviar 1" in s.transport.to_self[-1]

    # O admin edita e manda (pelo app); o 📝 sai.
    assert s.bridge.send_draft(draft["id"], "Temos 2 em Canoas.") is True
    assert s.transport.replies == [("m1", "Temos 2 em Canoas.")]
    assert s.transport.reactions[-1] == ("m1", "")
    assert s.bridge.send_draft(draft["id"]) is False  # ja foi

    # Pelo celular: "/enviar" com um rascunho so manda ele; "/descartar 3" descarta.
    _msg(s, BOSS, "m2", BOSS, text="e a 4031195?", dt=10)
    _react(s, BOSS, "m2")
    _msg(s, ME, "c1", ME, from_me=True, text="/enviar", dt=5)
    assert s.transport.replies[-1] == ("m2", "Sim. *TURBINA HOLSET HX55W 4031196* — 2 em Canoas")
    _msg(s, BOSS, "m3", BOSS, text="e a 3785479?", dt=10)
    _react(s, BOSS, "m3")
    _msg(s, ME, "c2", ME, from_me=True, text="/descartar 3", dt=5)
    assert s.bridge.list_drafts() == [] and len(s.transport.replies) == 2
    assert s.transport.to_self[-1] == "🗑️ Rascunho #3 descartado."


def test_reaction_answers_the_pasted_code_plus_audio(setup):
    s = setup
    _msg(s, BOSS, "m1", ME, from_me=True, text="Bom dia chefe")
    _msg(s, BOSS, "m2", BOSS, text="805314", dt=60)
    _msg(s, BOSS, "m3", BOSS, audio=True, dt=5)

    _react(s, BOSS, "m3")

    (call,) = s.chat.calls
    assert call["mensagem"] == "805314\ntemos essa daí?"
    assert call["canal"] == "whatsapp" and call["autor"] == BOSS
    assert call["historico"] == [{"papel": "assistente", "texto": "Bom dia chefe"}]
    assert s.transport.replies == [("m3", "Sim. *TURBINA HOLSET HX55W 4031196* — 2 em Canoas")]
    assert s.transport.reactions == [("m3", "")]  # tira o 🤖

    # Reagir de novo na mesma conversa reaproveita a transcricao e enxerga a resposta da ponte.
    _msg(s, BOSS, "m4", BOSS, text="e a 4031195?", dt=30)
    _react(s, BOSS, "m4")
    second = s.chat.calls[1]
    assert second["mensagem"] == "e a 4031195?"
    assert second["historico"][-1] == {"papel": "assistente", "texto": "Sim. *TURBINA HOLSET HX55W 4031196* — 2 em Canoas"}
    assert s.transcriber.calls == 1


def test_photo_of_the_plate_becomes_the_code(setup):
    s = setup
    # Foto sozinha, com 🤖 na foto.
    _msg(s, BOSS, "p1", BOSS, image=True)
    _react(s, BOSS, "p1")
    assert s.chat.calls[-1]["mensagem"] == "Foto da plaqueta: 466646-5041S"
    assert s.transport.replies[-1][0] == "p1" and s.transport.reactions[-1] == ("p1", "")

    # Foto com legenda + pergunta em seguida: tudo vira uma pergunta so.
    _msg(s, BOSS, "p2", BOSS, image=True, text="essa aqui", dt=600)
    _msg(s, BOSS, "p3", BOSS, text="temos?", dt=10)
    _react(s, BOSS, "p3")
    assert s.chat.calls[-1]["mensagem"] == "essa aqui\nFoto da plaqueta: 466646-5041S\ntemos?"
    assert s.vision.calls == 2


def test_unreadable_photo_marks_a_warning(setup):
    s = setup
    s.bridge.vision = FakeVision(error=AssistantUnavailableError("Não consegui ler o código na foto."))
    _msg(s, BOSS, "p1", BOSS, image=True)
    _react(s, BOSS, "p1")
    assert s.chat.calls == []
    assert s.transport.reactions == [("p1", "⚠️")]
    assert "Não consegui ler o código na foto" in s.transport.to_self[-1]


def test_only_the_teams_robot_reaction_triggers(setup):
    s = setup
    _msg(s, BOSS, "m1", BOSS, text="tem a 4031196?")
    _react(s, BOSS, "m1", emoji="👍")
    _react(s, BOSS, "m1", from_me=False)  # o chefe reagindo com 🤖 nao vale
    assert s.chat.calls == []

    _react(s, BOSS, "nao-existe")
    assert s.chat.calls == []
    assert "Não achei a mensagem" in s.transport.to_self[0]


def test_old_messages_are_not_glued_to_the_question(setup):
    s = setup
    _msg(s, BOSS, "m1", BOSS, text="4031195")
    _msg(s, BOSS, "m2", BOSS, text="tem a 805314?", dt=600)  # 10 min depois
    _react(s, BOSS, "m2")
    assert s.chat.calls[0]["mensagem"] == "tem a 805314?"
    assert s.chat.calls[0]["historico"] == [{"papel": "usuario", "texto": "4031195"}]


def test_test_alone_in_the_self_chat(setup):
    # Sem o chefe: tudo na conversa "Mensagem para mim", fazendo o papel do cliente.
    s = setup
    _msg(s, ME, "s1", ME, from_me=True, text="805314")
    _msg(s, ME, "s2", ME, from_me=True, audio=True, dt=4)
    _react(s, ME, "s2")
    assert s.chat.calls[0]["mensagem"] == "805314\ntemos essa daí?"
    assert s.chat.calls[0]["autor"] is None


def test_failures_mark_the_message_with_a_warning(setup):
    s = setup
    s.transcriber.error = AssistantUnavailableError("Sem chave do Groq para transcrever o áudio.")
    _msg(s, BOSS, "m1", BOSS, audio=True)
    _react(s, BOSS, "m1")
    assert s.chat.calls == []
    assert s.transport.reactions == [("m1", ERROR_REACTION)]
    assert "Sem chave do Groq" in s.transport.to_self[0]

    s.chat.error = RuntimeError("caiu")
    _msg(s, BOSS, "m2", BOSS, text="tem a 4031196?", dt=1)
    _react(s, BOSS, "m2")
    assert s.transport.reactions[-1] == ("m2", ERROR_REACTION)
    assert s.transport.replies == []


def test_commands_only_in_the_self_chat(setup):
    s = setup
    _msg(s, BOSS, "c0", ME, from_me=True, text="/pendentes")  # na conversa do chefe: ignorado
    assert s.transport.to_self == []

    _msg(s, ME, "c1", ME, from_me=True, text="/ajuda")
    assert s.transport.to_self[-1] == HELP_TEXT

    _msg(s, ME, "c2", ME, from_me=True, text="/ensinar 5327-988-7101 similar 5327-988-7210 muda o atuador")
    assert s.transport.to_self[-1].startswith("📝 Proposta #1: 53279887101 *similar* 53279887210 (muda o atuador).")
    (proposal,) = s.history.list_proposals("pendente")
    assert (proposal["codigo_a"], proposal["tipo"], proposal["observacao"]) == ("5327-988-7101", "similar", "muda o atuador")

    _msg(s, ME, "c3", ME, from_me=True, text="/ensinar HX55 igual 4031196")
    assert "não parece um código" in s.transport.to_self[-1]
    _msg(s, ME, "c4", ME, from_me=True, text="/ensinar 4031196 parecido 4044318")
    assert s.transport.to_self[-1].startswith("Use assim:")
    _msg(s, ME, "c4b", ME, from_me=True, text="/ensinar 465819-5003/53169887185 igual 4031196")
    assert s.transport.to_self[-1].startswith("Um código por regra")

    _msg(s, ME, "c5", ME, from_me=True, text="/pendentes")
    assert s.transport.to_self[-1].startswith("Propostas esperando o admin: 1")

    s.bridge.summary = SimpleNamespace(build_text=lambda: "*Resumo do estoque — hoje*")
    _msg(s, ME, "c5b", ME, from_me=True, text="/resumo")
    assert s.transport.to_self[-1] == "*Resumo do estoque — hoje*"

    # Mensagem repetida (o WhatsApp reenvia as vezes) nao roda o comando duas vezes.
    count = len(s.transport.to_self)
    _msg(s, ME, "c5", ME, from_me=True, text="/pendentes")
    assert len(s.transport.to_self) == count


def test_transcription_service_uses_groq_whisper(tmp_path, monkeypatch):
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    store = AssistantConfigStore(str(tmp_path / "cfg.json"))
    calls = []

    def post(url, **kwargs):
        calls.append((url, kwargs))
        return SimpleNamespace(status_code=200, json=lambda: {"text": " temos essa daí? "})

    service = AssistantTranscriptionService(config_store=store, http_post=post)
    with pytest.raises(AssistantUnavailableError, match="Sem chave do Groq"):
        service.transcribe(b"OggS")

    store.update(provedor="groq", api_key="gsk_teste")
    assert service.transcribe(b"OggS") == "temos essa daí?"
    url, kwargs = calls[0]
    assert url.endswith("/audio/transcriptions")
    assert kwargs["headers"]["Authorization"] == "Bearer gsk_teste"
    assert kwargs["data"]["language"] == "pt"
    assert kwargs["files"]["file"][0] == "audio.ogg"


class FakeLibTransport:
    def __init__(self, session_path, on_message, on_qr, on_state):
        self.session_path, self.on_message, self.on_qr, self.on_state = session_path, on_message, on_qr, on_state
        self.started = self.stopped = self.logged_out = False

    def start(self):
        self.started = True

    def stop(self):
        self.stopped = True

    def logout(self):
        self.logged_out = True

    def phone_number(self):
        return "5551988887777"


def _service(tmp_path):
    created = []

    def factory(session_path, **callbacks):
        created.append(FakeLibTransport(session_path, **callbacks))
        return created[-1]

    service = WhatsAppService(
        transport_factory=factory,
        bridge_factory=lambda transport: SimpleNamespace(handle=lambda m: None),
        config_store=AssistantConfigStore(str(tmp_path / "cfg.json")),
        session_dir=str(tmp_path),
    )
    return service, created


def test_backup_pc_answers_only_when_the_main_pc_is_not_answering(tmp_path, setup):
    health = {"whatsapp_robo": True}
    calls = []

    def primary_health(server):
        calls.append(server)
        if health is None:
            raise ConnectionError("desligado")
        return health

    service = WhatsAppService(
        config_store=AssistantConfigStore(str(tmp_path / "cfg.json")),
        session_dir=str(tmp_path),
        official_config_reader=lambda: {"role": "consumer", "remote_server_url": "http://192.168.0.10:8765"},
        primary_health=primary_health,
    )
    assert service.should_answer() is False  # o principal esta com o robo ligado
    assert service.status()["papel_robo"] == "reserva" and service.status()["principal_respondendo"] is True

    # PC principal desligado (ferias): a reserva assume, inclusive comandos e resumo.
    health = None
    service._primary_cache = None
    assert service.should_answer() is True

    # Na ponte: com o principal respondendo, a reserva nao responde o 🤖 nem executa comandos.
    s = setup
    s.bridge.should_answer = lambda: False
    _msg(s, BOSS, "m1", BOSS, text="tem a 4031196?")
    _react(s, BOSS, "m1")
    _msg(s, ME, "c1", ME, from_me=True, text="/ensinar 4031196 igual 4031195", dt=5)
    assert s.transport.replies == [] and s.chat.calls == [] and s.history.list_proposals() == []
    # O principal saiu do ar: o proximo 🤖 a reserva responde.
    s.bridge.should_answer = lambda: True
    _react(s, BOSS, "m1")
    assert s.transport.replies and s.transport.replies[-1][0] == "m1"

    # A publicadora e sempre o principal.
    principal = WhatsAppService(
        config_store=AssistantConfigStore(str(tmp_path / "cfg2.json")),
        official_config_reader=lambda: {"role": "publisher", "remote_server_url": "http://x"},
        primary_health=primary_health,
    )
    assert principal.should_answer() is True and principal.status()["papel_robo"] == "principal"


def test_whatsapp_service_lifecycle(tmp_path):
    service, created = _service(tmp_path)
    assert service.status() == {
        "estado": "parado", "qr": None, "numero": None, "erro": None, "ativo": False, "revisar": True,
        "papel_robo": "principal", "principal_respondendo": None,
    }

    service.start()
    transport = created[0]
    assert transport.started and transport.session_path.endswith("whatsapp_sessao.db")
    transport.on_qr("2@abc,def")
    assert service.status()["estado"] == "aguardando_qr" and service.status()["qr"] == "2@abc,def"
    transport.on_state("conectado")
    status = service.status()
    assert (status["estado"], status["qr"], status["numero"], status["ativo"]) == ("conectado", None, "5551988887777", True)

    # Fechar o backend nao "esquece" que estava ligado; com sessao salva, religa sozinho.
    service.stop(remember=False)
    (tmp_path / "whatsapp_sessao.db").write_bytes(b"")
    service.start_if_enabled()
    assert len(created) == 2

    # Tirado da lista de aparelhos pelo celular: precisa de QR de novo.
    created[1].on_state("desconectado")
    assert service.status()["estado"] == "desconectado" and service.status()["ativo"] is False

    # "Conectar" de novo: fecha a conexao morta e abre outra, que mostra um QR novo.
    service.start()
    assert created[1].stopped and len(created) == 3 and created[2].started
    created[2].on_qr("2@novo")
    assert service.status()["estado"] == "aguardando_qr" and service.status()["qr"] == "2@novo"

    service.logout()
    assert created[2].logged_out and not (tmp_path / "whatsapp_sessao.db").exists()


def test_proposals_and_whatsapp_endpoints(client, tmp_path, monkeypatch):
    assistant_admin_service._SESSIONS.clear()
    service, created = _service(tmp_path)
    client.app.dependency_overrides[get_assistant_admin_service] = lambda: AssistantAdminService(
        role_reader=lambda: "publisher", sleep=lambda s: None
    )
    client.app.dependency_overrides[get_whatsapp_service] = lambda: service
    try:
        assert client.get("/assistente/whatsapp/status").status_code == 403
        client.post("/assistente/admin/senha", json={"senha_nova": "turbina-segura"})
        token = client.post("/assistente/admin/login", json={"senha": "turbina-segura"}).json()["data"]["token"]
        auth = {"X-Admin-Token": token}

        started = client.post("/assistente/whatsapp/iniciar", headers=auth).json()["data"]
        assert started["estado"] == "conectando" and started["ativo"] is True
        created[0].on_qr("2@qr-de-teste")
        assert client.get("/assistente/whatsapp/status", headers=auth).json()["data"]["qr"] == "2@qr-de-teste"
        assert client.post("/assistente/whatsapp/parar", headers=auth).json()["data"]["estado"] == "parado"

        # Proposta vinda do WhatsApp: so vale depois de aprovada.
        history = AssistantHistoryService()
        pid = history.add_proposal("5327-988-7101", "5327-988-7116", "similar", "muda o atuador", autor="whatsapp")
        rejected = history.add_proposal("4031196", "4044318", "igual", None, autor="whatsapp")
        pending = client.get("/assistente/propostas", headers=auth).json()["data"]
        assert [p["id"] for p in pending] == [pid, rejected]

        approved = client.post(f"/assistente/propostas/{pid}/aprovar", headers=auth)
        assert approved.status_code == 200, approved.text
        assert approved.json()["data"]["tipo"] == "similar"
        assert client.post(f"/assistente/propostas/{rejected}/recusar", headers=auth).status_code == 200
        assert client.post(f"/assistente/propostas/{pid}/aprovar", headers=auth).status_code == 404  # ja decidida
        assert client.get("/assistente/propostas", headers=auth).json()["data"] == []
        rules = client.get("/assistente/conhecimento").json()["data"]
        assert [(r["codigo_a"], r["codigo_b"]) for r in rules] == [("5327-988-7101", "5327-988-7116")]
        statuses = {p["id"]: p["status"] for p in client.get("/assistente/propostas?status=todas", headers=auth).json()["data"]}
        assert statuses == {pid: "aprovada", rejected: "recusada"}
        assert json.loads(json.dumps(statuses))  # serializavel
    finally:
        client.app.dependency_overrides.clear()
        assistant_admin_service._SESSIONS.clear()


def test_old_messages_are_not_context_for_a_new_request(setup):
    s = setup
    _msg(s, BOSS, "m1", BOSS, text="876271515151517")
    _msg(s, BOSS, "m2", BOSS, text="turbina do scania super 2023 R460", dt=3 * 60 * 60)
    _react(s, BOSS, "m2")
    # O pedido de horas atras (outro cliente, outro assunto) nao entra na pergunta nova.
    assert s.chat.calls[-1]["historico"] == []
