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
  it("arredonda e não passa de 100", () => {
    expect(sessionProgress({ counted_items: 60, total_items: 259 })).toBe(23);
    expect(sessionProgress({ counted_items: 5, total_items: 0 })).toBe(0);
    expect(sessionProgress({ counted_items: 9, total_items: 3 })).toBe(100);
  });
});
