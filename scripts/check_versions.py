from __future__ import annotations

import json
import re
import tomllib
from pathlib import Path


SEMVER_PATTERN = re.compile(r"^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z\.-]+)?$")


def read_app_version_from_constants(path: Path) -> str:
    content = path.read_text(encoding="utf-8")
    match = re.search(r'APP_VERSION\s*=\s*"([^"]+)"', content)
    if not match:
        raise ValueError(f"Nao foi possivel localizar APP_VERSION em {path}")
    return match.group(1)


def read_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def read_toml(path: Path) -> dict:
    with path.open("rb") as f:
        return tomllib.load(f)


def main() -> int:
    repo_root = Path(__file__).resolve().parent.parent

    core_constants = repo_root / "core" / "constants.py"
    frontend_package = repo_root / "frontend" / "package.json"
    frontend_package_lock = repo_root / "frontend" / "package-lock.json"
    tauri_cargo_toml = repo_root / "frontend" / "src-tauri" / "Cargo.toml"
    tauri_conf = repo_root / "frontend" / "src-tauri" / "tauri.conf.json"
    tauri_cargo_lock = repo_root / "frontend" / "src-tauri" / "Cargo.lock"

    expected_version = read_app_version_from_constants(core_constants)
    errors: list[str] = []

    if not SEMVER_PATTERN.match(expected_version):
        errors.append(
            f"APP_VERSION invalida em {core_constants}: '{expected_version}' (esperado semver)."
        )

    package_json = read_json(frontend_package)
    package_version = str(package_json.get("version") or "")

    package_lock_json = read_json(frontend_package_lock)
    package_lock_root_version = str(package_lock_json.get("version") or "")
    package_lock_pkg_version = str(
        (package_lock_json.get("packages") or {}).get("", {}).get("version") or ""
    )

    cargo_toml = read_toml(tauri_cargo_toml)
    cargo_toml_version = str((cargo_toml.get("package") or {}).get("version") or "")

    tauri_conf_json = read_json(tauri_conf)
    tauri_conf_version = str((tauri_conf_json.get("package") or {}).get("version") or "")

    cargo_lock = read_toml(tauri_cargo_lock)
    cargo_lock_packages = cargo_lock.get("package") or []
    cargo_lock_versions = sorted(
        {
            str(pkg.get("version") or "")
            for pkg in cargo_lock_packages
            if pkg.get("name") == "chronos_inventory_desktop"
        }
    )
    if not cargo_lock_versions:
        errors.append(
            "Pacote 'chronos_inventory_desktop' nao encontrado em frontend/src-tauri/Cargo.lock."
        )
        cargo_lock_version = ""
    elif len(cargo_lock_versions) > 1:
        errors.append(
            "Multiplas versoes para 'chronos_inventory_desktop' em Cargo.lock: "
            + ", ".join(cargo_lock_versions)
        )
        cargo_lock_version = cargo_lock_versions[0]
    else:
        cargo_lock_version = cargo_lock_versions[0]

    checks = [
        ("core/constants.py APP_VERSION", expected_version),
        ("frontend/package.json version", package_version),
        ("frontend/package-lock.json version", package_lock_root_version),
        ("frontend/package-lock.json packages[''] version", package_lock_pkg_version),
        ("frontend/src-tauri/Cargo.toml package.version", cargo_toml_version),
        ("frontend/src-tauri/tauri.conf.json package.version", tauri_conf_version),
        ("frontend/src-tauri/Cargo.lock chronos_inventory_desktop.version", cargo_lock_version),
    ]

    for label, value in checks[1:]:
        if value != expected_version:
            errors.append(
                f"{label} = '{value}' mas deveria ser '{expected_version}'."
            )

    if errors:
        print("ERRO: inconsistencias de versao encontradas:")
        for err in errors:
            print(f" - {err}")
        return 1

    print(f"OK: versoes consistentes ({expected_version})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
