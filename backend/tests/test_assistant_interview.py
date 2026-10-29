"""Modo entrevista: a IA pergunta ao especialista o que ela nao sabe, todo dia (2.7.17)."""

from datetime import datetime

import pytest

from app.services.assistant_config_store import AssistantConfigStore
from app.services.assistant_history_service import AssistantHistoryService
from app.services.assistant_interview_service import (
    KIND_APPLICATION,
    KIND_FICHA,
    KIND_REGISTRY,
    KIND_REVIEW_OPEN,
    KIND_REVIEW_PAIR,
    AssistantInterviewService,
    parse_answer,
)
from app.services.whatsapp_bridge_service import WaMessage, WhatsAppBridge
from core.database.connection import DatabaseConnection
from core.exceptions import ValidationException
from test_assistant_tools import CANOAS, _create_product, tools  # noqa: F401  (fixture: catalogo + produtos)


class _Clock:
    def __init__(self, when: datetime) -> None:
        self.when = when

    def __call__(self) -> datetime:
        return self.when


class _NoSync:
    def publish_in_background(self) -> None:
        pass


@pytest.fixture()
def interview(tools, tmp_path):  # noqa: F811
    from app.services.assistant_teach_service import AssistantTeachService

    history = AssistantHistoryService(str(tmp_path / "historico.db"))
    teacher = AssistantTeachService(knowledge=tools.knowledge, history=history, sync=_NoSync())
    hidden = []
    service = AssistantInterviewService(
        history=history,
        knowledge=tools.knowledge,
        teacher=teacher,
        config_store=AssistantConfigStore(str(tmp_path / "assistente_config.json")),
        clock=_Clock(datetime(2026, 10, 29, 9, 30)),
        hide_application=hidden.append,
    )
    service.hidden = hidden
    return service


def _ask_missing(history: AssistantHistoryService, code: str, times: int = 1) -> None:
    for _ in range(times):
        history.record(
            canal="app", autor=None, pergunta=f"tem a {code}?", historico=[],
            result={"resposta": "não temos", "modo": "busca_direta"},
            consultas=[{"ferramenta": "buscar_por_codigo", "codigo": code, "temos_em_estoque": False}],
        )


def test_parse_answer_understands_words_codes_and_unsure():
    assert parse_answer(KIND_FICHA, "igual") == {"resposta": "igual", "observacao": None}
    assert parse_answer(KIND_FICHA, "similar, muda o atuador") == {"resposta": "similar", "observacao": "muda o atuador"}
    assert parse_answer(KIND_FICHA, "não sei") == {"resposta": "nao_sei"}
    assert parse_answer(KIND_FICHA, "talvez") is None
    assert parse_answer(KIND_APPLICATION, "sim") == {"resposta": "sim"}
    assert parse_answer(KIND_APPLICATION, "não vai") == {"resposta": "nao", "observacao": None}
    assert parse_answer(KIND_REVIEW_OPEN, "nao temos") == {"resposta": "nao_temos"}
    assert parse_answer(KIND_REVIEW_OPEN, "4031196") == {"resposta": "igual", "codigo": "4031196", "observacao": None}
    assert parse_answer(KIND_REVIEW_OPEN, "similar 4031196 muda a carcaça") == {
        "resposta": "similar", "codigo": "4031196", "observacao": "muda a carcaça"
    }


def test_daily_questions_come_from_every_source_and_stay_the_same_all_day(interview, tools, client):  # noqa: F811
    _create_product(client, "TURBO K27 - 53279907101/7210", {CANOAS: 4})
    _ask_missing(interview.history, "3785479", times=3)

    questions = interview.today()
    kinds = [q["tipo"] for q in questions]
    assert len(questions) == 5
    # O que ela nao soube responder vem primeiro; depois as pecas com estoque.
    assert kinds[0] == KIND_REVIEW_OPEN
    assert questions[0]["codigo_a"] == "3785479" and "Perguntaram 3x" in questions[0]["motivo"]
    assert {KIND_FICHA, KIND_REGISTRY, KIND_APPLICATION} <= set(kinds)
    ficha = next(q for q in questions if q["tipo"] == KIND_FICHA)
    assert {ficha["codigo_a"], ficha["codigo_b"]} == {"4031196", "4044318"}
    assert "805314" in ficha["motivo"] and "não quer dizer" in ficha["motivo"]
    registry = next(q for q in questions if q["tipo"] == KIND_REGISTRY)
    assert {registry["codigo_a"], registry["codigo_b"]} == {"53279907101", "53279907210"}
    assert [q["numero"] for q in questions] == [1, 2, 3, 4, 5]
    assert [o["valor"] for o in ficha["opcoes"]] == ["igual", "similar", "diferente", "nao_sei"]

    # Mesmo dia: as mesmas perguntas (nao sorteia de novo a cada vez que abre).
    assert [q["id"] for q in interview.today()] == [q["id"] for q in questions]


def test_answer_teaches_and_the_next_questions_take_it_into_account(interview, tools):  # noqa: F811
    ficha = next(q for q in interview.today() if q["tipo"] == KIND_FICHA)
    done = interview.answer(ficha["id"], "similar", "muda o atuador")
    assert done["estado"] == "respondida" and "Aprendido" in done["resultado"]
    relations = tools.knowledge.relations("4031196")
    assert relations["similares"][0]["obs"] == "muda o atuador"
    with pytest.raises(ValidationException, match="já foi respondida"):
        interview.answer(ficha["id"], "igual")

    # Amanha nao pergunta de novo o que ja foi ensinado.
    interview.clock.when = datetime(2026, 10, 30, 9, 0)
    assert all(q["tipo"] != KIND_FICHA for q in interview.today())


def test_unsure_comes_back_after_a_month_and_unanswered_carry_over(interview):
    first = interview.today()
    interview.answer(first[0]["id"], "nao_sei")

    interview.clock.when = datetime(2026, 10, 30, 9, 0)
    tomorrow = interview.today()
    carried = [q["id"] for q in tomorrow]
    assert first[0]["id"] not in carried
    assert {q["id"] for q in first[1:]} <= set(carried)  # as sem resposta voltam

    interview.clock.when = datetime(2026, 12, 5, 9, 0)
    later = interview.more()
    assert first[0]["chave"] in {q["chave"] for q in later}


def test_open_review_question_teaches_the_code_or_closes_it(interview, client):  # noqa: F811
    _ask_missing(interview.history, "3785479", times=2)
    question = next(q for q in interview.today() if q["tipo"] == KIND_REVIEW_OPEN)
    with pytest.raises(ValidationException, match="qual código"):
        interview.answer(question["id"], "igual")
    done = interview.answer(question["id"], "igual", codigo="4031196")
    assert "Aprendido" in done["resultado"]
    assert interview.knowledge.relations("3785479")["iguais"][0]["codigo"] == "4031196"
    assert interview.history.review_items() == []  # saiu do "Para revisar"

    _ask_missing(interview.history, "9999999", times=1)
    interview.clock.when = datetime(2026, 10, 30, 9, 0)
    other = next(q for q in interview.more() if q["codigo_a"] == "9999999")
    interview.answer(other["id"], "nao_temos")
    assert interview.history.review_items() == []


def test_review_with_a_suggestion_becomes_a_pair_question(interview):
    interview.history.record(
        canal="app", autor=None, pergunta="a 4031195 é igual à 4031196?", historico=[],
        result={"resposta": "não sei", "modo": "busca_direta"},
        consultas=[{"ferramenta": "comparar_codigos", "codigo": "4031195", "outro_codigo": "4031196", "fonte": None}],
    )
    question = interview.today()[0]
    assert question["tipo"] == KIND_REVIEW_PAIR
    assert (question["codigo_a"], question["codigo_b"]) == ("4031195", "4031196")
    assert question["motivo"] == "Perguntaram se a 4031195 é igual à 4031196 e eu não tinha certeza. Temos 2 da 4031196."


def test_application_no_marks_it_as_not_applicable(interview):
    question = next(q for q in interview.today() if q["tipo"] == KIND_APPLICATION)
    # A peca com mais estoque primeiro: a K27 (3) antes da HX55W (2).
    assert question["pergunta"] == "A *53279887116* vai no *Mercedes-Benz Ônibus OF 1318* (OM 366LA)?"
    assert question["dados"]["ficha"] == "802333"
    done = interview.answer(question["id"], "nao")
    assert "Não se aplica" in done["resultado"]
    assert interview.hidden == [question["dados"]]


def test_application_no_hides_the_line_in_the_real_catalog(tools, tmp_path):  # noqa: F811
    from core.catalog.hidden_applications import application_key

    service = AssistantInterviewService(
        history=AssistantHistoryService(str(tmp_path / "h.db")), knowledge=tools.knowledge,
        config_store=AssistantConfigStore(str(tmp_path / "c.json")), clock=_Clock(datetime(2026, 10, 29, 9, 0)),
    )
    data = {"ficha": "805314", "montadora": "Volvo", "veiculo": "Volvo FH 460",
            "motor": "MD13 460/480/500/520 HP Euro 5", "complemento": None}
    import app.services.own_ficha_service as own

    original = own.OwnFichaService.__init__

    def _no_publish(self, *args, **kwargs):
        original(self, *args, **{**kwargs, "after_change": lambda: None})

    own.OwnFichaService.__init__ = _no_publish
    try:
        service._hide_in_catalog(data)
    finally:
        own.OwnFichaService.__init__ = original
    conn = DatabaseConnection().get_connection()
    try:
        keys = {row[0] for row in conn.execute("SELECT chave FROM aplicacoes_ocultas")}
    finally:
        conn.close()
    assert application_key("805314", data) in keys


def test_settings_and_due(interview):
    assert interview.settings()["quantidade"] == 5 and interview.settings()["hora"] == "09:00"
    assert interview.due() is True
    interview.mark_sent()
    assert interview.due() is False
    with pytest.raises(ValidationException):
        interview.update_settings(hora="9h")
    with pytest.raises(ValidationException):
        interview.update_settings(quantidade=20)
    assert interview.update_settings(quantidade=3, ativo=False)["quantidade"] == 3
    assert interview.due(datetime(2026, 10, 31, 10, 0)) is False


# ----------------------------------------------------------------------
# WhatsApp: /perguntas, /r e /confirmar <PIN>
# ----------------------------------------------------------------------


class _Transport:
    def __init__(self) -> None:
        self.sent = []

    def is_self_chat(self, chat):
        return chat == "eu"

    def send_to_self(self, text):
        self.sent.append(text)
        return "id"

    def phone_number(self):
        return "5551"


class _Admin:
    def __init__(self) -> None:
        self.pin = "4321"

    def is_publisher(self):
        return True

    def has_whatsapp_pin(self):
        return True

    @staticmethod
    def whatsapp_pin_blocked():
        return False

    def check_whatsapp_pin(self, pin):
        return pin == self.pin


def _command(bridge, transport, text):
    bridge.command(WaMessage(chat="eu", id=text, sender="eu", from_me=True, timestamp=0, text=text))
    return transport.sent[-1]


def test_whatsapp_answers_wait_for_the_pin(interview, tools):  # noqa: F811
    transport = _Transport()
    bridge = WhatsAppBridge(transport, chat_service=object(), transcriber=object(), vision=object(),
                            history=interview.history, interview=interview, run_async=lambda fn: fn())
    bridge.admin = _Admin()

    text = _command(bridge, transport, "/perguntas")
    assert text.startswith("*Perguntas do dia — 29/10*")
    assert "/confirmar <PIN>" in text
    ficha = next(q for q in interview.today() if q["tipo"] == KIND_FICHA)

    reply = _command(bridge, transport, f"/r {ficha['numero']} igual")
    assert "anotei *igual*" in reply
    assert tools.knowledge.relations("4031196")["iguais"] == []  # ainda nao vale sem o PIN
    assert "não entendi" in _command(bridge, transport, f"/r {ficha['numero']} talvez").lower()

    assert _command(bridge, transport, "/confirmar 0000") == "PIN incorreto."
    done = _command(bridge, transport, "/confirmar 4321")
    assert "Aprendido" in done
    assert [r["codigo"] for r in tools.knowledge.relations("4031196")["iguais"]] == ["4044318"]
    assert "Nenhuma resposta esperando" in _command(bridge, transport, "/confirmar 4321")


def test_whatsapp_service_sends_the_questions_once_a_day(interview):
    from app.services.whatsapp_service import STATE_CONNECTED, WhatsAppService

    transport = _Transport()
    service = WhatsAppService(config_store=interview.config_store, interview_factory=lambda: interview,
                              is_publisher=lambda: True)
    service._transport, service.state = transport, STATE_CONNECTED
    assert service.send_interview_if_due() is True
    assert transport.sent[-1].startswith("*Perguntas do dia")
    assert service.send_interview_if_due() is False  # ja mandou hoje

    other = WhatsAppService(config_store=AssistantConfigStore(interview.config_store.config_path + ".2"),
                            interview_factory=lambda: interview, is_publisher=lambda: False)
    other._transport, other.state = _Transport(), STATE_CONNECTED
    interview.config_store = other.config_store
    assert other.send_interview_if_due() is False  # PC que nao publica a base nao pergunta


def test_pairs_the_company_already_relates_are_not_asked(interview, client):  # noqa: F811
    # A nova e a reman (RX) da mesma peca, e o nome de um produto nosso que ja junta os dois
    # codigos: os dados da empresa ja dizem. Antes perguntava "3797851 e 4031196RX".
    ficha = next(q for q in interview.today() if q["tipo"] == KIND_FICHA)
    _create_product(client, "TURBO HOLSET HX55W - 4044318/4031196RX", {CANOAS: 1})

    interview.clock.when = datetime(2026, 10, 29, 15, 0)  # mesmo dia: a pendente sai da lista
    assert ficha["id"] not in [q["id"] for q in interview.today()]
    interview.clock.when = datetime(2026, 10, 30, 9, 0)
    assert all(q["tipo"] != KIND_FICHA for q in interview.more())


def test_reman_code_is_shown_as_reman():
    from app.services.assistant_interview_service import _shown

    assert _shown("4031196RX") == "4031196RX (reman)"
    assert _shown("4031196") == "4031196"
