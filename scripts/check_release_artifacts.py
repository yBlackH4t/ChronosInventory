from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from urllib.parse import unquote, urlparse


def load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def find_versioned_files(files: list[Path], version: str) -> list[Path]:
    token = f"_{version}_"
    return [p for p in files if token in p.name]


def check_release_artifacts(frontend_dir: Path, repo: str, tag: str) -> int:
    errors: list[str] = []

    package_json = load_json(frontend_dir / "package.json")
    version = str(package_json.get("version") or "").strip()
    if not version:
        errors.append("Versao nao encontrada em frontend/package.json.")
        version = "0.0.0"

    release_dir = frontend_dir / "release"
    latest_path = release_dir / "latest.json"
    if not latest_path.exists():
        errors.append(f"Arquivo ausente: {latest_path}")
        latest = {}
    else:
        latest = load_json(latest_path)

    latest_version = str(latest.get("version") or "").strip()
    if latest_version != version:
        errors.append(
            f"latest.json version='{latest_version}' difere de package.json version='{version}'."
        )

    platforms = latest.get("platforms") or {}
    win = platforms.get("windows-x86_64") or {}
    signature = str(win.get("signature") or "").strip()
    url = str(win.get("url") or "").strip()

    if not signature:
        errors.append("latest.json sem assinatura em platforms.windows-x86_64.signature.")
    if not url:
        errors.append("latest.json sem URL em platforms.windows-x86_64.url.")

    expected_url_prefix = f"https://github.com/{repo}/releases/download/{tag}/"
    if url and not url.startswith(expected_url_prefix):
        errors.append(
            "URL do latest.json invalida. "
            f"Esperado prefixo '{expected_url_prefix}', recebido '{url}'."
        )

    zip_files = sorted(release_dir.glob("*.msi.zip"), key=lambda p: p.name.lower())
    versioned_zip_files = find_versioned_files(zip_files, version)
    if not versioned_zip_files:
        errors.append(
            f"Nenhum arquivo .msi.zip da versao {version} em {release_dir}."
        )

    if len(versioned_zip_files) > 1:
        errors.append(
            "Mais de um .msi.zip encontrado para a mesma versao. "
            f"Arquivos: {', '.join(p.name for p in versioned_zip_files)}"
        )

    versioned_msi_files = find_versioned_files(
        sorted(release_dir.glob("*.msi"), key=lambda p: p.name.lower()),
        version,
    )
    if not versioned_msi_files:
        errors.append(f"Nenhum arquivo .msi da versao {version} em {release_dir}.")

    selected_zip = versioned_zip_files[0] if versioned_zip_files else None
    if selected_zip:
        sig_path = Path(f"{selected_zip}.sig")
        if not sig_path.exists():
            errors.append(f"Assinatura ausente para updater bundle: {sig_path.name}")

        if url:
            parsed = urlparse(url)
            asset_name_from_url = unquote(Path(parsed.path).name)
            if asset_name_from_url != selected_zip.name:
                errors.append(
                    "latest.json aponta para asset diferente do bundle local. "
                    f"URL='{asset_name_from_url}', local='{selected_zip.name}'."
                )

    if errors:
        print("ERRO: validacao de release falhou:")
        for err in errors:
            print(f" - {err}")
        return 1

    print("OK: release validada com sucesso.")
    print(f" - repo: {repo}")
    print(f" - tag: {tag}")
    print(f" - versao: {version}")
    print(f" - latest: {latest_path}")
    print(f" - updater bundle: {selected_zip.name if selected_zip else 'N/A'}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Valida consistencia de latest.json e artefatos de release."
    )
    parser.add_argument("--repo", default="yBlackH4t/ChronosInventory")
    parser.add_argument("--tag", default=None)
    parser.add_argument("--frontend-dir", default="frontend")
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parent.parent
    frontend_dir = (repo_root / args.frontend_dir).resolve()
    if not frontend_dir.exists():
        print(f"ERRO: frontend-dir nao encontrado: {frontend_dir}")
        return 1

    package_json = load_json(frontend_dir / "package.json")
    version = str(package_json.get("version") or "").strip()
    tag = args.tag or f"v{version}"

    return check_release_artifacts(
        frontend_dir=frontend_dir,
        repo=args.repo,
        tag=tag,
    )


if __name__ == "__main__":
    raise SystemExit(main())
