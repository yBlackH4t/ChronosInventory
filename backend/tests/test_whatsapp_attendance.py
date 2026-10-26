import pytest

from app.services.whatsapp_bridge_service import WaMessage, WhatsAppBridge
from app.services.assistant_attendance_service import compatible_reply
from test_whatsapp_bridge import BOSS, ME, _msg, _react, setup  # noqa: F401


def draft_question(state, text="turbina Scania 440", answer="Qual é o motor?"):
    state.bridge.review_enabled = lambda: True
    state.chat.answer = answer
    _msg(state, BOSS, "question", BOSS, text=text)
    _react(state, BOSS, "question")
    return state.bridge.list_drafts()[0]


def test_short_answer_must_match_the_requested_field():
    assert compatible_reply("DC13", ["motor"])
    assert compatible_reply("2015", ["ano"])
    assert not compatible_reply("DC13", ["ano"])
    assert not compatible_reply("2015", ["motor"])
    assert compatible_reply("Euro 5", ["norma"])
    assert not compatible_reply("obrigado", ["motor", "ano"])


def restart(state):
    state.bridge = WhatsAppBridge(state.transport, chat_service=state.chat, transcriber=state.transcriber,
        history=state.history, clock=state.clock, vision=state.vision, run_async=lambda function: function(),
        review_enabled=lambda: True)


def test_question_only_waits_after_approved_send_and_persists(setup):  # noqa: F811
    state = setup
    draft = draft_question(state)
    assert state.bridge.list_sessions()[0]["estado"] == "em_revisao"
    restart(state)
    assert state.bridge.list_drafts()[0]["id"] == draft["id"]
    assert state.bridge.send_draft(draft["id"])
    restart(state)
    assert state.bridge.list_sessions()[0]["estado"] == "aguardando_cliente"
    state.clock.now += 1
    message = WaMessage(chat=BOSS, id="answer", sender=BOSS, from_me=False, timestamp=state.clock(),
                        text="DC13, 2015", quoted_message_id="sent-1")
    state.bridge.handle(message)
    assert len(state.chat.calls) == 1
    _react(state, BOSS, "answer")
    assert state.chat.calls[-1]["historico"][-1]["texto"] == "Qual é o motor?"
    assert state.bridge.list_drafts()[0]["atendimento_id"] == draft["atendimento_id"]


def test_failed_or_unconfirmed_send_keeps_draft(setup):  # noqa: F811
    state = setup
    draft = draft_question(state)
    state.transport.reply = lambda target, text: None
    with pytest.raises(RuntimeError):
        state.bridge.send_draft(draft["id"])
    restart(state)
    assert state.bridge.list_drafts()[0]["id"] == draft["id"]
    assert state.bridge.list_sessions()[0]["estado"] == "em_revisao"


def test_actual_edited_question_drives_context(setup):  # noqa: F811
    state = setup
    draft = draft_question(state)
    state.bridge.send_draft(draft["id"], "Qual é o ano?")
    session = state.bridge.list_sessions()[0]
    assert session["pendencias"][0]["campos"] == ["ano"]
    assert session["historico"][-1]["texto"] == "Qual é o ano?"


def test_short_engine_answer_without_quote_uses_only_one_sent_question(setup):  # noqa: F811
    state = setup
    draft = draft_question(state)
    state.bridge.send_draft(draft["id"])
    _msg(state, BOSS, "reply", BOSS, text="DC13, 2015", dt=4)
    _react(state, BOSS, "reply")
    assert state.chat.calls[-1]["historico"][-1]["texto"] == "Qual é o motor?"
    assert state.chat.calls[-1]["mensagem"] == "DC13, 2015"
    assert state.bridge.list_sessions()[0]["estado"] == "em_revisao"


def test_relevant_answer_refreshes_timeout_and_discard_restores_sent_pending_question(setup):  # noqa: F811
    state = setup
    draft = draft_question(state)
    state.bridge.send_draft(draft["id"])
    state.clock.now += 1100
    _msg(state, BOSS, "reply", BOSS, text="DC13", dt=1)
    _react(state, BOSS, "reply")
    next_draft = state.bridge.list_drafts()[0]
    state.clock.now += 200
    state.bridge.discard_draft(next_draft["id"])
    assert state.bridge.list_sessions()[0]["estado"] == "aguardando_cliente"


def test_unknown_quote_does_not_fall_back_to_another_pending_context(setup):  # noqa: F811
    state = setup
    draft = draft_question(state)
    state.bridge.send_draft(draft["id"])
    message = WaMessage(chat=BOSS, id="unrelated", sender=BOSS, from_me=False,
                        timestamp=state.clock() + 1, text="DC13", quoted_message_id="SOME_OTHER_QUESTION")
    state.bridge.handle(message)
    _react(state, BOSS, "unrelated")
    assert len(state.chat.calls) == 1
    assert "Não consegui vincular" in state.bridge.list_drafts()[-1]["texto"]


def test_discard_does_not_create_sent_question(setup):  # noqa: F811
    state = setup
    draft = draft_question(state)
    assert state.bridge.discard_draft(draft["id"])
    session = state.bridge.list_sessions()[0]
    assert session["historico"] == [] and session["pendencias"] == []
    assert state.transport.replies == []
    _msg(state, BOSS, "different", BOSS, text="tem 4031196?", dt=5)
    _react(state, BOSS, "different")
    assert state.chat.calls[-1]["mensagem"] == "tem 4031196?"
    assert state.chat.calls[-1]["historico"] == []


def test_failed_audio_prevents_partial_answer_even_with_pasted_code(setup):  # noqa: F811
    state = setup
    state.transcriber.error = RuntimeError("Não transcrito")
    _msg(state, BOSS, "code", BOSS, text="4031196")
    _msg(state, BOSS, "audio", BOSS, audio=True, dt=2)
    _react(state, BOSS, "audio")
    assert state.chat.calls == [] and state.transport.replies == []


@pytest.mark.parametrize("end", ["close", "expire", "new_topic"])
def test_closed_expired_or_new_topic_does_not_inherit_engine(setup, end):  # noqa: F811
    state = setup
    draft = draft_question(state)
    state.bridge.send_draft(draft["id"])
    if end == "close":
        state.bridge.close_session(draft["atendimento_id"])
    if end == "expire":
        state.clock.now += 1201
    _msg(state, BOSS, "next", BOSS, text="tem 4031196?" if end == "new_topic" else "DC13", dt=5)
    _react(state, BOSS, "next")
    assert state.chat.calls[-1]["historico"] == []


def test_other_sender_and_chat_cannot_use_pending_context(setup):  # noqa: F811
    state = setup
    draft = draft_question(state)
    state.bridge.send_draft(draft["id"])
    _msg(state, ME, "other", ME, text="DC13", dt=5)
    _react(state, ME, "other")
    assert state.chat.calls[-1]["historico"] == []


def test_multiple_pending_items_require_selection(setup):  # noqa: F811
    state = setup
    draft = draft_question(state)
    state.bridge.send_draft(draft["id"])
    service = state.bridge.attendance
    session = service.all("atendimentos")[0]
    service.save("atendimentos", {**session, "pendencias": [
        {"pedido_id": "1", "campos": ["motor"]}, {"pedido_id": "2", "campos": ["motor"]}]})
    _msg(state, BOSS, "short", BOSS, text="DC13", dt=5)
    _react(state, BOSS, "short")
    assert len(state.chat.calls) == 1
    assert "qual peça/pedido" in state.bridge.list_drafts()[-1]["texto"]


def test_expired_draft_cannot_be_sent(setup):  # noqa: F811
    state = setup
    draft = draft_question(state)
    state.clock.now += 1201
    with pytest.raises(ValueError):
        state.bridge.send_draft(draft["id"])
    assert state.transport.replies == []


def test_stock_change_requires_new_approval(setup):  # noqa: F811
    from types import SimpleNamespace
    from app.services.assistant_chat_service import _summarize_call

    state = setup
    draft = draft_question(state)
    current = {"produtos": [{"id": 1, "nome": "TURBO", "estoque_total": 1}]}
    original = _summarize_call("buscar_por_codigo", {"codigo": "4031196"}, current)
    state.bridge._drafts[draft["id"]].evidence = [original]
    state.chat.tools = SimpleNamespace(run_tool=lambda name, arguments: {
        "produtos": [{"id": 1, "nome": "TURBO", "estoque_total": 0}]})
    with pytest.raises(ValueError, match="estoque mudou"):
        state.bridge.send_draft(draft["id"])
    assert state.transport.replies == []
    assert state.bridge.list_drafts()


def test_account_change_hides_and_blocks_old_drafts(setup):  # noqa: F811
    state = setup
    state.transport.phone_number = lambda: "account1"
    draft = draft_question(state)
    state.transport.phone_number = lambda: "account2"
    assert state.bridge.list_drafts() == []
    with pytest.raises(ValueError, match="outra conta"):
        state.bridge.send_draft(draft["id"])
    assert state.transport.replies == []


def test_account_change_also_clears_unprocessed_message_buffer(setup):  # noqa: F811
    state = setup
    state.transport.phone_number = lambda: "account1"
    _msg(state, BOSS, "old", BOSS, text="4031196")
    state.transport.phone_number = lambda: "account2"
    _msg(state, BOSS, "new", BOSS, text="5452349", dt=1)
    _react(state, BOSS, "new")
    assert state.chat.calls[-1]["mensagem"] == "5452349"
