from __future__ import annotations

import json
import os
import sqlite3
import sys
import tempfile
from pathlib import Path


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    source = Path(__file__).resolve().parents[1] / "_comparacao" / "estoque_copia.db"
    if not source.is_file():
        raise SystemExit("Cópia de teste ausente: _comparacao/estoque_copia.db")
    destination = Path(tempfile.mkdtemp(prefix="chronos_ia_release_"))
    database = destination / "estoque.db"
    with sqlite3.connect(source.as_uri() + "?mode=ro", uri=True) as original, sqlite3.connect(database) as copy:
        original.backup(copy)
    os.environ["CHRONOS_APP_DIR"] = str(destination)
    os.environ["APP_ENV"] = "test"

    from app.services.assistant_chat_service import AssistantChatService
    from app.services.assistant_config_store import AssistantConfigStore

    def totals() -> list:
        with sqlite3.connect(database) as connection:
            return [connection.execute(query).fetchone()[0] for query in (
                "SELECT COUNT(*) FROM produtos", "SELECT SUM(quantidade) FROM produto_estoque",
                "SELECT COUNT(*) FROM movimentacoes")]

    before = totals()
    store = AssistantConfigStore(str(destination / "test_config.json"))
    store.update(provedor="nenhum")
    service = AssistantChatService(config_store=store, interpreter=None)
    print("Cópia isolada:", destination)
    print("ANTES (produtos, saldo, movimentos):", before)
    for question in ("tem 796155-5005?", "796155 5005 ou 5006", "tem a 5644540 5644541 4031196 770472?", "tem 796155?"):
        result = service.chat(question, canal="whatsapp")
        print("\nPERGUNTA:", question)
        print(result["resposta"])
        print("PEDIDOS:", json.dumps(result.get("pedidos", []), ensure_ascii=False))
    after = totals()
    with sqlite3.connect(database) as connection:
        integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
        foreign_keys = len(connection.execute("PRAGMA foreign_key_check").fetchall())
    print("\nDEPOIS:", after, "Integridade:", integrity, "FK:", foreign_keys)
    assert before == after and integrity == "ok" and foreign_keys == 0


if __name__ == "__main__":
    main()
