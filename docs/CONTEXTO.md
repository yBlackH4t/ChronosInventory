# Chronos Inventory — comece por aqui

Contexto completo para retomar o trabalho numa conversa nova (Projeto no Claude Desktop ou
Claude Code), em qualquer máquina. Atualizado em 2026-10-10. Os detalhes do assistente de IA
estão em `docs/ASSISTENTE_IA.md`.

---

## 1. O projeto

App desktop de estoque para Windows, **offline-first**, de uma distribuidora de turbinas
(**Garrett, Holset e BorgWarner**) com mais de uma filial e mais de uma máquina.

| Camada | Tecnologia | Pasta |
|---|---|---|
| Regras de negócio | Python 3.12 | `app/services`, `app/models` |
| Banco | SQLite | `core/database` |
| API local (porta 8000, só na própria máquina) | FastAPI | `backend/app` |
| Telas | React + TypeScript + Mantine + TanStack Query | `frontend/src` |
| Desktop e instalador | Tauri, com o backend empacotado (PyInstaller) | `frontend/src-tauri`, `build_backend.ps1` |

- **Versão em uso na empresa:** 2.3.0 (branch `main`).
- **Base oficial:** uma máquina "publica a base" e as outras "consomem", por uma pasta
  compartilhada ou pelo servidor local da publicadora (porta 8765).
- Mapa do código em `docs/PROJECT_MAP.md`; rotas em `docs/API_DOCS.md`.

## 2. Como trabalhamos

- **Só o Claude**, desde 2026-10-10. O Antigravity, que fazia as telas, está pausado; o Claude
  agora faz backend e telas. O `docs/HANDOFF.md` virou histórico.
- O dono fala português do Brasil, **não quer custos** (o assistente usa o plano gratuito do
  Groq) e prefere passos curtos com os comandos prontos para colar.
- Trabalho na branch **`feature/assistente-ia`**. **O merge na `main` é só do dono.**

## 3. Branches

| Branch | O que tem | Para quê |
|---|---|---|
| `main` | versão 2.3.0 | o que está instalado na empresa |
| **`feature/assistente-ia`** | **tudo**: a `main` + assistente de IA + proteção de dados + telas novas | trabalhar, testar e virar a 2.4.0 |
| `claude/protecao-dados` | só a proteção de dados (1 commit sobre a `main`) | opcional: uma 2.3.1 antes da 2.4.0 |
| `ag/operacao-e-atalhos`, `ag/assistente-chat` | trabalho do Antigravity | histórico: já estão dentro da `feature/assistente-ia` |
| `feature/migracao-banco-dados` | igual à `main` | histórico |

Na máquina de casa existe a pasta `ChronosInventory-ag` (cópia de trabalho do Antigravity).
Pode ser apagada quando o dono quiser, com `git worktree remove ..\ChronosInventory-ag`.

## 4. O que já foi feito

**Até a 2.3.0 (na `main`):** interface nova com abas e busca rápida (Ctrl+K); catálogo de
referências externas vinculado aos produtos e embutido no instalador; API fechada para a rede
(sem túnel público); movimentação e transferência em massa; vínculos entre produtos; etiquetas.

**Assistente de IA** (detalhes em `docs/ASSISTENTE_IA.md`):
- responde "temos turbina 4031196?", "turbina do scania 440?" e "temos essa daí?" pelo
  estoque. A **busca direta responde primeiro**; a IA gratuita (Groq) só entra quando a busca
  não entende a pergunta. Na avaliação com o Groq real, acertou 17 de 17;
- **códigos no formato da empresa**: só números (`53279887101`); Garrett com hífen
  (`796155-5002`);
- **conhecimento do especialista**: só o admin ensina ("A é igual/similar/diferente de B").
  Inclui a lista "Para revisar" (códigos perguntados que não temos) e o histórico com correção;
- o conhecimento **vai sozinho para as outras máquinas**, pela pasta compartilhada ou pelo
  servidor local;
- **WhatsApp em modo copiloto**: só responde quando alguém da equipe reage com 🤖 na mensagem
  do cliente. Entende áudio e foto da plaqueta, responde citando a mensagem e tem os comandos
  `/ensinar`, `/pendentes` e `/resumo` na "Mensagem para mim". Testado num celular com WhatsApp
  comum;
- **foto da plaqueta** também no chat do app;
- **resumo diário** na "Mensagem para mim": produtos que zeraram, os que mais saíram e o que
  perguntaram e não temos;
- o backend empacotado se testa sozinho no build (`--diagnostico-assistente`).

**Proteção de dados:** produto com movimentações não pode ser excluído (a tela oferece
inativar), e o servidor local pode ter senha, a mesma em todas as máquinas.

**Operação** (telas do Antigravity): atalho **N** para movimentação rápida no produto sob o
mouse ou selecionado; busca rápida com o saldo por filial; cartão do chat que abre o produto;
indicador do conhecimento no topo; peças relacionadas no catálogo com o estoque.

**Conferido em 2026-10-10 na `feature/assistente-ia`:**
- versões consistentes, 186 testes, Ruff, 21 testes de tela, build e lint sem erros (depois
  dos PRs #4, #5 e #6 das conversas do Projeto);
- telas do assistente no tema claro e no escuro;
- "Salvar configuração" da Base oficial funcionando no app.

## 5. O que vamos fazer

1. **Testar na empresa numa cópia do banco** (`docs/ASSISTENTE_IA.md`, seção 6). Vai ser o
   primeiro teste com os dados reais, e esta versão cria tabelas novas no banco.
2. Testar o conhecimento chegando numa segunda máquina.
3. ✅ **Instalador testado** (2026-10-11, na Área Restrita do Windows): o instalador com a CSP
   e o backend em pasta (PRs #4 e #5) funcionou. Falta só o **scanner do celular**, que a Área
   Restrita não deixa testar: conferir no computador real junto com o passo 1.
   Para gerar o instalador local: venv com `py -3.12` (o `python` do PATH desta máquina é o
   3.14 de 32 bits, que não instala as dependências) e
   `npx tauri build --bundles msi --config <json com "createUpdaterArtifacts": false>`, porque a
   chave de assinatura só existe no GitHub. Não commitar o `estoque_backend.spec` que o build
   reescreve com caminhos locais.
4. **Versão 2.4.0:**
   - rodar `frontend/scripts/bump_version.ps1 2.4.0`;
   - escrever a seção `## [2.4.0]` do `CHANGELOG.md` (é o texto de "Novidades da versão") e
     rodar `npm run changelog:sync`;
   - o dono junta na `main` e cria a tag `v2.4.0`. **A tag publica a atualização para todas
     as máquinas**, pela GitHub Release (`.github/workflows/release.yml`).

Depois (decisão do dono em 2026-10-11: **estabilidade e segurança primeiro**, uma coisa por versão):
- **usuários, login e papéis**: desenho em `docs/PLANO_USUARIOS.md` (local agora, preparado para
  a matriz); é a próxima grande tarefa e a base da criptografia do banco;
- criptografia: BitLocker nas máquinas e backups/base oficial criptografados; depois SQLCipher com
  a chave trancada pelas senhas (seção 7 do plano de usuários);
- estabilidade (auditoria P1/P2): porta 8000 fixa, estoque negativo barrado no banco, testes da
  busca por código;
- **scanner do celular**: a página carrega o `html5-qrcode` de `unpkg.com` sem versão fixa (embutir
  no app) e usa a câmera por HTTP na rede local, que os navegadores costumam bloquear. Conferir
  num celular no teste da empresa (`docs/PLANO_SEGMENTOS.md`, seção 6.5);
- juntar as perguntas reais do chefe na avaliação (`scripts/assistente_casos.json`);
- decidir o WhatsApp do número da empresa: não oficial (risco de bloqueio) ou oficial da Meta.

Futuro (não agora):
- servidor central para a matriz ver as 12 filiais (seção 5 do plano de usuários);
- o mesmo app para qualquer estoque (casa, fazenda, loja): segmento no primeiro uso, código de
  barras de mercado, unidades com decimais, validade e lotes (`docs/PLANO_SEGMENTOS.md`).

## 6. Regras e cuidados

- **Nunca use o `estoque.db` original da empresa:** sempre uma cópia, com `CHRONOS_APP_DIR`.
- **Nunca peça nem mostre chaves de API.** A do Groq fica em `assistente_config.json`, fora do git.
- **Não arraste a pasta inteira do projeto para o Projeto do Claude Desktop.** Ela tem arquivos
  fora do git de propósito: `assistente_config.json`, `estoque.db`, `official_base_config.json`
  (senha do servidor) e `backend/logs/`.
- `docs/API_DOCS.md` está em **cp1252**: leia e grave nessa codificação.
- O histórico exportado (JSONL) não leva o telefone de quem perguntou, e os logs do WhatsApp
  mascaram os números.
- Os testes (`pytest`) usam pastas temporárias e não mexem nos arquivos do projeto.

## 7. Verificações (as mesmas da CI)

```powershell
python scripts/check_versions.py
python -m pytest -q
cd frontend; npm ci; npm run build; npm run lint
```

## 8. Documentos

| Arquivo | Conteúdo |
|---|---|
| `docs/ASSISTENTE_IA.md` | assistente: estado, como funciona, onde está cada coisa, teste no banco real |
| `docs/PLANO_IA.md` | plano e decisões do assistente, fase por fase |
| `docs/PLANO_USUARIOS.md` | desenho de usuários, login e papéis (local e, no futuro, matriz) |
| `docs/PLANO_SEGMENTOS.md` | o app para qualquer tipo de estoque: segmentos, código de barras, unidades, validade |
| `docs/TESTE_ASSISTENTE.md` | roteiro de teste do assistente |
| `docs/API_DOCS.md` | rotas da API (cp1252) |
| `docs/PROJECT_MAP.md` | mapa do código |
| `docs/AUDITORIA_BACKEND_2026-10.md` | auditoria do backend e o que já foi resolvido |
| `docs/HANDOFF.md` | histórico da coordenação com o Antigravity e dos contratos de API |

## 9. Primeira mensagem numa conversa nova

> Leia `CLAUDE.md`, `docs/CONTEXTO.md` e `docs/ASSISTENTE_IA.md` e me diga onde paramos e qual
> o próximo passo.
