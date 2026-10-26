"""
Catalogo distribuido junto com o instalador.

O catalogo (fichas Master Power, referencias cruzadas, aplicacoes, relacionados) e
dado de referencia, igual para todas as maquinas. Ele viaja dentro do instalador em
`core/catalog/data/catalogo_bundle.db.gz` (gerado por scripts/export_catalog_bundle.py)
e e carregado na abertura do app:

1. `apply_catalog_bundle`: copia as tabelas `catalogo_*` do pacote para o banco local
   quando o conteudo do pacote mudou. Nunca toca produtos, estoque ou movimentacoes.
   Se a maquina tem um catalogo importado localmente (a maquina de origem do catalogo),
   ele e mantido.
2. `relink_catalog`: liga os produtos DESTA maquina as fichas, pelos codigos extraidos
   do nome. Roda quando o catalogo ou os produtos mudaram. Vinculos marcados a mao
   (CONFIRMADO / REJEITADO) sao preservados.

Falhas aqui nunca impedem o app de abrir: `run_catalog_startup` so registra no log.
"""

from __future__ import annotations

import gzip
import hashlib
import logging
import os
import shutil
import sqlite3
import sys
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from core.database.migration_v2_3_0_catalog import ensure_catalog_schema, rebuild_product_codes

logger = logging.getLogger(__name__)

BUNDLE_FILENAME = "catalogo_bundle.db.gz"
DEFAULT_BUNDLE_PATH = Path(__file__).resolve().parent / "data" / BUNDLE_FILENAME

# Parent tables first; deletes run in reverse order.
BUNDLE_TABLES = (
    "catalogo_fontes",
    "catalogo_produtos",
    "catalogo_referencias",
    "catalogo_aplicacoes",
    "catalogo_relacionados",
)

KEY_BUNDLE_HASH = "catalog_bundle_hash"
KEY_LINK_SIGNATURE = "catalog_link_signature"
LINK_RULES_VERSION = 2
LINK_STATUS_AUTO = "AUTO"
# KEY_BUNDLE_HASH depois de importar o arquivo da Master Power pela tela: "local:<versao>".
LOCAL_IMPORT_PREFIX = "local:"


def _is_newer(candidate: Any, current: Any) -> bool:
    """A versao do catalogo `candidate` e mais nova que `current`? ("21" > "20"; sem numero: nao)."""
    try:
        return float(str(candidate).strip()) > float(str(current).strip())
    except (TypeError, ValueError):
        return False


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def bundled_catalog_path() -> Optional[str]:
    """Pacote embutido: dentro do executavel (PyInstaller) ou no repositorio."""
    candidates = []
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        candidates.append(Path(meipass) / "core" / "catalog" / "data" / BUNDLE_FILENAME)
    candidates.append(DEFAULT_BUNDLE_PATH)
    for path in candidates:
        if path.is_file():
            return str(path)
    return None


def compute_catalog_hash(conn: sqlite3.Connection, schema: str = "main") -> str:
    """Hash do conteudo das tabelas do catalogo (identifica uma versao do pacote)."""
    digest = hashlib.sha256()
    for table in BUNDLE_TABLES:
        columns = [r[1] for r in conn.execute(f"PRAGMA {schema}.table_info({table})")]
        order = ", ".join(str(i + 1) for i in range(len(columns)))
        digest.update(f"#{table}:{','.join(columns)}\n".encode())
        for row in conn.execute(f"SELECT * FROM {schema}.{table} ORDER BY {order}"):
            digest.update(repr(tuple(row)).encode("utf-8", "replace"))
    return digest.hexdigest()


def _ensure_system_info(conn: sqlite3.Connection) -> None:
    conn.execute("CREATE TABLE IF NOT EXISTS system_info (key TEXT PRIMARY KEY, value TEXT)")


def _get_system(conn: sqlite3.Connection, key: str) -> Optional[str]:
    row = conn.execute("SELECT value FROM system_info WHERE key = ?", (key,)).fetchone()
    return str(row[0]) if row and row[0] is not None else None


def _set_system(conn: sqlite3.Connection, key: str, value: str) -> None:
    conn.execute("INSERT OR REPLACE INTO system_info (key, value) VALUES (?, ?)", (key, value))


def _manual_links(conn: sqlite3.Connection) -> List[Tuple[Any, ...]]:
    """Vinculos marcados a mao, identificados pelo codigo da ficha (ids podem mudar)."""
    return conn.execute(
        """
        SELECT v.produto_id, f.codigo, cp.codigo, v.status, v.codigos_em_comum
        FROM produto_catalogo_vinculo v
        JOIN catalogo_produtos cp ON cp.id = v.catalogo_produto_id
        JOIN catalogo_fontes f ON f.id = cp.fonte_id
        WHERE v.status <> ?
        """,
        (LINK_STATUS_AUTO,),
    ).fetchall()


def _restore_manual_links(conn: sqlite3.Connection, links: List[Tuple[Any, ...]]) -> int:
    restored = 0
    for produto_id, fonte_codigo, cat_codigo, status, comuns in links:
        row = conn.execute(
            """
            SELECT cp.id FROM catalogo_produtos cp
            JOIN catalogo_fontes f ON f.id = cp.fonte_id
            WHERE f.codigo = ? AND cp.codigo = ?
            """,
            (fonte_codigo, cat_codigo),
        ).fetchone()
        if not row:
            continue
        conn.execute(
            """
            INSERT INTO produto_catalogo_vinculo (produto_id, catalogo_produto_id, status, codigos_em_comum)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(produto_id, catalogo_produto_id) DO UPDATE SET
                status = excluded.status,
                atualizado_em = CURRENT_TIMESTAMP
            """,
            (produto_id, row[0], status, comuns),
        )
        restored += 1
    return restored


# ---------------------------------------------------------------------------
# 1. Pacote -> tabelas do catalogo
# ---------------------------------------------------------------------------

def apply_catalog_bundle(db_connection, bundle_path: Optional[str] = None) -> Dict[str, Any]:
    path = bundle_path or bundled_catalog_path()
    if not path or not os.path.isfile(path):
        return {"status": "sem_pacote"}

    with tempfile.TemporaryDirectory() as tmp:
        bundle_db = os.path.join(tmp, "catalogo_bundle.db")
        with gzip.open(path, "rb") as src, open(bundle_db, "wb") as dst:
            shutil.copyfileobj(src, dst)

        meta_conn = sqlite3.connect(bundle_db)
        try:
            meta = dict(meta_conn.execute("SELECT key, value FROM bundle_meta").fetchall())
        finally:
            meta_conn.close()
        bundle_hash = meta.get("content_hash")
        if not bundle_hash or int(meta.get("count_catalogo_produtos") or 0) <= 0:
            return {"status": "pacote_invalido"}

        conn = db_connection.get_connection()
        try:
            ensure_catalog_schema(conn)
            _ensure_system_info(conn)
            conn.commit()

            installed_hash = _get_system(conn, KEY_BUNDLE_HASH)
            if installed_hash == bundle_hash:
                return {"status": "atualizado", "hash": bundle_hash}

            # As fichas proprias nao contam: elas sao recopiadas depois (core/catalog/own_fichas.py).
            local_count = conn.execute(
                """
                SELECT COUNT(*) FROM catalogo_produtos cp JOIN catalogo_fontes f ON f.id = cp.fonte_id
                WHERE f.codigo <> 'PROPRIA'
                """
            ).fetchone()[0]
            if local_count and not installed_hash:
                # Catalogo importado nesta maquina (ex.: a maquina de origem): nao sobrescrever.
                return {"status": "catalogo_local_mantido", "produtos": local_count}
            if local_count and installed_hash.startswith(LOCAL_IMPORT_PREFIX):
                # Importado pela tela "Atualizar catálogo": so um pacote de versao mais nova substitui.
                local_version = installed_hash[len(LOCAL_IMPORT_PREFIX):]
                if not _is_newer(meta.get("fonte_versao"), local_version):
                    return {"status": "catalogo_local_mantido", "versao_local": local_version}

            conn.execute("ATTACH DATABASE ? AS bundle", (bundle_db,))
            try:
                conn.execute("BEGIN IMMEDIATE")
                try:
                    manual = _manual_links(conn)
                    conn.execute("DELETE FROM produto_catalogo_vinculo")
                    for table in reversed(BUNDLE_TABLES):
                        conn.execute(f"DELETE FROM main.{table}")
                    for table in BUNDLE_TABLES:
                        columns = [r[1] for r in conn.execute(f"PRAGMA main.table_info({table})")]
                        bundle_columns = {r[1] for r in conn.execute(f"PRAGMA bundle.table_info({table})")}
                        shared = [c for c in columns if c in bundle_columns]
                        col_sql = ", ".join(shared)
                        conn.execute(
                            f"INSERT INTO main.{table} ({col_sql}) SELECT {col_sql} FROM bundle.{table}"
                        )
                    restored = _restore_manual_links(conn, manual)
                    _set_system(conn, KEY_BUNDLE_HASH, bundle_hash)
                    conn.execute("DELETE FROM system_info WHERE key = ?", (KEY_LINK_SIGNATURE,))
                    conn.commit()
                except Exception:
                    conn.rollback()
                    raise
            finally:
                conn.execute("DETACH DATABASE bundle")

            counts = {t: conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in BUNDLE_TABLES}
            return {
                "status": "aplicado",
                "hash": bundle_hash,
                "fonte_versao": meta.get("fonte_versao"),
                "vinculos_manuais_preservados": restored,
                **counts,
            }
        finally:
            conn.close()


# ---------------------------------------------------------------------------
# 2. Produtos desta maquina <-> fichas do catalogo
# ---------------------------------------------------------------------------

def _link_signature(conn: sqlite3.Connection) -> str:
    digest = hashlib.sha256()
    digest.update(f"{LINK_RULES_VERSION}\n".encode())
    marker = conn.execute(
        "SELECT COUNT(*), COALESCE(MAX(id), 0) FROM catalogo_produtos"
    ).fetchone()
    refs = conn.execute("SELECT COUNT(*) FROM catalogo_referencias").fetchone()[0]
    digest.update(f"{_get_system(conn, KEY_BUNDLE_HASH)}|{marker[0]}|{marker[1]}|{refs}\n".encode())
    for row in conn.execute("SELECT id, nome, ativo FROM produtos ORDER BY id"):
        digest.update(repr(tuple(row)).encode("utf-8", "replace"))
    return digest.hexdigest()


def relink_catalog(db_connection, force: bool = False) -> Dict[str, Any]:
    from app.services.catalog_sync_service import CatalogSyncService

    conn = db_connection.get_connection()
    try:
        ensure_catalog_schema(conn)
        _ensure_system_info(conn)
        conn.commit()
        if not conn.execute("SELECT COUNT(*) FROM catalogo_produtos").fetchone()[0]:
            return {"status": "sem_catalogo"}

        signature = _link_signature(conn)
        if not force and _get_system(conn, KEY_LINK_SIGNATURE) == signature:
            return {"status": "atualizado"}

        conn.execute("BEGIN IMMEDIATE")
        try:
            manual = conn.execute(
                """
                SELECT produto_id, catalogo_produto_id, status, codigos_em_comum
                FROM produto_catalogo_vinculo WHERE status <> ?
                """,
                (LINK_STATUS_AUTO,),
            ).fetchall()
            conn.execute("DELETE FROM produto_catalogo_vinculo WHERE status = ?", (LINK_STATUS_AUTO,))
            rebuild_product_codes(conn)
            # Same matching rules as the catalog sync (codes in the product name).
            stats = CatalogSyncService(db_connection)._enrich_existing_products(conn)
            for produto_id, catalogo_id, status, comuns in manual:
                conn.execute(
                    """
                    INSERT INTO produto_catalogo_vinculo (produto_id, catalogo_produto_id, status, codigos_em_comum)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(produto_id, catalogo_produto_id) DO UPDATE SET
                        status = excluded.status,
                        atualizado_em = CURRENT_TIMESTAMP
                    """,
                    (produto_id, catalogo_id, status, comuns),
                )
            _set_system(conn, KEY_LINK_SIGNATURE, signature)
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        links = conn.execute("SELECT COUNT(*) FROM produto_catalogo_vinculo").fetchone()[0]
        return {
            "status": "religado",
            "produtos_vinculados": stats.get("vinculados", 0),
            "vinculos": links,
            "vinculos_manuais": len(manual),
        }
    finally:
        conn.close()


def link_product(db_connection, product_id: int) -> Dict[str, Any]:
    """
    Liga um produto ao catalogo logo depois de cadastrar ou renomear (antes so acontecia na
    proxima abertura do app): refaz os codigos do nome dele e os vinculos automaticos.
    Vinculos confirmados ou rejeitados a mao ficam como estao.
    """
    from app.services.catalog_sync_service import CatalogSyncService
    from core.catalog.normalization import extract_codes_from_name

    conn = db_connection.get_connection()
    try:
        ensure_catalog_schema(conn)
        conn.commit()
        if not conn.execute("SELECT COUNT(*) FROM catalogo_produtos").fetchone()[0]:
            return {"status": "sem_catalogo"}
        row = conn.execute("SELECT nome FROM produtos WHERE id = ?", (product_id,)).fetchone()
        if not row:
            return {"status": "sem_produto"}
        conn.execute("BEGIN IMMEDIATE")
        try:
            conn.execute("DELETE FROM produto_codigos WHERE produto_id = ? AND origem = 'NOME'", (product_id,))
            conn.executemany(
                "INSERT OR IGNORE INTO produto_codigos (produto_id, numero_norm, origem) VALUES (?, ?, 'NOME')",
                [(product_id, code) for code in extract_codes_from_name(row[0])],
            )
            manual = conn.execute(
                """
                SELECT catalogo_produto_id, status, codigos_em_comum FROM produto_catalogo_vinculo
                WHERE produto_id = ? AND status <> ?
                """,
                (product_id, LINK_STATUS_AUTO),
            ).fetchall()
            conn.execute(
                "DELETE FROM produto_catalogo_vinculo WHERE produto_id = ? AND status = ?",
                (product_id, LINK_STATUS_AUTO),
            )
            CatalogSyncService(db_connection)._enrich_existing_products(conn, [product_id])
            # O enriquecimento grava AUTO por cima; o que o usuario decidiu vale mais (como no relink).
            for catalogo_id, status, comuns in manual:
                conn.execute(
                    """
                    INSERT INTO produto_catalogo_vinculo (produto_id, catalogo_produto_id, status, codigos_em_comum)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(produto_id, catalogo_produto_id) DO UPDATE SET
                        status = excluded.status,
                        atualizado_em = CURRENT_TIMESTAMP
                    """,
                    (product_id, catalogo_id, status, comuns),
                )
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        links = conn.execute(
            "SELECT COUNT(*) FROM produto_catalogo_vinculo WHERE produto_id = ?", (product_id,)
        ).fetchone()[0]
        return {"status": "ligado", "vinculos": links}
    finally:
        conn.close()


def import_catalog_file(db_connection, source_path: str, original_name: Optional[str] = None) -> Dict[str, Any]:
    """
    "Atualizar catálogo": importa o arquivo da Master Power (CatalogoMasterPower_Aberto.db) nesta
    maquina, recopia as fichas proprias e religa os produtos. Marca o catalogo como importado
    aqui, para o pacote embutido de uma versao do app nao voltar o catalogo para tras.
    """
    from app.services.catalog_import_service import CatalogImportService
    from core.catalog.own_fichas import materialize
    from core.exceptions import ValidationException

    try:
        probe = sqlite3.connect(f"file:{source_path}?mode=ro", uri=True)
        try:
            tables = {r[0].upper() for r in probe.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
        finally:
            probe.close()
    except sqlite3.DatabaseError as exc:
        raise ValidationException(f"O arquivo não é um banco do catálogo Master Power ({exc}).")
    if "PRODUTO" not in tables:
        raise ValidationException(
            "O arquivo não parece ser o catálogo da Master Power (falta a tabela PRODUTO). "
            "Escolha o CatalogoMasterPower_Aberto.db."
        )

    stats = CatalogImportService(db_connection).import_master_power_catalog(source_path)
    conn = db_connection.get_connection()
    try:
        _ensure_system_info(conn)
        row = conn.execute(
            "SELECT versao, data_emissao FROM catalogo_fontes WHERE codigo = 'MASTER_POWER'"
        ).fetchone()
        version = str(row[0]) if row and row[0] is not None else ""
        if original_name:
            conn.execute(
                "UPDATE catalogo_fontes SET arquivo_origem = ? WHERE codigo = 'MASTER_POWER'", (original_name,)
            )
        _set_system(conn, KEY_BUNDLE_HASH, f"{LOCAL_IMPORT_PREFIX}{version}")
        conn.commit()
        materialize(conn)
    finally:
        conn.close()
    links = relink_catalog(db_connection, force=True)
    return {
        "versao": version or None,
        "data_emissao": row[1] if row else None,
        "importacao": stats,
        "produtos_vinculados": links.get("produtos_vinculados"),
    }


def catalog_status(db_connection) -> Dict[str, Any]:
    """Versao do catalogo Master Power desta maquina e de onde veio (pacote do app ou importado)."""
    conn = db_connection.get_connection()
    try:
        ensure_catalog_schema(conn)
        _ensure_system_info(conn)
        conn.commit()
        source = conn.execute(
            "SELECT versao, data_emissao, importado_em FROM catalogo_fontes WHERE codigo = 'MASTER_POWER'"
        ).fetchone()
        counts = dict(
            conn.execute(
                """
                SELECT f.codigo, COUNT(cp.id) FROM catalogo_fontes f
                LEFT JOIN catalogo_produtos cp ON cp.fonte_id = f.id GROUP BY f.codigo
                """
            ).fetchall()
        )
        installed = _get_system(conn, KEY_BUNDLE_HASH) or ""
        linked = conn.execute("SELECT COUNT(DISTINCT produto_id) FROM produto_catalogo_vinculo").fetchone()[0]
    finally:
        conn.close()
    return {
        "versao": source[0] if source else None,
        "data_emissao": source[1] if source else None,
        "importado_em": source[2] if source else None,
        "origem": "importado" if installed.startswith(LOCAL_IMPORT_PREFIX) else ("pacote" if installed else "local"),
        "fichas_master_power": int(counts.get("MASTER_POWER") or 0),
        "fichas_proprias": int(counts.get("PROPRIA") or 0),
        "produtos_vinculados": int(linked or 0),
    }


def run_catalog_startup(db_connection) -> None:
    """Chamado na abertura do backend. Nunca levanta excecao."""
    try:
        result = apply_catalog_bundle(db_connection)
        logger.info("catalog bundle: %s", result)
    except Exception:
        logger.exception("catalog bundle: falha ao aplicar o pacote do catalogo")
    try:
        from core.catalog.own_fichas import materialize

        conn = db_connection.get_connection()
        try:
            ensure_catalog_schema(conn)
            _ensure_system_info(conn)
            conn.commit()
            if materialize(conn):
                logger.info("catalog: fichas proprias copiadas para o catalogo")
        finally:
            conn.close()
    except Exception:
        logger.exception("catalog: falha ao copiar as fichas proprias")
    try:
        result = relink_catalog(db_connection)
        logger.info("catalog links: %s", result)
    except Exception:
        logger.exception("catalog links: falha ao religar produtos ao catalogo")
