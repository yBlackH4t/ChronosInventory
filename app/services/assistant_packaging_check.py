"""
Autodiagnostico do pacote do backend (PyInstaller) para o assistente.

O executavel do app instalado e gerado sem console, entao um modulo ou DLL que o PyInstaller
esquecer so aparece quando alguem tenta usar o WhatsApp na empresa. Este diagnostico importa e
inicia (sem conectar) o que o assistente usa e grava o resultado num arquivo JSON:

    estoque_backend.exe --diagnostico-assistente C:\\caminho\\diagnostico.json

O build (build_backend.ps1) roda isso depois de gerar o executavel e falha se algo faltar.
"""

from __future__ import annotations

import json
import os
import tempfile
from typing import Any, Callable, Dict, List, Tuple


def _neonize() -> None:
    from app.services.whatsapp_neonize_transport import NeonizeTransport

    with tempfile.TemporaryDirectory(prefix="chronos_diag_") as folder:
        # Cria o cliente (carrega a DLL da neonize), sem conectar ao WhatsApp.
        NeonizeTransport(os.path.join(folder, "sessao.db"), on_message=lambda message: None)


def _libmagic() -> None:
    import magic

    if magic.from_buffer(b"%PDF-1.4 teste", mime=True) != "application/pdf":
        raise RuntimeError("libmagic respondeu errado")


def _pillow() -> None:
    import io

    from PIL import Image

    out = io.BytesIO()
    Image.new("RGB", (4, 4)).save(out, "JPEG")


def _assistant_modules() -> None:
    import app.services.assistant_chat_service  # noqa: F401
    import app.services.assistant_daily_summary_service  # noqa: F401
    import app.services.assistant_knowledge_sync_service  # noqa: F401
    import app.services.assistant_transcription_service  # noqa: F401
    import app.services.assistant_vision_service  # noqa: F401
    import app.services.whatsapp_bridge_service  # noqa: F401
    import app.services.whatsapp_service  # noqa: F401


def _claude() -> None:
    import anthropic  # noqa: F401


def _catalog_bundle() -> None:
    from core.catalog.bundle import bundled_catalog_path

    if not bundled_catalog_path():
        raise FileNotFoundError("catalogo_bundle.db.gz nao veio no pacote")


CHECKS: List[Tuple[str, Callable[[], None]]] = [
    ("Assistente (serviços)", _assistant_modules),
    ("WhatsApp (neonize e a DLL dela)", _neonize),
    ("libmagic (usada pela neonize)", _libmagic),
    ("Fotos (Pillow)", _pillow),
    ("Claude (anthropic)", _claude),
    ("Catálogo embutido", _catalog_bundle),
]


def _api(app: Any) -> None:
    """
    O backend inteiro, sem abrir porta: banco novo, catalogo embutido e uma pergunta ao assistente.
    So roda com o banco numa pasta temporaria (o main.py define antes de abrir qualquer banco).
    """
    from fastapi.testclient import TestClient

    from core.database.connection import DatabaseConnection

    folder = os.environ.get("CHRONOS_APP_DIR", "")
    database = DatabaseConnection().get_database_path()
    if not folder or not os.path.abspath(database).startswith(os.path.abspath(tempfile.gettempdir())):
        raise RuntimeError(f"recusado: o banco nao esta numa pasta temporaria ({database})")
    # Como o proprio computador (127.0.0.1): a API so aceita pedidos locais.
    with TestClient(app, client=("127.0.0.1", 50000)) as client:
        if client.get("/health").status_code != 200:
            raise RuntimeError("/health nao respondeu")
        answer = client.post("/assistente/chat", json={"mensagem": "temos turbina do scania 440?"})
        if answer.status_code != 200 or not answer.json()["data"]["resposta"]:
            raise RuntimeError(f"/assistente/chat respondeu {answer.status_code}")


def run_check(report_path: str, app: Any = None) -> bool:
    checks = list(CHECKS)
    if app is not None:
        checks.append(("Backend e assistente respondendo (banco temporário)", lambda: _api(app)))
    results: List[Dict[str, Any]] = []
    for name, check in checks:
        try:
            check()
            results.append({"nome": name, "ok": True})
        except BaseException as exc:  # noqa: BLE001 - o diagnostico relata tudo, inclusive DLL faltando
            results.append({"nome": name, "ok": False, "erro": f"{type(exc).__name__}: {exc}"})
    ok = all(item["ok"] for item in results)
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump({"ok": ok, "verificacoes": results}, f, ensure_ascii=False, indent=2)
    return ok
