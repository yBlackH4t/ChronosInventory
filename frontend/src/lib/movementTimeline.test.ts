import { describe, expect, it } from "vitest";

import { planFlip } from "./flip";
import { movementNote, movementPlace, reversedMovementIds } from "./movementTimeline";

describe("movementNote", () => {
  it("estoque inicial vira o selo Saldo inicial, sem a observação padrão", () => {
    expect(
      movementNote({
        observacao: "Estoque inicial gerado no cadastro do produto.",
        documento: "CADASTRO_INICIAL",
      }),
    ).toEqual({ tag: "Saldo inicial", observation: null, document: null });
  });

  it("observações padrão somem; as escritas por alguém ficam", () => {
    expect(movementNote({ observacao: "Criado via Importação" }).tag).toBe("Importação");
    expect(movementNote({ observacao: "Estorno da movimentação #133" })).toEqual({
      tag: null,
      observation: null,
      document: null,
    });
    expect(movementNote({ observacao: "Venda balcão", documento: "NF 1392" })).toEqual({
      tag: null,
      observation: "Venda balcão",
      document: "NF 1392",
    });
  });
});

describe("reversedMovementIds", () => {
  it("marca as movimentações desfeitas por estorno", () => {
    const ids = reversedMovementIds([
      { natureza: "ESTORNO", movimento_ref_id: 12 },
      { natureza: "OPERACAO_NORMAL", movimento_ref_id: undefined },
      { natureza: "DEVOLUCAO", movimento_ref_id: 7 },
    ]);
    expect([...ids]).toEqual([12]);
  });
});

describe("movementPlace", () => {
  it("origem e destino numa linha", () => {
    expect(movementPlace("Canoas", "Passo Fundo")).toBe("Canoas → Passo Fundo");
    expect(movementPlace(null, "Canoas")).toBe("para Canoas");
    expect(movementPlace("Canoas", null)).toBe("de Canoas");
    expect(movementPlace(null, null)).toBeNull();
  });
});

describe("planFlip", () => {
  const before = new Map([
    ["a", 0],
    ["b", 60],
  ]);
  const after = new Map([
    ["c", 0],
    ["a", 60],
    ["b", 120],
  ]);

  it("completo: a nova entra e as outras deslizam", () => {
    expect(planFlip(before, after, "completo")).toEqual([
      { key: "c", kind: "enter" },
      { key: "a", kind: "move", dy: -60 },
      { key: "b", kind: "move", dy: -60 },
    ]);
  });

  it("suave só esmaece a nova; nenhum não anima", () => {
    expect(planFlip(before, after, "suave")).toEqual([{ key: "c", kind: "enter" }]);
    expect(planFlip(before, after, "nenhum")).toEqual([]);
  });

  it("muitas linhas mudando de lugar: só as novas aparecem", () => {
    const many = new Map(Array.from({ length: 80 }, (_, i) => [`k${i}`, i * 10] as const));
    const shifted = new Map(Array.from({ length: 80 }, (_, i) => [`k${i}`, i * 10 + 50] as const));
    expect(planFlip(many, shifted, "completo")).toEqual([]);
  });
});
