import { describe, expect, it } from "vitest";
import dayjs from "dayjs";
import { backupLine, certificateLine, flowBars, healthRings, monotonePath, officialBaseLine } from "./commandCenter";
import type { OfficialBaseStatusOut } from "../types/api";

const now = dayjs("2026-10-28T13:40:00");

describe("certificateLine", () => {
  it("sem certificado fica neutro", () => {
    expect(certificateLine(null, now).tone).toBe("neutral");
  });
  it("avisa a 30 dias e acusa vencido", () => {
    const cert = (validade: string) => ({ pastas_xml: [], certificado: { titular: "X", cnpj: null, validade } });
    expect(certificateLine(cert("2027-02-10"), now)).toMatchObject({ tone: "ok", detail: "válido até 10/02/2027" });
    expect(certificateLine(cert("2026-11-10"), now)).toMatchObject({ tone: "warn", detail: "vence em 13 dias (10/11/2026)" });
    expect(certificateLine(cert("2026-10-01"), now).tone).toBe("danger");
  });
});

describe("backupLine", () => {
  it("usa o backup mais novo", () => {
    const line = backupLine(
      [
        { name: "a", path: "a", size: 1, created_at: "2026-10-20T06:00:00" },
        { name: "b", path: "b", size: 1, created_at: "2026-10-28T06:00:00" },
      ],
      now,
    );
    expect(line).toMatchObject({ tone: "ok", detail: "último hoje 06:00" });
  });
  it("mais de 2 dias sem backup pede atenção", () => {
    expect(backupLine([{ name: "a", path: "a", size: 1, created_at: "2026-10-20T06:00:00" }], now).tone).toBe("warn");
    expect(backupLine([], now).tone).toBe("warn");
  });
});

describe("officialBaseLine", () => {
  const manifest = {
    format_version: 1,
    published_at: "2026-10-28T07:58:00",
    publisher_machine: "DELL-WIN11PRO",
    app_version: "2.7.9",
    min_app_version: "2.7.0",
    db_version: "1",
    database_filename: "estoque.db",
    database_sha256: "x",
  };
  it("quem publica mostra quando publicou", () => {
    const status = { role: "publisher", latest_manifest: manifest } as OfficialBaseStatusOut;
    expect(officialBaseLine(status, now)).toMatchObject({ label: "Base publicada", detail: "hoje 07:58", tone: "ok" });
  });
  it("quem publica pelo servidor local também conta", () => {
    const status = { role: "publisher", latest_manifest: null, server_latest_manifest: manifest } as OfficialBaseStatusOut;
    expect(officialBaseLine(status, now).detail).toBe("hoje 07:58");
  });
  it("quem consome mostra de quem é a base", () => {
    const status = { role: "consumer", server_latest_manifest: manifest } as OfficialBaseStatusOut;
    expect(officialBaseLine(status, now).detail).toBe("hoje 07:58 por DELL-WIN11PRO");
  });
});

describe("healthRings", () => {
  it("cada anel é a parte do total", () => {
    const rings = healthRings({ GIRANDO: 20, LENTO: 5, PARADO: 75 });
    expect(rings.map((r) => r.fraction)).toEqual([0.2, 0.05, 0.75]);
  });
  it("sem produtos não divide por zero", () => {
    expect(healthRings({ GIRANDO: 0, LENTO: 0, PARADO: 0 }).every((r) => r.fraction === 0)).toBe(true);
  });
});

describe("flowBars", () => {
  const days = Array.from({ length: 14 }, (_, i) => ({
    date: dayjs("2026-10-12").add(i, "day").format("YYYY-MM-DD"),
    entradas: i === 0 ? 5 : 0,
    saidas: 1,
    estoqueInicial: 0,
  }));
  it("30 e 90 dias pegam os últimos dias", () => {
    expect(flowBars(days, "30")).toHaveLength(14);
  });
  it("no ano junta por semana, a partir da segunda", () => {
    const weeks = flowBars(days, "365");
    expect(weeks).toEqual([
      { date: "2026-10-12", entradas: 5, saidas: 7 },
      { date: "2026-10-19", entradas: 0, saidas: 7 },
    ]);
  });
});

describe("monotonePath", () => {
  it("começa no primeiro ponto e termina no último", () => {
    const d = monotonePath([[0, 10], [10, 20], [20, 10]]);
    expect(d.startsWith("M0.0 10.0")).toBe(true);
    expect(d.endsWith("20.0 10.0")).toBe(true);
  });
  it("num pico, a tangente é zero (não passa do ponto)", () => {
    expect(monotonePath([[0, 10], [10, 20], [20, 10]])).toContain("6.7 20.0 10.0 20.0");
  });
});
