"""
Robo de versao: roda no GitHub a cada merge na main (.github/workflows/publicar.yml).

Os PRs nao mexem mais no numero da versao: cada um deixa um arquivo em `novidades/` com o que
mudou. Aqui o robo decide a versao nova, escreve a secao dela no CHANGELOG, apaga os arquivos
de novidades e troca o numero em todos os arquivos que o guardam. A tag e o build ficam para o
workflow.

Regras:
- a versao da main ainda nao tem tag (um PR antigo que ja trocou o numero a mao): publica essa
  mesma versao, juntando as novidades que houver na secao dela;
- tem tag e ha novidades: soma 1 no ultimo numero (ou no do meio / no primeiro, se algum arquivo
  pedir `versao: media` / `versao: grande` na primeira linha);
- tem tag e nao ha novidades (PR so de documentos ou testes): nao publica nada.

Uso: python scripts/proxima_versao.py [--aplicar] [--github-output ARQUIVO]
Sem --aplicar so mostra o que faria.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Callable

REPO_ROOT = Path(__file__).resolve().parent.parent
SECTION_ORDER = ("Added", "Changed", "Fixed")
VERSION_HEADER = re.compile(r"^##\s*\[(\d+\.\d+\.\d+)\]", re.MULTILINE)
BUMP_LINE = re.compile(r"^\s*versao\s*:\s*(media|grande)\s*$", re.IGNORECASE)
HEADING_LINE = re.compile(r"^###\s+(\w+)\s*$")

# Os mesmos lugares que o frontend/scripts/bump_version.ps1 troca.
VERSION_FILES: tuple[tuple[str, str], ...] = (
    ("core/constants.py", r'(APP_VERSION\s*=\s*")([^"]+)(")'),
    ("frontend/package.json", r'(^\s*"version"\s*:\s*")([^"]+)(")'),
    ("frontend/package-lock.json", r'(^\s*"version"\s*:\s*")([^"]+)(")'),
    (
        "frontend/package-lock.json",
        r'("packages"\s*:\s*\{\s*""\s*:\s*\{\s*"name"\s*:\s*"[^"]*"\s*,\s*"version"\s*:\s*")([^"]+)(")',
    ),
    (
        "frontend/src-tauri/Cargo.toml",
        r'(\[package\]\s*[\r\n]+name\s*=\s*"chronos_inventory_desktop"\s*[\r\n]+version\s*=\s*")([^"]+)(")',
    ),
    ("frontend/src-tauri/tauri.conf.json", r'(\n  "version"\s*:\s*")([^"]+)(")'),
    (
        "frontend/src-tauri/Cargo.lock",
        r'(name\s*=\s*"chronos_inventory_desktop"\s*[\r\n]+version\s*=\s*")([^"]+)(")',
    ),
)


@dataclass
class Novidade:
    path: Path
    bump: str = "patch"
    items: dict[str, list[str]] = field(default_factory=dict)


@dataclass
class Plano:
    versao: str | None
    novidades: list[Novidade]
    motivo: str


def read_app_version(root: Path) -> str:
    content = (root / "core" / "constants.py").read_text(encoding="utf-8")
    match = re.search(r'APP_VERSION\s*=\s*"([^"]+)"', content)
    if not match:
        raise ValueError("APP_VERSION nao encontrada em core/constants.py")
    return match.group(1)


def parse_novidade(path: Path) -> Novidade:
    novidade = Novidade(path=path)
    current = "Changed"
    for line in path.read_text(encoding="utf-8").splitlines():
        bump = BUMP_LINE.match(line)
        if bump:
            novidade.bump = "minor" if bump.group(1).lower() == "media" else "major"
            continue
        heading = HEADING_LINE.match(line.strip())
        if heading:
            current = heading.group(1).capitalize()
            continue
        if not line.strip():
            continue
        novidade.items.setdefault(current, []).append(line.rstrip())
    return novidade


def list_novidades(root: Path) -> list[Novidade]:
    folder = root / "novidades"
    if not folder.is_dir():
        return []
    files = sorted(p for p in folder.glob("*.md") if p.name.lower() != "readme.md")
    return [n for n in (parse_novidade(p) for p in files) if n.items]


def bump_version(version: str, kind: str) -> str:
    major, minor, patch = (int(part) for part in version.split("-")[0].split("."))
    if kind == "major":
        return f"{major + 1}.0.0"
    if kind == "minor":
        return f"{major}.{minor + 1}.0"
    return f"{major}.{minor}.{patch + 1}"


def git_tag_exists(tag: str) -> bool:
    result = subprocess.run(
        ["git", "rev-parse", "-q", "--verify", f"refs/tags/{tag}"],
        cwd=REPO_ROOT,
        capture_output=True,
    )
    return result.returncode == 0


def planejar(root: Path, tag_exists: Callable[[str], bool] = git_tag_exists) -> Plano:
    atual = read_app_version(root)
    novidades = list_novidades(root)
    if not tag_exists(f"v{atual}"):
        return Plano(atual, novidades, f"a versao {atual} da main ainda nao foi publicada")
    if not novidades:
        return Plano(None, [], "nenhuma novidade em novidades/: nada para publicar")
    kinds = {n.bump for n in novidades}
    kind = "major" if "major" in kinds else "minor" if "minor" in kinds else "patch"
    return Plano(bump_version(atual, kind), novidades, f"{len(novidades)} novidade(s) depois da v{atual}")


def _parse_section(body: str) -> tuple[list[str], dict[str, list[str]]]:
    """Separa o texto antes do primeiro ### e os itens de cada ###."""
    preamble: list[str] = []
    items: dict[str, list[str]] = {}
    current: str | None = None
    for line in body.splitlines():
        heading = HEADING_LINE.match(line.strip())
        if heading:
            current = heading.group(1).capitalize()
            items.setdefault(current, [])
        elif current is None:
            preamble.append(line)
        elif line.strip():
            items[current].append(line.rstrip())
    return preamble, items


def _render_section(header: str, preamble: list[str], items: dict[str, list[str]]) -> str:
    lines = [header, ""]
    lines += [line for line in preamble if line.strip()]
    if lines[-1] != "":
        lines.append("")
    order = list(SECTION_ORDER) + [k for k in items if k not in SECTION_ORDER]
    for name in order:
        if items.get(name):
            lines += [f"### {name}", *items[name], ""]
    return "\n".join(lines)


def update_changelog(text: str, versao: str, novidades: list[Novidade], hoje: str) -> str:
    novas: dict[str, list[str]] = {}
    for novidade in novidades:
        for name, lines in novidade.items.items():
            novas.setdefault(name, []).extend(lines)

    headers = list(VERSION_HEADER.finditer(text))
    existing = next((m for m in headers if m.group(1) == versao), None)
    if existing is None:
        if not novas:
            raise ValueError(f"CHANGELOG sem secao para {versao} e sem novidades para escrever.")
        section = _render_section(f"## [{versao}] - {hoje}", [], novas)
        insert_at = headers[0].start() if headers else len(text)
        return text[:insert_at] + section + "\n" + text[insert_at:]

    if not novas:
        return text
    following = next((m for m in headers if m.start() > existing.start()), None)
    end = following.start() if following else len(text)
    header_end = text.index("\n", existing.start())
    header = text[existing.start():header_end].rstrip("\r")
    preamble, items = _parse_section(text[header_end + 1:end])
    for name, lines in novas.items():
        items.setdefault(name, []).extend(lines)
    return text[: existing.start()] + _render_section(header, preamble, items) + "\n" + text[end:]


def check_changelog(text: str, versao: str) -> list[str]:
    headers = list(VERSION_HEADER.finditer(text))
    existing = next((m for m in headers if m.group(1) == versao), None)
    if existing is None:
        return [f"CHANGELOG sem secao para {versao}."]
    following = next((m for m in headers if m.start() > existing.start()), None)
    body = text[existing.end(): following.start() if following else len(text)]
    errors = []
    if re.search(r"\bTODO\b", body):
        errors.append(f"A secao {versao} do CHANGELOG ainda tem TODO.")
    if not re.search(r"^\s*-\s+\S", body, re.MULTILINE):
        errors.append(f"A secao {versao} do CHANGELOG nao tem nenhum item.")
    return errors


def set_version_in_files(root: Path, versao: str) -> None:
    for relative, pattern in VERSION_FILES:
        path = root / relative
        content = path.read_text(encoding="utf-8")
        regex = re.compile(pattern, re.MULTILINE | re.DOTALL)
        if not regex.search(content):
            raise ValueError(f"Numero da versao nao encontrado em {relative}.")
        content = regex.sub(lambda m: f"{m.group(1)}{versao}{m.group(3)}", content, count=1)
        path.write_bytes(content.encode("utf-8"))


def aplicar(root: Path, plano: Plano, hoje: str) -> None:
    if plano.versao is None:
        return
    changelog_path = root / "CHANGELOG.md"
    text = changelog_path.read_text(encoding="utf-8")
    text = update_changelog(text, plano.versao, plano.novidades, hoje)
    errors = check_changelog(text, plano.versao)
    if errors:
        raise ValueError(" ".join(errors))
    changelog_path.write_bytes(text.encode("utf-8"))
    if plano.versao != read_app_version(root):
        set_version_in_files(root, plano.versao)
    for novidade in plano.novidades:
        novidade.path.unlink()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    parser.add_argument("--aplicar", action="store_true", help="grava as mudancas")
    parser.add_argument("--github-output", help="arquivo $GITHUB_OUTPUT do Actions")
    args = parser.parse_args(argv)

    plano = planejar(REPO_ROOT, git_tag_exists)
    print(f"Robo de versao: {plano.motivo}.")
    if plano.versao:
        nomes = ", ".join(n.path.name for n in plano.novidades) or "nenhuma"
        print(f"Versao a publicar: {plano.versao} (novidades: {nomes})")
    if args.aplicar:
        try:
            aplicar(REPO_ROOT, plano, date.today().isoformat())
        except ValueError as exc:
            print(f"ERRO: {exc}", file=sys.stderr)
            return 1
    if args.github_output:
        with open(args.github_output, "a", encoding="utf-8") as out:
            out.write(f"versao={plano.versao or ''}\n")
            out.write(f"tag={'v' + plano.versao if plano.versao else ''}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
