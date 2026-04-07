from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

from check_versions import read_app_version_from_constants


def fail(message: str) -> None:
    print(f"ERRO: {message}")


def run_command(command: list[str], cwd: Path) -> int:
    print(f"> {' '.join(command)}")
    completed = subprocess.run(command, cwd=str(cwd))
    return completed.returncode


def validate_changelog(changelog_path: Path, expected_version: str) -> list[str]:
    content = changelog_path.read_text(encoding="utf-8")
    section_pattern = re.compile(
        rf"^## \[{re.escape(expected_version)}\].*?(?=^## \[|\Z)",
        re.MULTILINE | re.DOTALL,
    )
    match = section_pattern.search(content)
    if not match:
        return [f"CHANGELOG sem secao para a versao {expected_version}."]

    section = match.group(0)
    errors: list[str] = []
    if "TODO" in section.upper():
        errors.append(f"CHANGELOG da versao {expected_version} ainda contem TODO.")
    return errors


def validate_synced_changelog(changelog_ts_path: Path, expected_version: str) -> list[str]:
    content = changelog_ts_path.read_text(encoding="utf-8")
    version_matches = re.findall(r'"version":\s*"([^"]+)"', content)
    if not version_matches:
        return [f"Nenhuma versao encontrada em {changelog_ts_path}."]
    if version_matches[0] != expected_version:
        return [
            "frontend/src/lib/changelog.ts nao esta sincronizado com a versao atual. "
            f"Primeira entrada encontrada: {version_matches[0]}, esperado: {expected_version}."
        ]
    return []


def main() -> int:
    parser = argparse.ArgumentParser(description="Checklist tecnico de release/update.")
    parser.add_argument("--frontend-dir", default="frontend")
    parser.add_argument("--skip-sidecar", action="store_true")
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parent.parent
    frontend_dir = (repo_root / args.frontend_dir).resolve()
    if not frontend_dir.exists():
        fail(f"frontend-dir nao encontrado: {frontend_dir}")
        return 1

    expected_version = read_app_version_from_constants(repo_root / "core" / "constants.py")

    errors: list[str] = []
    errors.extend(validate_changelog(repo_root / "CHANGELOG.md", expected_version))
    errors.extend(
        validate_synced_changelog(repo_root / "frontend" / "src" / "lib" / "changelog.ts", expected_version)
    )
    if errors:
        print("ERRO: falhas de checklist de release:")
        for err in errors:
            print(f" - {err}")
        return 1

    if run_command([sys.executable, str(repo_root / "scripts" / "check_versions.py")], repo_root) != 0:
        return 1

    if not args.skip_sidecar:
        if run_command(
            [
                "powershell",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                str(frontend_dir / "scripts" / "verify_sidecar.ps1"),
            ],
            repo_root,
        ) != 0:
            return 1

    print(f"OK: release doctor validou a versao {expected_version}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
