"""
"Importar cadastro da empresa" (Backup > Catálogo): le o arquivo de produtos do sistema da loja,
mostra o que vai mudar e, quando o usuario confirma, cadastra os produtos que faltam (com saldo
zero) e guarda as aplicacoes como fichas "Cadastro da empresa". As regras de leitura ficam em
core/catalog/company_register.py.

Nunca mexe em saldo nem no nome dos produtos que ja existem. Antes de gravar faz uma copia de
seguranca do banco (backup_pre_cadastro_*).

Quem importa: a maquina que publica a base, ou uma que nao recebe de ninguem (como as fichas
proprias). As outras recebem tudo com "Aplicar base oficial".
"""

from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional

from app.services.own_ficha_service import OwnFichaReadOnlyError, OwnFichaService
from core.catalog import company_register as register
from core.database.connection import DatabaseConnection

READ_ONLY_REASON = (
    "O cadastro da empresa é importado na máquina que publica a base. As outras recebem os produtos "
    "e as aplicações com \"Aplicar base oficial\"."
)
NEW_PRODUCT_NOTE = "Cadastrado pela importação do cadastro da empresa (material {cd})."
PREVIEW_EXAMPLES = 30
BACKUP_PREFIX = "backup_pre_cadastro"


def _make_backup() -> str:
    from app.services.backup_service import BackupService

    _, path = BackupService().create_automatic_backup(prefix=BACKUP_PREFIX)
    return path


class CompanyRegisterService:
    def __init__(
        self,
        db_connection: Optional[DatabaseConnection] = None,
        can_edit: Optional[Callable[[], Dict[str, Any]]] = None,
        make_backup: Optional[Callable[[], str]] = None,
    ) -> None:
        self.db = db_connection or DatabaseConnection()
        self._can_edit = can_edit or OwnFichaService(self.db).can_edit
        self._make_backup = make_backup or _make_backup

    def can_edit(self) -> Dict[str, Any]:
        allowed = bool(self._can_edit().get("pode_editar"))
        return {"pode_editar": allowed, "motivo": None if allowed else READ_ONLY_REASON}

    # ------------------------------------------------------------------
    # Leitura
    # ------------------------------------------------------------------

    def status(self) -> Dict[str, Any]:
        conn = self.db.get_connection()
        try:
            self._ensure_schema(conn)
            row = conn.execute("SELECT COUNT(*), MAX(importado_em) FROM cadastro_fichas").fetchone()
        finally:
            conn.close()
        return {"fichas": int(row[0] or 0), "importado_em": row[1], **self.can_edit()}

    def _plan(self, conn, data: bytes) -> Dict[str, Any]:
        items = register.read_items(data)
        mp_codes = {
            r[0]
            for r in conn.execute(
                """
                SELECT r.numero_norm FROM catalogo_referencias r
                JOIN catalogo_produtos cp ON cp.id = r.catalogo_produto_id
                JOIN catalogo_fontes f ON f.id = cp.fonte_id
                WHERE f.codigo = 'MASTER_POWER'
                UNION
                SELECT cp.codigo_norm FROM catalogo_produtos cp
                JOIN catalogo_fontes f ON f.id = cp.fonte_id
                WHERE f.codigo = 'MASTER_POWER'
                """
            )
        }
        built = register.build_fichas(items, mp_codes)
        matches = register.match_products(conn, items)
        return {"items": items, "fichas": built["fichas"], "ignorados": built["ignorados"],
                "matches": matches, "novos": register.new_products(items, matches)}

    def preview(self, data: bytes) -> Dict[str, Any]:
        """O que a importacao faria, sem gravar nada."""
        conn = self.db.get_connection()
        try:
            self._ensure_schema(conn)
            plan = self._plan(conn, data)
            current = conn.execute("SELECT COUNT(*) FROM cadastro_fichas").fetchone()[0]
        finally:
            conn.close()
        return self._summary(plan, current)

    @staticmethod
    def _summary(plan: Dict[str, Any], current_fichas: int) -> Dict[str, Any]:
        fichas: List[Dict[str, Any]] = plan["fichas"]
        found = sum(1 for pid in plan["matches"].values() if pid is not None)
        return {
            "itens_no_arquivo": len(plan["items"]),
            "itens_ja_cadastrados": found,
            "produtos_novos": len(plan["novos"]),
            "exemplos_produtos_novos": [i["nome"] for i in plan["novos"][:PREVIEW_EXAMPLES]],
            "fichas": len(fichas),
            "fichas_atuais": int(current_fichas),
            "aplicacoes": sum(len(f["aplicacoes"]) for f in fichas),
            "codigos": sum(len(f["codigos"]) for f in fichas),
            "ignorados": plan["ignorados"],
        }

    # ------------------------------------------------------------------
    # Escrita
    # ------------------------------------------------------------------

    def apply(self, data: bytes, criar_produtos: bool = True) -> Dict[str, Any]:
        if not self.can_edit()["pode_editar"]:
            raise OwnFichaReadOnlyError(READ_ONLY_REASON)
        conn = self.db.get_connection()
        try:
            self._ensure_schema(conn)
            plan = self._plan(conn, data)  # le o arquivo antes da copia: arquivo errado nao gera backup
            current = conn.execute("SELECT COUNT(*) FROM cadastro_fichas").fetchone()[0]
        finally:
            conn.close()
        backup_path = self._make_backup()

        created = 0
        conn = self.db.get_connection()
        try:
            conn.execute("BEGIN IMMEDIATE")
            if criar_produtos and plan["novos"]:
                locations = [r[0] for r in conn.execute("SELECT id FROM locais WHERE ativo = 1")]
                for item in plan["novos"]:
                    cursor = conn.execute(
                        "INSERT INTO produtos (nome, observacao, ativo) VALUES (?, ?, 1)",
                        (item["nome"], NEW_PRODUCT_NOTE.format(cd=item["cd_material"])),
                    )
                    conn.executemany(
                        """
                        INSERT INTO produto_estoque (produto_id, local_id, quantidade, atualizado_em)
                        VALUES (?, ?, 0, datetime('now'))
                        """,
                        [(cursor.lastrowid, loc) for loc in locations],
                    )
                    created += 1
            register.replace_all(conn, plan["fichas"])
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
        self._refresh()
        summary = self._summary(plan, current)
        summary.update(produtos_criados=created, backup=backup_path)
        return summary

    def remove(self) -> Dict[str, Any]:
        """Tira as fichas do cadastro (os produtos cadastrados pela importacao continuam)."""
        if not self.can_edit()["pode_editar"]:
            raise OwnFichaReadOnlyError(READ_ONLY_REASON)
        conn = self.db.get_connection()
        try:
            self._ensure_schema(conn)
            removed = conn.execute("DELETE FROM cadastro_fichas").rowcount
            conn.commit()
        finally:
            conn.close()
        self._refresh()
        return {"fichas_removidas": int(removed or 0)}

    @staticmethod
    def _ensure_schema(conn) -> None:
        from core.catalog.bundle import ensure_catalog_schema
        from core.database.migration_v2_4_0_knowledge import ensure_knowledge_schema

        ensure_catalog_schema(conn)
        ensure_knowledge_schema(conn)
        conn.commit()

    def _refresh(self) -> None:
        """Copia as fichas para o catalogo e religa os produtos (os novos tambem)."""
        from core.catalog.bundle import _ensure_system_info, relink_catalog

        conn = self.db.get_connection()
        try:
            self._ensure_schema(conn)
            _ensure_system_info(conn)
            conn.commit()
            register.materialize(conn)
        finally:
            conn.close()
        relink_catalog(self.db, force=True)
