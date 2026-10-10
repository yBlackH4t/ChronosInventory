import { describe, expect, it } from "vitest";
import { parseCollectorInput } from "./inventoryCollector";

describe("parseCollectorInput", () => {
  it("etiqueta impressa CI-<id> vira o ID do produto", () => {
    expect(parseCollectorInput("ci-42")).toEqual({ kind: "product_id", value: 42 });
    expect(parseCollectorInput("CI 7")).toEqual({ kind: "product_id", value: 7 });
  });

  it("numero curto e ID; numero longo e codigo", () => {
    expect(parseCollectorInput("123")).toEqual({ kind: "product_id", value: 123 });
    expect(parseCollectorInput("4031195")).toEqual({
      kind: "product_code",
      value: "4031195",
    });
  });

  it("texto com digitos guarda so os digitos; vazio e ignorado", () => {
    expect(parseCollectorInput("HX40 4031195")).toEqual({
      kind: "product_code",
      value: "404031195",
    });
    expect(parseCollectorInput("   ")).toBeNull();
    expect(parseCollectorInput("abc")).toBeNull();
  });
});
