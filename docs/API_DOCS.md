# API Docs

## Base URL
- Local-only: `http://127.0.0.1:8000`
- Porta por `PORT` (default `8000`).

## Contrato de Resposta
Sucesso:
```json
{ "data": { ... }, "meta": { ... } }
```
Erro:
```json
{ "error": { "code": "...", "message": "...", "details": ... } }
```

## Observabilidade
- Header `X-Request-ID` em todas as respostas.
- Logs com `request_id`, metodo, path, status e tempo.

## PUT vs PATCH
- `PUT /produtos/{id}`: replace completo (`nome`, `qtd_canoas`, `qtd_pf`, `observacao`).
- `PATCH /produtos/{id}`: update parcial (ex.: apenas `observacao`).

## Produtos
- `GET /produtos?query=&page=&page_size=&sort=`
- `GET /produtos/resumo-visual?ids=1,2,3` (2.5.0, ate 100 ids)
  - por produto: `thumb_base64` (miniatura JPEG da foto principal ou null) e `saidas_semanas` (13 semanas, da mais antiga para a atual)
- `GET /produtos/{id}`
- `POST /produtos`
- `PUT /produtos/{id}`
- `PATCH /produtos/{id}`
- `DELETE /produtos/{id}` - so produto sem historico alem do estoque inicial do cadastro (`CADASTRO_INICIAL`). Com outras movimentacoes: 400 `validation_error` pedindo para inativar (o historico nao e apagado).
- `GET /produtos/{id}/historico`

Paginação (`/produtos`):
```json
{
  "page": 1,
  "page_size": 20,
  "total_items": 123,
  "total_pages": 7,
  "has_next": true
}
```

Observacao sobre IDs:
- ID de banco **nao e renumerado**.
- Coluna `#` da UI e apenas posicao da linha na pagina.

## Imagens de Produto (multiplas)
### Estrategia de storage
- Tabela dedicada `product_images` no SQLite.
- Maximo `5` imagens por produto.
- Uma imagem principal (`is_primary = 1`).
- Migracao automatica da imagem legada (`produtos.imagem`) para `product_images` no startup.

### Endpoints
- `GET /produtos/{id}/imagem` (compat legado: retorna imagem principal em base64)
- `POST /produtos/{id}/imagem` (compat legado: substitui imagem principal via multipart `file`)
- `GET /produtos/{id}/imagens` (lista imagens com base64 + metadata)
- `POST /produtos/{id}/imagens` (upload multiplo via multipart `files`)
- `PATCH /produtos/{id}/imagens/{image_id}/principal`
- `DELETE /produtos/{id}/imagens/{image_id}`

Validacoes:
- tipos: `image/jpeg`, `image/png`, `image/webp`
- limite por arquivo: `5MB`

## Movimentacoes
- `POST /movimentacoes`
- `GET /movimentacoes`

Regras:
- `ENTRADA`: exige `destino`
- `SAIDA`: exige `origem` e valida estoque
- `TRANSFERENCIA`: exige `origem` e `destino` diferentes

## Dashboard e Analytics
### Dashboard
- `GET /dashboard/resumo` (compat)

### Analytics novos (otimizados)
- `GET /analytics/stock/summary`
  - `total_canoas`, `total_pf`, `total_geral`, `zerados`
- `GET /analytics/stock/distribution`
  - distribuicao por local com percentual
- `GET /analytics/movements/top-saidas?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD&scope=CANOAS|PF|AMBOS&limit=5`
  - considera somente `SAIDA` (ignora `TRANSFERENCIA`)
- `GET /analytics/movements/timeseries?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD&scope=CANOAS|PF|AMBOS&bucket=day|week|month`
  - serie temporal de `SAIDA`
- `GET /analytics/movements/flow?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD&scope=CANOAS|PF|AMBOS&bucket=day|week|month`
  - entradas vs saidas
- `GET /analytics/stock/evolution?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD&bucket=day|week|month`
  - evolucao de estoque total
- `GET /analytics/products/inactive?days=30&date_to=YYYY-MM-DD&limit=5`
  - top itens sem movimentacao
- `GET /analytics/products/stockout-risk?days=30&max_dias=15&location_id=&limit=5`
  - itens com saldo que zeram em ate `max_dias` no ritmo de venda real (`SAIDA` normal) dos ultimos `days` dias
  - retorna `estoque_atual`, `total_saida` e `dias_cobertura`, do mais urgente para o menos
- `GET /analytics/stock/items?days=90&date_to=YYYY-MM-DD&location_id=` (2.5.0)
  - um item por produto com saldo: `estoque`, `ultima_saida`, `dias_sem_saida` e `saidas_periodo` (saida normal, sem ajuste/estorno); base da "Saude do estoque"
- `GET /analytics/movements/by-nature?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD&tipo=SAIDA|ENTRADA&location_id=` (2.5.0)
  - quantidade e numero de movimentacoes por natureza no periodo
- `GET /analytics/products/{id}/stock-history?days=180&date_to=YYYY-MM-DD` (2.5.0)
  - saldo total do produto no inicio, em cada dia com mudanca e hoje (nunca negativo)

### Endpoints legados mantidos
- `GET /analytics/top-saidas`
- `GET /analytics/estoque-distribuicao`
- `GET /analytics/entradas-saidas`
- `GET /analytics/estoque-evolucao`
- `GET /analytics/top-sem-mov`

## Baixa por NF-e (codigo de barras do DANFE)
- O codigo de barras do DANFE e a chave de acesso (44 digitos). O app procura o XML autorizado dessa chave nas pastas configuradas (e subpastas): primeiro pelo nome do arquivo, depois pelo comeco do conteudo.
- `GET /nfe/config` / `PUT /nfe/config` `{pastas_xml: [..]}` (ate 10). Padrao: `C:\nQuestorEmp\NFe\Geradas` e `C:\nQuestorEmp\NFe\Distribuicao`. Fica em `nfe_config.json` na pasta do app (por maquina, fora do banco).
- `GET /nfe/{chave}`: cabecalho da nota (`numero`, `serie`, `tipo_sugerido` SAIDA/ENTRADA pelo `tpNF`, `destinatario`, `autorizada`, `cancelada` se houver o evento 110111 na pasta, `ja_baixada`) e `itens` com `produto_sugerido`, `confianca` (`aprendido` | `codigo` | `duvida` | `nenhum`) e `candidatos` (com `estoque` por local). 400 se a chave for invalida; 404 se o XML nao estiver nas pastas.
- `POST /nfe/{chave}/baixa` `{tipo, location_id, itens: [{item, produto_id, quantidade, ignorar?}], natureza?, local_externo?, motivo_ajuste?, observacao?}`: todos os itens da nota, numa transacao. `natureza` e `OPERACAO_NORMAL` (padrao), `TRANSFERENCIA_EXTERNA` (exige `local_externo`) ou `AJUSTE` (exige `motivo_ajuste`). Movimentacoes com `documento` "NF <numero>" e `observacao` informada ou "NF-e <numero> serie <serie> - <outra parte>". O preview traz `movimento_sugerido` por tipo (`natureza`, `local_externo`, `observacao`): outra parte com a mesma raiz de CNPJ do `cnpj_loja` vem como transferencia externa. Recusa (400) nota cancelada, sem autorizacao ou ja baixada (tabela `nfe_baixas`); se todas as movimentacoes da nota foram estornadas, ela fica livre de novo. Item com `ignorar: true` (ex.: casco, nao e estoque) nao movimenta e fica lembrado em `nfe_itens_ignorados` (CNPJ do emitente + codigo; o preview traz `ignorar` em cada item); pelo menos um item precisa ser lancado. Guarda `nfe_item_vinculos` (CNPJ do emitente + codigo do item -> produto) para sugerir na proxima nota.
- Nota que nao esta nas pastas (ex.: de fornecedor): com o certificado A1 configurado, o app baixa o XML na SEFAZ (NFeDistribuicaoDFe, consulta pela chave, como o CNPJ desta loja; so consulta, nao registra ciencia) e guarda em `nfe_xml/` na pasta do app. Nota recebida pelo `cnpj_loja` vem com `tipo_sugerido` ENTRADA. Respostas da SEFAZ viram mensagens (so resumo = falta a ciencia da operacao; 656 = esperar 1 hora).
- `PUT /nfe/config` aceita tambem `cnpj_loja`. `PUT /nfe/certificado` `{arquivo, senha}`: confere o .pfx, guarda uma copia (`nfe_certificado.pfx`) e a senha protegida pelo DPAPI do Windows; `GET /nfe/config` devolve so `certificado: {titular, cnpj, validade}`. `DELETE /nfe/certificado` remove.
- O leitor do celular (`POST /api/scanner/barcode`) mostra "NF-e <numero>" no historico; a tela abre a conferencia da nota em qualquer aba. Sem https (pagina aberta pelo IP) a camera ao vivo e bloqueada pelo navegador, entao a pagina le o codigo de uma foto.

## Backup / Import / Export / Relatorios
- `POST /backup/criar`
- `GET /backup/segunda-pasta` / `PUT /backup/segunda-pasta` `{pasta}`: pasta em outro disco, pendrive ou rede que recebe uma copia de cada backup (subpasta `Chronos Inventory - <computador>`). `""` desliga. Devolve `pasta`, `destino`, `ativo`, `ultima_copia`, `ultimo_erro`, `arquivos`. Config desta maquina (`backup_segunda_pasta.json`), fora do banco.
- `POST /backup/restaurar` (501)
- `POST /backup/recuperar-fotos` `{backup_name}`: copia as fotos do backup so para produtos hoje sem foto (mesmo id e nome, ou nome unico); o resto do banco nao muda. Devolve `produtos_recuperados`, `fotos_copiadas`, `produtos_ja_com_foto`, `produtos_nao_encontrados` e `safety_backup`.
- `POST /backup/base-oficial/aplicar` e `/backup/base-oficial-servidor/aplicar`: depois de trocar o banco, devolvem as fotos desta maquina aos produtos que ficaram sem foto (`fotos_mantidas`, `produtos_com_fotos_mantidas`).
- `POST /import/excel`
- `POST /export/produtos` (stream `.xlsx`)
- `POST /relatorios/estoque.pdf` (stream `.pdf`)

### Base oficial: senha do servidor local (porta 8765)
- `PUT /backup/base-oficial/config` aceita `server_token` (min. 6 caracteres; `null` mantem, `""` remove). A mesma senha em todas as maquinas. `GET /backup/base-oficial/status` devolve so `server_token_set: bool` (a senha nunca volta).
- Com senha, o servidor exige o cabecalho `X-Chronos-Senha` em `/official/*`, `/compare/*` (e `/knowledge` do assistente); sem ele responde 401. `/health` continua aberto e informa `senha_exigida` e `senha_ok`. As buscas desta maquina mandam a senha sozinhas; senha diferente vira uma mensagem explicando o que configurar.
- Sem senha configurada, o servidor continua aberto como antes.

## Assistente de IA
Plano e regras em `docs/PLANO_IA.md`. Provedor padrao: Groq (plano gratuito). A busca direta (sem IA) responde primeiro quando entende a pergunta (codigo, veiculo/motor, "essa dai"); a IA so entra quando ela nao entende. Sem IA disponivel, responde pela busca direta.
- `POST /assistente/chat` - body `{ "mensagem": str (1-1000), "historico": [{ "papel": "usuario"|"assistente", "texto": str }] }`.
  Resposta `{ resposta, produtos: [{ id, nome, categoria, estoque_total, estoque_por_local }], ferramentas_usadas, modo: "ia"|"busca_direta", aviso: str|null }`.
  O backend nao guarda conversa: a tela envia o historico a cada pergunta. Nao retorna 503. `modo` = `busca_direta` com `aviso` null e o caso normal (a busca direta entendeu); com `aviso`, a IA falhou e a busca direta respondeu no lugar.
- `GET /assistente/config` - `{ provedor, configurado, origem_chave, chave_mascarada, modelo, esforco, provedores: [{ id, nome, gratuito, precisa_chave, configurado, origem_chave, chave_mascarada, modelo }] }`.
  Os campos do nivel de cima sao do provedor atual. Nunca devolve chaves.
- `PUT /assistente/config` - body parcial `{ provedor?: "groq"|"gemini"|"ollama"|"anthropic"|"nenhum", api_key?, modelo?, esforco?: "low"|"medium"|"high"|"xhigh"|"max" }`.
  `api_key` e `modelo` valem para o `provedor` enviado (ou o atual). `api_key: ""` remove a chave; `modelo: ""` volta ao padrao.
  A configuracao fica em `assistente_config.json` na pasta do app (fora do banco e dos backups).
- `POST /assistente/chat` aceita tambem `canal` (`app` | `whatsapp`, padrao `app`) e `autor` (ex.: numero do WhatsApp). Cada conversa vai para o historico do assistente.
- `POST /assistente/chat/foto` - multipart: `foto` (arquivo de imagem), `mensagem?` (texto junto), `historico?` (JSON da lista de mensagens). Le os codigos da plaqueta (Groq, modelo com visao) e responde como o chat; a resposta traz `leitura_foto` (ex.: "Foto da plaqueta: 466646-5041S"). Foto ilegivel ou sem chave: `422 foto_ilegivel` com a explicacao.

### Admin do assistente (maquina publicadora + senha)
Rotas marcadas com (admin) exigem o header `X-Admin-Token` (devolvido pelo login) e a maquina configurada como publicadora da base oficial; sem isso: `403 admin_necessario`.
- `GET /assistente/admin/status` - `{ maquina_publicadora, senha_definida, autenticado }`.
- `POST /assistente/admin/senha` - `{ senha_nova (6+), senha_atual? }`. A atual e exigida quando ja existe senha. Trocar a senha encerra as sessoes.
- `POST /assistente/admin/login` - `{ senha }` -> `{ token, expira_em }` (sessao de 8 h, some quando o backend reinicia).
- `POST /assistente/admin/logout`.

### Base de conhecimento do especialista
- `GET /assistente/conhecimento?busca=&limite=&offset=` - regras `{ id, codigo_a, codigo_b, tipo: igual|similar|diferente, observacao, criado_em, atualizado_em }`. Leitura livre.
- `POST /assistente/conhecimento` (admin) - `{ codigo_a, codigo_b, tipo, observacao? }`. Mesmo par de novo atualiza a regra. Tira os dois codigos da lista "Para revisar".
- `DELETE /assistente/conhecimento/{id}` (admin).
- `GET /assistente/conhecimento/sincronizacao` - conhecimento entre as maquinas (Fase 2c): `{ papel: publisher|consumer, configurado: bool (tem pasta/servidor para publicar ou receber; sem isso o `erro` so diz o que configurar), fonte: "servidor"|"pasta"|"servidor e pasta"|null, publicado_em, maquina, total_regras, atualizado_em, verificado_em, erro }`. Publicadora: para onde publicou. Outras: de onde e quando receberam. `erro` explica o que configurar.
- `POST /assistente/conhecimento/sincronizar` - "Sincronizar agora": a publicadora publica de novo; as outras baixam a versao publicada (mesma resposta do GET). Sem admin.
- A publicadora publica sozinha depois de cada regra criada, excluida ou aprovada, ao abrir o backend e a cada 10 min; as outras recebem ao abrir o backend e a cada 10 min. Arquivo `conhecimento_assistente.json` na pasta da base oficial (`latest/`) e na rota `GET /knowledge` do servidor local (porta 8765), que tambem passou a informar `knowledge_available` em `/health`.

### Revisao e historico
- `GET /assistente/revisao` (admin) - codigos pesquisados sem estoque ainda nao revisados: `{ codigo, vezes, ultima_vez, exemplo, conversas, conhecimento: [{codigo, relacao, obs}], sugestoes: [{codigo, produto_id, nome, estoque_total, motivo}] }`.
- `POST /assistente/revisao/{codigo}/concluir` (admin) - tira o codigo da lista (volta se for perguntado de novo).
- `GET /assistente/historico?limite=&offset=` (admin) - conversas, da mais nova para a mais antiga.
- `PUT /assistente/historico/{id}/correcao` (admin) - `{ resposta_correta, observacao? }`.
- `GET /assistente/historico/exportar` (admin) - arquivo JSONL (uma conversa por linha, sem o autor).

### Propostas (/ensinar pelo WhatsApp)
- `GET /assistente/propostas?status=pendente|aprovada|recusada|todas` (admin) - `{ id, criado_em, autor, codigo_a, codigo_b, tipo, observacao, status, decidido_em }`.
- `POST /assistente/propostas/{id}/aprovar` (admin) - vira regra da base de conhecimento (devolve a regra). 404 se nao estiver pendente.
- `POST /assistente/propostas/{id}/recusar` (admin).

### Resumo diario (Mensagem para mim)
- `GET /assistente/resumo` - `{ texto, ativo, hora, ultimo_envio }`: o resumo de hoje (zeraram desde ontem, mais sairam em 7 dias, perguntaram e nao temos em 7 dias) e a configuracao.
- `PUT /assistente/resumo` (admin) - `{ ativo?, hora? ("HH:MM") }`. Com o WhatsApp do app conectado, o resumo vai sozinho para a "Mensagem para mim" uma vez por dia, depois da hora. Comando `/resumo` manda na hora.

### WhatsApp (modo copiloto)
Todas (admin): o QR code conecta o WhatsApp da empresa ao Chronos.
- `GET /assistente/whatsapp/status` - `{ estado: parado|conectando|aguardando_qr|conectado|reconectando|desconectado|erro, qr, numero, erro, ativo }`. `qr` e o texto a desenhar como QR code (muda a cada ~20 s); so vem com `estado = aguardando_qr`.
- `POST /assistente/whatsapp/iniciar` - liga a ponte (mostra QR se ainda nao conectou). Fica ligada nas proximas aberturas do app.
- `POST /assistente/whatsapp/parar` - desliga a ponte (a conexao do aparelho continua salva).
- `POST /assistente/whatsapp/desconectar` - tira o Chronos dos aparelhos conectados e apaga a sessao (precisa de QR de novo).

## Indices SQLite relevantes
- `idx_produtos_nome`
- `idx_mov_produto`
- `idx_mov_data`
- `idx_mov_produto_data`
- `idx_mov_tipo_data`
- `idx_mov_tipo_origem_data`
- `idx_mov_tipo_destino_data`
- `idx_product_images_product`
- `idx_product_images_primary`

## Codigos de erro principais
- `validation_error`
- `insufficient_stock`
- `invalid_transfer`
- `not_found`
- `internal_error`
- `admin_necessario`
