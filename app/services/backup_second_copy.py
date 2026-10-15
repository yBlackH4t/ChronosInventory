"""
Segunda copia dos backups em outra pasta (outro disco, pendrive ou rede).

O banco e os backups ficam no mesmo disco (%APPDATA%). Se esse disco falhar, vai tudo junto;
com uma segunda pasta configurada, cada backup tambem e copiado para la.

- A configuracao e desta maquina (arquivo JSON ao lado do banco), nao vai no banco: aplicar a
  base oficial nao a apaga nem a traz de outra maquina.
- As copias ficam numa subpasta com o nome do computador, para duas maquinas poderem usar a
  mesma pasta da rede sem uma apagar os backups da outra.
- A segunda pasta espelha a pasta de backups: copia o que falta e apaga so os backups do
  Chronos (backup_*.db) que ja sairam da pasta principal pela limpeza.
"""

from __future__ import annotations

import json
import logging
import os
import re
import shutil
import socket
from datetime import datetime
from typing import Any, Dict, Optional

from core.exceptions import ValidationException
from core.utils.file_utils import FileUtils

LOG = logging.getLogger("backend.backup_second_copy")

CONFIG_FILENAME = "backup_segunda_pasta.json"
# So os backups que o proprio Chronos cria e apaga sozinho podem ser apagados la.
MANAGED_NAME = re.compile(r"^backup_[a-z_]+_\d{8}_\d{6}\.db$")


def _machine_folder_name() -> str:
    name = os.getenv("COMPUTERNAME") or socket.gethostname() or "maquina"
    safe = re.sub(r"[^A-Za-z0-9 ._-]", "_", name).strip() or "maquina"
    return f"Chronos Inventory - {safe}"


class BackupSecondCopy:
    def __init__(self, backups_dir: str, app_dir: Optional[str] = None) -> None:
        self.backups_dir = backups_dir
        self.config_path = os.path.join(app_dir or FileUtils.get_app_directory(), CONFIG_FILENAME)

    # ---------------- configuracao ----------------

    def _load(self) -> Dict[str, Any]:
        try:
            with open(self.config_path, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            return data if isinstance(data, dict) else {}
        except (OSError, ValueError):
            return {}

    def _save(self, data: Dict[str, Any]) -> None:
        tmp = self.config_path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(data, fh, ensure_ascii=False, indent=2)
        os.replace(tmp, self.config_path)

    def folder(self) -> str:
        return str(self._load().get("pasta") or "").strip()

    def destination(self) -> Optional[str]:
        folder = self.folder()
        return os.path.join(folder, _machine_folder_name()) if folder else None

    def status(self) -> Dict[str, Any]:
        data = self._load()
        destination = self.destination()
        files = 0
        if destination and os.path.isdir(destination):
            files = sum(1 for name in os.listdir(destination) if name.lower().endswith(".db"))
        return {
            "pasta": self.folder() or None,
            "destino": destination,
            "ativo": bool(destination),
            "ultima_copia": data.get("ultima_copia"),
            "ultimo_erro": data.get("ultimo_erro"),
            "arquivos": files,
        }

    def configure(self, folder: Optional[str]) -> Dict[str, Any]:
        folder = (folder or "").strip().strip('"')
        data = self._load()
        if not folder:
            data.update({"pasta": "", "ultimo_erro": None})
            self._save(data)
            return self.status()

        folder = os.path.abspath(folder)
        if not os.path.isdir(folder):
            raise ValidationException("Pasta nao encontrada. Confira se o disco ou pendrive esta conectado.")
        destination = os.path.join(folder, _machine_folder_name())
        backups_real = os.path.normcase(os.path.realpath(self.backups_dir))
        for candidate in (folder, destination):
            real = os.path.normcase(os.path.realpath(candidate))
            if real == backups_real or real.startswith(backups_real + os.sep):
                raise ValidationException("Escolha uma pasta fora da pasta de backups do Chronos.")
        try:
            os.makedirs(destination, exist_ok=True)
            probe = os.path.join(destination, ".teste_gravacao")
            with open(probe, "w", encoding="utf-8") as fh:
                fh.write("ok")
            os.remove(probe)
        except OSError as exc:
            raise ValidationException(f"Nao consegui gravar nessa pasta: {exc.strerror or exc}.") from exc

        data.update({"pasta": folder, "ultimo_erro": None})
        self._save(data)
        self.sync()
        return self.status()

    # ---------------- copia ----------------

    def sync(self) -> Dict[str, Any]:
        """Copia os backups que faltam na segunda pasta e tira de la os que a limpeza apagou."""
        destination = self.destination()
        result = {"copiados": 0, "removidos": 0, "erro": None}
        if not destination:
            return result
        data = self._load()
        try:
            if not os.path.isdir(self.folder()):
                raise OSError("pasta nao encontrada (disco, pendrive ou rede desconectado?)")
            os.makedirs(destination, exist_ok=True)
            primary = {
                name for name in os.listdir(self.backups_dir)
                if name.lower().endswith(".db") and os.path.isfile(os.path.join(self.backups_dir, name))
            }
            existing = set(os.listdir(destination))
            for name in sorted(primary - existing):
                src = os.path.join(self.backups_dir, name)
                tmp = os.path.join(destination, name + ".parcial")
                shutil.copy2(src, tmp)
                os.replace(tmp, os.path.join(destination, name))
                result["copiados"] += 1
            for name in sorted(existing - primary):
                if MANAGED_NAME.match(name):
                    try:
                        os.remove(os.path.join(destination, name))
                        result["removidos"] += 1
                    except OSError:
                        pass
            data["ultima_copia"] = datetime.now().isoformat(timespec="seconds")
            data["ultimo_erro"] = None
        except OSError as exc:
            message = exc.strerror or str(exc)
            result["erro"] = message
            data["ultimo_erro"] = f"{datetime.now():%d/%m/%Y %H:%M}: {message}"
            LOG.warning("segunda copia dos backups falhou: %s", message)
        try:
            self._save(data)
        except OSError:
            pass
        return result
