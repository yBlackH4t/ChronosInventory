import { describe, expect, it } from "vitest";

import { splitAnswerBlocks, splitCodes, tokenizeAnswerLine } from "./assistantAnswer";
import { nfeStepIndex, nfeStepStatus, stockAfter } from "./nfeSteps";
import { revealDelay, revealFor } from "./reveal";
import { SCAN_BEEP_KEY, beepTone, readBeepPreference, writeBeepPreference } from "./scanFeedback";

describe("revealFor", () => {
  it("nenhum: sem animação", () => {
    expect(revealFor("nenhum", 3)).toBeNull();
  });

  it("suave: só esmaece, sem deslocar", () => {
    const r = revealFor("suave", 2)!;
    expect(r.initial).toEqual({ opacity: 0 });
    expect(r.animate).toEqual({ opacity: 1 });
    expect(r.transition.delay).toBe(0.3);
  });

  it("completo: sobe um pouco, 150 ms entre um bloco e outro", () => {
    const r = revealFor("completo", 1)!;
    expect(r.initial.y).toBeGreaterThan(0);
    expect(r.animate.y).toBe(0);
    expect(r.transition.delay).toBe(0.15);
  });

  it("lista longa: os últimos entram juntos", () => {
    expect(revealDelay(0)).toBe(0);
    expect(revealDelay(8)).toBe(revealDelay(30));
    expect(revealDelay(-2)).toBe(0);
    expect(revealDelay(3, 0.05, 10)).toBe(0.15);
  });
});

describe("assistantAnswer", () => {
  it("destaca códigos de peça como etiqueta", () => {
    expect(splitCodes("Temos a 4031196 e a 796155-5002.", false)).toEqual([
      { text: "Temos a ", bold: false, code: false },
      { text: "4031196", bold: false, code: true },
      { text: " e a ", bold: false, code: false },
      { text: "796155-5002", bold: false, code: true },
      { text: ".", bold: false, code: false },
    ]);
  });

  it("não pega pedaço de modelo, ano nem quantidade", () => {
    for (const text of ["TURBO GARRETT GT4594", "MP530w", "A partir 2017", "temos 2 em Canoas", "13/10/2026"]) {
      expect(splitCodes(text, false).some((s) => s.code)).toBe(false);
    }
  });

  it("aceita Garrett com 3 dígitos e sufixo", () => {
    const codes = (t: string) => splitCodes(t, false).filter((s) => s.code).map((s) => s.text);
    expect(codes("TURBO GARRETT GT4594 452308-500:")).toEqual(["452308-500"]);
    expect(codes("876272-5017S e 53279887101")).toEqual(["876272-5017S", "53279887101"]);
  });

  it("junta negrito e código", () => {
    expect(tokenizeAnswerLine("*4031196*: temos.")).toEqual([
      { text: "4031196", bold: true, code: true },
      { text: ": temos.", bold: false, code: false },
    ]);
    expect(tokenizeAnswerLine("• *TURBINA HX55W 4031196* — 2")).toEqual([
      { text: "• ", bold: false, code: false },
      { text: "TURBINA HX55W ", bold: true, code: false },
      { text: "4031196", bold: true, code: true },
      { text: " — 2", bold: false, code: false },
    ]);
  });

  it("um bloco por linha, guardando o respiro das linhas em branco", () => {
    const blocks = splitAnswerBlocks("Linha 1\nLinha 2\n\n\nLinha 3\n");
    expect(blocks).toHaveLength(3);
    expect(blocks.map((b) => b.gapBefore)).toEqual([false, false, true]);
    expect(splitAnswerBlocks("")).toEqual([]);
    expect(splitAnswerBlocks("\n\nOi")[0].gapBefore).toBe(false);
  });
});

describe("nfeSteps", () => {
  const base = { hasNota: true, itemsWithoutProduct: 0, itemsShort: 0, allIgnored: false, hasProblems: false };

  it("sem nota: ler a chave", () => {
    expect(nfeStepIndex({ ...base, hasNota: false })).toBe(0);
  });

  it("item sem produto, sem saldo ou tudo ignorado: conferir itens", () => {
    expect(nfeStepIndex({ ...base, itemsWithoutProduct: 1 })).toBe(1);
    expect(nfeStepIndex({ ...base, itemsShort: 2 })).toBe(1);
    expect(nfeStepIndex({ ...base, allIgnored: true })).toBe(1);
  });

  it("itens certos: confirmar, mesmo faltando a natureza", () => {
    expect(nfeStepIndex({ ...base, hasProblems: true })).toBe(2);
    expect(nfeStepIndex(base)).toBe(2);
  });

  it("status de cada etapa", () => {
    expect([0, 1, 2].map((s) => nfeStepStatus(s, 1))).toEqual(["done", "current", "todo"]);
  });

  it("saldo que fica", () => {
    expect(stockAfter(5, 2, "SAIDA")).toBe(3);
    expect(stockAfter(5, 2, "ENTRADA")).toBe(7);
    expect(stockAfter(1, 3, "SAIDA")).toBe(-2);
    expect(stockAfter(null, 2, "SAIDA")).toBeNull();
  });
});

describe("scanFeedback", () => {
  function fakeStorage(initial: Record<string, string> = {}) {
    const data = { ...initial };
    return {
      data,
      getItem: (k: string) => (k in data ? data[k] : null),
      setItem: (k: string, v: string) => {
        data[k] = v;
      },
    };
  }

  it("bipe desligado por padrão", () => {
    expect(readBeepPreference(fakeStorage())).toBe(false);
    expect(readBeepPreference(null)).toBe(false);
  });

  it("lembra a escolha", () => {
    const storage = fakeStorage();
    writeBeepPreference(true, storage);
    expect(storage.data[SCAN_BEEP_KEY]).toBe("1");
    expect(readBeepPreference(storage)).toBe(true);
    writeBeepPreference(false, storage);
    expect(readBeepPreference(storage)).toBe(false);
  });

  it("armazenamento que falha não quebra", () => {
    const broken = {
      getItem: () => {
        throw new Error("bloqueado");
      },
      setItem: () => {
        throw new Error("bloqueado");
      },
    };
    expect(readBeepPreference(broken)).toBe(false);
    expect(() => writeBeepPreference(true, broken)).not.toThrow();
  });

  it("tom curto e agudo quando acha; grave quando não acha", () => {
    expect(beepTone(true).frequency).toBeGreaterThan(beepTone(false).frequency);
    expect(beepTone(true).duration).toBeLessThan(0.2);
  });
});
