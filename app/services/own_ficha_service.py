"""
Ficha propria pela tela (aba Catalogo do produto). As regras de dados ficam em
core/catalog/own_fichas.py; aqui ficam quem pode editar e o que fazer depois de salvar.

Quem edita: a maquina que publica a base, ou uma maquina que nao recebe de ninguem (sem
servidor nem pasta da base oficial). As outras recebem as fichas da publicadora junto com
o conhecimento do assistente, e uma edicao local seria trocada na proxima sincronizacao.
"""

from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional

from core.catalog import own_fichas
from core.database.connection import DatabaseConnection
from core.exceptions import ValidationException
from core.catalog.normalization import canonical_code, expand_family_codes

READ_ONLY_REASON = (
    "As fichas próprias são editadas na máquina que publica a base e chegam aqui sozinhas. "
    "Edite lá (Backup > Base oficial mostra o papel de cada máquina)."
)


class OwnFichaReadOnlyError(Exception):
    """Esta maquina recebe as fichas da publicadora: nao edita."""


def _official_base_config() -> Dict[str, Any]:
    from app.services.official_base_service import OfficialBaseService

    return OfficialBaseService().config_store.load()


class OwnFichaService:
    def __init__(
        self,
        db_connection: Optional[DatabaseConnection] = None,
        config_reader: Optional[Callable[[], Dict[str, Any]]] = None,
        after_change: Optional[Callable[[], None]] = None,
    ) -> None:
        self.db = db_connection or DatabaseConnection()
        self.config_reader = config_reader or _official_base_config
        self.after_change = after_change or self._publish

    # ------------------------------------------------------------------
    # Permissao
    # ------------------------------------------------------------------

    def can_edit(self) -> Dict[str, Any]:
        try:
            config = self.config_reader()
        except Exception:
            config = {}
        receives = config.get("role") != "publisher" and bool(
            str(config.get("remote_server_url") or "").strip() or str(config.get("official_base_dir") or "").strip()
        )
        return {"pode_editar": not receives, "motivo": READ_ONLY_REASON if receives else None}

    def _require_edit(self) -> None:
        if not self.can_edit()["pode_editar"]:
            raise OwnFichaReadOnlyError(READ_ONLY_REASON)

    # ------------------------------------------------------------------
    # Leitura e escrita
    # ------------------------------------------------------------------

    def list(self, codigo: Optional[str] = None) -> List[Dict[str, Any]]:
        conn = self.db.get_connection()
        try:
            fichas = own_fichas.list_fichas(conn)
        finally:
            conn.close()
        if not codigo:
            return fichas
        wanted = set(expand_family_codes([canonical_code(codigo)]))
        return [
            f for f in fichas
            if wanted & ({f["codigo_norm"]} | {canonical_code(c["numero"]) for c in f["codigos"]})
        ]

    def save(self, data: Dict[str, Any], ficha_id: Optional[int] = None) -> Dict[str, Any]:
        self._require_edit()
        conn = self.db.get_connection()
        try:
            new_id = own_fichas.save_ficha(conn, data, ficha_id)
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
        self._changed()
        return next(f for f in self.list() if f["id"] == new_id)

    def delete(self, ficha_id: int) -> None:
        self._require_edit()
        conn = self.db.get_connection()
        try:
            cursor = conn.execute("DELETE FROM fichas_proprias WHERE id = ?", (int(ficha_id),))
            conn.commit()
        finally:
            conn.close()
        if not cursor.rowcount:
            raise ValidationException("Ficha própria não encontrada.")
        self._changed()

    def _changed(self) -> None:
        own_fichas.refresh(self.db)  # copia para o catalogo e religa os produtos
        self.after_change()

    @staticmethod
    def _publish() -> None:
        from app.services.assistant_knowledge_sync_service import AssistantKnowledgeSyncService

        AssistantKnowledgeSyncService().publish_in_background()
