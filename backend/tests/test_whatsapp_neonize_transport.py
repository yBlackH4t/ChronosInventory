"""
Mensagens que a ponte manda pela neonize (citacao e reacao), montadas sem conectar ao WhatsApp.

No primeiro teste com celular a resposta chegou sem a citacao e o 🤖 nao saiu: a citacao
precisa do autor no mesmo tipo de endereco da conversa (numero ou LID), e a reacao usa a
chave exatamente como o WhatsApp da equipe mandou.
"""

import logging
from collections import OrderedDict

import pytest

E2E = pytest.importorskip("neonize.proto.waE2E.WAWebProtobufsE2E_pb2")
N = pytest.importorskip("neonize.proto.Neonize_pb2")
WACommon = pytest.importorskip("neonize.proto.waCommon.WACommon_pb2")

from app.services.whatsapp_neonize_transport import NeonizeTransport, _quoted_content  # noqa: E402

OWN_NUMBER = "5551999990000"
OWN_LID = "111122223333"
BOSS_NUMBER = "5551988887777"
BOSS_LID = "444455556666"


def jid(user, server, device=0):
    return N.JID(User=user, RawAgent=0, Device=device, Integrator=0, Server=server, IsEmpty=False)


def event(msg_id, chat, sender, from_me, message, sender_alt=None):
    source = N.MessageSource(Chat=chat, Sender=sender, IsFromMe=from_me, IsGroup=False)
    if sender_alt is not None:
        source.SenderAlt.CopyFrom(sender_alt)
    info = N.MessageInfo(MessageSource=source, ID=msg_id, Timestamp=1_700_000_000)
    return N.Message(Info=info, Message=message)


class FakeClient:
    def __init__(self):
        self.sent = []

    def get_me(self):
        return N.Device(JID=jid(OWN_NUMBER, "s.whatsapp.net"), LID=jid(OWN_LID, "lid"))

    def send_message(self, to, message):
        self.sent.append((to, message))
        return N.SendResponse(ID=f"ENVIADA{len(self.sent)}")

    def build_reaction(self, chat, sender, message_id, emoji):
        key = WACommon.MessageKey(remoteJID=f"{chat.User}@{chat.Server}", fromMe=True, ID=message_id)
        return E2E.Message(reactionMessage=E2E.ReactionMessage(key=key, text=emoji))


@pytest.fixture
def transport():
    # Sem o __init__: nao cria o cliente de verdade nem conecta.
    received = []
    instance = object.__new__(NeonizeTransport)
    instance.client = FakeClient()
    instance._on_message = received.append
    instance._on_qr = instance._on_state = None
    instance._own_chats = None
    instance._thread = None
    instance._reaction_keys = OrderedDict()
    instance.received = received
    return instance


def text_message(text):
    message = E2E.Message(conversation=text)
    message.messageContextInfo.messageSecret = b"segredo"  # metadado que nao vai na citacao
    return message


def test_reply_quotes_with_the_author_in_the_chat_address_form(transport, caplog):
    caplog.set_level(logging.DEBUG, logger="app.services.whatsapp_neonize_transport")
    chat = jid(BOSS_LID, "lid")
    transport._message(None, event("MSG1", chat, jid(BOSS_LID, "lid"), False, text_message("tem a 805314?"),
                                   sender_alt=jid(BOSS_NUMBER, "s.whatsapp.net")))
    assert "conversa=…6666@lid" in caplog.text and "remetente_alt=…7777@s.whatsapp.net" in caplog.text
    assert BOSS_NUMBER not in caplog.text  # o registro nao traz o numero inteiro

    sent_id = transport.reply(transport.received[-1], "*805314*: temos.")

    assert sent_id == "ENVIADA1"
    to, sent = transport.client.sent[-1]
    assert to == chat
    assert sent.extendedTextMessage.text == "*805314*: temos."
    context = sent.extendedTextMessage.contextInfo
    assert context.stanzaID == "MSG1"
    # A neonize punha o numero (SenderAlt) numa conversa por LID e o WhatsApp nao mostrava a citacao.
    assert context.participant == f"{BOSS_LID}@lid"
    assert context.quotedMessage.conversation == "tem a 805314?"
    assert not context.quotedMessage.HasField("messageContextInfo")


def test_quoted_audio_keeps_only_the_content():
    audio = E2E.Message()
    audio.audioMessage.seconds = 3
    audio.audioMessage.contextInfo.stanzaID = "OUTRA"
    audio.messageContextInfo.messageSecret = b"segredo"

    quoted = _quoted_content(audio)

    assert quoted.audioMessage.seconds == 3
    assert not quoted.audioMessage.HasField("contextInfo")
    assert not quoted.HasField("messageContextInfo")


def test_reaction_is_removed_with_the_same_key_the_team_sent(transport):
    chat = jid(OWN_LID, "lid")  # "Mensagem para mim"
    desktop = jid(OWN_LID, "lid", device=5)
    transport._message(None, event("MSG2", chat, desktop, True, text_message("805314")))
    robot = E2E.Message()
    robot.reactionMessage.key.remoteJID = f"{OWN_NUMBER}@s.whatsapp.net"  # como o app do WhatsApp mandou
    robot.reactionMessage.key.fromMe = True
    robot.reactionMessage.key.ID = "MSG2"
    robot.reactionMessage.text = "🤖"
    transport._message(None, event("R1", chat, desktop, True, robot))
    target = next(m for m in transport.received if m.id == "MSG2")

    transport.reply(target, "*805314*: não temos.")
    transport.react(target, "")

    _, answer = transport.client.sent[0]
    assert answer.extendedTextMessage.contextInfo.participant == f"{OWN_LID}@lid"  # eu mesmo, como a conversa
    to, reaction = transport.client.sent[1]
    assert to == chat
    assert reaction.reactionMessage.key.remoteJID == f"{OWN_NUMBER}@s.whatsapp.net"
    assert reaction.reactionMessage.key.fromMe and reaction.reactionMessage.key.ID == "MSG2"
    assert reaction.reactionMessage.text == ""
    assert reaction.reactionMessage.senderTimestampMS > 0


def test_own_message_in_another_chat_is_quoted_with_my_address_of_the_same_kind(transport):
    for chat, expected in ((jid(BOSS_LID, "lid"), f"{OWN_LID}@lid"),
                           (jid(BOSS_NUMBER, "s.whatsapp.net"), f"{OWN_NUMBER}@s.whatsapp.net")):
        transport._message(None, event("M" + chat.Server, chat, jid(OWN_NUMBER, "s.whatsapp.net", 5), True,
                                       text_message("segue o código 805314")))
        transport.reply(transport.received[-1], "ok")
        assert transport.client.sent[-1][1].extendedTextMessage.contextInfo.participant == expected


def test_reaction_without_a_remembered_key_falls_back_to_building_one(transport):
    chat = jid(BOSS_NUMBER, "s.whatsapp.net")
    transport._message(None, event("MSG3", chat, jid(BOSS_NUMBER, "s.whatsapp.net"), False, text_message("oi")))

    transport.react(transport.received[-1], "⚠️")

    to, reaction = transport.client.sent[-1]
    assert to == chat
    assert reaction.reactionMessage.key.ID == "MSG3" and reaction.reactionMessage.text == "⚠️"


def test_photo_without_caption_is_kept_for_the_plate_reader(transport):
    photo = E2E.Message()
    photo.imageMessage.mimetype = "image/jpeg"
    transport._message(None, event("FOTO1", jid(BOSS_LID, "lid"), jid(BOSS_LID, "lid"), False, photo))

    (message,) = transport.received
    assert (message.id, message.is_image, message.text) == ("FOTO1", True, None)

    photo.imageMessage.caption = "essa aqui"
    transport._message(None, event("FOTO2", jid(BOSS_LID, "lid"), jid(BOSS_LID, "lid"), False, photo))
    assert (transport.received[-1].is_image, transport.received[-1].text) == (True, "essa aqui")


@pytest.mark.parametrize("field", ["extendedTextMessage", "audioMessage", "imageMessage"])
def test_quoted_message_id_reaches_the_bridge(transport, field):
    message = E2E.Message()
    getattr(message, field).contextInfo.stanzaID = "QUESTION1"
    if field == "extendedTextMessage":
        message.extendedTextMessage.text = "DC13"
    transport._message(None, event("ANSWER1", jid(BOSS_LID, "lid"), jid(BOSS_LID, "lid"), False, message))
    assert transport.received[-1].quoted_message_id == "QUESTION1"


def test_restored_draft_still_quotes_without_original_neonize_event(transport):
    from app.services.whatsapp_bridge_service import WaMessage

    target = WaMessage(chat=f"{BOSS_LID}@lid", id="OLD1", sender=f"{BOSS_NUMBER}@s.whatsapp.net",
                       from_me=False, timestamp=1, text="tem 4031196?")
    assert transport.reply(target, "Sim.") == "ENVIADA1"
    to, message = transport.client.sent[-1]
    assert to.Server == "lid"
    assert message.extendedTextMessage.contextInfo.stanzaID == "OLD1"
    assert message.extendedTextMessage.contextInfo.participant == f"{BOSS_LID}@lid"
