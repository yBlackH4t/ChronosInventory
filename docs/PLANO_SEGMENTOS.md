# Plano — Chronos para qualquer tipo de estoque (segmentos)

Como o mesmo app passa a servir para turbinas, casa, fazenda, loja ou almoxarifado, sem virar
outro programa. Ainda não há código; vem **depois** da fase de estabilidade e do login
(`docs/PLANO_USUARIOS.md`). Escrito em 2026-10-11. Relacionado: `docs/CONTEXTO.md`.

---

## 1. Ideia

O Chronos já é um gestor de estoque genérico por baixo: os locais de estoque são livres desde a
versão 2.0 (migração `migration_v2_0_0_white_label.py`). O que é "de turbina" fica em cima disso
e vira **opcional por segmento**. Um app só, um código só, um instalador só.

## 2. Escolha do segmento no primeiro uso

A tela de boas-vindas (`/setup`, que hoje pede o primeiro local de estoque) passa a perguntar
antes: **"Que tipo de estoque?"**

| Segmento | Liga |
|---|---|
| Turbinas e autopeças | catálogo de turbinas, assistente com códigos Garrett e busca por veículo/motor |
| Casa | código de barras de mercado, validade, unidades (kg, L) |
| Fazenda | unidades, lotes, validade de insumos, locais como galpão e silo |
| Loja / mercadinho | código de barras de mercado, validade, unidades |
| Outro | só o básico; o resto o usuário liga nas Configurações |

O segmento só **liga e desliga módulos** e ajusta os textos ("peça" × "produto"). Dá para mudar
depois em Configurações. Com o login (plano de usuários), só o dono muda.

## 3. O que é de turbina e vira opcional

| Parte | Hoje | Por segmento |
|---|---|---|
| Catálogo de turbinas | vem no instalador (`core/catalog/data/catalogo_bundle.db.gz`, 0,85 MB) | continua no instalador (é pequeno e funciona offline), mas só é **ativado** no segmento de turbinas |
| Assistente de IA | códigos Garrett, motor e veículo | a busca por código e por nome vale para todos; a parte de veículo/motor e o formato Garrett ficam no segmento de turbinas |
| Textos | "peça", "aplicação" | ajustados pelo segmento |

## 4. Mudanças de verdade

### 4.1 Unidade de medida e quantidade com decimais

- **Hoje:** `quantidade INTEGER` no banco (`core/database/connection.py`, tabelas de estoque e
  movimentações) e `int` nos schemas (`backend/app/schemas/product.py`).
- **Precisa:** cada produto com uma **unidade** (un, kg, g, L, ml, saco, caixa...) e quantidade com
  casas decimais (1,5 kg; 200 L).
- **Cuidado:** mexe no coração do estoque. Usar inteiro em **milésimos** (1,5 kg = 1500) ou
  `NUMERIC` com arredondamento definido, nunca float, para não aparecer 0,30000000004. Migração
  com backup, conferindo totais antes e depois, e testes de todas as movimentações, inventário,
  relatórios e base oficial.

### 4.2 Validade e lotes

- **Hoje:** o estoque guarda só "quantos tenho" por local.
- **Precisa:** cada entrada pode virar um **lote** com data de validade (e número de lote,
  opcional). A saída sugere o lote que vence primeiro.
- **Telas:** "Vencendo nos próximos N dias" no Dashboard e aviso ao dar saída de um lote que não é
  o mais antigo.
- É a maior mudança: entrada, saída, transferência, inventário e relatórios passam a enxergar
  lotes. Para quem não usa validade (turbinas), tudo continua igual: um lote "geral" escondido.

### 4.3 Código de barras de mercado (EAN/GTIN)

O código de barras do mercado (EAN-13, como `7891234567890`) é **só um número**, registrado pela
marca na GS1. Para saber que é "extrato de tomate da marca X", alguém tem que consultar uma base de
dados.

Fluxo:
1. O usuário bipa (leitor USB ou o scanner do celular que o app já tem).
2. O app procura o número **no banco local**. Se conhece, faz +1 (entrada) ou −1 (saída).
3. Se não conhece, **consulta uma base online** e preenche nome, marca e foto:
   - **Open Food Facts:** gratuita e aberta, boa para alimentos, com produtos brasileiros;
   - **Cosmos (Bluesoft):** base brasileira bem completa; o uso maior é pago.
4. O usuário confirma e o produto fica salvo. Daí em diante funciona **offline**.

O que falta no app:
- campo `codigo_barras` no produto, único, com índice, aceitando mais de um código por produto
  (embalagens diferentes);
- o leitor de hoje entende a etiqueta própria (`CI-123`) e códigos de peça
  (`frontend/src/components/inventory/inventoryCollector.ts`, `BatchMovementModal.tsx`); passa a
  entender EAN-8, EAN-13 e UPC (com o dígito verificador conferido);
- a consulta é feita pelo **backend** (a CSP das telas só deixa falar com a API local), com tempo
  limite e funcionando mesmo sem internet (aí só não preenche nada);
- "modo bipar": tela em que cada bipe já soma ou subtrai, para encher a despensa rápido.

## 5. Ordem de implementação

| Ordem | Entrega | Tamanho |
|---|---|---|
| 1 | Segmento no primeiro uso; catálogo e assistente de turbina opcionais; textos por segmento | pequeno |
| 2 | Campo de código de barras, "modo bipar" e consulta ao Open Food Facts | pequeno a médio |
| 3 | Unidades de medida e quantidade com decimais (migração do banco) | médio |
| 4 | Validade e lotes, com alerta de vencimento | grande |

Cada item sai numa versão própria, testado numa cópia do banco. **Nada disso pode mudar o
funcionamento para quem usa turbinas.**

## 6. Modo "Casa" (uso próprio, não venda)

Ideia do dono (2026-10-11): em casa ninguém vai ao computador dar baixa num extrato de tomate. O
uso é **no celular, na cozinha, pela rede de casa**, sem nada exposto na internet.

### 6.1 O que muda em relação ao comercial

| | Turbinas (comercial) | Casa (uso próprio) |
|---|---|---|
| Igual | cadastro, entrada, saída, locais, bipar, histórico | igual |
| Dashboard | saídas, filiais, perto de zerar para vender | **vencendo**, **abertos há muitos dias**, **acabando**, lista de compras |
| Etiquetas | peça e expedição (NF-e) | nenhuma, ou "aberto em dd/mm" |
| Transferência | entre filiais | "mover" simples (despensa → geladeira), opcional |
| Escondidos | — | NF-e, etiquetas de expedição, base oficial, relatórios de venda |

### 6.2 Estados de cada item

Não é só entrada e saída: cada unidade passa por estados.

```
 Entrada (compra chegou)
      │
      ▼
 [Fechado, na despensa] ──bipe──► [Aberto / em uso] ──bipe──► [Acabou]
                                   conta os dias aberto         (vai para a lista de compras
                                   e avisa ("aberto há 4 dias")   se ficar abaixo do mínimo)
                                          │
                                          └──► [Descartado] (venceu ou estragou: mostra o desperdício)
```

- **Bipe inteligente:** um bipe só, e o app sugere a ação pelo estado. Se há um fechado e nenhum
  aberto, sugere "Abrir?". Se já há um aberto, sugere "Acabou?". Um toque confirma, para quase
  nunca precisar escolher.
- **Modos:** "Compras" (todo bipe é entrada, para guardar as compras rápido) e "Cozinha" (bipe
  é abrir ou acabar).
- **Validade depois de aberto:** por produto ("extrato aberto: 3 dias na geladeira"), usada no
  aviso.
- **Lista de compras automática:** o que acabou e ficou abaixo do mínimo.

### 6.3 O app do celular

- **Só na rede de casa:** o celular fala com o Chronos do computador pelo Wi-Fi. Nada na internet.
- **Câmera exige cuidado:** navegadores só liberam a câmera ao vivo em HTTPS (ou `localhost`). Por
  `http://192.168...` ela é bloqueada. Caminhos:
  1. **App Android feito com o Tauri 2**, que já gera apps de celular reaproveitando as telas
     React. Um app instalado usa a câmera sem precisar de HTTPS. **Recomendado.**
  2. Página web com HTTPS local (certificado próprio instalado no celular): funciona, mas é
     chato de configurar em cada aparelho.
- **Pareamento:** o celular pareia com o computador por QR code e usa o login do plano de usuários.
- Funciona offline dentro de casa (o computador é o "servidor").

### 6.4 Aparelho fixo na cozinha

Em vez de criar hardware, usar um aparelho pronto num suporte, sempre ligado em modo "Cozinha":

| Opção | Como | Custo |
|---|---|---|
| **Celular ou tablet Android antigo** num suporte | o próprio app (6.3) em tela cheia; a câmera bipa; o app **fala** a pergunta ("Abrir ou acabou?") e aceita toque ou voz | quase zero. **Recomendado** |
| Leitor de código USB/Bluetooth + tablet | bipe mais rápido que câmera | o preço de um leitor simples |
| Alexa / Echo | **não serve bem:** a Alexa não lê código de barras e depende da nuvem da Amazon, o contrário de "só na rede de casa" | — |

### 6.5 Achado no scanner atual (vale também para turbinas)

A página do scanner de celular (`backend/app/api/routers/scanner.py`) carrega o leitor
`html5-qrcode` de `unpkg.com` **sem versão fixa** e usa a câmera por HTTP na rede local. Então:
- precisa de internet no celular, e uma versão nova ou alterada do pacote entra sem aviso. O
  certo é embutir o arquivo no app, com versão fixa;
- a câmera ao vivo provavelmente é bloqueada pelo navegador (HTTP), sobrando o modo de tirar foto.
  **Conferir num celular no teste da empresa.**

Isso entra na fase de estabilidade e segurança, antes do modo Casa.

## 7. Decisões em aberto (para o dono)

1. Um instalador só para todos, ou uma edição "Turbinas" e uma "Geral" com o mesmo código?
2. Consultar o Open Food Facts automaticamente, ou só quando o usuário apertar "buscar"? Consultar
   manda o número do código de barras para fora da máquina.
3. Precisa de lotes sem validade (rastrear lote de fabricação), ou só validade?
4. O nome do produto continua "Chronos Inventory" para todos os segmentos?
5. Modo Casa: o computador fica sempre ligado como "servidor" da casa, ou o próprio celular
   guarda o estoque (aí o app de celular teria banco próprio)?

## 8. Quando

Depois de:
1. lançar a 2.4.0;
2. a fase de estabilidade e segurança;
3. o login de usuários (`docs/PLANO_USUARIOS.md`).

Assim a versão para outros segmentos já nasce com usuários e segurança.
