# ⏳ Chronos Inventory

> Sistema desktop de gestão de estoque para Windows: local, rápido, offline-first, com atualização automática, leitor de código pelo celular e assistente de IA que responde pelo estoque, no app e no WhatsApp.

![Python](https://img.shields.io/badge/Python-3.12-blue)
![FastAPI](https://img.shields.io/badge/FastAPI-Backend-009688)
![React](https://img.shields.io/badge/React-19-61DAFB)
![Mantine](https://img.shields.io/badge/Mantine-9-339AF0)
![Vite](https://img.shields.io/badge/Vite-7-646CFF)
![Tauri](https://img.shields.io/badge/Tauri-2-FFC131)
![Windows](https://img.shields.io/badge/Windows-10|11-0078D6)
[![Versão oficial](https://img.shields.io/github/v/release/yBlackH4t/ChronosInventory?label=vers%C3%A3o%20oficial&color=green)](https://github.com/yBlackH4t/ChronosInventory/releases/latest)

---

## 🎯 Sobre o Projeto

O **Chronos Inventory** é um aplicativo desktop de controle de estoque feito para uma distribuidora de turbinas (Garrett, Holset e BorgWarner) com várias filiais e várias máquinas. Ele funciona **sem internet**, guarda os dados **na própria máquina** e é distribuído por **instalador Windows** que se atualiza sozinho.

- ⚡ Velocidade de banco local (SQLite)
- 🔌 Operação do dia a dia sem internet
- 🏢 Várias filiais e várias máquinas, com uma **base oficial** compartilhada
- 📱 Celular como leitor de código de barras (inventário, contagem e NF-e)
- 🤖 Assistente que responde "temos essa turbina?" pelo estoque, no app e no WhatsApp
- 🔄 Atualização automática em segundo plano, com canal de teste antes de liberar para todos

---

## ✨ Funcionalidades

### 📦 Produtos
- Cadastro e edição, com descrição e várias fotos; **fotos em lote** pelo código no nome do arquivo
- Pesquisa por código em **colunas**: turbina nova, reman, montada, conjunto central e similares, cada uma com o saldo na frente
- Código da peça mostrado inteiro (com ponto, traço ou letras) e copiável com um clique
- Estoque por filial e por local; status ativo/inativo
- Vínculos entre produtos: turbo **montado faturado pelo conjunto**, **par do biturbo**, conjunto e substituição, lidos das observações do cadastro da empresa (`produtos_completos.csv`)
- Ficha de catálogo (Master Power): especificações, referências cruzadas e aplicações
- Filtros num botão só, com a etiqueta do filtro ligado ao lado da busca

### 📊 Estoque e Movimentações
- Entrada, saída e transferência entre filiais, inclusive em lote, com natureza, local externo e observação
- Movimentação rápida com o atalho **N**
- Histórico com minimapa por dia; estornos escondidos por padrão
- Inventário por sessões, com progresso real, motivo da diferença e folha de contagem
- Comparação de estoques e perfis de estoque

### 📱 Celular como leitor
O celular lê o QR code da tela, fica pareado com o computador e passa a funcionar como leitor de código de barras (pela câmera), em três modos:
- **Inventário:** conta direto na sessão aberta, e a tela do computador acompanha na hora
- **Contagem:** mostra o saldo por filial e soma numa lista
- **NF-e:** lê a chave da nota

Lê a etiqueta certa da caixa (Garrett, Holset, BorgWarner), aceita **−1 / +1** ou a quantidade digitada, e permite digitar o código quando a etiqueta não lê.

### 🧾 Nota fiscal (NF-e)
- Entrada e saída pela chave da nota ou pela foto da DANFE, com download da SEFAZ pelo certificado A1
- Vários CNPJs da empresa salvos; o Chronos usa o da nota sozinho
- Produto desativado aparece na nota com "Reativar"; dá para cadastrar produto novo ali mesmo
- Etiqueta de expedição depois da baixa, com perfis (inclusive "Crua") e modelo meia folha A4
- Aviso de remessa entre matriz e filial pronto para enviar no WhatsApp

### 🤖 Assistente de IA
- Responde perguntas como "temos turbina 4031196?", "turbina do scania 440?" ou pedidos com vários códigos
- A **busca direta no banco responde**; a IA (plano gratuito do Groq; Gemini e Ollama opcionais) só interpreta o código, o veículo, o motor e o ano
- Entende hífen, sufixo, OEM, nova/reman e até código e veículo **falados por extenso** ("cinco quatro meia...", "scania quatrocentos e quarenta")
- Conhecimento do especialista ("A é igual/similar/diferente de B"), com "Para revisar", "Exemplos aprovados" e histórico
- **Perguntas do dia:** a IA escolhe 5 dúvidas por dia e pergunta ao especialista, no app ou no WhatsApp
- O conhecimento chega sozinho às outras máquinas pela base oficial e vai junto em cada backup
- Foto da plaqueta no chat

Detalhes em [`docs/ASSISTENTE_IA.md`](docs/ASSISTENTE_IA.md).

### 💬 WhatsApp
- **Modo copiloto:** só responde quando alguém da equipe reage com 🤖 na mensagem do cliente; nunca responde sozinho
- Revisão antes de enviar (`/enviar`, `/descartar`), com o saldo conferido de novo antes do envio
- Entende áudio, foto e texto juntos; atendimentos separados por conversa (`/atendimentos`, `/encerrar`)
- Comandos para ensinar e consultar: `/perguntar`, `/igual`, `/similar`, `/diferente`, `/pesquisar`, `/aprovar`, `/recusar`, `/perguntas`, `/ensinar`, `/pendentes`, `/resumo`
- Status do robô na barra de cima (ponto que bate e aviso de pergunta nova)
- O Chronos fica perto do relógio do Windows ao fechar a janela, para o robô continuar ligado

### 📈 Painel e Relatórios
- Painel **Centro de comando**: estoque girando, lento e parado; "Pede ação hoje"; faixa ao vivo das últimas movimentações; gráfico de entradas e saídas
- Relatórios em PDF, com miniatura da folha e os números ao lado
- Etiquetas de estoque e de expedição (NF-e) com código de barras/QR

### 🎨 Aparência
- Tema claro e escuro, com 8 paletas (Azul-petróleo, Grafite, Esmeralda, Oficina, Violeta, Turbo, Oceano, Cyber) e "Minha cor"
- Menu de vidro, colorido ou neon; fundo com manchas, malha viva ou partículas; vários estilos de canto
- Animações em três níveis (Completo, Suave e Nenhum, para os PCs mais fracos)

### 🛠️ Operação
- Abas no topo (**Alt+1**, **Alt+2**...) e menu da engrenagem em grupos
- Busca rápida (**Ctrl+K**) com prévia da foto e saldo por filial
- Importação (planilha, catálogo Master Power, cadastro da empresa, fotos em lote) e exportação em Excel
- Backup local com cópia automática e "Voltar uma cópia"
- **Base oficial:** um computador principal publica a base e os outros baixam pelo servidor dele na rede (porta 8765, com senha)
- O Chronos se religa sozinho se o serviço parar e abre mesmo com a porta 8000 ocupada

### 🔐 Proteção de dados
- Produto com movimentações não pode ser excluído (a tela oferece inativar)
- Trava no banco contra saldo negativo
- Pegar a base da principal avisa antes de apagar o que só este computador tem
- Cópia de segurança antes de cada atualização

---

## 🧠 Stack Tecnológica

| Camada | Tecnologia | Pasta |
|---|---|---|
| Regras de negócio | Python 3.12 | `app/services`, `app/models` |
| Banco | SQLite | `core/database` |
| API local | FastAPI + Uvicorn | `backend/app` |
| Telas | React 19 + TypeScript + Vite 7 + Mantine 9 + Motion + TanStack Query | `frontend/src` |
| Desktop | Tauri 2 (Rust) | `frontend/src-tauri` |
| Empacotamento | PyInstaller (sidecar) | `build_backend.ps1` |
| Assistente | Groq (gratuito), Gemini/Ollama opcionais, neonize (WhatsApp) | `app/services` |
| Publicação | GitHub Actions + GitHub Releases + Tauri Updater | `.github/workflows` |

---

# 🏗️ Arquitetura

- O app Tauri inicia o backend Python empacotado (sidecar).
- A API escuta em `127.0.0.1:8000` (ou outra porta livre), fechada para a rede. Só o leitor do celular pareado entra pela rede.
- O servidor da base oficial (porta 8765) é opcional e só existe no computador principal.
- Mapa do código em [`docs/PROJECT_MAP.md`](docs/PROJECT_MAP.md); rotas em [`docs/API_DOCS.md`](docs/API_DOCS.md); estado do projeto em [`docs/CONTEXTO.md`](docs/CONTEXTO.md).

## 💾 Persistência

Banco e configurações ficam em:

```
%APPDATA%\Chronos Inventory
```

Para desenvolvimento e testes, a variável `CHRONOS_APP_DIR` aponta o app para outra pasta. **Nunca use o banco original da empresa: trabalhe sempre numa cópia.**

---

# 🚀 Instalação (Usuário Final)

Baixe o instalador `.msi` em **[Releases](https://github.com/yBlackH4t/ChronosInventory/releases/latest)** e execute normalmente. Depois disso o próprio Chronos procura atualização ao abrir e a cada hora, baixa escondido e instala ao fechar (ou em "Reiniciar agora").

Em Configurações > Este computador > **Canal de atualização**:
- **Estável** (padrão): recebe só a versão liberada para todos.
- **Teste**: recebe cada versão nova antes dos outros, para conferir.

---

# 👨‍💻 Desenvolvimento

## 🔧 Requisitos

- Windows 10/11
- Python 3.12
- Node 22 e npm
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

# 🖥️ Build e Publicação

## Build local

```powershell
cd frontend
npm run build:app
```

Esse comando gera o sidecar do backend (`build_backend.ps1`, que também roda o autodiagnóstico do assistente), roda o `release:doctor` e cria o instalador `.msi` em `frontend/src-tauri/target/release/bundle/msi/`.

## Publicar uma versão (automático)

1. O PR **não mexe no número da versão nem no `CHANGELOG.md`**. Ele deixa um arquivo em [`novidades/`](novidades/README.md) com o que mudou. PR só de documentos ou testes não precisa do arquivo e não gera versão.
2. No merge na `main`, o fluxo **Publicar** (`publicar.yml`) escolhe o número, escreve o `CHANGELOG.md`, cria a tag e publica a versão como pré-lançamento, só para o **canal Teste**.
3. Conferido no PC de teste: GitHub > Actions > **Liberar para todos**. Os PCs do canal Estável instalam em até 1 hora.
4. Deu problema: Actions > **Voltar versão** com o número da versão boa. Todos voltam em até 1 hora.

Ninguém cria tag à mão. Passo a passo e caminho manual de emergência em [`README_RELEASE.md`](README_RELEASE.md).

---

# 📁 Estrutura do Projeto

```
app/                 regras de negócio (services, models)
core/                banco, catálogo e utilitários
backend/app/         API FastAPI
backend/tests/       testes (pytest)
frontend/src/        telas React
frontend/src-tauri/  app desktop (Tauri 2)
novidades/           o que cada PR mudou (vira o CHANGELOG no merge)
scripts/             verificações, publicação e avaliação do assistente
docs/                documentação
```

---

# 🔐 Segurança e Privacidade

- API só em localhost; pela rede entram só o celular pareado e o servidor da base oficial (com senha)
- Dados ficam nas máquinas da empresa
- Sem telemetria
- O assistente usa a internet só para a IA (Groq) e o WhatsApp; a busca direta funciona offline
- Chaves e senhas ficam fora do git (`assistente_config.json`, `official_base_config.json`)
- O histórico exportado não leva telefones, e os logs do WhatsApp mascaram os números

---

# 📌 Roadmap

- [x] Relatórios PDF
- [x] Base oficial compartilhada entre máquinas
- [x] Assistente de IA e WhatsApp em modo copiloto
- [x] NF-e por código de barras e etiqueta de expedição
- [x] Celular como leitor (inventário, contagem e NF-e)
- [x] Publicação automática com canal de teste e "Voltar versão"
- [ ] Usuários e login no app
- [ ] WhatsApp do número da empresa (decidir: não oficial × API oficial da Meta)
- [ ] Endereço da peça no galpão (QR por palete/área)
