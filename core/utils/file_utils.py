"""
File helpers used across the project.
"""

import os
import shutil
import sys
from typing import Optional

from core.constants import APP_NAME, BACKUPS_FOLDER, DB_NAME, IMAGES_FOLDER
from core.exceptions import FileOperationException


class FileUtils:
    """Utility class for file and directory operations."""

    _legacy_migration_done = False

    @staticmethod
    def get_app_directory() -> str:
        """
        Returns the application data directory.
        Production: %APPDATA%/Chronos Inventory
        Development: project root
        """
        if getattr(sys, "frozen", False):
            appdata_root = os.getenv("APPDATA") or os.path.expanduser("~")
            app_dir = os.path.join(appdata_root, APP_NAME)
            FileUtils.migrate_legacy_data_to(app_dir)
        else:
            app_dir = os.path.abspath(
                os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
            )

        os.makedirs(app_dir, exist_ok=True)
        return app_dir

    @staticmethod
    def _iter_legacy_app_dirs(target_dir: str) -> list[str]:
        legacy_names = ("EstoqueRS", "Estoque Local")
        legacy_dirs: list[str] = []

        for env_name in ("APPDATA", "LOCALAPPDATA"):
            env_root = os.getenv(env_name)
            if not env_root:
                continue
            for name in legacy_names:
                candidate = os.path.join(env_root, name)
                if os.path.abspath(candidate) == os.path.abspath(target_dir):
                    continue
                if os.path.isdir(candidate):
                    legacy_dirs.append(candidate)

        # Remove duplicates while preserving order.
        return list(dict.fromkeys(legacy_dirs))

    @staticmethod
    def _copy_tree_if_missing(source_dir: str, destination_dir: str) -> int:
        copied_files = 0
        for root, _, files in os.walk(source_dir):
            rel_path = os.path.relpath(root, source_dir)
            dst_root = (
                destination_dir
                if rel_path == "."
                else os.path.join(destination_dir, rel_path)
            )
            os.makedirs(dst_root, exist_ok=True)
            for filename in files:
                src_file = os.path.join(root, filename)
                dst_file = os.path.join(dst_root, filename)
                if not os.path.exists(dst_file):
                    shutil.copy2(src_file, dst_file)
                    copied_files += 1
        return copied_files

    @staticmethod
    def migrate_legacy_data_to(target_app_dir: str) -> dict:
        """
        Migrate data from legacy folders to target folder without overriding
        files that already exist in the target.
        """
        result = {
            "target_dir": target_app_dir,
            "sources": [],
            "copied_files": 0,
        }

        if FileUtils._legacy_migration_done:
            return result

        os.makedirs(target_app_dir, exist_ok=True)
        legacy_dirs = FileUtils._iter_legacy_app_dirs(target_app_dir)
        if not legacy_dirs:
            FileUtils._legacy_migration_done = True
            return result

        for source_dir in legacy_dirs:
            source_record = {"path": source_dir, "copied": 0}

            source_db = os.path.join(source_dir, DB_NAME)
            target_db = os.path.join(target_app_dir, DB_NAME)
            if os.path.isfile(source_db) and not os.path.exists(target_db):
                shutil.copy2(source_db, target_db)
                result["copied_files"] += 1
                source_record["copied"] += 1

            for folder_name in (IMAGES_FOLDER, BACKUPS_FOLDER, "exports"):
                source_folder = os.path.join(source_dir, folder_name)
                if not os.path.isdir(source_folder):
                    continue
                target_folder = os.path.join(target_app_dir, folder_name)
                copied = FileUtils._copy_tree_if_missing(source_folder, target_folder)
                result["copied_files"] += copied
                source_record["copied"] += copied

            result["sources"].append(source_record)

        FileUtils._legacy_migration_done = True
        return result

    @staticmethod
    def get_images_directory() -> str:
        app_dir = FileUtils.get_app_directory()
        images_dir = os.path.join(app_dir, IMAGES_FOLDER)
        os.makedirs(images_dir, exist_ok=True)
        return images_dir

    @staticmethod
    def get_backups_directory() -> str:
        app_dir = FileUtils.get_app_directory()
        backups_dir = os.path.join(app_dir, BACKUPS_FOLDER)
        os.makedirs(backups_dir, exist_ok=True)
        return backups_dir

    @staticmethod
    def get_database_path() -> str:
        return os.path.join(FileUtils.get_app_directory(), DB_NAME)

    @staticmethod
    def file_exists(filepath: str) -> bool:
        return os.path.exists(filepath) and os.path.isfile(filepath)

    @staticmethod
    def directory_exists(dirpath: str) -> bool:
        return os.path.exists(dirpath) and os.path.isdir(dirpath)

    @staticmethod
    def create_directory(dirpath: str) -> None:
        try:
            os.makedirs(dirpath, exist_ok=True)
        except Exception as exc:
            raise FileOperationException(
                f"Erro ao criar diretorio {dirpath}: {exc}"
            ) from exc

    @staticmethod
    def copy_file(source: str, destination: str) -> None:
        try:
            dest_dir = os.path.dirname(destination)
            if dest_dir:
                FileUtils.create_directory(dest_dir)
            shutil.copy2(source, destination)
        except Exception as exc:
            raise FileOperationException(f"Erro ao copiar arquivo: {exc}") from exc

    @staticmethod
    def move_file(source: str, destination: str) -> None:
        try:
            dest_dir = os.path.dirname(destination)
            if dest_dir:
                FileUtils.create_directory(dest_dir)
            shutil.move(source, destination)
        except Exception as exc:
            raise FileOperationException(f"Erro ao mover arquivo: {exc}") from exc

    @staticmethod
    def delete_file(filepath: str) -> None:
        try:
            if FileUtils.file_exists(filepath):
                os.remove(filepath)
        except Exception as exc:
            raise FileOperationException(f"Erro ao remover arquivo: {exc}") from exc

    @staticmethod
    def rename_file(old_path: str, new_path: str) -> None:
        try:
            os.rename(old_path, new_path)
        except Exception as exc:
            raise FileOperationException(f"Erro ao renomear arquivo: {exc}") from exc

    @staticmethod
    def get_file_extension(filepath: str) -> str:
        return os.path.splitext(filepath)[1].lower()

    @staticmethod
    def list_files_in_directory(dirpath: str, extension: Optional[str] = None) -> list:
        if not FileUtils.directory_exists(dirpath):
            return []

        files = []
        for filename in os.listdir(dirpath):
            filepath = os.path.join(dirpath, filename)
            if os.path.isfile(filepath):
                if extension is None or filepath.lower().endswith(extension.lower()):
                    files.append(filepath)

        return files

    @staticmethod
    def get_temp_directory() -> str:
        return os.environ.get("TEMP", "/tmp")

