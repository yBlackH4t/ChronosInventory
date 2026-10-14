"""
"Sugerir ao admin": um colega propoe uma regra (A igual/similar/diferente de B) pelo Chronos
do PC dele, e ela chega como proposta na maquina publicadora, onde o admin aprova ou recusa
(Assistente > Admin > Para revisar), como as do /ensinar do WhatsApp.

- Maquina publicadora, ou sem fonte configurada: a proposta fica nesta maquina.
- Outras maquinas: vai para o servidor local da publicadora (POST /proposals), com a mesma
  senha do servidor. Nada vale antes da aprovacao do admin.
"""

from __future__ import annotations

from typing import Any, Callable, Dict, Optional

from app.services.assistant_knowledge_service import MAX_NOTE_LENGTH, check_single_code
from core.catalog.normalization import canonical_code, is_searchable_code
from core.exceptions import ValidationException

PROPOSAL_TYPES = ("igual", "similar", "diferente")
MAX_AUTHOR_LENGTH = 60
MAX_PENDING = 500


def _official_base_config() -> Dict[str, Any]:
    from app.services.official_base_service import OfficialBaseService

    return OfficialBaseService().config_store.load()


def normalize_proposal(data: Any) -> Dict[str, Any]:
    """Confere a proposta (da tela ou de outra maquina). Erro = ValidationException."""
    if not isinstance(data, dict):
        raise ValidationException("Proposta inválida.")
    codes = []
    for key, label in (("codigo_a", "Primeiro código"), ("codigo_b", "Segundo código")):
        raw = " ".join(str(data.get(key) or "").split())[:60]
        if not is_searchable_code(canonical_code(raw)):
            raise ValidationException(f"{label}: {raw!r} não parece um código de peça.")
        check_single_code(raw)
        codes.append(raw.upper())
    if canonical_code(codes[0]) == canonical_code(codes[1]):
        raise ValidationException("Os dois códigos são o mesmo.")
    kind = str(data.get("tipo") or "").strip().lower()
    if kind not in PROPOSAL_TYPES:
        raise ValidationException("Tipo inválido. Use igual, similar ou diferente.")
    note = " ".join(str(data.get("observacao") or "").split())[:MAX_NOTE_LENGTH] or None
    author = " ".join(str(data.get("autor") or "").split())[:MAX_AUTHOR_LENGTH] or None
    return {"codigo_a": codes[0], "codigo_b": codes[1], "tipo": kind, "observacao": note, "autor": author}


class AssistantProposalService:
    def __init__(
        self,
        history: Any = None,
        config_reader: Optional[Callable[[], Dict[str, Any]]] = None,
        local_share: Any = None,
    ) -> None:
        self._history = history
        self.config_reader = config_reader or _official_base_config
        self._local_share = local_share

    @property
    def history(self) -> Any:
        if self._history is None:
            from app.services.assistant_history_service import AssistantHistoryService

            self._history = AssistantHistoryService()
        return self._history

    @property
    def local_share(self) -> Any:
        if self._local_share is None:
            from app.services.local_share_service import LocalShareService

            self._local_share = LocalShareService()
        return self._local_share

    def receive(self, data: Any, default_author: Optional[str] = None) -> int:
        """Grava a proposta nesta maquina (vinda da tela daqui ou de outra maquina)."""
        proposal = normalize_proposal(data)
        if len(self.history.list_proposals("pendente")) >= MAX_PENDING:
            raise ValidationException("Há propostas demais esperando o admin. Peça para ele revisar primeiro.")
        return self.history.add_proposal(
            proposal["codigo_a"],
            proposal["codigo_b"],
            proposal["tipo"],
            proposal["observacao"],
            autor=proposal["autor"] or default_author,
        )

    def submit(self, data: Any) -> Dict[str, Any]:
        """Da tela: manda para a publicadora, ou guarda aqui se esta maquina e a que aprova."""
        proposal = normalize_proposal(data)
        try:
            config = self.config_reader()
        except Exception:
            config = {}
        server = str(config.get("remote_server_url") or "").strip()
        if config.get("role") == "publisher" or not server:
            proposal_id = self.receive(proposal, default_author="esta máquina")
            return {"id": proposal_id, "destino": "esta_maquina"}
        result = self.local_share.send_remote_proposal(server, proposal)
        return {"id": result.get("id"), "destino": "publicadora"}
