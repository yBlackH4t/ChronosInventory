import sqlite3
from pathlib import Path

from core.database.connection import DatabaseConnection
from core.utils.file_utils import FileUtils


def _create_legacy_db(db_path: Path) -> None:
    conn = sqlite3.connect(db_path)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS produtos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            qtd_canoas INTEGER DEFAULT 0,
            qtd_pf INTEGER DEFAULT 0,
            imagem BLOB,
            observacao TEXT
        );
        """
    )
    conn.execute(
        "INSERT INTO produtos (nome, qtd_canoas, qtd_pf, observacao) VALUES (?, ?, ?, ?)",
        ("ITEM LEGADO", 3, 2, "origem-legado"),
    )
    conn.commit()
    conn.close()


def test_migrate_legacy_appdata_folder_content(tmp_path, monkeypatch):
    roaming = tmp_path / "Roaming"
    local = tmp_path / "Local"
    legacy = roaming / "EstoqueRS"
    target = roaming / "Chronos Inventory"

    (legacy / "imagens").mkdir(parents=True, exist_ok=True)
    (legacy / "backups").mkdir(parents=True, exist_ok=True)
    (legacy / "exports").mkdir(parents=True, exist_ok=True)
    (legacy / "imagens" / "a.txt").write_text("img", encoding="utf-8")
    (legacy / "backups" / "b.txt").write_text("bak", encoding="utf-8")
    (legacy / "exports" / "c.txt").write_text("exp", encoding="utf-8")

    monkeypatch.setenv("APPDATA", str(roaming))
    monkeypatch.setenv("LOCALAPPDATA", str(local))
    FileUtils._legacy_migration_done = False

    result = FileUtils.migrate_legacy_data_to(str(target))

    assert result["copied_files"] == 3
    assert (target / "imagens" / "a.txt").exists()
    assert (target / "backups" / "b.txt").exists()
    assert (target / "exports" / "c.txt").exists()


def test_database_connection_migrates_legacy_db_from_estoquers(tmp_path, monkeypatch):
    roaming = tmp_path / "Roaming"
    local = tmp_path / "Local"
    legacy = roaming / "EstoqueRS"
    target = roaming / "Chronos Inventory"
    legacy.mkdir(parents=True, exist_ok=True)
    target.mkdir(parents=True, exist_ok=True)

    legacy_db = legacy / "estoque.db"
    _create_legacy_db(legacy_db)

    monkeypatch.setenv("APPDATA", str(roaming))
    monkeypatch.setenv("LOCALAPPDATA", str(local))
    monkeypatch.setattr(
        FileUtils,
        "get_app_directory",
        staticmethod(lambda: str(target)),
    )

    FileUtils._legacy_migration_done = False
    DatabaseConnection._instance = None
    DatabaseConnection._initialized = False

    db = DatabaseConnection()
    target_db = Path(db.get_database_path())
    assert target_db.exists()

    conn = sqlite3.connect(target_db)
    row = conn.execute(
        "SELECT nome, qtd_canoas, qtd_pf, observacao FROM produtos WHERE nome=?",
        ("ITEM LEGADO",),
    ).fetchone()
    conn.close()

    assert row is not None
    assert row[1] == 3
    assert row[2] == 2
    assert row[3] == "origem-legado"

