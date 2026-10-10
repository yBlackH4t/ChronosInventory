# ⏳ Chronos Inventory

> Sistema desktop de gestão de estoque para Windows: local, rápido, offline-first, com atualização automática e assistente de IA para consultas de estoque.

![Python](https://img.shields.io/badge/Python-3.12-blue)
![FastAPI](https://img.shields.io/badge/FastAPI-Backend-009688)
![React](https://img.shields.io/badge/React-19-61DAFB)
![Vite](https://img.shields.io/badge/Vite-7-646CFF)
![Tauri](https://img.shields.io/badge/Tauri-2-FFC131)
![Windows](https://img.shields.io/badge/Windows-10|11-0078D6)
![Version](https://img.shields.io/badge/version-2.3.0-green)

---

## 🎯 Sobre o Projeto

O **Chronos Inventory** é um aplicativo desktop de controle de estoque feito para uma distribuidora de turbinas (Garrett, Holset e BorgWarner) com várias filiais e várias máquinas. Ele funciona **sem internet**, guarda os dados **na própria máquina** e é distribuído por **instalador Windows** com atualização automática.

- ⚡ Velocidade de banco local (SQLite)
- 🔌 Operação do dia a dia sem internet
- 🏢 Várias filiais e várias máquinas, com uma base oficial compartilhada
- 🤖 Assistente que responde "temos essa turbina?" pelo estoque
- 🔄 Atualizações automáticas pelo GitHub Releases

---

## ✨ Funcionalidades

### 📦 Produtos
- Cadastro e edição, com descrição e várias imagens (imagem principal)
- Estoque por filial e por local
- Status do produto (ativo/inativo)
- Vínculos entre produtos (ex.: turbina montada ↔ conjunto central)
- Ficha de catálogo: especificações, referências cruzadas e aplicações, com códigos copiáveis
- Catálogo de referências embutido no instalador e vinculado aos produtos

### 📊 Estoque e Movimentações
- Entrada, saída e transferência entre filiais, inclusive em massa
- Movimentação rápida com o atalho **N**
- Histórico completo
- Inventário por sessões, com diferença faltando/sobrando
- Comparação de estoques e perfis de estoque

### 🤖 Assistente de IA
- Responde perguntas como "temos turbina 4031196?", "turbina do scania 440?" ou "temos essa daí?"
- A **busca direta responde primeiro**; a IA (plano gratuito do Groq) só entra quando a busca não entende a pergunta
- Entende hífen, sufixo, OEM e versões nova/reman dos códigos
- Conhecimento do especialista ("A é igual/similar/diferente de B"), ensinado só pelo admin, com lista "Para revisar" e histórico
- O conhecimento chega sozinho às outras máquinas
- Foto da plaqueta no chat
- WhatsApp em **modo copiloto**: só responde quando alguém da equipe reage com 🤖; entende áudio e foto, e tem os comandos `/ensinar`, `/pendentes` e `/resumo`
- Resumo diário: produtos que zeraram, os que mais saíram e o que perguntaram e não temos

Detalhes em [`docs/ASSISTENTE_IA.md`](docs/ASSISTENTE_IA.md).

### 📈 Painel e Relatórios
- Dashboard com indicadores e cor fixa por filial
- Relatórios em PDF
- Etiquetas com código de barras/QR (Estoque e Expedição NF-e)

### 🛠️ Operação
- Interface com abas no topo (Alt+1 a Alt+6), tema claro e escuro
- Busca rápida (**Ctrl+K**) com saldo por filial
- Importação e exportação (Excel)
- Backup local
- **Base oficial**: uma máquina publica a base e as outras consomem, por pasta compartilhada ou pelo servidor local da publicadora (com senha opcional)
- Atualização automática com "Novidades da versão"

### 🔐 Proteção de dados
- Produto com movimentações não pode ser excluído (a tela oferece inativar)
- Senha opcional no servidor local da base oficial

---

## 🧠 Stack Tecnológica

| Camada | Tecnologia | Pasta |
|---|---|---|
| Regras de negócio | Python 3.12 | `app/services`, `app/models` |
| Banco | SQLite | `core/database` |
| API local | FastAPI + Uvicorn | `backend/app` |
| Telas | React 19 + TypeScript + Vite 7 + Mantine 8 + TanStack Query | `frontend/src` |
| Desktop | Tauri 2 | `frontend/src-tauri` |
| Empacotamento | PyInstaller (sidecar) | `build_backend.ps1` |
| Assistente | Groq (gratuito), neonize (WhatsApp) | `app/services` |
| Updater | GitHub Releases + Tauri Updater | `.github/workflows/release.yml` |

---

# 🏗️ Arquitetura

- O app Tauri inicia o backend Python empacotado (sidecar).
- A API escuta só em `127.0.0.1:8000`, fechada para a rede.
- O servidor da base oficial (porta 8765) é opcional e só existe na máquina publicadora.
- Mapa do código em [`docs/PROJECT_MAP.md`](docs/PROJECT_MAP.md); rotas em [`docs/API_DOCS.md`](docs/API_DOCS.md).

## 💾 Persistência

Banco e configurações ficam em:

```
%APPDATA%\Chronos Inventory
```

Para desenvolvimento e testes, a variável `CHRONOS_APP_DIR` aponta o app para outra pasta. **Nunca use o banco original da empresa: trabalhe sempre numa cópia.**

---

# 🚀 Instalação (Usuário Final)

Baixe o instalador `.msi` em **[Releases](https://github.com/yBlackH4t/ChronosInventory/releases/latest)** e execute normalmente. As próximas versões são instaladas pelo próprio app.

---

# 👨‍💻 Desenvolvimento

## 🔧 Requisitos

- Windows 10/11
- Python 3.12
- Node 20+ e npm
- Rust (toolchain estável)
- Visual Studio Build Tools (C++)
- Git

## Backend

```powershell
python -m venv .venv312
.\.venv312\Scripts\Activate.ps1
pip install -r backend\requirements.txt
pip install -r backend\requirements-dev.txt
python -m pytest -q
```

## Frontend

```powershell
cd frontend
npm ci
npm run dev      # telas no navegador (Vite)
npm run build
npm run lint
```

## Assistente

A chave do Groq fica em `assistente_config.json`, **fora do git**. Nunca publique essa chave. O roteiro de teste está em [`docs/TESTE_ASSISTENTE.md`](docs/TESTE_ASSISTENTE.md).

## Verificações (as mesmas da CI)

```powershell
python scripts/check_versions.py
python -m pytest -q
cd frontend; npm ci; npm run build; npm run lint
```

---

# 🖥️ Build Desktop

```powershell
cd frontend
npm run build:app
```

Esse comando gera o sidecar do backend (`build_backend.ps1`, que também roda o autodiagnóstico do assistente), roda o `release:doctor` e cria o instalador `.msi` em `frontend/src-tauri/target/release/bundle/msi/`.

## Publicar uma versão

1. `frontend/scripts/bump_version.ps1 X.Y.Z`
2. Escrever a seção `## [X.Y.Z]` do `CHANGELOG.md` (é o texto de "Novidades da versão") e rodar `npm run changelog:sync`
3. Criar a tag `vX.Y.Z` na `main`. **A tag publica a atualização para todas as máquinas**, pelo workflow de release.

Passo a passo completo em [`README_RELEASE.md`](README_RELEASE.md).

---

# 📁 Estrutura do Projeto

```
app/                 regras de negócio (services, models)
core/                banco, catálogo e utilitários
backend/app/         API FastAPI
backend/tests/       testes (pytest)
frontend/src/        telas React
frontend/src-tauri/  app desktop (Tauri 2)
scripts/             verificações, release e avaliação do assistente
docs/                documentação
```

---

# 🔐 Segurança e Privacidade

- API só em localhost, sem exposição externa
- Dados ficam na máquina (e na pasta compartilhada da base oficial, se configurada)
- Sem telemetria
- O assistente usa a internet só para a IA (Groq) e o WhatsApp; a busca direta funciona offline
- Chaves e senhas ficam fora do git (`assistente_config.json`, `official_base_config.json`)
- O histórico exportado não leva telefones, e os logs do WhatsApp mascaram os números

---

# 📌 Roadmap

- [x] Relatórios PDF
- [x] Base oficial compartilhada entre máquinas
- [x] Assistente de IA e WhatsApp em modo copiloto
- [ ] Usuários e login no app
- [ ] WhatsApp do número da empresa (decidir: não oficial × API oficial da Meta)
- [ ] Integração fiscal
