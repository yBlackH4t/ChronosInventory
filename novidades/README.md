# Novidades da próxima versão

Cada PR deixa aqui **um arquivo `.md` com o que mudou** e não mexe no número da versão. No merge
na `main`, o robô (`.github/workflows/publicar.yml`, script `scripts/proxima_versao.py`) junta os
arquivos numa seção nova do `CHANGELOG.md`, escolhe o número, apaga os arquivos, cria a tag e
publica a versão no **canal de teste**. Para todos os PCs ela só vai depois de "Liberar para
todos" (Actions > Liberar para todos).

- Nome do arquivo: qualquer um que não se repita, por exemplo o assunto ou a branch
  (`etiqueta-nf.md`). Arquivos diferentes nunca dão conflito entre PRs paralelos.
- Formato: as mesmas seções do CHANGELOG (`### Added`, `### Changed`, `### Fixed`) com itens
  `- `. Linhas sem seção entram em `### Changed`.
- O robô soma 1 no último número (2.7.30 -> 2.7.31). Para somar no do meio (2.8.0) ou no primeiro
  (3.0.0), a primeira linha de um dos arquivos é `versao: media` ou `versao: grande`.
- PR sem arquivo aqui (só documentos ou testes) não gera versão.

Exemplo:

```markdown
### Fixed
- **Etiquetas:** a etiqueta da NF sai com o CEP inteiro.
```
