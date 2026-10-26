import { describe, expect, it } from "vitest";

import { applySavedOrder, moveItem } from "./reorder";

describe("moveItem", () => {
  it("move para frente e para trás", () => {
    expect(moveItem(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveItem(["a", "b", "c", "d"], 3, 1)).toEqual(["a", "d", "b", "c"]);
  });

  it("índice fora da lista não muda nada", () => {
    expect(moveItem(["a", "b"], 0, 5)).toEqual(["a", "b"]);
  });
});

describe("applySavedOrder", () => {
  it("segue a ordem salva e põe os novos no fim", () => {
    expect(applySavedOrder([1, 2, 3, 4], [3, 1])).toEqual([3, 1, 2, 4]);
    expect(applySavedOrder([1, 2], null)).toEqual([1, 2]);
  });
});
