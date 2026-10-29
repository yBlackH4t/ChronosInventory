"""
Servico de importacao e sincronizacao do catalogo Master Power.

Lê o banco externo SQLite do catalogo (CatalogoMasterPower_Aberto.db),
higieniza codificacao, converte observacoes RTF, agrupa fabricantes nas marcas
oficiais (BorgWarner, Holset, Garrett...) e popula as tabelas catalogo_* no banco do Chronos.
"""

from __future__ import annotations

import json
import logging
import os
import sqlite3
from typing import Any, Dict, List, Optional, Tuple

from core.catalog.normalization import (
    canonical_code,
    clean_text,
    normalize_manufacturer,
    rtf_to_text,
    split_reference_numbers,
)
from core.database.connection import DatabaseConnection
from core.database.migration_v2_3_0_catalog import ensure_catalog_schema
from core.exceptions import DatabaseException

logger = logging.getLogger(__name__)

# Mapeamento dos campos tecnicos CpoAuxProd1..23 para rotulos limpos
SPEC_LABELS = {
    1: "Material do Rotor Compressor",
    4: "Modelo",
    5: "Diâmetro do Rotor Compressor",
    6: "Diâmetro do Rotor de Turbina",
    7: "Atuador",
    8: "Classificação",
    9: "Entrada / Retorno de Óleo",
    10: "Carcaça Turbina",
    11: "A/R Carcaça Turbina",
    12: "Área Carcaça Turbina",
    13: "Base Carcaça Turbina",
    14: "Flange Escapamento",
    15: "A/R Carcaça Compressora",
    16: "Área Carcaça Compressora",
    17: "Tipo Carcaça Compressora",
    18: "Entrada Carcaça Compressora",
    19: "Saída Carcaça Compressora",
    20: "Diâmetro Saída Carcaça Compressora",
    21: "Ângulo Carcaça Turbina",
    22: "Ângulo Carcaça Compressora",
    23: "Regulagem do Atuador / Válvula",
}


class CatalogImportService:
    """Importador e sincronizador do catalogo Master Power."""

    def __init__(self, db_connection: Optional[DatabaseConnection] = None):
        self.db_connection = db_connection or DatabaseConnection()

    def import_master_power_catalog(self, source_db_path: str) -> Dict[str, Any]:
        """
        Executa a importacao completa do catalogo Master Power.

        Args:
            source_db_path: Caminho completo para CatalogoMasterPower_Aberto.db

        Returns:
            Dicionario com estatisticas da importacao
        """
        if not os.path.exists(source_db_path):
            raise FileNotFoundError(f"Arquivo do catalogo nao encontrado: {source_db_path}")

        logger.info("Iniciando importacao do catalogo Master Power: %s", source_db_path)

        src_conn = sqlite3.connect(f"file:{source_db_path}?mode=ro", uri=True)
        src_conn.row_factory = sqlite3.Row

        dest_conn = self.db_connection.get_connection()
        try:
            ensure_catalog_schema(dest_conn)
            dest_cursor = dest_conn.cursor()

            dest_cursor.execute("BEGIN IMMEDIATE TRANSACTION")

            # 1. Registrar / atualizar fonte
            meta = self._read_catalog_metadata(src_conn)
            dest_cursor.execute(
                """
                INSERT INTO catalogo_fontes (codigo, nome, versao, data_emissao, arquivo_origem, importado_em)
                VALUES ('MASTER_POWER', 'Catálogo Master Power Turbo', ?, ?, ?, datetime('now'))
                ON CONFLICT(codigo) DO UPDATE SET
                    versao = excluded.versao,
                    data_emissao = excluded.data_emissao,
                    arquivo_origem = excluded.arquivo_origem,
                    importado_em = excluded.importado_em
                """,
                (meta.get("versao"), meta.get("data_emissao"), source_db_path),
            )
            dest_cursor.execute("SELECT id FROM catalogo_fontes WHERE codigo = 'MASTER_POWER'")
            fonte_id = int(dest_cursor.fetchone()[0])

            # 2. Ler grupos de produto
            grupos_map = self._read_groups_map(src_conn)

            # 3. Ler observacoes de produtos
            obs_map = self._read_observations_map(src_conn)

            # 4. Importar produtos do catalogo
            src_cursor = src_conn.cursor()
            src_cursor.execute(
                """
                SELECT CodigoProduto, NumeroProduto, DescricaoProduto, CodigoGrupoProduto,
                       ArquivoFotoProduto,
                       CpoAuxProd1, CpoAuxProd4, CpoAuxProd5, CpoAuxProd6, CpoAuxProd7,
                       CpoAuxProd8, CpoAuxProd9, CpoAuxProd10, CpoAuxProd11, CpoAuxProd12,
                       CpoAuxProd13, CpoAuxProd14, CpoAuxProd15, CpoAuxProd16, CpoAuxProd17,
                       CpoAuxProd18, CpoAuxProd19, CpoAuxProd20, CpoAuxProd21, CpoAuxProd22,
                       CpoAuxProd23
                FROM PRODUTO
                """
            )

            # Mapeamento do CodigoProduto interno (Master) para o ID no Chronos
            mp_id_to_chronos_id: Dict[int, int] = {}
            total_produtos = 0

            for row in src_cursor.fetchall():
                mp_id = int(row["CodigoProduto"])
                codigo = clean_text(row["NumeroProduto"]) or str(mp_id)
                codigo_norm = canonical_code(codigo)
                descricao = clean_text(row["DescricaoProduto"]) or "TURBO"
                grupo = grupos_map.get(row["CodigoGrupoProduto"], "OUTROS")
                modelo = clean_text(row["CpoAuxProd4"])
                foto = clean_text(row["ArquivoFotoProduto"])
                obs = obs_map.get(mp_id)

                # Montar especificacoes estruturadas
                specs = []
                for field_idx, label in SPEC_LABELS.items():
                    val = clean_text(row[f"CpoAuxProd{field_idx}"])
                    if val:
                        specs.append({"campo": label, "valor": val})
                specs_json = json.dumps(specs, ensure_ascii=False) if specs else None

                dest_cursor.execute(
                    """
                    INSERT INTO catalogo_produtos (
                        fonte_id, codigo, codigo_norm, codigo_origem, descricao,
                        grupo, modelo, especificacoes, observacao, foto_arquivo, ativo
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
                    ON CONFLICT(fonte_id, codigo) DO UPDATE SET
                        codigo_norm = excluded.codigo_norm,
                        codigo_origem = excluded.codigo_origem,
                        descricao = excluded.descricao,
                        grupo = excluded.grupo,
                        modelo = excluded.modelo,
                        especificacoes = excluded.especificacoes,
                        observacao = excluded.observacao,
                        foto_arquivo = excluded.foto_arquivo,
                        ativo = 1,
                        atualizado_em = CURRENT_TIMESTAMP
                    RETURNING id
                    """,
                    (
                        fonte_id,
                        codigo,
                        codigo_norm,
                        mp_id,
                        descricao,
                        grupo,
                        modelo,
                        specs_json,
                        obs,
                        foto,
                    ),
                )
                inserted_id = int(dest_cursor.fetchone()[0])
                mp_id_to_chronos_id[mp_id] = inserted_id
                total_produtos += 1

            # 5. Importar referencias cruzadas
            # Limpa referencias antigas da fonte para evitar orfaos em recarga
            dest_cursor.execute(
                """
                DELETE FROM catalogo_referencias
                WHERE catalogo_produto_id IN (
                    SELECT id FROM catalogo_produtos WHERE fonte_id = ?
                )
                """,
                (fonte_id,),
            )

            src_cursor.execute(
                """
                SELECT rc.CodigoProduto, f.DescricaoFabricante, rc.NumeroProduto
                FROM REFERENCIACRUZADA rc
                JOIN FABRICANTE f ON f.CodigoFabricante = rc.CodigoFabricante
                """
            )
            ref_payload: List[Tuple[int, str, str, str]] = []
            seen_refs = set()

            for row in src_cursor.fetchall():
                chronos_cp_id = mp_id_to_chronos_id.get(int(row["CodigoProduto"]))
                if not chronos_cp_id:
                    continue

                raw_fab = row["DescricaoFabricante"]
                normalized_fab = normalize_manufacturer(raw_fab)

                # Divide se tiver mais de um numero no campo ("4031195 – 3785479")
                pairs = split_reference_numbers(row["NumeroProduto"])
                for orig_num, canon_num in pairs:
                    key = (chronos_cp_id, normalized_fab, canon_num)
                    if key not in seen_refs:
                        seen_refs.add(key)
                        ref_payload.append(
                            (chronos_cp_id, normalized_fab, orig_num, canon_num)
                        )

            # Também insere o proprio codigo Master Power como referencia fabricante MASTER POWER
            for mp_id, chronos_cp_id in mp_id_to_chronos_id.items():
                dest_cursor.execute(
                    "SELECT codigo, codigo_norm FROM catalogo_produtos WHERE id = ?",
                    (chronos_cp_id,),
                )
                c_row = dest_cursor.fetchone()
                if c_row:
                    key = (chronos_cp_id, "MASTER POWER", c_row[1])
                    if key not in seen_refs:
                        seen_refs.add(key)
                        ref_payload.append(
                            (chronos_cp_id, "MASTER POWER", c_row[0], c_row[1])
                        )

            dest_cursor.executemany(
                """
                INSERT INTO catalogo_referencias (catalogo_produto_id, fabricante, numero, numero_norm)
                VALUES (?, ?, ?, ?)
                """,
                ref_payload,
            )

            # 6. Importar aplicacoes e motorizacoes
            dest_cursor.execute(
                """
                DELETE FROM catalogo_aplicacoes
                WHERE catalogo_produto_id IN (
                    SELECT id FROM catalogo_produtos WHERE fonte_id = ?
                )
                """,
                (fonte_id,),
            )

            src_cursor.execute(
                """
                SELECT pa.CodigoProduto,
                       f.DescricaoFabricante as Montadora,
                       a.DescricaoAplicacao as Veiculo,
                       a.ComplementoAplicacao3_1 as Motor,
                       t.DescricaoTipoAplicacao as Tipo,
                       a.ComplementoAplicacao3_2 as Complemento
                FROM PRODUTO_APLICACAO pa
                JOIN APLICACAO a ON a.CodigoAplicacao = pa.CodigoAplicacao
                LEFT JOIN FABRICANTE f ON f.CodigoFabricante = a.CodigoFabricante
                LEFT JOIN TIPOAPLICACAO t ON t.CodigoTipoAplicacao = a.CodigoTipoAplicacao
                """
            )
            app_payload: List[Tuple[int, Optional[str], str, Optional[str], Optional[str], Optional[str]]] = []
            seen_apps = set()

            for row in src_cursor.fetchall():
                chronos_cp_id = mp_id_to_chronos_id.get(int(row["CodigoProduto"]))
                if not chronos_cp_id:
                    continue

                montadora = clean_text(row["Montadora"])
                veiculo = clean_text(row["Veiculo"]) or "Diversos"
                motor = clean_text(row["Motor"])
                tipo = clean_text(row["Tipo"])
                compl = clean_text(row["Complemento"])

                app_key = (chronos_cp_id, montadora, veiculo, motor)
                if app_key not in seen_apps:
                    seen_apps.add(app_key)
                    app_payload.append(
                        (chronos_cp_id, montadora, veiculo, motor, tipo, compl)
                    )

            dest_cursor.executemany(
                """
                INSERT INTO catalogo_aplicacoes (
                    catalogo_produto_id, montadora, veiculo, motor, tipo, complemento
                )
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                app_payload,
            )

            # 7. Importar relacionados (conjuntos x turbos)
            dest_cursor.execute(
                """
                DELETE FROM catalogo_relacionados
                WHERE catalogo_produto_id IN (
                    SELECT id FROM catalogo_produtos WHERE fonte_id = ?
                )
                """,
                (fonte_id,),
            )

            src_cursor.execute(
                "SELECT CodProdConj, CodProdComp FROM CONJ_PRODS"
            )
            rel_payload = []
            for row in src_cursor.fetchall():
                conj_id = mp_id_to_chronos_id.get(int(row["CodProdConj"]))
                comp_id = mp_id_to_chronos_id.get(int(row["CodProdComp"]))
                if conj_id and comp_id:
                    # Turbo aponta para seu conjunto central
                    rel_payload.append((conj_id, comp_id, "COMPONENTE"))
                    # Conjunto central aponta de volta para o turbo
                    rel_payload.append((comp_id, conj_id, "TURBO_COMPLETO"))

            src_cursor.execute(
                "SELECT CodigoProduto, CodigoSimilar FROM SIMILAR"
            )
            for row in src_cursor.fetchall():
                p1 = mp_id_to_chronos_id.get(int(row["CodigoProduto"]))
                p2 = mp_id_to_chronos_id.get(int(row["CodigoSimilar"]))
                if p1 and p2:
                    rel_payload.append((p1, p2, "SIMILAR"))

            dest_cursor.executemany(
                """
                INSERT OR IGNORE INTO catalogo_relacionados (catalogo_produto_id, relacionado_id, tipo)
                VALUES (?, ?, ?)
                """,
                rel_payload,
            )

            dest_conn.commit()

            result = {
                "fonte_id": fonte_id,
                "produtos_importados": total_produtos,
                "referencias_importadas": len(ref_payload),
                "aplicacoes_importadas": len(app_payload),
                "relacionados_importados": len(rel_payload),
            }
            logger.info("Importacao do catalogo concluida com sucesso: %s", result)
            return result

        except Exception as exc:
            dest_conn.rollback()
            logger.error("Erro na importacao do catalogo: %s", exc, exc_info=True)
            raise DatabaseException(f"Falha ao importar catálogo: {exc}") from exc
        finally:
            src_conn.close()
            dest_conn.close()

    def _read_catalog_metadata(self, conn: sqlite3.Connection) -> Dict[str, Any]:
        """Lê versao e data do catalogo de UMREGISTRO."""
        try:
            row = conn.execute(
                "SELECT VersaoCatalogo, DataEmissao FROM UMREGISTRO LIMIT 1"
            ).fetchone()
            if row:
                return {
                    "versao": str(row[0] or ""),
                    "data_emissao": str(row[1] or "").split()[0],
                }
        except Exception as e:
            logger.warning("Falha ao ler metadados de UMREGISTRO: %s", e)
        return {"versao": "1.0", "data_emissao": ""}

    def _read_groups_map(self, conn: sqlite3.Connection) -> Dict[int, str]:
        cursor = conn.cursor()
        cursor.execute("SELECT CodigoGrupoProduto, DescricaoGrupoProduto FROM GRUPOPRODUTO")
        return {
            int(r[0]): clean_text(r[1]) or "TURBOCOMPRESSOR"
            for r in cursor.fetchall()
        }

    def _read_observations_map(self, conn: sqlite3.Connection) -> Dict[int, str]:
        cursor = conn.cursor()
        cursor.execute("SELECT CodigoProduto, Observacao FROM PRODUTO_OBS")
        out = {}
        for r in cursor.fetchall():
            txt = rtf_to_text(r[1])
            if txt:
                out[int(r[0])] = txt
        return out
