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
- `GET /produtos/{id}`
- `POST /produtos`
- `PUT /produtos/{id}`
- `PATCH /produtos/{id}`
- `DELETE /produtos/{id}`
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

### Endpoints legados mantidos
- `GET /analytics/top-saidas`
- `GET /analytics/estoque-distribuicao`
- `GET /analytics/entradas-saidas`
- `GET /analytics/estoque-evolucao`
- `GET /analytics/top-sem-mov`

## Backup / Import / Export / Relatorios
- `POST /backup/criar`
- `POST /backup/restaurar` (501)
- `POST /import/excel`
- `POST /export/produtos` (stream `.xlsx`)
- `POST /relatorios/estoque.pdf` (stream `.pdf`)

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
