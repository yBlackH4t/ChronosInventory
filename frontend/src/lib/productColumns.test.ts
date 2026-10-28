import { describe, expect, it } from "vitest";

import type { InventoryLocation, Product, ProductColumnItem } from "./api";
import { columnStock, itemTitle, looksLikeCode, stockPlace, totalSaidas } from "./productColumns";

const product = (over: Partial<Product> = {}): Product => ({
  id: 1,
  nome: "TURBINA HOLSET HX55W 4031196",
  inventories: {},
  total_stock: 0,
  linked_count: 0,
  ...over,
});

const item = (over: Partial<ProductColumnItem> = {}): ProductColumnItem => ({
  produto: product(),
  relacao: "exato",
  ...over,
});

const CANOAS: InventoryLocation = { id: 11, name: "CANOAS", label: "Canoas", ativo: true };
const PF: InventoryLocation = { id: 12, name: "PF", label: "Passo Fundo", ativo: true };

describe("looksLikeCode", () => {
  it("abre colunas para um código só", () => {
    for (const code of ["4031196", "466646-5041S", "HX40W", "5439.710.0522", "1000-020-112"]) {
      expect(looksLikeCode(code)).toBe(true);
    }
  });

  it("deixa texto, #ID e código curto na lista", () => {
    for (const text of ["", "403", "turbo hx40", "#4775", "CONJUNTO", "4031196 4031195"]) {
      expect(looksLikeCode(text)).toBe(false);
    }
  });
});

describe("contas da coluna", () => {
  it("soma saldo e saídas", () => {
    const column = {
      chave: "nova" as const,
      titulo: "Turbina nova",
      itens: [item({ produto: product({ total_stock: 2 }) }), item({ produto: product({ total_stock: 3 }) })],
    };
    expect(columnStock(column)).toBe(5);
    expect(totalSaidas([0, 1, 0, 2])).toBe(3);
    expect(totalSaidas(undefined)).toBe(0);
  });
});

describe("stockPlace", () => {
  it("diz a filial quando o saldo está numa só", () => {
    expect(stockPlace(item({ produto: product({ inventories: { 11: 2 } }) }), [CANOAS, PF])).toBe("em Canoas");
    expect(stockPlace(item(), [CANOAS])).toBe("em Canoas");
    expect(stockPlace(item({ produto: product({ inventories: { 11: 1, 12: 1 } }) }), [CANOAS, PF])).toBe("em estoque");
    expect(stockPlace(item(), [CANOAS, PF])).toBe("em estoque");
  });
});

describe("itemTitle", () => {
  it("a montada mostra o turbo; o saldo é do conjunto", () => {
    const montada = item({
      produto: product({ nome: "CONJUNTO CENTRAL - 4032382" }),
      relacao: "montada_no_conjunto",
      turbo_nome: "TURBO HOLSET HX55W - 4031196RX",
    });
    expect(itemTitle(montada)).toBe("TURBO HOLSET HX55W - 4031196RX");
    expect(itemTitle(item())).toBe("TURBINA HOLSET HX55W 4031196");
  });
});
