"""
Serviço de sincronizacao, enriquecimento e auto-cadastro do catalogo.

Responsabilidades:
1. Enriquecer os produtos ja cadastrados em `produtos` vinculando-os ao catálogo.
2. Auto-cadastrar os turbos/conjuntos faltantes da Master Power na tabela `produtos`,
   respeitando a hierarquia de marcas originais (HOLSET, BORGWARNER, GARRETT, MITSUBISHI, IHI, OEM)
   e definindo estoque inicial zero em todos os locais.
"""

from __future__ import annotations

import collections
import logging
import re
import sqlite3
from typing import Any, Dict, List, Optional, Set

from core.catalog.normalization import canonical_code, extract_codes_from_name
from core.database.connection import DatabaseConnection
from core.database.migration_v2_3_0_catalog import rebuild_product_codes
from core.exceptions import DatabaseException

logger = logging.getLogger(__name__)

# Prioridade das marcas originais para nomear novos produtos
BRAND_PRIORITY = [
    "HOLSET",
    "BORGWARNER",
    "GARRETT",
    "MITSUBISHI",
    "IHI",
    "OEM",
    "MAHLE",
    "MASTER POWER",
]


class CatalogSyncService:
    """Sincronizador e auto-cadastrador do catalogo."""

    def __init__(self, db_connection: Optional[DatabaseConnection] = None):
        self.db_connection = db_connection or DatabaseConnection()

    def sync_and_enrich_all(self, auto_register: bool = False) -> Dict[str, Any]:
        """
        Executa o ciclo completo de sincronizacao:
        1. Recalcula codigos canonicos dos produtos existentes (produto_codigos).
        2. Vincula produtos existentes aos correspondentes do catalogo.
        3. Se auto_register=True, cadastra itens faltantes com marcas originais e estoque 0.
        """
        conn = self.db_connection.get_connection()
        try:
            conn.execute("BEGIN IMMEDIATE TRANSACTION")

            # 1. Atualizar produto_codigos de todos os produtos existentes
            rebuild_product_codes(conn)

            # 2. Enriquecer produtos existentes
            enrich_stats = self._enrich_existing_products(conn)

            # 3. Auto-cadastrar faltantes
            register_stats = (
                self._auto_register_missing_products(conn)
                if auto_register
                else {"cadastrados": 0, "por_marca": {}}
            )

            # 4. Atualizar produto_codigos novamente (para cobrir os auto-cadastrados)
            if register_stats.get("cadastrados", 0) > 0:
                rebuild_product_codes(conn)

            conn.commit()

            res = {
                "existentes_processados": enrich_stats["total_existentes"],
                "existentes_vinculados": enrich_stats["vinculados"],
                "novos_auto_cadastrados": register_stats["cadastrados"],
                "auto_cadastrados_por_marca": register_stats["por_marca"],
            }
            logger.info("Sincronizacao de catalogo concluida: %s", res)
            return res

        except Exception as exc:
            conn.rollback()
            logger.error("Erro na sincronizacao do catalogo: %s", exc, exc_info=True)
            raise DatabaseException(f"Falha na sincronização: {exc}") from exc
        finally:
            conn.close()

    def _enrich_existing_products(
        self, conn: sqlite3.Connection, product_ids: Optional[List[int]] = None
    ) -> Dict[str, int]:
        """Vincula nossos produtos existentes (ou so `product_ids`) aos produtos do catalogo."""
        c = conn.cursor()

        # Carregar todas as referencias do catalogo indexadas por numero_norm
        cp_by_ref_norm = collections.defaultdict(set)
        for r in c.execute(
            "SELECT catalogo_produto_id, numero_norm FROM catalogo_referencias"
        ).fetchall():
            norm = r[1]
            if len(norm) >= 5:
                cp_by_ref_norm[norm].add(r[0])

        # Carregar grupos dos produtos do catalogo para desambiguacao
        cp_grupos = dict(
            c.execute("SELECT id, UPPER(COALESCE(grupo, '')) FROM catalogo_produtos").fetchall()
        )

        if product_ids is None:
            our_prods = c.execute(
                "SELECT id, nome, UPPER(nome) FROM produtos WHERE ativo = 1"
            ).fetchall()
        else:
            marks = ",".join("?" for _ in product_ids) or "NULL"
            our_prods = c.execute(
                f"SELECT id, nome, UPPER(nome) FROM produtos WHERE ativo = 1 AND id IN ({marks})",
                tuple(product_ids),
            ).fetchall()

        vinculos_payload = []
        vinculados_count = 0

        for pid, nome, nome_upper in our_prods:
            codes = extract_codes_from_name(nome)
            candidates: Set[int] = set()
            matching_codes: Dict[int, List[str]] = collections.defaultdict(list)

            for code in codes:
                if code in cp_by_ref_norm:
                    for cp_id in cp_by_ref_norm[code]:
                        candidates.add(cp_id)
                        matching_codes[cp_id].append(code)

            if not candidates:
                continue

            # Desambiguacao se houver mais de um candidato
            is_our_conj = "CONJ" in nome_upper or "CENTRAL" in nome_upper
            best_candidates = []

            for cp_id in candidates:
                cp_grupo = cp_grupos.get(cp_id, "")
                is_cp_conj = "CONJUNTO" in cp_grupo
                if (is_our_conj and is_cp_conj) or (not is_our_conj and not is_cp_conj):
                    best_candidates.append(cp_id)

            chosen = best_candidates if best_candidates else list(candidates)

            for cp_id in chosen:
                common_str = ",".join(sorted(set(matching_codes[cp_id])))
                vinculos_payload.append((pid, cp_id, "AUTO", common_str))

            vinculados_count += 1

        c.executemany(
            """
            INSERT INTO produto_catalogo_vinculo (produto_id, catalogo_produto_id, status, codigos_em_comum)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(produto_id, catalogo_produto_id) DO UPDATE SET
                status = excluded.status,
                codigos_em_comum = excluded.codigos_em_comum,
                atualizado_em = CURRENT_TIMESTAMP
            """,
            vinculos_payload,
        )

        return {"total_existentes": len(our_prods), "vinculados": vinculados_count}

    def _auto_register_missing_products(self, conn: sqlite3.Connection) -> Dict[str, Any]:
        """Auto-cadastra os produtos do catalogo que ainda nao existem no estoque."""
        c = conn.cursor()

        # Identifica quais catalogo_produtos ja possuem vinculo
        linked_cp_ids = {
            r[0]
            for r in c.execute(
                "SELECT DISTINCT catalogo_produto_id FROM produto_catalogo_vinculo"
            ).fetchall()
        }

        # Carrega catalogo_produtos nao vinculados
        missing_cps = c.execute(
            """
            SELECT id, codigo, descricao, grupo, modelo
            FROM catalogo_produtos
            WHERE ativo = 1
            ORDER BY grupo, codigo
            """
        ).fetchall()
        missing_cps = [cp for cp in missing_cps if cp[0] not in linked_cp_ids]

        if not missing_cps:
            return {"cadastrados": 0, "por_marca": {}}

        # Carregar referencias agrupadas por catalogo_produto_id e fabricante
        refs_by_cp = collections.defaultdict(lambda: collections.defaultdict(list))
        for r in c.execute(
            "SELECT catalogo_produto_id, fabricante, numero FROM catalogo_referencias"
        ).fetchall():
            refs_by_cp[r[0]][r[1]].append(r[2])

        # Locais ativos para inicializar estoque zerado
        locais = [r[0] for r in c.execute("SELECT id FROM locais WHERE ativo = 1").fetchall()]

        brand_counter = collections.Counter()
        created_count = 0

        for cp_id, codigo, descricao, grupo, modelo in missing_cps:
            fabs = refs_by_cp[cp_id]
            is_conj = (
                "CONJUNTO" in (grupo or "").upper()
                or "CONJUNTO" in (descricao or "").upper()
            )
            tipo_prefix = "CONJUNTO CENTRAL" if is_conj else "TURBO"

            # Modelo limpo (remove prefixo Master MPxxx se houver nome original entre parenteses)
            model_clean = self._clean_model_str(modelo)

            # Determina a marca principal
            chosen_brand = "MASTER POWER"
            chosen_nums = [codigo]

            for b in BRAND_PRIORITY:
                if b in fabs and fabs[b]:
                    chosen_brand = b
                    chosen_nums = fabs[b][:4]
                    break

            brand_counter[chosen_brand] += 1
            nums_str = " / ".join(chosen_nums)

            # Monta o nome oficial
            name_parts = [tipo_prefix, chosen_brand]
            if model_clean:
                name_parts.append(model_clean)
            final_name = " ".join(name_parts) + f" - {nums_str}"

            # 1. Inserir na tabela produtos
            c.execute(
                """
                INSERT INTO produtos (nome, ativo, observacao)
                VALUES (?, 1, ?)
                """,
                (final_name, f"Origem: Catálogo Master Power ({codigo})"),
            )
            new_pid = int(c.lastrowid)

            # 2. Inicializar estoque zero em todos os locais ativos
            for lid in locais:
                c.execute(
                    """
                    INSERT INTO produto_estoque (produto_id, local_id, quantidade, atualizado_em)
                    VALUES (?, ?, 0, datetime('now'))
                    """,
                    (new_pid, lid),
                )

            # 3. Vincular imediatamente ao catalogo
            common_str = ",".join(canonical_code(n) for n in chosen_nums)
            c.execute(
                """
                INSERT INTO produto_catalogo_vinculo (produto_id, catalogo_produto_id, status, codigos_em_comum)
                VALUES (?, ?, 'AUTO', ?)
                """,
                (new_pid, cp_id, common_str),
            )

            created_count += 1

        return {
            "cadastrados": created_count,
            "por_marca": dict(brand_counter),
        }

    @staticmethod
    def _clean_model_str(model_raw: Optional[str]) -> str:
        if not model_raw:
            return ""
        # Se tem "(HX55)", prefere o nome original dentro dos parenteses
        m = re.search(r"\(([^)]+)\)", model_raw)
        if m:
            return m.group(1).strip()
        # Se comeca com MPxxx w, tenta pegar o sufixo ou limpa espacos
        return re.sub(r"\s+", " ", str(model_raw)).strip()
