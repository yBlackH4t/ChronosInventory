"""
Ligacao da ponte do assistente com o WhatsApp, pela biblioteca neonize (whatsmeow).

E a unica parte que conhece a biblioteca: converte os eventos em WaMessage e
executa responder, reagir, baixar audio e mandar mensagem para o proprio numero.
O Chronos entra como um "aparelho conectado" (QR code), como o WhatsApp Web.

API nao oficial: viola os termos do WhatsApp e o numero pode ser banido. Por isso
a ponte so responde quando alguem da equipe reage com 🤖 (docs/PLANO_IA.md).
"""

from __future__ import annotations

import logging
import threading
import time
from collections import OrderedDict
from typing import Any, Callable, Optional, Set, Tuple

from app.services.whatsapp_bridge_service import WaMessage

LOG = logging.getLogger(__name__)

# Nome do Chronos em "Aparelhos conectados" no celular (vale para conexoes novas).
DEVICE_NAME = "Chronos"
MAX_REMEMBERED_REACTIONS = 200
_QUOTE_SKIP_FIELDS = {"senderKeyDistributionMessage", "messageContextInfo"}


def _jid_str(jid: Any) -> str:
    """'5551999999999@s.whatsapp.net' (sem o numero do aparelho)."""
    return f"{jid.User}@{jid.Server}" if jid is not None and jid.User else ""


def _mask_jid(jid: Any) -> str:
    """JID para o log, sem o numero inteiro: '…1234:5@lid' (final, aparelho e tipo de endereco)."""
    if jid is None or not getattr(jid, "User", ""):
        return "-"
    device = f":{jid.Device}" if getattr(jid, "Device", 0) else ""
    return f"…{jid.User[-4:]}{device}@{jid.Server}"


def _mask_str(jid: str) -> str:
    user, _, server = (jid or "").partition("@")
    return f"…{user.split(':')[0][-4:]}@{server}" if user else "-"


def _seconds(timestamp: int) -> float:
    if not timestamp:
        return time.time()
    return timestamp / 1000 if timestamp > 10**12 else float(timestamp)


def _content(message: Any) -> Tuple[Optional[str], Any]:
    """(nome do campo, valor) do conteudo da mensagem: conversation, extendedTextMessage, audioMessage..."""
    for field, value in message.ListFields():
        if field.name == "conversation" or (field.name.endswith("Message") and field.name not in _QUOTE_SKIP_FIELDS):
            return field.name, value
    return None, None


def _quoted_content(message: Any) -> Any:
    """So o conteudo da mensagem citada, sem metadados nem a citacao dela, como os aplicativos oficiais."""
    quoted = type(message)()
    name, value = _content(message)
    if name is None:
        quoted.CopyFrom(message)
    elif name == "conversation":
        quoted.conversation = value
    else:
        part = getattr(quoted, name)
        part.CopyFrom(value)
        if "contextInfo" in part.DESCRIPTOR.fields_by_name:
            part.ClearField("contextInfo")
    return quoted


class NeonizeTransport:
    def __init__(
        self,
        session_path: str,
        on_message: Callable[[WaMessage], None],
        on_qr: Optional[Callable[[str], None]] = None,
        on_state: Optional[Callable[[str], None]] = None,
    ) -> None:
        from neonize.client import NewClient
        from neonize.events import ConnectedEv, DisconnectedEv, LoggedOutEv, MessageEv, PairStatusEv
        from neonize.proto.waCompanionReg.WAWebProtobufsCompanionReg_pb2 import DeviceProps

        # Sem FFmpeg a neonize avisa que nao gera figurinhas/audios; so baixamos o audio, que nao precisa.
        logging.getLogger("neonize.utils.ffmpeg").setLevel(logging.ERROR)
        self.client = NewClient(session_path, props=DeviceProps(os=DEVICE_NAME, platformType=DeviceProps.SAFARI))
        self._on_message = on_message
        self._on_qr = on_qr
        self._on_state = on_state
        self._own_chats: Optional[Set[str]] = None
        self._thread: Optional[threading.Thread] = None
        # id da mensagem -> (chave e conversa da reacao 🤖, como o WhatsApp da equipe mandou)
        self._reaction_keys: "OrderedDict[str, Tuple[Any, Any]]" = OrderedDict()

        self.client.event.qr(self._qr)
        self.client.event(MessageEv)(self._message)
        self.client.event(ConnectedEv)(lambda _c, _e: self._state("conectado"))
        self.client.event(PairStatusEv)(lambda _c, _e: self._state("pareado"))
        self.client.event(LoggedOutEv)(lambda _c, _e: self._state("desconectado"))
        self.client.event(DisconnectedEv)(lambda _c, _e: self._state("reconectando"))

    # ------------------------------------------------------------------
    # Ciclo de vida
    # ------------------------------------------------------------------

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._thread = threading.Thread(target=self._run, name="whatsapp-neonize", daemon=True)
        self._thread.start()

    def _run(self) -> None:
        try:
            self.client.connect()  # bloqueia enquanto estiver conectado
        except Exception:
            LOG.exception("whatsapp: a conexao terminou com erro")
            self._state("erro")

    def stop(self) -> None:
        """
        Fecha a conexao e encerra a chamada da biblioteca: so desconectar deixava a thread dela
        presa esperando, e o backend podia travar ao fechar.
        """
        for action in (self.client.disconnect, self.client.stop):
            try:
                action()
            except Exception:
                LOG.exception("whatsapp: falha ao desligar")

    def logout(self) -> None:
        """Desconecta este aparelho do WhatsApp (sai da lista de aparelhos conectados)."""
        try:
            self.client.logout()
        except Exception:
            LOG.exception("whatsapp: falha ao sair da conta")

    def phone_number(self) -> Optional[str]:
        try:
            me = self.client.get_me()
            return me.JID.User or None
        except Exception:
            return None

    # ------------------------------------------------------------------
    # Eventos
    # ------------------------------------------------------------------

    def _state(self, state: str) -> None:
        if state == "conectado":
            self._own_chats = None  # recarrega o proprio numero
        if self._on_state:
            self._on_state(state)

    def _qr(self, _client: Any, data: bytes) -> None:
        if self._on_qr:
            self._on_qr(data.decode("utf-8", "replace") if isinstance(data, bytes) else str(data))

    def _message(self, _client: Any, event: Any) -> None:
        try:
            self._log_received(event)
        except Exception:  # o registro e so para investigar; nunca pode perder a mensagem
            LOG.exception("whatsapp: falha ao registrar a mensagem recebida")
        try:
            message = self._to_wa(event)
        except Exception:
            LOG.exception("whatsapp: mensagem em formato inesperado")
            return
        if message is None:
            return
        if message.reaction_to and message.reaction:
            self._remember_reaction(event)
        self._on_message(message)

    def _remember_reaction(self, event: Any) -> None:
        """
        Guarda a chave da reacao exatamente como o WhatsApp da equipe mandou: tirar o 🤖
        (ou por ⚠️) com a mesma chave funciona tanto com numero quanto com LID.
        """
        key = type(event.Message.reactionMessage.key)()
        key.CopyFrom(event.Message.reactionMessage.key)
        chat = type(event.Info.MessageSource.Chat)()
        chat.CopyFrom(event.Info.MessageSource.Chat)
        self._reaction_keys[key.ID] = (key, chat)
        self._reaction_keys.move_to_end(key.ID)
        while len(self._reaction_keys) > MAX_REMEMBERED_REACTIONS:
            self._reaction_keys.popitem(last=False)

    @staticmethod
    def _log_received(event: Any) -> None:
        """Enderecos de cada mensagem recebida (sem o numero inteiro), para investigar o envio."""
        if not LOG.isEnabledFor(logging.DEBUG):
            return
        info, msg = event.Info, event.Message
        source = info.MessageSource
        name, value = _content(msg)
        parts = [
            f"id={info.ID}",
            f"tipo={name or '-'}",
            f"conversa={_mask_jid(source.Chat)}",
            f"remetente={_mask_jid(source.Sender)}",
            f"remetente_alt={_mask_jid(source.SenderAlt)}",
            f"destinatario_alt={_mask_jid(source.RecipientAlt)}",
            f"meu={source.IsFromMe}",
            f"enderecamento={source.AddressingMode or '-'}",
        ]
        if info.HasField("DeviceSentMeta") and info.DeviceSentMeta.DestinationJID:
            parts.append(f"enviada_para={_mask_str(info.DeviceSentMeta.DestinationJID)}")
        if name == "reactionMessage":
            key = value.key
            parts.append(
                f"reacao={value.text or '(removida)'} chave_conversa={_mask_str(key.remoteJID)} "
                f"chave_meu={key.fromMe} chave_autor={_mask_str(key.participant)} chave_id={key.ID}"
            )
        context = getattr(value, "contextInfo", None) if value is not None and name != "conversation" else None
        if context is not None and context.stanzaID:
            parts.append(
                f"cita={context.stanzaID} citado_autor={_mask_str(context.participant)} "
                f"citado_conversa={_mask_str(context.remoteJID)}"
            )
        LOG.debug("whatsapp: recebida %s", " ".join(parts))

    @staticmethod
    def _to_wa(event: Any) -> Optional[WaMessage]:
        info = event.Info
        source = info.MessageSource
        if source.IsGroup:
            return None  # grupos ficam de fora
        wa = WaMessage(
            chat=_jid_str(source.Chat),
            id=info.ID,
            sender=_jid_str(source.Sender),
            from_me=bool(source.IsFromMe),
            timestamp=_seconds(int(info.Timestamp)),
            raw=event,
        )
        msg = event.Message
        if msg.HasField("reactionMessage"):
            wa.reaction_to = msg.reactionMessage.key.ID
            wa.reaction = msg.reactionMessage.text
        elif msg.conversation:
            wa.text = msg.conversation
        elif msg.HasField("extendedTextMessage"):
            wa.text = msg.extendedTextMessage.text
        elif msg.HasField("audioMessage"):
            wa.is_audio = True
        elif msg.HasField("imageMessage"):
            # Foto (ex.: da plaqueta): a ponte le os codigos quando alguem reage com 🤖.
            wa.is_image = True
            wa.text = msg.imageMessage.caption or None
            return wa
        else:
            return wa if wa.text else None
        return wa

    # ------------------------------------------------------------------
    # Acoes (chamadas pela ponte)
    # ------------------------------------------------------------------

    def is_self_chat(self, chat: str) -> bool:
        if self._own_chats is None:
            try:
                me = self.client.get_me()
                self._own_chats = {c for c in (_jid_str(me.JID), _jid_str(me.LID)) if c}
            except Exception:
                return False
        return chat in self._own_chats

    def _quoted_author(self, source: Any) -> str:
        """
        Autor da mensagem citada no mesmo tipo de endereco da conversa (numero ou LID), como
        fazem os aplicativos oficiais. A biblioteca misturava os dois (conversa por LID e autor
        por numero) e o WhatsApp mostrava a resposta sem a citacao.
        """
        chat = _jid_str(source.Chat)
        if not source.IsFromMe or self.is_self_chat(chat):
            return chat  # conversa 1:1: o autor e o outro lado (ou eu mesmo, na "Mensagem para mim")
        me = self.client.get_me()
        own = _jid_str(me.LID) if source.Chat.Server == "lid" else _jid_str(me.JID)
        return own or chat

    def reply(self, target: WaMessage, text: str) -> Optional[str]:
        from neonize.proto.waE2E.WAWebProtobufsE2E_pb2 import ContextInfo, ExtendedTextMessage, Message

        info = target.raw.Info
        context = ContextInfo(
            stanzaID=info.ID,
            participant=self._quoted_author(info.MessageSource),
            quotedMessage=_quoted_content(target.raw.Message),
        )
        message = Message(extendedTextMessage=ExtendedTextMessage(text=text, contextInfo=context))
        response = self.client.send_message(info.MessageSource.Chat, message)
        LOG.debug(
            "whatsapp: resposta enviada id=%s conversa=%s cita=%s citado_autor=%s",
            response.ID,
            _mask_jid(info.MessageSource.Chat),
            info.ID,
            _mask_str(context.participant),
        )
        return response.ID or None

    def react(self, target: WaMessage, emoji: str) -> None:
        if target.raw is None:
            return
        remembered = self._reaction_keys.get(target.id)
        if remembered is not None:
            from neonize.proto.waE2E.WAWebProtobufsE2E_pb2 import Message, ReactionMessage

            key, chat = remembered
            reaction = Message(
                reactionMessage=ReactionMessage(key=key, text=emoji, senderTimestampMS=int(time.time() * 1000))
            )
            origin = "chave da reacao"
        else:
            source = target.raw.Info.MessageSource
            chat = source.Chat
            reaction = self.client.build_reaction(source.Chat, source.Sender, target.id, emoji)
            origin = "chave montada"
        response = self.client.send_message(chat, reaction)
        LOG.debug(
            "whatsapp: reacao enviada (%s) emoji=%s conversa=%s chave_conversa=%s chave_meu=%s mensagem=%s id=%s",
            origin,
            emoji or "(removida)",
            _mask_jid(chat),
            _mask_str(reaction.reactionMessage.key.remoteJID),
            reaction.reactionMessage.key.fromMe,
            target.id,
            response.ID,
        )

    def send_to_self(self, text: str) -> Optional[str]:
        from neonize.utils.jid import JIDToNonAD

        me = self.client.get_me()
        response = self.client.send_message(JIDToNonAD(me.JID), text)  # sem o numero do aparelho
        return response.ID or None

    def download_audio(self, message: WaMessage) -> bytes:
        return self.client.download_any(message.raw.Message)

    def download_image(self, message: WaMessage) -> bytes:
        return self.client.download_any(message.raw.Message)
