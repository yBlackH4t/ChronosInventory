import { describe, expect, it } from "vitest";

import type { MovementOut } from "./api";
import { dayAnchorId, minimapDays } from "./movementMinimap";

const mov = (id: number, data: string, tipo: MovementOut["tipo"], quantidade: number) =>
  ({ id, data, tipo, quantidade, produto_id: 1, natureza: "OPERACAO_NORMAL" }) as MovementOut;

describe("minimapDays", () => {
  it("soma entradas, saídas e transferências por dia", () => {
    const days = minimapDays([
      mov(1, "2026-10-26T10:00:00", "ENTRADA", 3),
      mov(2, "2026-10-26T09:00:00", "SAIDA", 2),
      mov(3, "2026-10-25T15:00:00", "TRANSFERENCIA", 1),
    ]);
    expect(days).toEqual([
      { day: "2026-10-26", entradas: 3, saidas: 2, transferencias: 0, count: 2 },
      { day: "2026-10-25", entradas: 0, saidas: 0, transferencias: 1, count: 1 },
    ]);
    expect(dayAnchorId("2026-10-26")).toBe("mov-dia-2026-10-26");
  });
});
