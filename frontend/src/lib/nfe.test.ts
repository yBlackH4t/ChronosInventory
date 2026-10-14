import { describe, expect, it } from "vitest";
import { formatNfeKey, parseNfeKey } from "./nfe";

const CHAVE = "43261003897158000285550020000145601821211022";

describe("parseNfeKey", () => {
  it("reconhece a chave do DANFE, com ou sem espacos", () => {
    expect(parseNfeKey(CHAVE)).toBe(CHAVE);
    expect(parseNfeKey(formatNfeKey(CHAVE))).toBe(CHAVE);
    expect(parseNfeKey(`NFe${CHAVE}`)).toBe(CHAVE);
  });

  it("recusa digito verificador errado e codigos de produto", () => {
    expect(parseNfeKey(CHAVE.slice(0, 43) + "3")).toBeNull();
    expect(parseNfeKey("CI-12")).toBeNull();
    expect(parseNfeKey("876272-5017S")).toBeNull();
    expect(parseNfeKey("")).toBeNull();
  });
});
