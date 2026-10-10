import { describe, expect, it } from "vitest";
import {
  DEFAULT_MOVEMENT_FILTERS,
  adjustmentReasonLabel,
  deserializeFilters,
  movementNatureLabel,
  resolveMovementTableLayout,
  serializeFilters,
  signedQuantity,
} from "./movements";

describe("filtros de movimentacoes", () => {
  it("ida e volta pela serializacao preserva ids e datas", () => {
    const filters = {
      ...DEFAULT_MOVEMENT_FILTERS,
      origem_location_id: 2,
      destino_location_id: 5,
      date_from: new Date(2026, 9, 1),
      date_to: new Date(2026, 9, 10),
    };
    const serialized = serializeFilters(filters);
    expect(serialized.origem_location_id).toBe("2");
    expect(serialized.date_from).toBe("2026-10-01");

    const restored = deserializeFilters(serialized);
    expect(restored.origem_location_id).toBe(2);
    expect(restored.destino_location_id).toBe(5);
    expect(restored.date_to?.getDate()).toBe(10);
  });

  it("sem estado salvo volta para os filtros padrao", () => {
    expect(deserializeFilters(undefined)).toEqual(DEFAULT_MOVEMENT_FILTERS);
  });
});

describe("rotulos", () => {
  it("quantidade leva sinal conforme o tipo", () => {
    expect(signedQuantity("ENTRADA", 3)).toBe("+3");
    expect(signedQuantity("SAIDA", 3)).toBe("−3");
    expect(signedQuantity("TRANSFERENCIA", 3)).toBe("3");
  });

  it("natureza so de historico tem rotulo proprio", () => {
    expect(movementNatureLabel("ESTORNO" as never)).toBe("Estorno");
  });

  it("motivo vazio vira traco e desconhecido passa direto", () => {
    expect(adjustmentReasonLabel(null)).toBe("-");
    expect(adjustmentReasonLabel("OUTRO_MOTIVO")).toBe("OUTRO_MOTIVO");
  });
});

describe("layout da tabela", () => {
  it("modo automatico esconde colunas extras em telas estreitas", () => {
    expect(resolveMovementTableLayout("AUTO", 1200).showExtraColumns).toBe(false);
    expect(resolveMovementTableLayout("AUTO", 1500).showExtraColumns).toBe(true);
  });

  it("modo escolhido ignora a largura da tela", () => {
    expect(resolveMovementTableLayout("DETALHADO", 900).minWidth).toBe(1840);
    expect(resolveMovementTableLayout("COMPACTO", 2400).minWidth).toBe(1260);
  });
});
