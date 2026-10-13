# Plano — usuários, login e papéis

Desenho do login do Chronos: primeiro **local** (cada instalação), já preparado para o futuro com
a **matriz** (servidor central com as filiais). Ainda não há código; este documento é para revisar
antes. Escrito em 2026-10-11. Relacionados: `docs/CONTEXTO.md` e
`docs/AUDITORIA_BACKEND_2026-10.md` (P1 #1).

---

## 1. Objetivos

1. Saber **quem** fez cada coisa (movimentação, ajuste, regra ensinada).
2. Cada pessoa só faz o que o **papel** dela permite, conferido no **backend**, nunca só
   escondendo botões.
3. Ser a base da **criptografia do banco**: a senha destrava a chave (seção 7).
4. Crescer para a **matriz** sem refazer nada: os usuários locais de hoje viram usuários da
   organização amanhã.

## 2. Como é hoje

- Não há usuários: qualquer pessoa na frente do computador faz tudo.
- Só existe a **senha de admin do assistente**: hash PBKDF2-SHA256 (200 mil iterações) em
  `assistente_config.json`, sessão de 8 horas na memória do backend (cabeçalho `X-Admin-Token`),
  só na máquina que publica a base (`app/services/assistant_admin_service.py`).
- A primeira abertura passa pela tela `/setup` (`SetupPage.tsx` + `SetupGuard.tsx`), que pede o
  primeiro local de estoque.
- "Aplicar base oficial" **substitui o banco inteiro** da máquina (auditoria, P2 #13).

## 3. Papéis

| Papel | Pode | Na fase matriz |
|---|---|---|
| **Dono** | Tudo: usuários, configurações, base oficial, ensinar o assistente, apagar | vira **dono da organização** (todas as filiais) |
| **Gerente** | Movimentar, inventário, ajustes de estoque, relatórios, aprovar propostas do assistente | gerente **da filial dele** |
| **Operador** | Consultar, entradas, saídas e transferências do dia a dia, usar o assistente | operador **da filial dele** |

Regras:
- Sempre existe **pelo menos um dono ativo**. O sistema não deixa remover nem rebaixar o último.
- Permissões ficam numa tabela **papel → ações** no backend (`produtos.excluir`,
  `estoque.ajustar`, `usuarios.gerenciar`...). As telas só leem essa lista para esconder o que não
  pode, mas quem decide é o backend.

## 4. Fase local (agora)

### 4.1 Onde fica

No **banco local** (`estoque.db`; criptografado na fase da seção 7), em tabelas novas. Todos os
identificadores são **UUID**, não 1, 2, 3, para que 12 filiais possam se juntar um dia sem choque.

| Tabela | Campos principais |
|---|---|
| `organizacao` | `id` (UUID), `nome`, `criada_em`. Hoje sempre 1 linha |
| `filial` | `id` (UUID), `organizacao_id`, `nome`. Hoje 1 linha por instalação, ligada aos locais de estoque |
| `usuarios` | `id` (UUID), `organizacao_id`, `filial_id` (vazio = toda a organização), `nome`, `login`, `senha_hash`, `papel`, `ativo`, `criado_em`, `atualizado_em`, `trocar_senha` |
| `sessoes` | `token_hash`, `usuario_id`, `criada_em`, `expira_em`, `ultimo_uso` |
| `auditoria` | `id`, `usuario_id`, `acao`, `alvo`, `detalhes`, `quando` |

Mudanças em tabelas que já existem:
- `movimentacoes` ganha `usuario_id` (vazio nas antigas).
- A regra ensinada ao assistente e a aprovação de proposta guardam o `usuario_id`.

### 4.2 Senhas e sessões

- **Hash Argon2id** (padrão atual para senhas). Se a biblioteca não empacotar bem no
  PyInstaller, usar PBKDF2-SHA256 com 600 mil iterações, que já está provado no app.
- **Mínimo de 8 caracteres.** O dono pode marcar "trocar a senha no próximo login".
- **Tentativas erradas:** 5 seguidas travam aquele login por 5 minutos (registrado na auditoria).
- **Sessão:** token aleatório; o banco guarda só o **hash** do token. Expira com 12 horas sem uso
  e ao sair. Trocar a senha derruba as outras sessões daquele usuário.
- **Atalho do balcão:** "Trocar de usuário" rápido, sem fechar o app.

### 4.3 Primeiro uso (instalação nova)

A tela `/setup` passa a ter dois passos:
1. **Criar o dono:** nome, login e senha (duas vezes).
2. **Primeiro local de estoque** (como hoje).

Nada abre antes disso. Quem instala é o dono, como num roteador novo.

### 4.4 Atualização de uma instalação que já tem dados

Ao atualizar para a versão com login, as máquinas já têm estoque mas nenhum usuário:
- **Se a máquina já tem senha de admin do assistente:** a tela pede **essa senha** para criar o
  dono. Ela comprova que quem está ali é o dono de verdade.
- **Se não tem:** a tela "Criar o dono" aparece para quem abrir primeiro. Por isso, **o dono
  atualiza a máquina dele primeiro** e cria a conta antes de liberar o app para a equipe (escrever
  isso nas "Novidades da versão").
- As movimentações antigas ficam com `usuario_id` vazio ("antes do login").

### 4.5 Senha de admin do assistente

Deixa de existir separada: **"admin do assistente" = papel dono** (ou gerente, para aprovar
propostas). O `X-Admin-Token` vira a sessão normal. O `assistente_config.json` continua só com a
configuração da IA.

### 4.6 Esqueceu a senha

- **Operador ou gerente:** o dono redefine (fica `trocar_senha` = sim).
- **O dono:** usa o **código de recuperação**, mostrado uma vez na criação do dono, para imprimir
  e guardar. Com ele, define uma senha nova. **Sem o código e sem outro dono, não há como
  entrar.** Na seção 7 isso vira obrigatório, porque a mesma chave abre o banco.

### 4.7 Base oficial e usuários

Hoje "Aplicar base oficial" troca o banco inteiro. Com usuários no banco:
- **Os usuários, as sessões e a auditoria da máquina ficam preservados** ao aplicar a base. Elas
  são copiadas antes e devolvidas depois, ou ficam fora do que a base substitui.
- A base publicada **não leva** usuários nem hashes de senha de uma máquina para outra.
- A fase matriz (seção 5) é que vai distribuir usuários, com segurança.

### 4.8 API (rascunho)

| Rota | Quem | Faz |
|---|---|---|
| `GET /auth/estado` | todos | `{ tem_dono, logado, usuario, permissoes }` |
| `POST /auth/dono` | só sem dono | cria o dono (pede a senha do assistente, se existir) e devolve o código de recuperação |
| `POST /auth/login` / `POST /auth/sair` | todos | entra e sai |
| `POST /auth/trocar-senha` | logado | troca a própria senha |
| `POST /auth/recuperar` | todos | código de recuperação + senha nova |
| `GET/POST/PATCH /usuarios` | dono | listar, criar, mudar papel, ativar/desativar, redefinir senha |
| `GET /auditoria` | dono e gerente | quem fez o quê, com filtros |

Todas as outras rotas passam a exigir sessão, menos `/health` e a página do scanner do celular. O
scanner precisa de um cuidado próprio: o celular recebe um token de uso único do usuário logado no
computador.

## 5. Fase matriz (futuro)

```
 Matriz (dono da organização)
   │  cria a organização no servidor central
   │  gera um código de pareamento por filial (vale uma vez)
   ▼
 Servidor central (FastAPI + PostgreSQL) ── autoridade sobre usuários e papéis
   ▲  HTTPS só de saída, sem VPN
   │
 Filiais (app atual + SQLite)
   - pareadas com o código → recebem uma credencial da máquina (revogável)
   - recebem os usuários DA filial na sincronização
   - guardam cópia local dos logins para funcionar offline
```

1. **Organização:** o dono cria a organização no servidor central. O `organizacao.id` local passa
   a ser o do servidor.
2. **Pareamento:** a matriz gera "Filial Curitiba: 7KX-29P". Na filial, o app pede o código uma
   vez. A máquina passa a pertencer à organização, com uma **credencial de máquina** que a matriz
   revoga se o computador sumir.
3. **Usuários no centro:** a partir do pareamento, criar, mudar papel e bloquear se faz **na
   matriz**. A tela de usuários da filial vira "pedir à matriz" (ou o gerente da filial cria só
   operadores da própria filial, se o dono permitir).
4. **Login offline:** a filial guarda o hash das senhas dos usuários dela. Sem internet, o login
   funciona. Sem sincronizar há mais de **N dias** (sugestão: 7), pede conexão.
5. **Bloqueio:** vale na próxima sincronização da filial (em segundos, com internet).
6. **Quem manda:** o servidor **não confia** no papel que a filial diz ter. Cada envio é conferido
   com os papéis que o servidor guarda. Alterar o banco local só engana aquela máquina e nunca
   muda dados da organização.
7. **Importação:** na hora do pareamento, os usuários locais da filial sobem para o servidor (os
   UUIDs garantem que não colidem). Ninguém se recadastra; a matriz só confere os papéis.

## 6. Auditoria

Registrar sempre: login (certo e errado), criação ou mudança de usuário e de papel, ajuste de
estoque, exclusão e inativação de produto, aplicar e publicar base oficial, regra ensinada ou
aprovada no assistente, troca de configuração. A tela "Auditoria" mostra, filtra e exporta. Na
fase matriz, a auditoria também sobe para o centro.

## 7. Ligação com a criptografia do banco

- O banco é criptografado com uma **chave aleatória** (SQLCipher, AES-256).
- Essa chave fica guardada **trancada pela senha de cada usuário** (uma cópia trancada por
  usuário) e **pelo código de recuperação** do dono.
- No login, a senha destrava a chave e o app abre o banco. Sem senha nem código, o `estoque.db`
  copiado é ilegível.
- **Consequência:** o login acontece **antes** de abrir o banco. Então os dados mínimos para o
  login (usuários e cópias trancadas da chave) ficam num arquivo pequeno ao lado do banco.
- Detalhes num plano próprio, depois da fase local do login.

## 8. Decisões em aberto (para o dono)

1. Usar PIN curto (4–6 dígitos) para operadores no balcão, além da senha?
2. O gerente pode criar operadores, ou só o dono?
3. Tempo da sessão: 12 horas sem uso está bom?
4. Na fase matriz, quantos dias uma filial pode ficar sem sincronizar e ainda aceitar login?
5. Atualização (4.4): aceitar o risco do "quem abrir primeiro vira dono" nas máquinas sem senha do
   assistente, com o aviso nas Novidades?

## 9. Etapas de implementação

| Etapa | Entrega | Pronto quando |
|---|---|---|
| 1 | Tabelas (seção 4.1), hash, sessões, `/auth/*`, dono no `/setup`, atualização (4.4) | testes de login, bloqueio por tentativas, último dono protegido |
| 2 | Permissões em todas as rotas, `usuario_id` nas movimentações, tela de usuários | teste por papel em cada rota que grava |
| 3 | Auditoria e tela de auditoria; senha do assistente vira papel | ações da seção 6 registradas |
| 4 | Base oficial preservando usuários (4.7); scanner com token de uso único | aplicar base não apaga usuários |
| 5 | Criptografia do banco (seção 7), com plano próprio | `estoque.db` copiado não abre sem senha |
| — | Fase matriz (seção 5) | quando o servidor central existir |

Cada etapa sai numa versão própria, testada numa cópia do banco antes de lançar.
