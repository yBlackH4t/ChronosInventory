import importlib.util
import json
import shutil
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
_spec = importlib.util.spec_from_file_location("proxima_versao", REPO_ROOT / "scripts" / "proxima_versao.py")
pv = importlib.util.module_from_spec(_spec)
sys.modules["proxima_versao"] = pv
_spec.loader.exec_module(pv)

CHANGELOG = """# Changelog

Notas do updater.

## [2.7.29] - 2026-10-30

### Changed
- **Atualizacao automatica:** baixa escondido.

## [2.7.28] - 2026-10-30

### Fixed
- Inventario.
"""


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    for relative, _ in pv.VERSION_FILES:
        target = tmp_path / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(REPO_ROOT / relative, target)
    (tmp_path / "CHANGELOG.md").write_text(CHANGELOG, encoding="utf-8")
    (tmp_path / "novidades").mkdir()
    (tmp_path / "novidades" / "README.md").write_text("# Como escrever\n- nao e novidade\n", encoding="utf-8")
    pv.set_version_in_files(tmp_path, "2.7.29")
    return tmp_path


def _novidade(repo: Path, name: str, text: str) -> None:
    (repo / "novidades" / name).write_text(text, encoding="utf-8")


def test_sem_novidades_e_versao_publicada_nao_publica(repo):
    plano = pv.planejar(repo, tag_exists=lambda tag: True)
    assert plano.versao is None


def test_versao_sem_tag_publica_ela_mesma(repo):
    plano = pv.planejar(repo, tag_exists=lambda tag: False)
    assert plano.versao == "2.7.29"
    pv.aplicar(repo, plano, "2026-10-31")
    assert pv.read_app_version(repo) == "2.7.29"
    assert (repo / "CHANGELOG.md").read_text(encoding="utf-8") == CHANGELOG


def test_novidades_viram_versao_seguinte(repo):
    _novidade(repo, "b-etiqueta.md", "### Fixed\n- **Etiquetas:** CEP inteiro.\n")
    _novidade(repo, "a-painel.md", "- **Painel:** mais rapido.\n\n### Added\n- **Canal de teste.**\n")
    plano = pv.planejar(repo, tag_exists=lambda tag: True)
    assert plano.versao == "2.7.30"

    pv.aplicar(repo, plano, "2026-10-31")

    text = (repo / "CHANGELOG.md").read_text(encoding="utf-8")
    nova = text.split("## [2.7.30] - 2026-10-31")[1].split("## [2.7.29]")[0]
    assert nova.index("### Added") < nova.index("### Changed") < nova.index("### Fixed")
    assert "- **Canal de teste.**" in nova and "- **Painel:** mais rapido." in nova
    assert text.index("## [2.7.30]") < text.index("## [2.7.29]")
    assert sorted(p.name for p in (repo / "novidades").iterdir()) == ["README.md"]

    assert pv.read_app_version(repo) == "2.7.30"
    package = json.loads((repo / "frontend" / "package.json").read_text(encoding="utf-8"))
    lock = json.loads((repo / "frontend" / "package-lock.json").read_text(encoding="utf-8"))
    tauri = json.loads((repo / "frontend" / "src-tauri" / "tauri.conf.json").read_text(encoding="utf-8"))
    assert package["version"] == lock["version"] == lock["packages"][""]["version"] == tauri["version"] == "2.7.30"
    cargo = (repo / "frontend" / "src-tauri" / "Cargo.toml").read_text(encoding="utf-8")
    assert 'version = "2.7.30"' in cargo


def test_versao_media_e_grande(repo):
    _novidade(repo, "x.md", "versao: media\n- Login.\n")
    assert pv.planejar(repo, tag_exists=lambda tag: True).versao == "2.8.0"
    _novidade(repo, "y.md", "Versao: grande\n- Servidor central.\n")
    assert pv.planejar(repo, tag_exists=lambda tag: True).versao == "3.0.0"


def test_pr_antigo_com_numero_trocado_junta_novidades_na_secao_dele(repo):
    _novidade(repo, "nova.md", "### Fixed\n- Corrige o bip.\n")
    plano = pv.planejar(repo, tag_exists=lambda tag: tag != "v2.7.29")
    assert plano.versao == "2.7.29"

    pv.aplicar(repo, plano, "2026-10-31")

    text = (repo / "CHANGELOG.md").read_text(encoding="utf-8")
    secao = text.split("## [2.7.29] - 2026-10-30")[1].split("## [2.7.28]")[0]
    assert "- **Atualizacao automatica:** baixa escondido." in secao
    assert "### Fixed\n- Corrige o bip." in secao
    assert pv.read_app_version(repo) == "2.7.29"


def test_novidade_com_todo_nao_publica(repo):
    _novidade(repo, "x.md", "- TODO escrever\n")
    plano = pv.planejar(repo, tag_exists=lambda tag: True)
    with pytest.raises(ValueError, match="TODO"):
        pv.aplicar(repo, plano, "2026-10-31")
    assert pv.read_app_version(repo) == "2.7.29"
    assert (repo / "novidades" / "x.md").exists()


def test_github_output(repo, tmp_path, monkeypatch):
    monkeypatch.setattr(pv, "REPO_ROOT", repo)
    monkeypatch.setattr(pv, "git_tag_exists", lambda tag: True)
    _novidade(repo, "x.md", "- Algo.\n")
    out = tmp_path / "out.txt"
    assert pv.main(["--github-output", str(out)]) == 0
    assert out.read_text(encoding="utf-8") == "versao=2.7.30\ntag=v2.7.30\n"
    assert (repo / "novidades" / "x.md").exists()
