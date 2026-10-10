"""
Resumo diario do estoque na conversa "Mensagem para mim" do WhatsApp (docs/PLANO_IA.md, Fase 4).

Todo dia, na hora escolhida pelo admin, a ponte manda para o proprio numero:
- o que zerou desde ontem;
- o que mais saiu nos ultimos 7 dias;
- os codigos que perguntaram ao assistente e nao temos (pistas de compra).
Tambem sai na hora com o comando /resumo. Nunca vai para clientes: so para o proprio numero.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta
from typing import Any, Callable, Dict, List, Optional

from app.services.assistant_answer_format import display_code
from app.services.assistant_config_store import AssistantConfigStore
from core.exceptions import ValidationException

LOG = logging.getLogger(__name__)

SECTION = "resumo"
DEFAULT_HOUR = "08:00"
TOP_LIMIT = 5
_HOUR = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


class AssistantDailySummaryService:
    def __init__(
        self,
        movements: Any = None,
        history: Any = None,
        config_store: Optional[AssistantConfigStore] = None,
        clock: Callable[[], datetime] = datetime.now,
    ) -> None:
        self._movements = movements
        self._history = history
        self.config_store = config_store or AssistantConfigStore()
        self.clock = clock

    @property
    def movements(self) -> Any:
        if self._movements is None:
            from app.services.movement_service import MovementService

            self._movements = MovementService()
        return self._movements

    @property
    def history(self) -> Any:
        if self._history is None:
            from app.services.assistant_history_service import AssistantHistoryService

            self._history = AssistantHistoryService()
        return self._history

    # ------------------------------------------------------------------
    # Texto
    # ------------------------------------------------------------------

    def build_text(self, now: Optional[datetime] = None) -> str:
        now = now or self.clock()
        today = now.date()
        lines: List[str] = [f"*Resumo do estoque — {now:%d/%m/%Y}*"]

        stockouts = self._safe(lambda: self.movements.get_recent_stockouts(1, today, limit=TOP_LIMIT))
        if stockouts:
            lines.append("*Zeraram desde ontem:*")
            lines += [f"• {item['nome']} (saíram {item['total_saida_recente']})" for item in stockouts]
        else:
            lines.append("Nada zerou desde ontem.")

        top = self._safe(lambda: self.movements.get_top_saidas(today - timedelta(days=6), today, limit=TOP_LIMIT))
        top = [item for item in top if int(item.get("total_saida") or 0) > 0]
        if top:
            lines.append("*Mais saíram nos últimos 7 dias:*")
            lines += [f"• {item['nome']} — {item['total_saida']}" for item in top]
        else:
            lines.append("Nenhuma saída nos últimos 7 dias.")

        since = (now - timedelta(days=7)).isoformat(timespec="seconds")
        missing = self._safe(lambda: self.history.missing_codes_since(since, limit=TOP_LIMIT))
        if missing:
            lines.append("*Perguntaram e não temos (7 dias):*")
            lines += [f"• {display_code(item['codigo'])} — {item['vezes']}x" for item in missing]
        return "\n".join(lines)

    @staticmethod
    def _safe(read: Callable[[], List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
        """Uma parte que falha nao derruba o resumo inteiro."""
        try:
            return list(read() or [])
        except Exception:
            LOG.exception("resumo: falha ao montar uma parte")
            return []

    # ------------------------------------------------------------------
    # Configuracao e horario
    # ------------------------------------------------------------------

    def settings(self) -> Dict[str, Any]:
        saved = self.config_store.load_section(SECTION)
        return {
            "ativo": bool(saved.get("ativo")),
            "hora": str(saved.get("hora") or DEFAULT_HOUR),
            "ultimo_envio": saved.get("ultimo_envio"),
        }

    def update_settings(self, ativo: Optional[bool] = None, hora: Optional[str] = None) -> Dict[str, Any]:
        current = self.settings()
        if hora is not None:
            hora = hora.strip()
            if not _HOUR.match(hora):
                raise ValidationException("Hora inválida. Use HH:MM, ex.: 08:00.")
            current["hora"] = hora
        if ativo is not None:
            current["ativo"] = bool(ativo)
        self.config_store.save_section(SECTION, current)
        return current

    def due(self, now: Optional[datetime] = None) -> bool:
        """Ligado, ja passou da hora e ainda nao saiu hoje?"""
        now = now or self.clock()
        current = self.settings()
        return (
            current["ativo"]
            and now.strftime("%H:%M") >= current["hora"]
            and current["ultimo_envio"] != now.date().isoformat()
        )

    def mark_sent(self, now: Optional[datetime] = None) -> None:
        now = now or self.clock()
        current = self.settings()
        current["ultimo_envio"] = now.date().isoformat()
        self.config_store.save_section(SECTION, current)
