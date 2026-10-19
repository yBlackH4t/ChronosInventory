import dayjs from "dayjs";
import { describe, expect, it } from "vitest";

import { detectBrand, detectCondition } from "./brands";
import {
  applyMovementToProduct,
  brandTitle,
  flashKindFor,
  locationColumns,
  monthTicks,
  splitProductCode,
  versionTitle,
} from "./productView";

const split = (nome: string) => splitProductCode(nome, detectBrand(nome));

describe("splitProductCode", () => {
  it("tira o código da peça nos formatos da empresa", () => {
    expect(split("TURBINA GARRETT GT1749S 715924-0002")).toEqual({ code: "715924-0002", rest: "TURBINA GT1749S" });
    expect(split("CONJUNTO CENTRAL GT2556S 754127-0003S").code).toBe("754127-0003S");
    expect(split("CONJUNTO CENTRAL BV39 5439 710 0522")).toEqual({ code: "5439 710 0522", rest: "CONJUNTO CENTRAL BV39" });
    expect(split("TURBINA HOLSET HX55W 4031196")).toEqual({ code: "4031196", rest: "TURBINA HX55W" });
    expect(split("CONJUNTO CENTRAL B1G 11559880005").code).toBe("11559880005");
    expect(split("TURBO K27 53279907101/7210 REMAN").code).toBe("53279907101/7210");
    expect(split("1000-010-114 GT1852V KIT").code).toBe("1000-010-114");
  });

  it("não confunde modelo com código", () => {
    expect(split("CONJUNTO CENTRAL B2UV-63A 12009097000")).toEqual({
      code: "12009097000",
      rest: "CONJUNTO CENTRAL B2UV-63A",
    });
    expect(split("KIT REPARO TURBO GT20")).toEqual({ code: null, rest: "KIT REPARO TURBO GT20" });
  });

  it("arruma separadores que sobram", () => {
    expect(split("TURBO HX40W - 4038989")).toEqual({ code: "4038989", rest: "TURBO HX40W" });
    expect(split("TURBO HE200WG - 3799431 / 3785294")).toEqual({ code: "3799431", rest: "TURBO HE200WG / 3785294" });
  });
});

describe("rótulos", () => {
  it("marca e versão em texto simples", () => {
    expect(brandTitle(detectBrand("TURBINA BORGWARNER K16 80000175064"))).toBe("BorgWarner");
    expect(brandTitle(null)).toBeNull();
    expect(versionTitle(detectCondition("TURBINA GARRETT GT1749V 729041-9009"))).toBe("Reman");
    expect(versionTitle(detectCondition("TURBO HX35 (MONTADA)"))).toBe("Montada");
  });

  it("cor do saldo que pisca segue o tipo", () => {
    expect(flashKindFor("ENTRADA")).toBe("entrada");
    expect(flashKindFor("SAIDA")).toBe("saida");
    expect(flashKindFor("TRANSFERENCIA")).toBe("transferencia");
  });
});

describe("locationColumns", () => {
  const totals = [
    { location_id: 1, total: 312 },
    { location_id: 2, total: 0 },
  ];

  it("sem os totais ainda, mostra todas", () => {
    expect(locationColumns([1, 2], null)).toEqual({ ids: [1, 2], onlyLocationId: null });
  });

  it("filial sem saldo some; se sobra uma só, fica só o saldo", () => {
    expect(locationColumns([1, 2], totals)).toEqual({ ids: [], onlyLocationId: 1 });
    expect(locationColumns([1, 2, 3], [...totals, { location_id: 3, total: 4 }])).toEqual({
      ids: [1, 3],
      onlyLocationId: null,
    });
  });

  it("um saldo na página mantém a coluna (totais podem estar atrasados)", () => {
    expect(locationColumns([1, 2], totals, [{ inventories: { 2: 1 } }]).ids).toEqual([1, 2]);
  });
});

describe("applyMovementToProduct", () => {
  const product = { inventories: { 1: 3, 2: 0 }, total_stock: 3 };

  it("entrada, saída e transferência", () => {
    expect(applyMovementToProduct(product, { tipo: "ENTRADA", quantidade: 2, destino_location_id: 1 }).total_stock).toBe(5);
    expect(applyMovementToProduct(product, { tipo: "SAIDA", quantidade: 1, origem_location_id: 1 }).total_stock).toBe(2);
    const moved = applyMovementToProduct(product, {
      tipo: "TRANSFERENCIA",
      quantidade: 2,
      origem_location_id: 1,
      destino_location_id: 2,
    });
    expect(moved.inventories).toEqual({ 1: 1, 2: 2 });
    expect(moved.total_stock).toBe(3);
  });

  it("nunca fica negativo e não muda o original", () => {
    expect(applyMovementToProduct(product, { tipo: "SAIDA", quantidade: 9, origem_location_id: 1 }).total_stock).toBe(0);
    expect(product.total_stock).toBe(3);
  });
});

describe("monthTicks", () => {
  it("um rótulo por mês, no dia 1", () => {
    const ticks = monthTicks(dayjs("2026-04-22").valueOf(), dayjs("2026-10-19").valueOf());
    expect(ticks.map((t) => dayjs(t).format("YYYY-MM-DD"))).toEqual([
      "2026-05-01",
      "2026-06-01",
      "2026-07-01",
      "2026-08-01",
      "2026-09-01",
      "2026-10-01",
    ]);
  });

  it("intervalo inválido não gera rótulos", () => {
    expect(monthTicks(10, 5)).toEqual([]);
    expect(monthTicks(Number.NaN, 5)).toEqual([]);
  });
});
