# Chronos Inventory — comece por aqui

Contexto completo para retomar o trabalho numa conversa nova (Projeto no Claude Desktop ou
Claude Code), em qualquer máquina. Atualizado em 2026-10-26. Os detalhes do assistente de IA
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

- **Base atual da main:** 2.7.9 (Painel, #40). Em PR: 2.7.7 (#39, lista de Produtos), 2.7.10 = montada (#41) + aba Produtos em colunas (#42, em cima da #41), as duas na mesma versão. Merge e tag só pelo dono.
- **Base oficial:** uma máquina "publica a base" e as outras "consomem", por uma pasta
  compartilhada ou pelo servidor local da publicadora (porta 8765).
- Mapa do código em `docs/PROJECT_MAP.md`; rotas em `docs/API_DOCS.md`.

## 2. Como trabalhamos

- **O Codex cuida do backend e das telas.** O Antigravity, que fazia as telas, está pausado; o Codex
  agora faz backend e telas. O `docs/HANDOFF.md` virou histórico.
- O dono fala português do Brasil, **não quer custos** (o assistente usa o plano gratuito do
  Groq) e prefere passos curtos com os comandos prontos para colar.
- Trabalho na branch **`feature/assistente-ia`**. **O merge na `main` é só do dono.**
- Correção de precisão do estoque da IA em `codex/ia-estoque-garrett`, criada a partir de
  `claude/project-thread-bwu9lo` (descendente da `feature/assistente-ia`). Foco atual: somente IA.

## 3. Branches

| Branch | O que tem | Para quê |
|---|---|---|
| `main` | versão 2.7.4 | base integrada para preparar a 2.7.5 |
| `codex/ia-estoque-garrett` | IA com pedidos completos e contexto revisado no WhatsApp, sobre a main 2.7.4 | revisão e homologação da 2.7.5, sem merge nem tag pelo agente |
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

**Primeiro teste no banco real (2026-10-13, na empresa, cópia em `C:\teste_assistente`):** o dono
achou o assistente "burro" em três pontos, corrigidos na branch `claude/project-thread-bwu9lo`
(a partir da `feature/assistente-ia`): "A é a mesma que B?" agora responde a relação e não o
estoque; o "Para revisar" só sugere com motivo (sem "mesmo início de código"); "Não serve" não
tira mais o código da lista. Respostas por veículo em duas linhas por opção (✅/❌). Análise do
banco real: `analise-estoque-db.md` na biblioteca do Projeto.

## 5. O que vamos fazer

- **2.7.5 em preparação (26/10):** evolução da IA na branch `codex/ia-estoque-garrett`,
  com a main 2.7.4 integrada e a base do Claude preservada. Pedidos estruturados (até 30 itens/60 consultas), alternativas
  sem somar saldos, versões e filial por item, exemplos aprovados e sincronizados pelo admin.
  WhatsApp mantém 🤖 e `/enviar`: atendimentos/rascunhos persistem em banco próprio, perguntas
  só aguardam cliente depois do envio, respostas citadas priorizam o atendimento, envio com falha
  preserva rascunho e saldo alterado exige nova revisão. Prazo configurável (20 min por padrão),
  `/atendimentos`, `/encerrar` e controles no app. Áudio não transcrito bloqueia resposta parcial.
  Na cópia isolada: `796155-5005` = 01; os quatro códigos são consultados; totais 3628 produtos,
  saldo 383 e 728 movimentos preservados, integridade OK/FK 0. Registro em
  `_comparacao/resultado/ia_2_7_5.txt`; reprodução com `python -m scripts.test_assistant_release`.
  Validação anterior à integração: 291 testes na bateria completa, 35 regressões específicas e 31
  testes do frontend; Ruff/versões/build OK, lint sem erros (5 avisos existentes).
  MSI local antigo em `frontend/src-tauri/target/release/bundle/msi/Chronos Inventory_2.5.5_x64_en-US.msi`;
  não corresponde à 2.7.5 e não deve ser publicado como esta versão.
  Executável/autodiagnóstico OK; os 16 módulos alterados da IA foram comparados com o fonte,
  inclusive o backend usado pelo empacotador. `estoque_backend.spec` local foi restaurado.
  O backend também foi extraído do MSI: 16 módulos conferidos e SHA-256 igual ao artefato aprovado.
  Próximo passo: homologar áudio real e continuidade no WhatsApp; usar primeiro
  `scripts/testar_ia_2_7_5.ps1` após gerar o executável 2.7.5 (cópia e configuração isoladas, porta 8000 livre).
  Próximo passo de entrega: repetir testes após a integração, commit, push e PR para a main.
  Sem instalação automática, merge do PR, tag ou publicação; homologação real fica com o dono.

- **Prioridade de IA (2026-10-23):** validar a correção do saldo Garrett no app instalado.
  Na cópia de 21/10, a consulta de `796155-5005` somava 1 unidade dela com 1 da `796155-5011`
  e mostrava 02. A expansão de família usava o prefixo `796155` como equivalência entre
  sufixos diferentes. Corrigido no código; a mesma cópia passou a responder 01, sem alterar
  saldos ou movimentações. A assinatura dos vínculos foi versionada para recalcular os índices
  e vínculos automáticos antigos na abertura, preservando vínculos manuais.
  Próximo passo: validar no app atualizado e evoluir a IA para interpretar pedidos completos,
  com vários itens, alternativas por "ou", códigos falados em partes e versões por item.
  Diagnóstico de 23/10: os limites atuais de três códigos descartam o quarto pedido;
  "796155 5005 ou 5006" não preserva as duas alternativas. O plano está em `docs/PLANO_IA.md`,
  seção "Pedidos completos e conhecimento atualizável". A implementação está em validação na 2.7.5.
  No WhatsApp, planejar também contexto por atendimento/item: uma pergunta só passa a aguardar
  o cliente após `/enviar`; continuações mantêm 🤖 e revisão. Encerramento, expiração e mudança
  de assunto deixam de aplicar o contexto antigo, preservando histórico e conhecimento.
  Detalhes na seção "WhatsApp: contexto por atendimento e envio aprovado" do mesmo plano.
  O banco original não foi usado.

- **2.7.4, Vidro suave em Inventário, Etiquetas, Relatórios e tabela de Produtos** (branch
   `claude/project-thread-oq7mai`, PR para a `main`): coluna "Código" em Produtos, anel de progresso
   e selos no Inventário, pílula e código em destaque nas Etiquetas, miniatura da folha nos
   Relatórios, correção do "Local #null" e do botão claro no Grafite escuro. Inclui também as
   microinterações (itens 2 a 22) no mesmo PR #36. A 2.7.3 (estornos, PR #35) já está na `main`;
   a tag `v2.7.4` cobre a 2.7.3 e a 2.7.2.
- **2.7.3, movimentações mais limpas** (branch `claude/project-thread-mswsxd`, PR para a `main`): a
   movimentação estornada e o estorno dela saem juntos da lista de Movimentações (chave "Mostrar
   estornados" mostra de novo). Nada é apagado; saldo, relatórios e histórico do produto iguais.
   A tag `v2.7.3` cobre a 2.7.2.
- **2.7.2, nota fiscal e etiquetas** (branch `claude/project-thread-dcq6wk`, PR para a `main`): a nota
   acha produtos desativados e reativa na tela, cadastra produto novo sem sair da nota, sugere pelo
   código da empresa (CD_MATERIAL = id), vários CNPJs salvos escolhidos sozinhos pela nota, e perfis
   de etiqueta de expedição com o perfil "Crua (sem marca)". A tag `v2.7.2` cobre a 2.7.1.
- **2.7.1, etiqueta da NF depois da baixa** (branch `claude/project-thread-j2dl6e`, PR #32 para a
   `main`): botão "Imprimir etiqueta" ao fim da saída por NF-e (e ao bipar uma nota já baixada),
   modelo "meia folha" em Etiquetas > Expedição (NF-e) > Layout, e a impressão do designer saindo
   no mesmo lugar do desenho. A 2.7.0 (PR #31) já está na `main` sem tag: a tag `v2.7.1` leva as
   duas, e a `v2.7.0` não deve ser criada.
- **2.7.0, cadastro da empresa** (2026-10-21, branch `claude/project-thread-7n35k7`, PR para a `main`):
   importa o `produtos_completos.csv` do sistema da loja em Backup > Catálogo (produtos que faltam com
   saldo zero + aplicações e similares como fichas "Cadastro da empresa") e deixa id e nome de cada
   produto iguais aos do sistema da loja (CD_MATERIAL), com lista "Para conferir" do que parece outra peça. Depois do merge: importar na
   máquina que publica a base e "Publicar base".
0. **2.5.5, correções da avaliação** (branch `claude/project-thread-vw3djm`, PR para a `main`):
   segurança do backend (Host/Origin na API, servidor da base oficial só com senha e bloqueio por
   IP, senhas e chaves de API protegidas com DPAPI, PIN para `/aprovar` com tela em Assistente >
   Admin, chave do A1 cifrada no temp, limites de download/upload), estoque inicial fora das
   entradas, contraste, acentos e textos, Node 22 e bibliotecas atualizadas. Falta o dono revisar,
   juntar e criar a tag. **Atenção ao atualizar:** a publicadora sem senha deixa de ligar o servidor
   até o dono definir uma senha (a mesma nas outras máquinas); `/aprovar` pelo WhatsApp só funciona
   depois de criar o PIN.
0. **Visual novo "Vidro suave"** (escolhido em 2026-10-18; plano e amostras no Projeto): 2.6.0,
   depois da 2.5.5. ✅ Passo "base nova" na branch `claude/vidro-suave-base` (a partir da
   `claude/project-thread-vw3djm`): tema petróleo, fonte Sora, vidro em todas as telas, fundo com
   manchas, animações com níveis Completo/Suave/Nenhum em Configurações > Aparência e Mantine 9.
   Próximo: redesenho tela a tela. Testar num PC fraco da empresa se o vidro pesa (se pesar,
   "Nenhum").
   ✅ 2.6.1, Painel em blocos: branch `claude/painel-bento` (a partir da `main` 2.6.0); os gráficos
   que saíram do Painel estão em Relatórios > Análises. Falta o dono revisar e juntar.
0. **2.5.0, novo visual** (branch `claude/project-thread-8wdsu2`, PR para a `main`): as 11 ideias
   do mockup que o dono aprovou. Falta o dono revisar, juntar e criar a tag. Conferir na cópia do
   banco real se a "Evolução do estoque" ficou sem saldo negativo.

1. ✅ **Testado na empresa numa cópia do banco** (2026-10-13): as tabelas novas foram criadas sem
   erro e as correções do teste entraram na `feature/assistente-ia`.
2. Testar o conhecimento chegando numa segunda máquina (falta; se falhar, o app não quebra).
3. ✅ **Instalador testado** (2026-10-11, na Área Restrita do Windows): o instalador com a CSP
   e o backend em pasta (PRs #4 e #5) funcionou. ✅ Scanner do celular conferido pelo dono na
   empresa em 2026-10-13.
   Para gerar o instalador local: venv com `py -3.12` (o `python` do PATH desta máquina é o
   3.14 de 32 bits, que não instala as dependências) e
   `npx tauri build --bundles msi --config <json com "createUpdaterArtifacts": false>`, porque a
   chave de assinatura só existe no GitHub. Não commitar o `estoque_backend.spec` que o build
   reescreve com caminhos locais.
4. **Versão 2.4.0:**
   - ✅ versão trocada para 2.4.0 e `## [2.4.0]` escrita no `CHANGELOG.md` (2026-10-13; o
     `bump_version.ps1` foi corrigido para o `package-lock` e o `tauri.conf.json` do Tauri 2);
   - **falta:** o dono junta a `feature/assistente-ia` na `main` (PR #2) e cria a tag `v2.4.0`.
     **A tag publica a atualização para todas as máquinas**, pela GitHub Release
     (`.github/workflows/release.yml`). Fazer backup do banco antes.

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
- o mesmo app para outros estoques de empresa (loja, fazenda): segmento no primeiro uso, código de
  barras de mercado, unidades com decimais, validade e lotes (`docs/PLANO_SEGMENTOS.md`).

**Estoque de casa virou um app separado (decisão do dono em 2026-10-11): o Chronos Home**
(`github.com/yBlackH4t/ChronosHome`, pasta `C:\Users\rafae\Documents\ChronosHome`), em Flutter e
com os dados no celular. Não fazer "modo Casa" dentro do Chronos Inventory: a empresa não deve ver
isso, e publicar o app de casa neste repositório faria as máquinas da empresa receberem a versão
de casa como atualização. As branches `claude/poc-casa-android` (prova de conceito em Tauri,
aprovada no celular) e `claude/modo-casa` ficam só como histórico.

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
