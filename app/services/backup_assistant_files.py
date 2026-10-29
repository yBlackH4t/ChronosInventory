"""
Bancos do assistente que vao junto com cada backup do estoque.

O estoque.db guarda o estoque e as regras ensinadas, mas a lista "Para revisar", as propostas dos
colegas, as Perguntas do dia, as conversas e os atendimentos do WhatsApp ficam em bancos proprios
desta maquina. Cada backup `backup_X.db` leva uma copia deles ao lado, com o mesmo nome e um
sufixo (`backup_X.db.ia-historico`), que nao termina em .db e por isso nao aparece na lista.
"""

from __future__ import annotations

import os
import sqlite3
from typing import Dict, List

from core.utils.file_utils import FileUtils

# sufixo do arquivo no backup -> nome do banco na pasta do app
ASSISTANT_DATABASES: Dict[str, str] = {
    ".ia-historico": "assistente_historico.db",
    ".ia-atendimentos": "assistente_atendimentos.db",
}


def _live_path(db_name: str) -> str:
    return os.path.join(FileUtils.get_app_directory(), db_name)


def _copy_sqlite(source: str, destination: str) -> None:
    src = sqlite3.connect(source, timeout=10)
    dst = sqlite3.connect(destination, timeout=10)
    try:
        with dst:
            src.backup(dst)
        try:
            dst.execute("PRAGMA wal_checkpoint(TRUNCATE);")
        except sqlite3.Error:
            pass
    finally:
        dst.close()
        src.close()


def companion_paths(backup_path: str) -> List[str]:
    return [backup_path + suffix for suffix in ASSISTANT_DATABASES]


def save_with_backup(backup_path: str) -> int:
    """Copia os bancos do assistente desta maquina para junto do backup. Devolve quantos copiou."""
    copied = 0
    for suffix, db_name in ASSISTANT_DATABASES.items():
        source = _live_path(db_name)
        if not os.path.isfile(source):
            continue
        destination = backup_path + suffix
        if os.path.exists(destination):
            os.remove(destination)
        _copy_sqlite(source, destination)
        copied += 1
    return copied


def restore_from_backup(backup_path: str) -> int:
    """Volta os bancos do assistente que estao guardados junto do backup. Devolve quantos voltou."""
    restored = 0
    for suffix, db_name in ASSISTANT_DATABASES.items():
        source = backup_path + suffix
        if not os.path.isfile(source):
            continue
        _copy_sqlite(source, _live_path(db_name))
        restored += 1
    return restored


def delete_with_backup(backup_path: str) -> None:
    for path in companion_paths(backup_path):
        try:
            os.remove(path)
        except OSError:
            pass
