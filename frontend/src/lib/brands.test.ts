import { describe, expect, it } from "vitest";
import { brandColor, detectBrand, detectCondition } from "./brands";

describe("detectBrand", () => {
  it("reconhece fabricantes pelo nome e por modelos conhecidos", () => {
    expect(detectBrand("Turbina Holset HX40")?.label).toBe("HOLSET");
    expect(detectBrand("TURBO K27 SCANIA")?.label).toBe("BORGWARNER");
    expect(detectBrand("Turbina Garrett GT45")?.label).toBe("GARRETT");
    expect(detectBrand("Rolamento 6203")).toBeNull();
  });

  it("cor de fabricante desconhecido cai no cinza", () => {
    expect(brandColor("holset")).toBe("blue");
    expect(brandColor("XYZ")).toBe("gray");
  });
});

describe("detectCondition", () => {
  it("separa montada, reman e nova", () => {
    expect(detectCondition("Turbina montada Scania").label).toBe("MONTADA");
    expect(detectCondition("HX40 4031195RX").label).toBe("REMAN");
    expect(detectCondition("Garrett 452174-9005").label).toBe("REMAN");
    expect(detectCondition("Garrett 452174-0005").label).toBe("NOVA");
    expect(detectCondition("BorgWarner 53279907101").label).toBe("REMAN");
    expect(detectCondition("Holset 4031195").label).toBe("NOVA");
  });
});
