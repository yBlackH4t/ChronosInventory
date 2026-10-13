"""Catalog shipped with the installer: applied to other machines without touching stock."""

import gzip
import sqlite3
import sys
from pathlib import Path


from core.catalog.bundle import (
    DEFAULT_BUNDLE_PATH,
    apply_catalog_bundle,
    relink_catalog,
)
from core.database.connection import DatabaseConnection
from core.database.migration_v2_3_0_catalog import ensure_catalog_schema

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from export_catalog_bundle import export_bundle  # noqa: E402


def _make_source_catalog(path: Path, descricao: str = "Turbocompressor", extra_ref: str | None = None) -> None:
    conn = sqlite3.connect(path)
    ensure_catalog_schema(conn)
    conn.execute(
        "INSERT INTO catalogo_fontes (id, codigo, nome, versao) VALUES (1, 'MASTER_POWER', 'Catalogo Master Power', '20')"
    )
    conn.execute(
        """
        INSERT INTO catalogo_produtos (id, fonte_id, codigo, codigo_norm, descricao, grupo)
        VALUES (10, 1, '805463', '805463', ?, 'TURBOCOMPRESSOR')
        """,
        (descricao,),
    )
    refs = [("BORGWARNER", "53299887201"), ("MASTER POWER", "805463")]
    if extra_ref:
        refs.append(("HOLSET", extra_ref))
    conn.executemany(
        "INSERT INTO catalogo_referencias (catalogo_produto_id, fabricante, numero, numero_norm) VALUES (10, ?, ?, ?)",
        [(fab, num, num) for fab, num in refs],
    )
    conn.execute(
        "INSERT INTO catalogo_aplicacoes (catalogo_produto_id, montadora, veiculo, motor) VALUES (10, 'SCANIA', 'R 440', 'DC13')"
    )
    conn.commit()
    conn.close()


def _bundle(tmp_path: Path, name: str, **kwargs) -> str:
    source = tmp_path / f"{name}_source.db"
    _make_source_catalog(source, **kwargs)
    out = tmp_path / f"{name}.db.gz"
    export_bundle(str(source), str(out))
    return str(out)


def _create_product(client, nome: str, stock: int) -> int:
    response = client.post("/produtos", json={"nome": nome, "inventories": {"11": stock}})
    assert response.status_code == 201, response.text
    return response.json()["data"]["id"]


def _db_counts():
    conn = DatabaseConnection().get_connection()
    try:
        return {
            "produtos": conn.execute("SELECT COUNT(*) FROM produtos").fetchone()[0],
            "estoque": conn.execute("SELECT COALESCE(SUM(quantidade), 0) FROM produto_estoque").fetchone()[0],
            "movimentacoes": conn.execute("SELECT COUNT(*) FROM movimentacoes").fetchone()[0],
            "fichas": conn.execute("SELECT COUNT(*) FROM catalogo_produtos").fetchone()[0],
        }
    finally:
        conn.close()


def test_bundle_brings_catalog_and_links_products_without_touching_stock(client, tmp_path):
    product_id = _create_product(client, "TURBO BORG K29 53299887201", stock=3)
    _create_product(client, "TURBO SEM CODIGO NO CATALOGO 999999999", stock=2)
    before = _db_counts()
    assert before["fichas"] == 0

    db = DatabaseConnection()
    bundle = _bundle(tmp_path, "v1")
    result = apply_catalog_bundle(db, bundle)
    assert result["status"] == "aplicado"
    links = relink_catalog(db)
    assert links["status"] == "religado"

    after = _db_counts()
    assert after["fichas"] == 1
    assert {k: after[k] for k in ("produtos", "estoque", "movimentacoes")} == {
        k: before[k] for k in ("produtos", "estoque", "movimentacoes")
    }

    catalog = client.get(f"/produtos/{product_id}/catalogo").json()["data"]
    assert [v["codigo"] for v in catalog["vinculos"]] == ["805463"]
    assert catalog["vinculos"][0]["aplicacoes"][0]["veiculo"] == "R 440"

    # Second start with the same installer: nothing to do.
    assert apply_catalog_bundle(db, bundle)["status"] == "atualizado"
    assert relink_catalog(db)["status"] == "atualizado"


def test_new_bundle_version_replaces_catalog_and_keeps_manual_link_status(client, tmp_path):
    product_id = _create_product(client, "TURBO BORG K29 53299887201", stock=1)
    db = DatabaseConnection()
    apply_catalog_bundle(db, _bundle(tmp_path, "v1"))
    relink_catalog(db)

    conn = db.get_connection()
    conn.execute("UPDATE produto_catalogo_vinculo SET status = 'REJEITADO' WHERE produto_id = ?", (product_id,))
    conn.commit()
    conn.close()

    result = apply_catalog_bundle(db, _bundle(tmp_path, "v2", descricao="Turbocompressor revisado"))
    assert result["status"] == "aplicado"
    assert result["vinculos_manuais_preservados"] == 1
    relink_catalog(db)

    conn = db.get_connection()
    status = conn.execute(
        "SELECT status FROM produto_catalogo_vinculo WHERE produto_id = ?", (product_id,)
    ).fetchone()[0]
    descricao = conn.execute("SELECT descricao FROM catalogo_produtos").fetchone()[0]
    conn.close()
    assert status == "REJEITADO"
    assert descricao == "Turbocompressor revisado"


def test_locally_imported_catalog_is_never_overwritten(client, tmp_path):
    db = DatabaseConnection()
    conn = db.get_connection()
    conn.execute("INSERT INTO catalogo_fontes (id, codigo, nome) VALUES (1, 'MASTER_POWER', 'Local')")
    conn.execute(
        "INSERT INTO catalogo_produtos (id, fonte_id, codigo, codigo_norm, descricao) VALUES (1, 1, 'LOCAL1', 'LOCAL1', 'Ficha local')"
    )
    conn.commit()
    conn.close()

    result = apply_catalog_bundle(db, _bundle(tmp_path, "v1"))
    assert result["status"] == "catalogo_local_mantido"

    conn = db.get_connection()
    codigos = [r[0] for r in conn.execute("SELECT codigo FROM catalogo_produtos")]
    conn.close()
    assert codigos == ["LOCAL1"]


def test_products_created_later_are_linked_on_next_start(client, tmp_path):
    db = DatabaseConnection()
    apply_catalog_bundle(db, _bundle(tmp_path, "v1", extra_ref="4031195"))
    relink_catalog(db)

    product_id = _create_product(client, "TURBO HOLSET HX55 4031195", stock=1)
    assert relink_catalog(db)["status"] == "religado"

    catalog = client.get(f"/produtos/{product_id}/catalogo").json()["data"]
    assert [v["codigo"] for v in catalog["vinculos"]] == ["805463"]


def test_shipped_bundle_is_present_and_valid(tmp_path):
    """The installer must carry the catalog; a release without it leaves colleagues empty."""
    assert DEFAULT_BUNDLE_PATH.is_file(), "Rode scripts/export_catalog_bundle.py antes da release"
    tmp = tmp_path / "bundle.db"
    tmp.write_bytes(gzip.decompress(DEFAULT_BUNDLE_PATH.read_bytes()))
    conn = sqlite3.connect(tmp)
    meta = dict(conn.execute("SELECT key, value FROM bundle_meta").fetchall())
    fichas = conn.execute("SELECT COUNT(*) FROM catalogo_produtos").fetchone()[0]
    conn.close()
    assert meta["content_hash"]
    assert fichas == int(meta["count_catalogo_produtos"]) > 0
