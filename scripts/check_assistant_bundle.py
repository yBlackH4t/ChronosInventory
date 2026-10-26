from __future__ import annotations

import argparse
from pathlib import Path
from types import CodeType

from PyInstaller.archive.readers import CArchiveReader

MODULES = (
    "app.services.assistant_requests", "app.services.assistant_attendance_service",
    "app.services.assistant_examples_service", "app.services.assistant_chat_service",
    "app.services.assistant_direct_service", "app.services.assistant_interpreter_service",
    "app.services.assistant_tools_service", "app.services.assistant_knowledge_sync_service",
    "app.services.whatsapp_bridge_service", "app.services.whatsapp_service",
    "app.services.whatsapp_neonize_transport", "core.catalog.normalization", "core.catalog.bundle",
    "core.constants", "backend.app.api.routers.assistant", "backend.app.schemas.assistant",
)


def normalize(code: CodeType) -> CodeType:
    return code.replace(co_filename="bundle", co_consts=tuple(
        normalize(value) if isinstance(value, CodeType) else value for value in code.co_consts))


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description="Confere se o backend empacotado contém a IA do código atual.")
    parser.add_argument("--exe", type=Path, default=root / "frontend/src-tauri/bin/estoque_backend.exe")
    args = parser.parse_args()
    archive = CArchiveReader(str(args.exe))
    pyz = archive.open_embedded_archive("PYZ.pyz")
    different = []
    for module in MODULES:
        path = root.joinpath(*module.split(".")).with_suffix(".py")
        source = compile(path.read_text(encoding="utf-8-sig"), str(path), "exec", dont_inherit=True)
        bundled = pyz.extract(module)
        if not isinstance(bundled, CodeType) or normalize(source) != normalize(bundled):
            different.append(module)
    if different:
        raise SystemExit("Backend desatualizado: " + ", ".join(different))
    print(f"OK: {len(MODULES)} módulos da IA no executável correspondem ao código atual.")


if __name__ == "__main__":
    main()
