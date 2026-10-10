"""
Repository da base de conhecimento do especialista (relacoes entre codigos).

Cada par e guardado uma vez, com codigo_a_norm < codigo_b_norm. As regras de
negocio (validacao, grupos de iguais, sugestoes) ficam em
`app/services/assistant_knowledge_service.py`.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from core.database.repositories.base_repository import BaseRepository


class KnowledgeRepository(BaseRepository):
    def all_rules(self) -> List[Dict[str, Any]]:
        """Todas as regras (poucas centenas): a busca carrega tudo e monta os grupos em memoria."""
        return self._execute_query(
            """
            SELECT id, codigo_a, codigo_a_norm, codigo_b, codigo_b_norm, tipo, observacao
            FROM conhecimento_equivalencias
            ORDER BY id
            """
        )

    def list_rules(self, search_norm: Optional[str] = None, limit: int = 200, offset: int = 0) -> List[Dict[str, Any]]:
        where = ""
        params: List[Any] = []
        if search_norm:
            where = "WHERE codigo_a_norm LIKE ? OR codigo_b_norm LIKE ?"
            params += [f"%{search_norm}%", f"%{search_norm}%"]
        return self._execute_query(
            f"""
            SELECT id, codigo_a, codigo_b, tipo, observacao, criado_em, atualizado_em
            FROM conhecimento_equivalencias
            {where}
            ORDER BY atualizado_em DESC, id DESC
            LIMIT ? OFFSET ?
            """,
            tuple(params + [limit, offset]),
        )

    def get_rule(self, rule_id: int) -> Optional[Dict[str, Any]]:
        rows = self._execute_query(
            """
            SELECT id, codigo_a, codigo_b, tipo, observacao, criado_em, atualizado_em
            FROM conhecimento_equivalencias WHERE id = ?
            """,
            (rule_id,),
        )
        return rows[0] if rows else None

    def upsert_rule(
        self, codigo_a: str, codigo_a_norm: str, codigo_b: str, codigo_b_norm: str, tipo: str, observacao: Optional[str]
    ) -> int:
        """Cria a regra ou atualiza tipo/observacao se o par ja existe. Devolve o id."""
        conn = self.db.get_connection()
        try:
            conn.execute(
                """
                INSERT INTO conhecimento_equivalencias
                    (codigo_a, codigo_a_norm, codigo_b, codigo_b_norm, tipo, observacao)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(codigo_a_norm, codigo_b_norm) DO UPDATE SET
                    codigo_a = excluded.codigo_a,
                    codigo_b = excluded.codigo_b,
                    tipo = excluded.tipo,
                    observacao = excluded.observacao,
                    atualizado_em = CURRENT_TIMESTAMP
                """,
                (codigo_a, codigo_a_norm, codigo_b, codigo_b_norm, tipo, observacao),
            )
            row = conn.execute(
                "SELECT id FROM conhecimento_equivalencias WHERE codigo_a_norm = ? AND codigo_b_norm = ?",
                (codigo_a_norm, codigo_b_norm),
            ).fetchone()
            conn.commit()
            return int(row[0])
        finally:
            conn.close()

    def delete_rule(self, rule_id: int) -> bool:
        return self._execute_command("DELETE FROM conhecimento_equivalencias WHERE id = ?", (rule_id,)) > 0

    def product_codes_with_prefix(self, prefix: str, length: int) -> List[Dict[str, Any]]:
        """Nossos produtos ativos com algum codigo que comeca com `prefix` e tem `length` caracteres."""
        return self._execute_query(
            """
            SELECT DISTINCT pc.produto_id, pc.numero_norm
            FROM produto_codigos pc
            JOIN produtos p ON p.id = pc.produto_id
            WHERE p.ativo = 1 AND pc.numero_norm LIKE ? AND LENGTH(pc.numero_norm) = ?
            ORDER BY pc.numero_norm
            """,
            (f"{prefix}%", length),
        )
