"""
Autodiagnostico do pacote (estoque_backend.exe --diagnostico-assistente): aqui roda pelo codigo-fonte;
o build_backend.ps1 roda o mesmo dentro do executavel e falha se algo faltar.
"""

import json

from app.services.assistant_packaging_check import CHECKS, run_check


def test_packaging_check_reports_each_dependency(tmp_path):
    report = tmp_path / "diagnostico.json"

    assert run_check(str(report)) is True

    data = json.loads(report.read_text(encoding="utf-8"))
    assert data["ok"] is True
    assert [item["nome"] for item in data["verificacoes"]] == [name for name, _ in CHECKS]


def test_packaging_check_reports_failures(tmp_path, monkeypatch):
    def broken():
        raise ImportError("DLL nao encontrada")

    monkeypatch.setattr("app.services.assistant_packaging_check.CHECKS", [("Algo que falta", broken)])
    report = tmp_path / "diagnostico.json"

    assert run_check(str(report)) is False

    (item,) = json.loads(report.read_text(encoding="utf-8"))["verificacoes"]
    assert item == {"nome": "Algo que falta", "ok": False, "erro": "ImportError: DLL nao encontrada"}


def test_packaging_check_api_passes_host_lock(client, tmp_path, monkeypatch):
    # O executavel roda sem APP_ENV=test: o Host "testserver" do TestClient seria recusado.
    monkeypatch.delenv("APP_ENV", raising=False)
    monkeypatch.setenv("CHRONOS_APP_DIR", str(tmp_path))
    monkeypatch.setattr("tempfile.gettempdir", lambda: str(tmp_path))
    report = tmp_path / "diagnostico.json"

    run_check(str(report), app=client.app)

    item = json.loads(report.read_text(encoding="utf-8"))["verificacoes"][-1]
    assert item == {"nome": "Backend e assistente respondendo (banco temporário)", "ok": True}
