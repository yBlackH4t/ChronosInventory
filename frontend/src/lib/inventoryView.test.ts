import { describe, expect, it } from "vitest";

import { sessionLocalLabel, sessionProgress } from "./inventoryView";

describe("sessionLocalLabel", () => {
  it("usa o nome que o backend manda em local", () => {
    expect(sessionLocalLabel({ local: "Canoas", location_id: null })).toBe("Canoas");
  });

  it("nunca mostra Local #null", () => {
    expect(sessionLocalLabel({ local: "", location_id: null })).toBe("Sem local");
    expect(sessionLocalLabel({ location_id: 2 })).toBe("Local #2");
  });
});

describe("sessionProgress", () => {
  it("usa só os itens que pedem contagem, não o 0 de 0", () => {
    expect(sessionProgress({ counted_items: 0, to_count_items: 238, total_items: 1838 })).toBe(0);
    expect(sessionProgress({ counted_items: 119, to_count_items: 238, total_items: 1838 })).toBe(50);
    expect(sessionProgress({ counted_items: 237, to_count_items: 238, total_items: 1838 })).toBe(99);
    expect(sessionProgress({ counted_items: 238, to_count_items: 238, total_items: 1838 })).toBe(100);
  });

  it("sem to_count_items usa o total e não passa de 100", () => {
    expect(sessionProgress({ counted_items: 60, total_items: 259 })).toBe(23);
    expect(sessionProgress({ counted_items: 5, total_items: 0 })).toBe(0);
    expect(sessionProgress({ counted_items: 9, total_items: 3 })).toBe(100);
  });
});
