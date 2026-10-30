import { describe, expect, it } from "vitest";
import { SLOTS_PER_DAY, dayStrip, parseDay, recordSample, slotIndex, slotLabel } from "./whatsappUptime";

const at = (h: number, m: number) => new Date(2026, 9, 30, h, m);

describe("whatsappUptime", () => {
  it("meia hora por casa", () => {
    expect(slotIndex(at(0, 10))).toBe(0);
    expect(slotIndex(at(9, 45))).toBe(19);
    expect(slotLabel(19)).toBe("09:30");
  });

  it("dia novo ou dado estragado recomeça vazio", () => {
    expect(parseDay(JSON.stringify({ date: "2026-10-29", slots: "1".repeat(48) }), at(8, 0)).slots).toBe(".".repeat(48));
    expect(parseDay("lixo", at(8, 0)).slots).toHaveLength(SLOTS_PER_DAY);
  });

  it("uma queda na meia hora deixa a casa vermelha", () => {
    let day = parseDay(null, at(8, 0));
    day = recordSample(day, at(8, 1), true);
    day = recordSample(day, at(8, 10), false);
    day = recordSample(day, at(8, 20), true);
    const strip = dayStrip(day, at(9, 5));
    expect(strip[16]).toBe("off");
    expect(strip[17]).toBe("none");
    expect(strip[18]).toBe("none");
    expect(strip[19]).toBe("future");
  });

  it("ligado fica verde", () => {
    const day = recordSample(parseDay(null, at(10, 0)), at(10, 5), true);
    expect(dayStrip(day, at(10, 6))[20]).toBe("on");
  });
});
