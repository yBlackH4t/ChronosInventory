# ⏳ Chronos Inventory

> Sistema desktop moderno de gestão de estoque local, rápido, offline-first e com atualização automática.

![Python](https://img.shields.io/badge/Python-3.12-blue)
![FastAPI](https://img.shields.io/badge/FastAPI-Backend-009688)
![React](https://img.shields.io/badge/React-Frontend-61DAFB)
![Tauri](https://img.shields.io/badge/Tauri-Desktop-FFC131)
![Windows](https://img.shields.io/badge/Windows-10|11-0078D6)
![Version](https://img.shields.io/badge/version-1.0.0-green)

---

## 🎯 Sobre o Projeto

O **Chronos Inventory** é um aplicativo desktop para controle de estoque empresarial, desenvolvido para operar **100% offline**, com **alta performance local** e **distribuição simples via instalador Windows**.

Ideal para empresas que precisam de:

- ⚡ Velocidade (SQLite local)
- 🔌 Funcionamento sem internet
- 🔄 Atualizações automáticas
- 🖥️ Experiência nativa desktop
- 🧩 Arquitetura moderna e escalável

---

## ✨ Funcionalidades

### 📦 Gestão de Produtos
- Cadastro e edição
- Múltiplas imagens por produto
- Imagem principal
- Controle por filial
- Descrição dos produtos

### 📊 Estoque & Movimentações
- Entrada
- Saída
- Transferência entre filiais
- Histórico completo

### 📈 Analytics
- Dashboard com indicadores
- Relatórios rápidos
- Visão geral do estoque

### 🛠️ Operacional
- Importação/Exportação
- Backup local
- Recuperação automática
- Atualização automática (auto-update)

---

## 🧠 Stack Tecnológica

| Camada | Tecnologia |
|-----------|------------------------------|
| Backend | Python + FastAPI + SQLite |
| Frontend | React + TypeScript + Vite |
| Desktop | Tauri v1 |
| Empacotamento | PyInstaller (sidecar) |
| Updater | GitHub Releases + Tauri Updater |

---

# 🏗️ Arquitetura

## API
- Local-only → `127.0.0.1`
- Offline-first
- Backend sidecar isolado

---

## 💾 Persistência

Local do banco:

```
%APPDATA%\Chronos Inventory
```
---

# 🚀 Instalação (Usuário Final)

Baixe o instalador na aba:

👉 **Releases → .msi**

Execute normalmente.  
As próximas versões serão atualizadas automaticamente.

---

# 👨‍💻 Desenvolvimento

## 🔧 Requisitos

- Windows 10/11
- Python 3.12
- Node 20+
- Rust (toolchain estável)
- Visual Studio Build Tools (C++)
- Git

---

## Backend

```powershell
python -m venv .venv312
.\.venv312\Scripts\Activate.ps1
pip install -r backend\requirements.txt
pip install -r backend\requirements-dev.txt
pytest -q
```

---

## Frontend

```powershell
cd frontend
npm ci
npm run build
```

---

# 🖥️ Build Desktop

## Gerar sidecar do backend

```powershell
.\build_backend.ps1
```

## Gerar instalador MSI

```powershell
cd frontend
npm run build:app
```

Saída:
```
*.msi
```
---

# 📁 Estrutura do Projeto

```
backend/
app/
core/
frontend/
frontend/src-tauri/
docs/
```

---

# 🔐 Segurança

- API apenas localhost
- Sem exposição externa
- Dados locais
- Sem dependência de nuvem
- Sem telemetria

---

# 📌 Roadmap

- [ ] Relatórios PDF
- [ ] Controle de usuários
- [ ] Sincronização opcional
- [ ] Integração fiscal

---
