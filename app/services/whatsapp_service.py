"""
Liga, desliga e acompanha a ponte WhatsApp do assistente (docs/PLANO_IA.md, Fase 3).

Um por processo do backend. Guarda o estado para a tela de Configuracoes: QR code
para conectar, conectado, desconectado. A sessao do WhatsApp fica em
whatsapp_sessao.db na pasta do app; se a ponte estava ligada, religa quando o
backend abre (start_if_enabled).
"""

from __future__ import annotations

import logging
import os
import threading
from typing import Any, Callable, Dict, Optional

from app.services.assistant_config_store import AssistantConfigStore
from core.utils.file_utils import FileUtils

LOG = logging.getLogger(__name__)

SESSION_FILE = "whatsapp_sessao.db"

STATE_STOPPED = "parado"
STATE_CONNECTING = "conectando"
STATE_WAITING_QR = "aguardando_qr"
STATE_CONNECTED = "conectado"
STATE_RECONNECTING = "reconectando"
STATE_LOGGED_OUT = "desconectado"
STATE_ERROR = "erro"

# Secao separada do "whatsapp" (que guarda so o "ativo" e e regravada inteira ao ligar/desligar).
REVIEW_SECTION = "whatsapp_revisao"

# De quanto em quanto tempo confere se e hora do resumo diario.
SUMMARY_CHECK_SECONDS = 60


def _default_transport_factory(session_path: str, **callbacks: Any) -> Any:
    from app.services.whatsapp_neonize_transport import NeonizeTransport

    return NeonizeTransport(session_path, **callbacks)


def review_before_sending(config_store: Optional[AssistantConfigStore] = None) -> bool:
    """"Revisar antes de enviar" (ligado por padrao): a resposta do 🤖 vira rascunho para o admin."""
    section = (config_store or AssistantConfigStore()).load_section(REVIEW_SECTION)
    return bool(section.get("revisar", True))


def _default_bridge_factory(transport: Any) -> Any:
    from app.services.whatsapp_bridge_service import WhatsAppBridge

    return WhatsAppBridge(transport, review_enabled=review_before_sending)


def _default_summary_factory() -> Any:
    from app.services.assistant_daily_summary_service import AssistantDailySummaryService

    return AssistantDailySummaryService()


class WhatsAppService:
    _instance: Optional["WhatsAppService"] = None
    _instance_lock = threading.Lock()

    @classmethod
    def instance(cls) -> "WhatsAppService":
        with cls._instance_lock:
            if cls._instance is None:
                cls._instance = cls()
            return cls._instance

    def __init__(
        self,
        transport_factory: Callable[..., Any] = _default_transport_factory,
        bridge_factory: Callable[[Any], Any] = _default_bridge_factory,
        config_store: Optional[AssistantConfigStore] = None,
        session_dir: Optional[str] = None,
        summary_factory: Optional[Callable[[], Any]] = None,
    ) -> None:
        self.transport_factory = transport_factory
        self.bridge_factory = bridge_factory
        self.config_store = config_store or AssistantConfigStore()
        self.session_dir = session_dir
        self.summary_factory = summary_factory or _default_summary_factory
        self.state = STATE_STOPPED
        self.qr: Optional[str] = None
        self.error: Optional[str] = None
        self._transport: Any = None
        self._bridge: Any = None
        self._lock = threading.Lock()
        self._summary_stop: Optional[threading.Event] = None

    def session_path(self) -> str:
        return os.path.join(self.session_dir or FileUtils.get_app_directory(), SESSION_FILE)

    # ------------------------------------------------------------------

    def start(self) -> Dict[str, Any]:
        with self._lock:
            if self._transport is not None and self.state in (STATE_LOGGED_OUT, STATE_ERROR):
                # Conexao morta (aparelho removido pelo celular, erro): fecha e comeca outra, com QR novo.
                self._discard_transport()
            if self._transport is None:
                self.state, self.qr, self.error = STATE_CONNECTING, None, None
                try:
                    transport = self.transport_factory(
                        self.session_path(),
                        on_message=self._on_message,
                        on_qr=self._on_qr,
                        on_state=self._on_state,
                    )
                    self._bridge = self.bridge_factory(transport)
                    self._transport = transport
                    transport.start()
                except Exception as exc:
                    LOG.exception("whatsapp: nao foi possivel iniciar")
                    self._transport = self._bridge = None
                    self.state, self.error = STATE_ERROR, str(exc)
                    return self.status()
                self._start_summary_clock()
            self._set_enabled(True)
        return self.status()

    # ------------------------------------------------------------------
    # Resumo diario (na "Mensagem para mim", na hora configurada pelo admin)
    # ------------------------------------------------------------------

    def _start_summary_clock(self) -> None:
        if self._summary_stop is not None:
            return
        stop = threading.Event()
        self._summary_stop = stop

        def loop() -> None:
            while not stop.wait(SUMMARY_CHECK_SECONDS):
                self.send_summary_if_due()

        threading.Thread(target=loop, name="whatsapp-resumo", daemon=True).start()

    def _stop_summary_clock(self) -> None:
        if self._summary_stop is not None:
            self._summary_stop.set()
            self._summary_stop = None

    def send_summary_if_due(self) -> bool:
        """Manda o resumo do dia se estiver na hora (conectado, ligado e ainda nao saiu hoje)."""
        transport = self._transport
        if transport is None or self.state != STATE_CONNECTED:
            return False
        try:
            summary = self.summary_factory()
            if not summary.due():
                return False
            transport.send_to_self(summary.build_text())
            summary.mark_sent()
            return True
        except Exception:
            LOG.exception("whatsapp: falha ao mandar o resumo diario")
            return False

    def _discard_transport(self) -> None:
        self._stop_summary_clock()
        transport, self._transport, self._bridge = self._transport, None, None
        if transport is not None:
            try:
                transport.stop()
            except Exception:
                LOG.exception("whatsapp: falha ao fechar a conexao")

    def stop(self, remember: bool = True) -> Dict[str, Any]:
        """Para a ponte. `remember=False` (fechando o backend) mantem a ponte ligada para a proxima vez."""
        with self._lock:
            self._discard_transport()
            self.state, self.qr = STATE_STOPPED, None
            if remember:
                self._set_enabled(False)
        return self.status()

    def logout(self) -> Dict[str, Any]:
        """Tira o Chronos da lista de aparelhos conectados do WhatsApp e apaga a sessao."""
        with self._lock:
            if self._transport is not None:
                self._transport.logout()
            self._discard_transport()
            self._set_enabled(False)
            for suffix in ("", "-wal", "-shm"):
                path = self.session_path() + suffix
                if os.path.exists(path):
                    try:
                        os.remove(path)
                    except OSError:
                        LOG.warning("whatsapp: nao foi possivel apagar %s", path)
            self.state, self.qr = STATE_LOGGED_OUT, None
        return self.status()

    def start_if_enabled(self) -> None:
        """Na abertura do backend: religa se estava ligada e ja tem sessao (nao mostra QR sozinho)."""
        if self.config_store.load_section("whatsapp").get("ativo") and os.path.exists(self.session_path()):
            self.start()

    def status(self) -> Dict[str, Any]:
        number = None
        if self._transport is not None and self.state == STATE_CONNECTED:
            try:
                number = self._transport.phone_number()
            except Exception:
                number = None
        return {
            "estado": self.state,
            "qr": self.qr if self.state == STATE_WAITING_QR else None,
            "numero": number,
            "erro": self.error,
            "ativo": bool(self.config_store.load_section("whatsapp").get("ativo")),
            "revisar": review_before_sending(self.config_store),
        }

    # ------------------------------------------------------------------
    # Revisar antes de enviar
    # ------------------------------------------------------------------

    def set_review(self, enabled: bool) -> Dict[str, Any]:
        self.config_store.save_section(REVIEW_SECTION, {"revisar": bool(enabled)})
        return self.status()

    def list_drafts(self) -> list:
        bridge = self._bridge
        return bridge.list_drafts() if bridge is not None else []

    def send_draft(self, draft_id: int, text: Optional[str] = None) -> bool:
        bridge = self._bridge
        return bool(bridge is not None and bridge.send_draft(draft_id, text))

    def discard_draft(self, draft_id: int) -> bool:
        bridge = self._bridge
        return bool(bridge is not None and bridge.discard_draft(draft_id))

    # ------------------------------------------------------------------
    # Callbacks do transport
    # ------------------------------------------------------------------

    def _on_message(self, message: Any) -> None:
        bridge = self._bridge
        if bridge is not None:
            bridge.handle(message)

    def _on_qr(self, code: str) -> None:
        self.qr, self.state = code, STATE_WAITING_QR

    def _on_state(self, state: str) -> None:
        if state == "conectado":
            self.state, self.qr, self.error = STATE_CONNECTED, None, None
        elif state == "pareado":
            self.state, self.qr = STATE_CONNECTING, None
        elif state == "reconectando":
            self.state = STATE_RECONNECTING
        elif state == "desconectado":
            # Tiraram o Chronos dos aparelhos conectados pelo celular: precisa de QR de novo.
            self.state, self.qr = STATE_LOGGED_OUT, None
            self._set_enabled(False)
        elif state == "erro":
            self.state = STATE_ERROR

    def _set_enabled(self, enabled: bool) -> None:
        self.config_store.save_section("whatsapp", {"ativo": enabled})
