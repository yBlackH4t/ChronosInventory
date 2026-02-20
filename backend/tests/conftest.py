import importlib
import os

import pytest
from fastapi.testclient import TestClient

from core.database.connection import DatabaseConnection
from core.utils import file_utils


@pytest.fixture()
def client(tmp_path, monkeypatch):
    def _get_app_directory():
        path = tmp_path / "appdata"
        path.mkdir(parents=True, exist_ok=True)
        return str(path)

    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setattr(file_utils.FileUtils, "get_app_directory", staticmethod(_get_app_directory))
    monkeypatch.setattr(file_utils.FileUtils, "get_app_root_directory", staticmethod(_get_app_directory))
    monkeypatch.setattr(
        file_utils.FileUtils,
        "get_profiles_registry_path",
        staticmethod(lambda: os.path.join(_get_app_directory(), "stock_profiles.json")),
    )
    monkeypatch.setattr(
        file_utils.FileUtils,
        "get_profiles_directory",
        staticmethod(lambda: os.path.join(_get_app_directory(), "profiles")),
    )

    DatabaseConnection._instance = None
    DatabaseConnection._initialized = False

    from backend.app import main as main_module

    importlib.reload(main_module)
    return TestClient(main_module.app)

