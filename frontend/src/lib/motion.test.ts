import { describe, expect, it } from "vitest";
import {
  DEFAULT_MOTION_LEVEL,
  isMotionLevel,
  pageTransitionFor,
  resolveMotionLevel,
} from "./motion";

describe("resolveMotionLevel", () => {
  it("usa a escolha quando o sistema não pede menos movimento", () => {
    expect(resolveMotionLevel("completo", false)).toBe("completo");
    expect(resolveMotionLevel("suave", false)).toBe("suave");
    expect(resolveMotionLevel("nenhum", false)).toBe("nenhum");
  });

  it("com 'Diminuir animações' no sistema, o completo vira suave", () => {
    expect(resolveMotionLevel("completo", true)).toBe("suave");
    expect(resolveMotionLevel("suave", true)).toBe("suave");
  });

  it("nunca dá mais movimento a quem escolheu nenhum", () => {
    expect(resolveMotionLevel("nenhum", true)).toBe("nenhum");
  });

  it("valor salvo inválido ou ausente volta ao padrão", () => {
    expect(resolveMotionLevel(undefined, false)).toBe(DEFAULT_MOTION_LEVEL);
    expect(resolveMotionLevel("rapido", false)).toBe(DEFAULT_MOTION_LEVEL);
    expect(resolveMotionLevel(42, true)).toBe("suave");
  });
});

describe("isMotionLevel", () => {
  it("aceita só os três níveis", () => {
    expect(isMotionLevel("completo")).toBe(true);
    expect(isMotionLevel("Completo")).toBe(false);
    expect(isMotionLevel(null)).toBe(false);
  });
});

describe("pageTransitionFor", () => {
  it("nenhum não anima", () => {
    expect(pageTransitionFor("nenhum")).toBeNull();
  });

  it("suave só mexe na opacidade", () => {
    const t = pageTransitionFor("suave")!;
    expect(Object.keys(t.initial)).toEqual(["opacity"]);
    expect(Object.keys(t.animate)).toEqual(["opacity"]);
  });

  it("completo desliza pouco e dura cerca de 250 ms", () => {
    const t = pageTransitionFor("completo")!;
    expect(t.initial.y).toBeGreaterThan(0);
    expect(t.initial.y).toBeLessThanOrEqual(12);
    expect(t.enterDuration).toBeCloseTo(0.25, 2);
  });
});
