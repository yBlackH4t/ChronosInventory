"""
Ponte WhatsApp do assistente, em "modo copiloto" (docs/PLANO_IA.md, Fase 3).

O Chronos entra no WhatsApp da empresa como um aparelho conectado e so responde
quando alguem que usa esse WhatsApp manda: reagindo com 🤖 na mensagem do cliente.
A IA nunca responde sozinha.

- Reacao 🤖 numa mensagem: junta essa mensagem com as mensagens seguidas da mesma
  pessoa (ex.: o codigo colado + o audio "temos essa daí?"), transcreve os audios, le
  os codigos das fotos de plaqueta, pergunta ao assistente e responde citando a
  mensagem. Depois tira o 🤖 (ou poe ⚠️ se deu erro).
- Comandos so na conversa "Mensagem para mim": /ajuda, /ensinar (vira uma proposta
  que o admin aprova no app) e /pendentes. Como colegas tambem usam o WhatsApp da
  empresa, nada ensinado por aqui vale sem a aprovacao do admin.

Este modulo nao conhece a biblioteca do WhatsApp: fala com ela por um "transport"
(app/services/whatsapp_neonize_transport.py). Os testes usam um transport falso.
"""

from __future__ import annotations

import logging
import threading
import os
import time
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import Any, Callable, Deque, Dict, List, Optional, Protocol, Tuple

from app.services.assistant_answer_format import display_code
from app.services.assistant_knowledge_service import check_single_code
from core.catalog.normalization import canonical_code, is_searchable_code
from core.exceptions import ValidationException

LOG = logging.getLogger(__name__)

TRIGGER_REACTION = "🤖"
ERROR_REACTION = "⚠️"
# Mensagens seguidas da mesma pessoa ate 3 min antes/depois da marcada viram uma pergunta so.
GROUP_WINDOW_SECONDS = 180
CONTEXT_MESSAGES = 10
# So a conversa recente vale como contexto: o audio de um pedido de horas atras (outro cliente,
# outro assunto) nao pode virar parte da pergunta nova.
CONTEXT_WINDOW_SECONDS = 20 * 60
BUFFER_SIZE = 60
BUFFER_MAX_AGE_SECONDS = 6 * 3600
TEACH_TYPES = ("igual", "similar", "diferente")
# Revisar antes de enviar: a resposta vira rascunho (📝 na mensagem) ate o admin mandar.
DRAFT_REACTION = "📝"
DRAFT_MAX_AGE_SECONDS = 6 * 3600
MAX_DRAFTS = 30

PIN_MISSING_TEXT = "Para aprovar pelo WhatsApp, crie um PIN em Assistente > Admin."

HELP_TEXT = (
    "*Assistente do Chronos*\n"
    "• Reaja com 🤖 numa mensagem do cliente: eu respondo na conversa.\n"
    "• Foto da plaqueta: reaja com 🤖 na foto; eu leio o código e respondo.\n"
    "• /perguntar <pergunta>: pergunte aqui, sem envolver o cliente\n"
    "  ex.: /perguntar 4031196 é a mesma que 5455609?\n"
    "  Se eu não souber, responda /igual, /similar ou /diferente [observação]\n"
    "• /aprovar <nº> <PIN> ou /recusar <nº> <PIN>: uma proposta (veja em /pendentes)\n"
    "• /ensinar <código> <igual|similar|diferente> <código> [observação]\n"
    "  ex.: /ensinar 53279887101 similar 53279887210 muda o atuador\n"
    "  (vira uma proposta; só vale depois que o admin aprovar no app)\n"
    "• /pendentes: o que está esperando revisão do admin\n"
    "• /enviar <nº> ou /descartar <nº>: o rascunho da resposta (modo revisar antes de enviar)\n"
    "• /resumo: o que zerou, o que mais saiu e o que pediram e não temos"
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
    is_image: bool = False  # foto (ex.: da plaqueta); a legenda, se houver, fica em `text`
    reaction_to: Optional[str] = None  # id da mensagem reagida
    reaction: Optional[str] = None  # emoji ("" = reacao removida)
    bot: bool = False  # mensagem enviada pela propria ponte
    raw: Any = None  # evento original da biblioteca (para citar, reagir, baixar)
    transcript: Optional[str] = None
    quoted_message_id: Optional[str] = None


@dataclass
class Draft:
    """Resposta preparada que espera o admin (modo "revisar antes de enviar")."""

    id: int
    chat: str
    target: WaMessage
    question: str
    answer: str
    created_at: float
    session_id: int = 0
    revision: int = 0
    pending: Any = None
    evidence: Any = None


class WhatsAppTransport(Protocol):
    def is_self_chat(self, chat: str) -> bool: ...

    def reply(self, target: WaMessage, text: str) -> Optional[str]: ...

    def react(self, target: WaMessage, emoji: str) -> None: ...

    def send_to_self(self, text: str) -> Optional[str]: ...

    def download_audio(self, message: WaMessage) -> bytes: ...

    def download_image(self, message: WaMessage) -> bytes: ...


class WhatsAppBridge:
    def __init__(
        self,
        transport: WhatsAppTransport,
        chat_service: Any = None,
        transcriber: Any = None,
        history: Any = None,
        clock: Callable[[], float] = time.time,
        run_async: Optional[Callable[[Callable[[], None]], Any]] = None,
        vision: Any = None,
        summary: Any = None,
        review_enabled: Optional[Callable[[], bool]] = None,
        context_minutes: Optional[Callable[[], int]] = None,
    ) -> None:
        self.summary = summary  # resumo diario (/resumo); criado so quando usado
        if chat_service is None:
            from app.services.assistant_chat_service import AssistantChatService

            chat_service = AssistantChatService()
        if transcriber is None:
            from app.services.assistant_transcription_service import AssistantTranscriptionService

            transcriber = AssistantTranscriptionService()
        if vision is None:
            from app.services.assistant_vision_service import AssistantVisionService

            vision = AssistantVisionService()
        self.vision = vision
        if history is None:
            from app.services.assistant_history_service import AssistantHistoryService

            history = AssistantHistoryService()
        self.transport = transport
        self.chat_service = chat_service
        self.transcriber = transcriber
        self.history = history
        self.clock = clock
        self.review_enabled = review_enabled or (lambda: False)
        self.context_minutes = context_minutes or (lambda: 20)
        from app.services.assistant_attendance_service import AssistantAttendanceService

        self.attendance = AssistantAttendanceService(os.path.join(os.path.dirname(self.history.db_path), "assistente_atendimentos.db"))
        # PC reserva: so responde quando o principal nao esta respondendo (WhatsAppService decide).
        self.should_answer: Callable[[], bool] = lambda: True
        self._chats: Dict[str, Deque[WaMessage]] = {}
        self._drafts: Dict[int, Draft] = {}
        self._draft_seq = 0
        # /perguntar: a conversa particular com a IA (pergunta e resposta), para o "/igual" saber do que fala.
        self._private: List[Tuple[float, Dict[str, str]]] = []
        self.teacher: Any = None
        self.admin: Any = None  # AssistantAdminService (testes trocam por um de mentira)
        self._lock = threading.Lock()
        self._work_lock = threading.RLock()
        self._buffer_account = self._account()
        self._handled = {(session["chat"], message_id): session["id"] for session in self.attendance.all("atendimentos")
                         for message_id in session.get("mensagens_recebidas", [])}
        for saved in self.attendance.all("rascunhos"):
            target = WaMessage(**saved["target"])
            self._drafts[saved["id"]] = Draft(saved["id"], saved["chat"], target, saved["question"],
                saved["answer"], saved["created_at"], saved["session_id"], saved["revision"], saved["pending"], saved.get("evidence", []))
            self._draft_seq = max(self._draft_seq, saved["id"])
        if run_async is None:
            executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="whatsapp-assistente")
            run_async = executor.submit
        self._run = run_async

    # ------------------------------------------------------------------
    # Entrada de eventos (chamada pelo transport, na thread da biblioteca)
    # ------------------------------------------------------------------

    def handle(self, message: WaMessage) -> None:
        account = self._account()
        with self._lock:
            if account != self._buffer_account:
                self._chats.clear()
                self._private.clear()
                self._buffer_account = account
                self._handled = {(session["chat"], message_id): session["id"]
                                 for session in self.attendance.all("atendimentos") if session.get("conta", "") == account
                                 for message_id in session.get("mensagens_recebidas", [])}
        if message.reaction_to is not None:
            if message.from_me and message.reaction == TRIGGER_REACTION:
                self._run(lambda: self.answer(message.chat, message.reaction_to) if self.should_answer() else None)
            return
        if not self._remember(message):
            return  # repetida
        text = (message.text or "").strip()
        if message.from_me and text.startswith("/") and self.transport.is_self_chat(message.chat):
            # Com dois PCs conectados, so um executa o comando (senao "/ensinar" vira duas propostas).
            self._run(lambda: self.command(message) if self.should_answer() else None)

    # ------------------------------------------------------------------
    # Resposta (reacao 🤖)
    # ------------------------------------------------------------------

    def answer(self, chat: str, target_id: str) -> None:
        with self._work_lock:
            self._answer_locked(chat, target_id)

    def _answer_locked(self, chat: str, target_id: str) -> None:
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
            if problems or not parts:
                self.transport.react(target, ERROR_REACTION)
                self._note_to_self("Não consegui ler a mensagem: " + ("; ".join(problems) or "sem texto."))
                return
            account = self._account()
            session, clarification = self.attendance.resolve(chat, target.sender, "\n".join(parts),
                target.quoted_message_id, self.clock(), self.context_minutes() * 60, account)
            historico = session["historico"][-20:]
            result = ({"resposta": clarification} if clarification else self.chat_service.chat(
                "\n".join(parts), historico, canal="whatsapp", autor=None if target.from_me else target.sender
            ))
            session["mensagens_recebidas"] = list(dict.fromkeys(session.get("mensagens_recebidas", []) + [message.id for message in group]))
            session["atualizado_em"] = self.clock()
            session["estado"] = "em_revisao"
            self.attendance.save("atendimentos", session)
            self._handled.update({(chat, message.id): session["id"] for message in group})
            if self.review_enabled():
                # Revisar antes de enviar: vira rascunho; o admin manda (ou edita) pelo app ou /enviar.
                self._make_draft(chat, target, "\n".join(parts), result["resposta"], session,
                                 result.get("pendencias", []), result.get("consultas_estoque", []))
                return
            sent_id = self.transport.reply(target, result["resposta"])
            if not sent_id:
                raise RuntimeError("O WhatsApp não confirmou o envio")
            self.attendance.confirm_sent(session["id"], "\n".join(parts), result["resposta"], sent_id,
                                         result.get("pendencias", []), self.clock())
            self._remember_bot(chat, sent_id, result["resposta"])
            self.transport.react(target, "")
        except Exception:
            LOG.exception("whatsapp: falha ao responder a mensagem %s", target_id)
            try:
                self.transport.react(target, ERROR_REACTION)
            except Exception:
                LOG.exception("whatsapp: falha ao marcar o erro")

    # ------------------------------------------------------------------
    # Rascunhos (revisar antes de enviar)
    # ------------------------------------------------------------------

    def _make_draft(self, chat: str, target: WaMessage, question: str, answer: str,
                    session: Dict[str, Any], pending: Any, evidence: Any) -> Draft:
        with self._lock:
            self._expire_drafts()
            for old in list(self._drafts.values()):
                if old.session_id == session["id"] or (old.chat == chat and old.target.id == target.id):
                    self._drafts.pop(old.id, None)
                    self.attendance.delete_draft(old.id)
            target_data = {key: getattr(target, key) for key in ("chat", "id", "sender", "from_me", "timestamp", "text", "quoted_message_id")}
            saved = self.attendance.save("rascunhos", {"chat": chat, "target": target_data,
                "question": question, "answer": answer, "created_at": self.clock(), "session_id": session["id"],
                "revision": session["revisao"], "pending": pending, "evidence": evidence})
            draft = Draft(saved["id"], chat, target, question, answer, self.clock(), session["id"], session["revisao"], pending, evidence)
            self._drafts[draft.id] = draft
        self.transport.react(target, DRAFT_REACTION)
        self._note_to_self(
            f"📝 *Rascunho #{draft.id}* (ainda não foi para o cliente)\n"
            f"Atendimento #{draft.session_id} · cliente …{target.sender.split('@')[0][-4:]}\n"
            f"Pergunta: {question[:300]}\n\n{answer}\n\n"
            f"Para mandar: /enviar {draft.id}  •  Para descartar: /descartar {draft.id}\n"
            "Para editar: Chronos > Assistente > Admin > WhatsApp."
        )
        return draft

    def _expire_drafts(self) -> None:
        now = self.clock()
        for draft_id in [d.id for d in self._drafts.values() if now - d.created_at > DRAFT_MAX_AGE_SECONDS]:
            self._drafts.pop(draft_id, None)
            self.attendance.delete_draft(draft_id)
        while len(self._drafts) > MAX_DRAFTS:
            draft_id = min(self._drafts)
            self._drafts.pop(draft_id, None)
            self.attendance.delete_draft(draft_id)

    def list_drafts(self) -> List[Dict[str, Any]]:
        with self._lock:
            self._expire_drafts()
            allowed = {item["id"] for item in self.attendance.all("atendimentos") if item.get("conta", "") == self._account()}
            drafts = sorted((draft for draft in self._drafts.values() if draft.session_id in allowed), key=lambda d: d.id)
        return [
            {
                "id": d.id,
                "cliente": d.target.sender,
                "pergunta": d.question,
                "texto": d.answer,
                "criado_em": d.created_at,
                "atendimento_id": d.session_id,
                "pendencias": d.pending or [],
            }
            for d in drafts
        ]

    def send_draft(self, draft_id: int, text: Optional[str] = None) -> bool:
        with self._work_lock:
            return self._send_draft_locked(draft_id, text)

    def _send_draft_locked(self, draft_id: int, text: Optional[str] = None) -> bool:
        """Manda o rascunho (ou o texto editado) para o cliente, citando a mensagem. False se nao existe."""
        with self._lock:
            self._expire_drafts()
            draft = self._drafts.get(int(draft_id))
        if draft is None:
            return False
        final = (text or "").strip() or draft.answer
        self.attendance.expire(self.clock(), self.context_minutes() * 60)
        session = next((item for item in self.attendance.all("atendimentos") if item["id"] == draft.session_id), None)
        if not session or session["revisao"] != draft.revision or session["estado"] in ("cancelado", "concluido", "expirado"):
            raise ValueError("Este atendimento mudou ou expirou. Reaja novamente com 🤖 para gerar um rascunho atualizado.")
        if session.get("conta", "") != self._account():
            raise ValueError("O rascunho pertence a outra conta do WhatsApp.")
        if draft.evidence:
            from app.services.assistant_chat_service import _summarize_call

            for evidence in draft.evidence:
                output = self.chat_service.tools.run_tool(evidence["ferramenta"], evidence["entrada"])
                if _summarize_call(evidence["ferramenta"], evidence["entrada"], output) != evidence:
                    raise ValueError("O estoque mudou desde a consulta. Reaja novamente com 🤖 e revise o novo saldo antes de enviar.")
        sent_id = self.transport.reply(draft.target, final)
        if not sent_id:
            raise RuntimeError("Envio não confirmado. O rascunho foi preservado; confira o WhatsApp antes de tentar novamente.")
        self.attendance.confirm_sent(draft.session_id, draft.question, final, sent_id, draft.pending or [], self.clock())
        with self._lock:
            self._drafts.pop(draft.id, None)
            self.attendance.delete_draft(draft.id)
        self._remember_bot(draft.chat, sent_id, final)
        self.transport.react(draft.target, "")
        return True

    def discard_draft(self, draft_id: int) -> bool:
        with self._work_lock:
            return self._discard_draft_locked(draft_id)

    def _discard_draft_locked(self, draft_id: int) -> bool:
        with self._lock:
            draft = self._drafts.pop(int(draft_id), None)
        if draft is None:
            return False
        self.attendance.delete_draft(draft.id)
        session = next((item for item in self.attendance.all("atendimentos") if item["id"] == draft.session_id), None)
        if session and session["estado"] not in ("cancelado", "concluido", "expirado"):
            session["estado"] = "aguardando_cliente" if session.get("mensagens_enviadas") and session.get("pendencias") else "cancelado"
            self.attendance.save("atendimentos", session)
        self.transport.react(draft.target, "")
        return True

    # ------------------------------------------------------------------
    # Comandos (so na conversa "Mensagem para mim")
    # ------------------------------------------------------------------

    def command(self, message: WaMessage) -> None:
        parts = (message.text or "").strip().split()
        name = parts[0].lower() if parts else ""
        try:
            if name in ("/enviar", "/descartar"):
                reply = self._draft_command(name, parts[1:])
            elif name == "/encerrar":
                reply = ("Atendimento encerrado; histórico preservado." if len(parts) == 2 and parts[1].lstrip("#").isdigit()
                         and self.close_session(int(parts[1].lstrip("#"))) else "Use /encerrar <número do atendimento>.")
            elif name == "/atendimentos":
                reply = "\n".join(f"#{item['id']}: {item['estado']} · {item['origem'][:100]}" for item in self.list_sessions()) or "Nenhum atendimento."
            elif name in ("/ensinar", "/ensina"):
                reply = self._teach(parts[1:])
            elif name in ("/perguntar", "/pergunta", "/p"):
                reply = self._ask(" ".join(parts[1:]))
            elif name in ("/igual", "/similar", "/diferente", "/pesquisar"):
                reply = self._ask(" ".join([name[1:], *parts[1:]]))
            elif name in ("/aprovar", "/recusar"):
                reply = self._decide(name, parts[1:])
            elif name in ("/pendentes", "/revisar"):
                reply = self._pending()
            elif name == "/resumo":
                reply = self._summary().build_text()
            else:
                reply = HELP_TEXT
        except Exception:
            LOG.exception("whatsapp: falha no comando %s", name)
            reply = "Não consegui executar o comando agora. Tente de novo."
        self._note_to_self(reply)

    def _summary(self) -> Any:
        if self.summary is None:
            from app.services.assistant_daily_summary_service import AssistantDailySummaryService

            self.summary = AssistantDailySummaryService(history=self.history)
        return self.summary

    def list_sessions(self) -> List[Dict[str, Any]]:
        self.attendance.expire(self.clock(), self.context_minutes() * 60)
        return [item for item in reversed(self.attendance.all("atendimentos")) if item.get("conta", "") == self._account()][:50]

    def _account(self) -> str:
        phone = getattr(self.transport, "phone_number", None)
        return str(phone() or "") if callable(phone) else ""

    def close_session(self, session_id: int) -> bool:
        with self._work_lock:
            if not any(item["id"] == session_id for item in self.list_sessions()):
                return False
            return self.attendance.close(session_id)

    def _draft_command(self, name: str, args: List[str]) -> str:
        drafts = self.list_drafts()
        if args and args[0].lstrip("#").isdigit():
            draft_id = int(args[0].lstrip("#"))
        elif len(drafts) == 1:
            draft_id = drafts[0]["id"]  # so um esperando: "/enviar" basta
        elif not drafts:
            return "Nenhum rascunho esperando."
        else:
            return f"Qual rascunho? {', '.join('#' + str(d['id']) for d in drafts)} (ex.: {name} {drafts[-1]['id']})"
        if name == "/enviar":
            return f"✅ Rascunho #{draft_id} enviado." if self.send_draft(draft_id) else f"Rascunho #{draft_id} não existe mais."
        return f"🗑️ Rascunho #{draft_id} descartado." if self.discard_draft(draft_id) else f"Rascunho #{draft_id} não existe mais."

    def _teach(self, args: List[str]) -> str:
        if len(args) < 3 or args[1].lower() not in TEACH_TYPES:
            return "Use assim: /ensinar 53279887101 similar 53279887210 muda o atuador"
        code_a, kind, code_b = args[0], args[1].lower(), args[2]
        for code in (code_a, code_b):
            if not is_searchable_code(canonical_code(code)):
                return f"*{code}* não parece um código de peça. Confira e mande de novo."
            try:
                check_single_code(code)
            except ValidationException as exc:
                return str(exc)
        note = " ".join(args[3:]).strip() or None
        proposal_id = self.history.add_proposal(code_a, code_b, kind, note, autor="whatsapp")
        detail = f" ({note})" if note else ""
        return (
            f"📝 Proposta #{proposal_id}: {display_code(code_a)} *{kind}* {display_code(code_b)}{detail}.\n"
            "Só vale depois que o admin aprovar no app (Assistente > Admin > Para revisar)."
        )

    def _ask(self, question: str) -> str:
        if not question.strip():
            return "Use assim: /perguntar 4031196 é a mesma que 5455609?"
        now = self.clock()
        self._private = [(t, m) for t, m in self._private if now - t <= CONTEXT_WINDOW_SECONDS][-8:]
        historico = [m for _, m in self._private]
        result = self.chat_service.chat(question, historico, canal="particular", autor="whatsapp")
        self._private += [
            (now, {"papel": "usuario", "texto": question}),
            (now, {"papel": "assistente", "texto": result["resposta"]}),
        ]
        return result["resposta"]

    def _decide(self, name: str, args: List[str]) -> str:
        if not args or not args[0].lstrip("#").isdigit():
            return f"Use assim: {name} 3 1234 (o número aparece em /pendentes; depois, o seu PIN)"
        from app.services.assistant_admin_service import AssistantAdminService

        if self.admin is None:
            self.admin = AssistantAdminService()
        admin = self.admin
        if not admin.is_publisher():
            return "Aprovar e recusar só no PC principal (o que publica a base)."
        # Quem pega o celular desbloqueado nao aprova nada sem o PIN (Assistente > Admin).
        if not admin.has_whatsapp_pin():
            return PIN_MISSING_TEXT
        if len(args) < 2:
            return f"Falta o PIN. Use assim: {name} {args[0].lstrip('#')} 1234"
        if admin.whatsapp_pin_blocked():
            return "PIN errado várias vezes. Aprovar pelo WhatsApp fica bloqueado por 10 minutos."
        if not admin.check_whatsapp_pin(args[1]):
            return "PIN incorreto."
        if self.teacher is None:
            from app.services.assistant_teach_service import AssistantTeachService

            self.teacher = AssistantTeachService(history=self.history)
        proposal_id = int(args[0].lstrip("#"))
        return self.teacher.approve(proposal_id) if name == "/aprovar" else self.teacher.reject(proposal_id)

    def _pending(self) -> str:
        proposals = self.history.list_proposals("pendente")
        review = self.history.review_items(limit=5)
        lines = [f"Propostas esperando o admin: {len(proposals)}"]
        for item in proposals[:5]:
            note = f" ({item['observacao']})" if item.get("observacao") else ""
            lines.append(f"• #{item['id']}: {item['codigo_a']} *{item['tipo']}* {item['codigo_b']}{note}")
        if proposals:
            lines.append("Para decidir: /aprovar <nº> <PIN> ou /recusar <nº> <PIN>")
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
        if message.quoted_message_id != target.quoted_message_id:
            return False
        handled = self._handled.get((message.chat, message.id))
        if handled is not None and handled != self._handled.get((target.chat, target.id)):
            return False
        if any(draft.target.id == message.id and draft.target.id != target.id for draft in self._drafts.values()):
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
        earlier = [
            m
            for m in messages[max(0, start - CONTEXT_MESSAGES) : start]
            if not (m.text or "").startswith("/")
            and (m.sender == target.sender or m.bot)
            and messages[start].timestamp - m.timestamp <= CONTEXT_WINDOW_SECONDS
        ]
        return target, messages[start : end + 1], earlier

    def _text_of(self, message: WaMessage, transcribe: bool, problems: List[str]) -> Optional[str]:
        if message.is_image:
            # Foto da plaqueta: os codigos lidos entram na pergunta, junto com a legenda.
            if message.transcript is None and transcribe:
                try:
                    message.transcript = self.vision.read_as_question(self.transport.download_image(message))
                except Exception as exc:  # inclui AssistantUnavailableError
                    problems.append(f"foto não lida ({exc})")
            parts = [p.strip() for p in (message.text, message.transcript) if p and p.strip()]
            return "\n".join(parts) or None
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
