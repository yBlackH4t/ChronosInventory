# Changelog

Este arquivo define as notas que aparecem no updater do Chronos Inventory.
Formato recomendado:

- Um bloco por versao usando `## [X.Y.Z] - YYYY-MM-DD`
- Secoes `### Added`, `### Changed`, `### Fixed`
- Itens em lista com `- `

## [Unreleased]

### Added
- Tela de backup com listagem, validacao de integridade, restauracao e exportacao de diagnostico.
- Endpoints de backup para listar (`/backup/listar`), validar (`/backup/validar`), restaurar (`/backup/restaurar`) e baixar pacote de suporte (`/backup/diagnostico`).
- Testes automatizados cobrindo fluxo de backup/restore e download de diagnostico.

### Changed
- Updater do desktop agora mostra release notes no fluxo automatico e no botao manual de verificacao.
- `release_sign.ps1` passou a gerar `latest.json` com `notes` automaticas a partir do `CHANGELOG.md`.
- `release:bump` passou a criar template de secao no changelog para novas versoes.
- Allowlist do Tauri foi reduzida para minimo necessario (`process.relaunch`).

### Fixed
- Restauracao de backup em Windows sem falha de lock no arquivo `-wal`.
- Startup do backend com execucao de migracao versionada e rollback em caso de erro.
- Endpoint `--version` no backend sidecar para validar sincronismo de versao no processo de release.


## [1.1.5] - 2026-02-18

### Added
- TODO

### Changed
- TODO

### Fixed
- TODO

## [1.1.4] - 2026-02-18

### Fixed
- Bloqueio de compatibilidade quando frontend e backend estao em versoes incompativeis.
- Validacao de versao no CI/release para evitar publicar artefatos fora de sincronia.
- Regras de movimentacao com natureza/documento/referencia para reduzir erros de validacao.

### Changed
- Processo de release com `release:bump` e checklist tecnico em `README_RELEASE.md`.
