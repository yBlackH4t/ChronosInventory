"""
Ponte WhatsApp do assistente, em "modo copiloto" (docs/PLANO_IA.md, Fase 3).

O Chronos entra no WhatsApp da empresa como um aparelho conectado e so responde
quando alguem que usa esse WhatsApp manda: reagindo com 🤖 na mensagem do cliente.
A IA nunca responde sozinha.

- Reacao 🤖 numa mensagem: junta essa mensagem com as mensagens seguidas da mesma
  pessoa (ex.: o codigo colado + o audio "temos essa daí?"), transcreve os audios,
  pergunta ao assistente e responde citando a mensagem. Depois tira o 🤖 (ou poe ⚠️
  se deu erro).
- Comandos so na conversa "Mensagem para mim": /ajuda, /ensinar (vira uma proposta
  que o admin aprova no app) e /pendentes. Como colegas tambem usam o WhatsApp da
  empresa, nada ensinado por aqui vale sem a aprovacao do admin.

Este modulo nao conhece a biblioteca do WhatsApp: fala com ela por um "transport"
(app/services/whatsapp_neonize_transport.py). Os testes usam um transport falso.
"""

from __future__ import annotations

import logging
import threading
import time
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import Any, Callable, Deque, Dict, List, Optional, Protocol, Tuple

from app.services.assistant_answer_format import display_code
from core.catalog.normalization import canonical_code, is_searchable_code

LOG = logging.getLogger(__name__)

TRIGGER_REACTION = "🤖"
ERROR_REACTION = "⚠️"
# Mensagens seguidas da mesma pessoa ate 3 min antes/depois da marcada viram uma pergunta so.
GROUP_WINDOW_SECONDS = 180
CONTEXT_MESSAGES = 10
BUFFER_SIZE = 60
BUFFER_MAX_AGE_SECONDS = 6 * 3600
TEACH_TYPES = ("igual", "similar", "diferente")

HELP_TEXT = (
    "*Assistente do Chronos*\n"
    "• Reaja com 🤖 numa mensagem do cliente: eu respondo na conversa.\n"
    "• /ensinar <código> <igual|similar|diferente> <código> [observação]\n"
    "  ex.: /ensinar 53279887101 similar 53279887210 muda o atuador\n"
    "  (vira uma proposta; só vale depois que o admin aprovar no app)\n"
    "• /pendentes: o que está esperando revisão do admin"
)


@dataclass
class WaMessage:
    chat: str
    id: str
    sender: str
    from_me: bool
    timestamp: float
    text: Optional[str] = None
    is_audio: bool = False
    reaction_to: Optional[str] = None  # id da mensagem reagida
    reaction: Optional[str] = None  # emoji ("" = reacao removida)
    bot: bool = False  # mensagem enviada pela propria ponte
    raw: Any = None  # evento original da biblioteca (para citar, reagir, baixar)
    transcript: Optional[str] = None


class WhatsAppTransport(Protocol):
    def is_self_chat(self, chat: str) -> bool: ...

    def reply(self, target: WaMessage, text: str) -> Optional[str]: ...

    def react(self, target: WaMessage, emoji: str) -> None: ...

    def send_to_self(self, text: str) -> Optional[str]: ...

    def download_audio(self, message: WaMessage) -> bytes: ...


class WhatsAppBridge:
    def __init__(
        self,
        transport: WhatsAppTransport,
        chat_service: Any = None,
        transcriber: Any = None,
        history: Any = None,
        clock: Callable[[], float] = time.time,
        run_async: Optional[Callable[[Callable[[], None]], Any]] = None,
    ) -> None:
        if chat_service is None:
            from app.services.assistant_chat_service import AssistantChatService

            chat_service = AssistantChatService()
        if transcriber is None:
            from app.services.assistant_transcription_service import AssistantTranscriptionService

            transcriber = AssistantTranscriptionService()
        if history is None:
            from app.services.assistant_history_service import AssistantHistoryService

            history = AssistantHistoryService()
        self.transport = transport
        self.chat_service = chat_service
        self.transcriber = transcriber
        self.history = history
        self.clock = clock
        self._chats: Dict[str, Deque[WaMessage]] = {}
        self._lock = threading.Lock()
        if run_async is None:
            executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="whatsapp-assistente")
            run_async = executor.submit
        self._run = run_async

    # ------------------------------------------------------------------
    # Entrada de eventos (chamada pelo transport, na thread da biblioteca)
    # ------------------------------------------------------------------

    def handle(self, message: WaMessage) -> None:
        if message.reaction_to is not None:
            if message.from_me and message.reaction == TRIGGER_REACTION:
                self._run(lambda: self.answer(message.chat, message.reaction_to))
            return
        if not self._remember(message):
            return  # repetida
        text = (message.text or "").strip()
        if message.from_me and text.startswith("/") and self.transport.is_self_chat(message.chat):
            self._run(lambda: self.command(message))

    # ------------------------------------------------------------------
    # Resposta (reacao 🤖)
    # ------------------------------------------------------------------

    def answer(self, chat: str, target_id: str) -> None:
        target, group, earlier = self._conversation_around(chat, target_id)
        if target is None:
            self._note_to_self(
                "Não achei a mensagem em que você reagiu com 🤖. "
                "O Chronos só enxerga mensagens que chegaram com ele ligado."
            )
            return
        try:
            parts, problems = [], []
            for message in group:
                text = self._text_of(message, transcribe=True, problems=problems)
                if text:
                    parts.append(text)
            if not parts:
                self.transport.react(target, ERROR_REACTION)
                self._note_to_self("Não consegui ler a mensagem: " + ("; ".join(problems) or "sem texto."))
                return
            historico = []
            for message in earlier:
                text = self._text_of(message, transcribe=False, problems=[])
                if text:
                    papel = "assistente" if self._is_company_side(message) else "usuario"
                    historico.append({"papel": papel, "texto": text})
            result = self.chat_service.chat(
                "\n".join(parts), historico, canal="whatsapp", autor=None if target.from_me else target.sender
            )
            sent_id = self.transport.reply(target, result["resposta"])
            self._remember_bot(chat, sent_id, result["resposta"])
            self.transport.react(target, "")
        except Exception:
            LOG.exception("whatsapp: falha ao responder a mensagem %s", target_id)
            try:
                self.transport.react(target, ERROR_REACTION)
            except Exception:
                LOG.exception("whatsapp: falha ao marcar o erro")

    # ------------------------------------------------------------------
    # Comandos (so na conversa "Mensagem para mim")
    # ------------------------------------------------------------------

    def command(self, message: WaMessage) -> None:
        parts = (message.text or "").strip().split()
        name = parts[0].lower() if parts else ""
        try:
            if name in ("/ensinar", "/ensina"):
                reply = self._teach(parts[1:])
            elif name in ("/pendentes", "/revisar"):
                reply = self._pending()
            else:
                reply = HELP_TEXT
        except Exception:
            LOG.exception("whatsapp: falha no comando %s", name)
            reply = "Não consegui executar o comando agora. Tente de novo."
        self._note_to_self(reply)

    def _teach(self, args: List[str]) -> str:
        if len(args) < 3 or args[1].lower() not in TEACH_TYPES:
            return "Use assim: /ensinar 53279887101 similar 53279887210 muda o atuador"
        code_a, kind, code_b = args[0], args[1].lower(), args[2]
        for code in (code_a, code_b):
            if not is_searchable_code(canonical_code(code)):
                return f"*{code}* não parece um código de peça. Confira e mande de novo."
        note = " ".join(args[3:]).strip() or None
        proposal_id = self.history.add_proposal(code_a, code_b, kind, note, autor="whatsapp")
        detail = f" ({note})" if note else ""
        return (
            f"📝 Proposta #{proposal_id}: {display_code(code_a)} *{kind}* {display_code(code_b)}{detail}.\n"
            "Só vale depois que o admin aprovar no app (Assistente > Admin > Para revisar)."
        )

    def _pending(self) -> str:
        proposals = self.history.list_proposals("pendente")
        review = self.history.review_items(limit=5)
        lines = [f"Propostas esperando o admin: {len(proposals)}"]
        if review:
            lines.append("Códigos sem estoque para revisar:")
            lines += [f"• {item['codigo']} (perguntado {item['vezes']}x)" for item in review]
        else:
            lines.append("Nenhum código para revisar.")
        return "\n".join(lines)

    # ------------------------------------------------------------------
    # Memoria das conversas
    # ------------------------------------------------------------------

    def _remember(self, message: WaMessage) -> bool:
        now = self.clock()
        with self._lock:
            buffer = self._chats.setdefault(message.chat, deque(maxlen=BUFFER_SIZE))
            if any(m.id == message.id for m in buffer):
                return False
            while buffer and now - buffer[0].timestamp > BUFFER_MAX_AGE_SECONDS:
                buffer.popleft()
            buffer.append(message)
            return True

    def _remember_bot(self, chat: str, message_id: Optional[str], text: str) -> None:
        self._remember(
            WaMessage(
                chat=chat,
                id=message_id or f"bot-{self.clock()}",
                sender="bot",
                from_me=True,
                timestamp=self.clock(),
                text=text,
                bot=True,
            )
        )

    def _note_to_self(self, text: str) -> None:
        try:
            self.transport.send_to_self(text)
        except Exception:
            LOG.exception("whatsapp: falha ao mandar aviso para a conversa do proprio numero")

    def _is_company_side(self, message: WaMessage) -> bool:
        """Quem fala pela empresa: a ponte, ou a equipe (fora da conversa "Mensagem para mim")."""
        if message.bot:
            return True
        return message.from_me and not self.transport.is_self_chat(message.chat)

    def _is_question_part(self, message: WaMessage, target: WaMessage) -> bool:
        if self._is_company_side(message) or message.sender != target.sender:
            return False
        return not (message.text or "").strip().startswith("/")

    def _conversation_around(
        self, chat: str, target_id: str
    ) -> Tuple[Optional[WaMessage], List[WaMessage], List[WaMessage]]:
        with self._lock:
            messages = list(self._chats.get(chat, ()))
        index = next((i for i, m in enumerate(messages) if m.id == target_id), None)
        if index is None:
            return None, [], []
        target = messages[index]
        start = end = index
        while (
            start > 0
            and self._is_question_part(messages[start - 1], target)
            and target.timestamp - messages[start - 1].timestamp <= GROUP_WINDOW_SECONDS
        ):
            start -= 1
        while (
            end + 1 < len(messages)
            and self._is_question_part(messages[end + 1], target)
            and messages[end + 1].timestamp - target.timestamp <= GROUP_WINDOW_SECONDS
        ):
            end += 1
        earlier = [m for m in messages[max(0, start - CONTEXT_MESSAGES) : start] if not (m.text or "").startswith("/")]
        return target, messages[start : end + 1], earlier

    def _text_of(self, message: WaMessage, transcribe: bool, problems: List[str]) -> Optional[str]:
        if message.text and message.text.strip():
            return message.text.strip()
        if not message.is_audio:
            return None
        if message.transcript is None and transcribe:
            try:
                message.transcript = self.transcriber.transcribe(self.transport.download_audio(message))
            except Exception as exc:  # inclui AssistantUnavailableError
                problems.append(f"áudio não transcrito ({exc})")
                return None
        return message.transcript
