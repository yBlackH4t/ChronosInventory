import { describe, expect, it } from "vitest";
import dayjs from "dayjs";

import { actionSummary, buildActionList, coverageLabel } from "./dashboardActions";
import { activityTimeLabel, robotStatus, rollingSum, share } from "./dashboardBento";
import { revealFor } from "./dashboardMotion";
import type { RecentStockoutItem, StockItemOverview, StockoutRiskItem } from "./api";

const stockout = (id: number, vendidos: number): RecentStockoutItem => ({
  produto_id: id,
  nome: `ZERADO ${id}`,
  total_saida_recente: vendidos,
});
const risk = (id: number, dias: number, estoque = 1): StockoutRiskItem => ({
  produto_id: id,
  nome: `RISCO ${id}`,
  estoque_atual: estoque,
  total_saida: 10,
  dias_cobertura: dias,
});
const parado = (id: number, estoque: number, dias: number | null): StockItemOverview => ({
  produto_id: id,
  nome: `PARADO ${id}`,
  estoque,
  ultima_saida: null,
  dias_sem_saida: dias,
  saidas_periodo: 0,
});

describe("buildActionList", () => {
  it("orders zerados (most sold first), then repor (fewest days), then parados", () => {
    const items = buildActionList({
      stockouts: [stockout(1, 2), stockout(2, 6)],
      risk: [risk(3, 9), risk(4, 2)],
      parados: [parado(5, 12, null), parado(6, 8, 200)],
    });
    expect(items.map((i) => [i.kind, i.produtoId])).toEqual([
      ["ZERADO", 2],
      ["ZERADO", 1],
      ["REPOR", 4],
      ["REPOR", 3],
      ["PARADO", 5],
      ["PARADO", 6],
    ]);
    expect(items[0].detail).toBe("Sem estoque, mas saíram 6 unidades em 30 dias");
    expect(items[2].detail).toBe("1 unidade em estoque, dura ~2 dias no ritmo de saída");
    expect(items[4].detail).toBe("12 unidades paradas, nunca saiu");
    expect(items[5].detail).toBe("8 unidades paradas, sem saída há 200 dias");
  });

  it("keeps room for parados when the urgent ones fill the list", () => {
    const items = buildActionList({
      stockouts: Array.from({ length: 6 }, (_, i) => stockout(i + 1, 10 - i)),
      risk: Array.from({ length: 6 }, (_, i) => risk(i + 20, i + 1)),
      parados: [parado(50, 9, null), parado(51, 7, null), parado(52, 5, null)],
      limit: 8,
    });
    expect(items).toHaveLength(8);
    expect(items.filter((i) => i.kind === "PARADO").map((i) => i.produtoId)).toEqual([50, 51]);
    expect(items.filter((i) => i.kind === "ZERADO")).toHaveLength(6);
  });

  it("fills the list with parados when there is little urgent work", () => {
    const items = buildActionList({
      stockouts: [],
      risk: [risk(1, 3)],
      parados: Array.from({ length: 10 }, (_, i) => parado(i + 10, 20 - i, null)),
      limit: 5,
    });
    expect(items.map((i) => i.kind)).toEqual(["REPOR", "PARADO", "PARADO", "PARADO", "PARADO"]);
  });

  it("shows a product only once", () => {
    const items = buildActionList({
      stockouts: [stockout(1, 3)],
      risk: [risk(1, 2)],
      parados: [parado(1, 4, null)],
    });
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("ZERADO");
  });

  it("writes the summary and coverage in Portuguese", () => {
    expect(actionSummary(0)).toBe("Nada pede ação hoje");
    expect(actionSummary(1)).toBe("1 item pede ação hoje");
    expect(actionSummary(4)).toBe("4 itens pedem ação hoje");
    expect(coverageLabel(0)).toBe("zera hoje");
    expect(coverageLabel(1)).toBe("dura ~1 dia");
  });
});

describe("dashboard bento helpers", () => {
  it("sums a rolling window", () => {
    expect(rollingSum([1, 2, 3, 4, 5], 3)).toEqual([1, 3, 6, 9, 12]);
  });

  it("labels activity times relative to today", () => {
    const now = dayjs("2026-10-19T15:00:00");
    expect(activityTimeLabel("2026-10-19T14:32:00", now)).toBe("hoje 14:32");
    expect(activityTimeLabel("2026-10-18T09:10:00", now)).toBe("ontem 09:10");
    expect(activityTimeLabel("2026-10-12T08:05:00", now)).toBe("12/10 08:05");
    expect(activityTimeLabel("lixo", now)).toBe("");
  });

  it("only pulses when the robot is connected", () => {
    expect(robotStatus("conectado", true)).toMatchObject({ tone: "success", pulse: true });
    expect(robotStatus("parado", false)).toMatchObject({ label: "Robô do WhatsApp desligado", pulse: false });
    expect(robotStatus("erro", true).tone).toBe("danger");
  });

  it("clamps shares", () => {
    expect(share(3, 4)).toBe(0.75);
    expect(share(1, 0)).toBe(0);
    expect(share(5, 4)).toBe(1);
  });
});

describe("revealFor (motion levels)", () => {
  it("does not animate at all on Nenhum", () => {
    for (const kind of ["grow-y", "grow-x", "draw", "slide", "fade"] as const) {
      expect(revealFor("nenhum", kind).initial).toBe(false);
    }
  });

  it("only fades on Suave", () => {
    for (const kind of ["grow-y", "grow-x", "draw", "slide", "fade"] as const) {
      expect(revealFor("suave", kind, 3).initial).toEqual({ opacity: 0 });
    }
  });

  it("grows, draws and slides on Completo, staggered by index", () => {
    expect(revealFor("completo", "grow-y").initial).toEqual({ scaleY: 0 });
    expect(revealFor("completo", "grow-x").initial).toEqual({ scaleX: 0 });
    expect(revealFor("completo", "draw").initial).toEqual({ pathLength: 0 });
    expect(revealFor("completo", "slide").initial).toEqual({ opacity: 0, y: -14 });
    expect(revealFor("completo", "grow-x", 2, 0.3).transition.delay).toBeCloseTo(0.46);
    expect(revealFor("completo", "grow-y", 100).transition.delay).toBeLessThanOrEqual(0.6);
  });
});
