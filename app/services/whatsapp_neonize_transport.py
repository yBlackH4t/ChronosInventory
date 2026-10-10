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
from typing import Any, Callable, Optional, Set

from app.services.whatsapp_bridge_service import WaMessage

LOG = logging.getLogger(__name__)


def _jid_str(jid: Any) -> str:
    """'5551999999999@s.whatsapp.net' (sem o numero do aparelho)."""
    return f"{jid.User}@{jid.Server}" if jid is not None and jid.User else ""


def _seconds(timestamp: int) -> float:
    if not timestamp:
        return time.time()
    return timestamp / 1000 if timestamp > 10**12 else float(timestamp)


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

        # Sem FFmpeg a neonize avisa que nao gera figurinhas/audios; so baixamos o audio, que nao precisa.
        logging.getLogger("neonize.utils.ffmpeg").setLevel(logging.ERROR)
        self.client = NewClient(session_path)
        self._on_message = on_message
        self._on_qr = on_qr
        self._on_state = on_state
        self._own_chats: Optional[Set[str]] = None
        self._thread: Optional[threading.Thread] = None

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
        try:
            self.client.disconnect()
        except Exception:
            LOG.exception("whatsapp: falha ao desconectar")

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
            message = self._to_wa(event)
        except Exception:
            LOG.exception("whatsapp: mensagem em formato inesperado")
            return
        if message is not None:
            self._on_message(message)

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
        elif msg.HasField("imageMessage") and msg.imageMessage.caption:
            wa.text = msg.imageMessage.caption
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

    def reply(self, target: WaMessage, text: str) -> Optional[str]:
        response = self.client.reply_message(text, target.raw)
        return response.ID or None

    def react(self, target: WaMessage, emoji: str) -> None:
        if target.raw is None:
            return
        source = target.raw.Info.MessageSource
        reaction = self.client.build_reaction(source.Chat, source.Sender, target.id, emoji)
        self.client.send_message(source.Chat, reaction)

    def send_to_self(self, text: str) -> Optional[str]:
        from neonize.utils.jid import JIDToNonAD

        me = self.client.get_me()
        response = self.client.send_message(JIDToNonAD(me.JID), text)  # sem o numero do aparelho
        return response.ID or None

    def download_audio(self, message: WaMessage) -> bytes:
        return self.client.download_any(message.raw.Message)
