"""
Gera o pacote do catalogo que vai dentro do instalador.

O catalogo (fichas, referencias cruzadas, aplicacoes, relacionados) e dado de
referencia: o mesmo para todas as maquinas. Este script copia somente as tabelas
`catalogo_*` de um banco do Chronos para `core/catalog/data/catalogo_bundle.db.gz`.
Nenhum produto, estoque ou movimentacao entra no pacote.

Na primeira abertura da nova versao, cada maquina carrega esse catalogo e liga
os proprios produtos as fichas pelos codigos (ver core/catalog/bundle.py).

Uso (rode sempre que o catalogo for atualizado, antes de gerar a release):
    python scripts/export_catalog_bundle.py --source estoque.db
"""

from __future__ import annotations

import argparse
import gzip
import os
import shutil
import sqlite3
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from core.catalog.bundle import (  # noqa: E402
    BUNDLE_TABLES,
    DEFAULT_BUNDLE_PATH,
    compute_catalog_hash,
)
from core.database.migration_v2_3_0_catalog import ensure_catalog_schema  # noqa: E402


def export_bundle(source_db: str, output_path: str) -> dict:
    if not os.path.isfile(source_db):
        raise SystemExit(f"Banco de origem nao encontrado: {source_db}")

    with tempfile.TemporaryDirectory() as tmp:
        bundle_db = os.path.join(tmp, "catalogo_bundle.db")
        out = sqlite3.connect(bundle_db)
        try:
            ensure_catalog_schema(out)
            # Only SELECTs run against the source database.
            out.execute("ATTACH DATABASE ? AS src", (os.path.abspath(source_db),))
            for table in BUNDLE_TABLES:
                columns = [r[1] for r in out.execute(f"PRAGMA main.table_info({table})")]
                col_sql = ", ".join(columns)
                out.execute(f"INSERT INTO main.{table} ({col_sql}) SELECT {col_sql} FROM src.{table}")
            out.commit()
            out.execute("DETACH DATABASE src")

            counts = {t: out.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in BUNDLE_TABLES}
            if counts["catalogo_produtos"] == 0:
                raise SystemExit("O banco de origem nao tem catalogo (catalogo_produtos vazio).")

            content_hash = compute_catalog_hash(out)
            fonte = out.execute(
                "SELECT codigo, versao, data_emissao FROM catalogo_fontes ORDER BY id LIMIT 1"
            ).fetchone()
            out.execute("CREATE TABLE bundle_meta (key TEXT PRIMARY KEY, value TEXT)")
            meta = {
                "content_hash": content_hash,
                "fonte": fonte[0] if fonte else "",
                "fonte_versao": str(fonte[1] or "") if fonte else "",
                "fonte_data_emissao": str(fonte[2] or "") if fonte else "",
                **{f"count_{t}": str(n) for t, n in counts.items()},
            }
            out.executemany("INSERT INTO bundle_meta (key, value) VALUES (?, ?)", meta.items())
            out.commit()
            out.execute("VACUUM")
        finally:
            out.close()

        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        with open(bundle_db, "rb") as src, gzip.open(output_path, "wb", compresslevel=9) as dst:
            shutil.copyfileobj(src, dst)

    meta["arquivo"] = output_path
    meta["tamanho_kb"] = str(os.path.getsize(output_path) // 1024)
    return meta


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", default=str(REPO_ROOT / "estoque.db"), help="Banco do Chronos com o catalogo")
    parser.add_argument("--out", default=str(DEFAULT_BUNDLE_PATH), help="Arquivo .db.gz de saida")
    args = parser.parse_args()
    meta = export_bundle(args.source, args.out)
    for key, value in meta.items():
        print(f"{key}: {value}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
