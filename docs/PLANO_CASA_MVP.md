# Plano de execução — modo Casa, primeira versão (MVP)

Continuação da prova de conceito aprovada em 2026-10-11 (`mobile/README.md`). Desenho geral em
`docs/PLANO_SEGMENTOS.md`, seção 6. Este arquivo é o **passo a passo para executar**.

**Branch:** `claude/modo-casa`, a partir da `claude/poc-casa-android`. Não vai para a
`feature/assistente-ia` nem para a 2.4.0 até o dono decidir.

---

## 1. O que a primeira versão entrega

No celular, na rede de casa:
1. **Parear** o celular com o PC lendo um QR code na tela do Chronos (uma vez).
2. **Modo Compras:** bipa → entrada de 1 unidade. Produto novo: o app sugere nome e marca (Open
   Food Facts), você confirma e ele é cadastrado já com a entrada.
3. **Modo Cozinha:** bipa → o app sugere **Abrir** (há fechados e nenhum aberto) ou **Acabou** (já
   há um aberto); um toque confirma. Também dá para escolher **Descartar** (venceu ou estragou).
4. **Lista de compras:** produtos abaixo do estoque mínimo.
5. **Abertos há muitos dias:** lista com "aberto há N dias".

Fica **de fora** (versões seguintes): validade e lotes, kg/litros com decimais, Dashboard de casa no
computador, login de usuários, aparelho fixo falando as perguntas.

## 2. Regras de segurança

- Hoje a rota do scanner aceita **qualquer aparelho do Wi-Fi**. As rotas novas (`/api/casa/...`)
  **exigem um celular pareado**: cada celular recebe um token próprio. O PC guarda só o hash, e o
  token pode ser revogado no PC.
- **Código de pareamento:** aparece no QR, vale **5 minutos** e **uma vez só**, com limite de
  tentativas erradas.
- A trava de rede (`local_only_middleware`) passa a liberar também `/api/casa/`; todas as outras
  rotas continuam só no próprio computador.
- A consulta ao Open Food Facts sai **do PC**, e só manda o número do código de barras.

## 3. Banco de dados (só tabelas e colunas novas; nada muda para turbinas)

| Tabela ou coluna | Para quê |
|---|---|
| `produto_codigos_barras` (`codigo` único, `produto_id`) | um produto pode ter mais de um código (embalagens) |
| `produtos.estoque_minimo` (inteiro, padrão 0) | lista de compras: estoque abaixo disso entra na lista |
| `itens_abertos` (`produto_id`, `local_id`, `aberto_em`, `fechado_em`, `como`) | abertos e "há quantos dias"; `como` = acabou ou descartado |
| `dispositivos` (`id`, `nome`, `token_hash`, `criado_em`, `ultimo_uso`, `revogado_em`) | celulares pareados |

Movimentações reaproveitadas:
- Compras = `ENTRADA` normal.
- Acabou = `SAIDA` normal.
- Descartar = ajuste com motivo `PERDA` e observação "Descartado (casa)".
- **Abrir não mexe na quantidade:** o item continua no estoque, só fica marcado como aberto.

## 4. Etapas

| # | Entrega | Onde | Pronto quando |
|---|---|---|---|
| 1 | Tabelas novas (migração que só acrescenta), código de barras ligado ao produto | `core/database`, repositórios | testes de migração numa cópia do banco; nada muda para turbinas |
| 2 | Pareamento: `POST /api/casa/parear`, token por celular, trava de rede para `/api/casa/` | `backend/app/api/routers/casa.py`, `main.py` | testes: sem token = 401, código vencido ou usado = recusado, outras rotas continuam bloqueadas na rede |
| 3 | Bipe e ações: `POST /api/casa/bipe` (diz quem é o produto, o estado e a ação sugerida), `POST /api/casa/acao` (entrada, abrir, acabou, descartar) | serviço `casa_service.py` | testes de cada ação e do estoque resultante |
| 4 | Produto novo: `GET /api/casa/sugestao/{ean}` (Open Food Facts, 3 s de limite, funciona sem internet) e `POST /api/casa/produto` | serviço `ean_lookup_service.py` | testes com a consulta simulada, sem internet |
| 5 | Lista de compras e abertos: `GET /api/casa/lista`, `GET /api/casa/abertos`, estoque mínimo editável | rotas e tela de produto | testes |
| 6 | No computador: tela "Celulares" (QR de pareamento, lista, revogar) em Configurações | `frontend/src` | build e lint; QR aparece e o pareamento funciona |
| 7 | App do celular: ler o QR de pareamento, abas **Compras**, **Cozinha** e **Lista**, confirmação com um toque, cadastro de produto novo | `mobile/` | APK instalado no Galaxy A10s |
| 8 | Teste completo no celular com uma **cópia** do banco e a documentação (`mobile/README.md`, plano) | — | roteiro da seção 5 passa |

Cada etapa termina com: `pytest`, `ruff`, build e lint das telas, um commit e um push na branch.

## 5. Roteiro de teste final (no celular)

1. Parear o celular pelo QR do PC.
2. Modo Compras: bipar algo já cadastrado (+1); bipar uma maionese nova → nome sugerido → confirmar
   → cadastrada com 1 unidade.
3. Modo Cozinha: bipar a maionese → "Abrir?" → confirmar; bipar de novo → "Acabou?" → confirmar →
   estoque 0.
4. Estoque mínimo 1 → a maionese aparece na lista de compras.
5. Revogar o celular no PC → o próximo bipe é recusado.
6. Outro aparelho sem pareamento tenta `/api/casa/bipe` → recusado.

## 6. Decisões já tomadas (o dono pode mudar)

- Quantidade em **unidades inteiras** nesta versão.
- **Um local padrão** para a casa: o primeiro local de estoque; escolher local fica para depois.
- **Open Food Facts automático** quando o produto é novo (manda só o número do código).
- Descarte registrado como **ajuste com motivo PERDA**.
- Estoque mínimo **0** por padrão (não entra na lista até o dono definir).

## 7. Tamanho

Etapas 1 a 5 (backend): a maior parte. Etapa 6 (tela do PC): pequena. Etapa 7 (app): média.
Dá para seguir em sequência nesta conversa, etapa por etapa, com testes em cada uma.
