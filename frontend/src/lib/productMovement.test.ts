import { describe, expect, it } from "vitest";
import type { MovementCreate } from "./api";
import {
  createActionMovementValues,
  normalizeMovementPayload,
  validateMovementSubmission,
} from "./productMovement";

function values(overrides: Partial<MovementCreate>): MovementCreate {
  return { ...createActionMovementValues("ENTRADA", 7, 1), ...overrides };
}

describe("validateMovementSubmission", () => {
  it("aceita uma entrada normal", () => {
    expect(validateMovementSubmission(values({}))).toBeNull();
  });

  it("recusa transferencia para o mesmo local", () => {
    const result = validateMovementSubmission(
      values({ tipo: "TRANSFERENCIA", origem_location_id: 1, destino_location_id: 1 }),
    );
    expect(result?.field).toBe("destino_location_id");
  });

  it("devolucao precisa ser entrada e ter movimento de referencia", () => {
    expect(
      validateMovementSubmission(values({ tipo: "SAIDA", natureza: "DEVOLUCAO" }))?.field,
    ).toBe("natureza");
    expect(
      validateMovementSubmission(values({ natureza: "DEVOLUCAO" }))?.field,
    ).toBe("movimento_ref_id");
  });

  it("ajuste exige motivo e observacao", () => {
    expect(validateMovementSubmission(values({ natureza: "AJUSTE" }))?.field).toBe(
      "motivo_ajuste",
    );
    const semObs = values({
      natureza: "AJUSTE",
      motivo_ajuste: "AVARIA",
      observacao: "   ",
    });
    expect(validateMovementSubmission(semObs)?.field).toBe("observacao");
  });

  it("transferencia externa exige o local externo", () => {
    const result = validateMovementSubmission(
      values({ tipo: "SAIDA", natureza: "TRANSFERENCIA_EXTERNA", local_externo: " " }),
    );
    expect(result?.field).toBe("local_externo");
  });
});

describe("normalizeMovementPayload", () => {
  it("remove o lado que nao se aplica e limpa textos vazios", () => {
    const payload = normalizeMovementPayload(
      values({ tipo: "SAIDA", origem_location_id: 2, destino_location_id: 3, observacao: "  " }),
      9,
    );
    expect(payload.produto_id).toBe(9);
    expect(payload.origem_location_id).toBe(2);
    expect(payload.destino_location_id).toBeUndefined();
    expect(payload.observacao).toBeUndefined();
    expect(payload.motivo_ajuste).toBeUndefined();
  });
});
