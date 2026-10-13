"""
Recuperacao de fotos de produto a partir de outro banco (backup ou banco anterior).

As fotos ficam no proprio banco (tabela product_images). Quando o banco inteiro e
trocado (base oficial, restauracao), as fotos que so existiam nesta maquina somem.
Aqui as fotos de um banco de origem sao copiadas para o banco ativo, somente para
produtos que estao sem nenhuma foto no destino; nada que ja existe e alterado.
"""

from __future__ import annotations

import sqlite3
from typing import Dict, Optional


def _normalize_name(value: Optional[str]) -> str:
    return " ".join(str(value or "").upper().split())


def _table_exists(conn: sqlite3.Connection, schema: str, table: str) -> bool:
    row = conn.execute(
        f"SELECT 1 FROM {schema}.sqlite_master WHERE type = 'table' AND name = ?",
        (table,),
    ).fetchone()
    return row is not None


def copy_missing_product_photos(source_db: str, target_db: str) -> Dict[str, int]:
    """
    Copia as fotos de `source_db` para `target_db` nos produtos sem foto no destino.

    O produto e reconhecido pelo mesmo id com o mesmo nome; se o id mudou, por um
    nome que aparece uma unica vez no destino. Produtos nao encontrados sao ignorados.
    """
    result = {
        "produtos_com_foto_na_origem": 0,
        "produtos_recuperados": 0,
        "fotos_copiadas": 0,
        "produtos_ja_com_foto": 0,
        "produtos_nao_encontrados": 0,
    }

    conn = sqlite3.connect(target_db)
    try:
        conn.execute("ATTACH DATABASE ? AS origem", (source_db,))
        try:
            if not _table_exists(conn, "origem", "product_images") or not _table_exists(conn, "origem", "produtos"):
                return result

            source_products = conn.execute(
                """
                SELECT p.id, p.nome
                FROM origem.produtos p
                WHERE EXISTS (SELECT 1 FROM origem.product_images i WHERE i.product_id = p.id)
                """
            ).fetchall()
            result["produtos_com_foto_na_origem"] = len(source_products)
            if not source_products:
                return result

            target_by_id: Dict[int, str] = {}
            ids_by_name: Dict[str, list] = {}
            for product_id, nome in conn.execute("SELECT id, nome FROM main.produtos"):
                normalized = _normalize_name(nome)
                target_by_id[int(product_id)] = normalized
                ids_by_name.setdefault(normalized, []).append(int(product_id))
            with_photo = {
                int(row[0]) for row in conn.execute("SELECT DISTINCT product_id FROM main.product_images")
            }

            conn.execute("BEGIN IMMEDIATE")
            try:
                for source_id, source_name in source_products:
                    normalized = _normalize_name(source_name)
                    target_id: Optional[int] = None
                    if target_by_id.get(int(source_id)) == normalized:
                        target_id = int(source_id)
                    elif len(ids_by_name.get(normalized, [])) == 1:
                        target_id = ids_by_name[normalized][0]

                    if target_id is None:
                        result["produtos_nao_encontrados"] += 1
                        continue
                    if target_id in with_photo:
                        result["produtos_ja_com_foto"] += 1
                        continue

                    copied = conn.execute(
                        """
                        INSERT INTO main.product_images (product_id, image_data, mime_type, is_primary, created_at)
                        SELECT ?, image_data, COALESCE(mime_type, 'image/jpeg'), COALESCE(is_primary, 0),
                               COALESCE(created_at, CURRENT_TIMESTAMP)
                        FROM origem.product_images
                        WHERE product_id = ?
                        ORDER BY id
                        """,
                        (target_id, int(source_id)),
                    ).rowcount
                    with_photo.add(target_id)
                    result["produtos_recuperados"] += 1
                    result["fotos_copiadas"] += max(int(copied or 0), 0)
                conn.commit()
            except Exception:
                conn.rollback()
                raise
        finally:
            conn.execute("DETACH DATABASE origem")
    finally:
        conn.close()
    return result
