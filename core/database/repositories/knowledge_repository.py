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
    # ------------------------------------------------------------------
    # Grafo de codigos (app/services/code_graph.py)
    # ------------------------------------------------------------------

    def active_product_names(self) -> List[Dict[str, Any]]:
        return self._execute_query("SELECT id, nome FROM produtos WHERE ativo = 1 ORDER BY id")

    def nfe_item_links(self) -> List[Dict[str, Any]]:
        """Codigo do item na nota do fornecedor -> nosso produto (aprendido na Baixa por NF-e)."""
        try:
            return self._execute_query("SELECT codigo, produto_id FROM nfe_item_vinculos")
        except Exception:  # tabela ainda nao existe (nenhuma nota conferida nesta maquina)
            return []

    def graph_signature(self) -> str:
        """Muda quando produtos, regras ou vinculos de NF-e mudam (para nao remontar o grafo a toa)."""
        products = self._execute_query(
            "SELECT COUNT(*) AS n, COALESCE(MAX(id), 0) AS m, COALESCE(SUM(LENGTH(nome)), 0) AS s FROM produtos WHERE ativo = 1"
        )[0]
        rules = self._execute_query(
            "SELECT COUNT(*) AS n, COALESCE(MAX(atualizado_em), '') AS m FROM conhecimento_equivalencias"
        )[0]
        nfe = len(self.nfe_item_links())
        return f"{products['n']}:{products['m']}:{products['s']}|{rules['n']}:{rules['m']}|{nfe}"

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

    def export_rules(self) -> List[Dict[str, Any]]:
        """Todas as regras com as datas, para publicar para as outras maquinas."""
        return self._execute_query(
            """
            SELECT codigo_a, codigo_a_norm, codigo_b, codigo_b_norm, tipo, observacao, criado_em, atualizado_em
            FROM conhecimento_equivalencias
            ORDER BY codigo_a_norm, codigo_b_norm
            """
        )

    def replace_all(self, rules: List[Dict[str, Any]]) -> None:
        """Troca todas as regras pelas publicadas, de uma vez (maquinas que so recebem o conhecimento)."""
        conn = self.db.get_connection()
        try:
            conn.execute("BEGIN IMMEDIATE")
            conn.execute("DELETE FROM conhecimento_equivalencias")
            conn.executemany(
                """
                INSERT INTO conhecimento_equivalencias
                    (codigo_a, codigo_a_norm, codigo_b, codigo_b_norm, tipo, observacao, criado_em, atualizado_em)
                VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), COALESCE(?, CURRENT_TIMESTAMP))
                """,
                [
                    (
                        r["codigo_a"],
                        r["codigo_a_norm"],
                        r["codigo_b"],
                        r["codigo_b_norm"],
                        r["tipo"],
                        r.get("observacao"),
                        r.get("criado_em"),
                        r.get("atualizado_em"),
                    )
                    for r in rules
                ],
            )
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def product_codes_with_prefix(self, prefix: str, length: int) -> List[Dict[str, Any]]:
        """Nossos produtos ativos com algum codigo que comeca com `prefix` e tem `length` caracteres."""
        return self._execute_query(
            """
            SELECT DISTINCT pc.produto_id, pc.numero_norm
            FROM produto_codigos pc
            JOIN produtos p ON p.id = pc.produto_id
            WHERE p.ativo = 1 AND pc.numero_norm GLOB ? AND LENGTH(pc.numero_norm) = ?
            ORDER BY pc.numero_norm
            """,
            (f"{prefix}*", length),
        )
