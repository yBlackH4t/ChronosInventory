import { describe, expect, it } from "vitest";

import { buildRemessaAviso, codigoDoAviso, foraDoEstoque, saudacao } from "./remessaAviso";

describe("aviso de remessa", () => {
  it("monta a mensagem no padrão da equipe, só com os grupos que têm peça", () => {
    const text = buildRemessaAviso(
      {
        numero: 75111,
        ufOrigem: "SC",
        ufDestino: "RS",
        itens: [
          { tipo: "ESTOQUE", quantidade: 1, codigo: "4032382" },
          { tipo: "SERVICO", quantidade: 1, codigo: "BC.0373" },
          { tipo: "ESTOQUE", quantidade: 2, codigo: "4032382" },
        ],
      },
      new Date(2026, 9, 28, 9, 0),
    );
    expect(text).toBe(
      [
        "Bom dia, tudo bem?",
        "🗒️ SEGUE RELAÇÃO DE PEÇAS SC X RS:",
        "📦 ESTOQUE:\n\n03 - 4032382",
        "🛠️ SERVIÇO/MONTAGEM:\n\n01 - BC.0373",
        "📄 NF: 75111",
      ].join("\n\n"),
    );
  });

  it("casco e garantia aparecem com o título deles e a rota segue o sentido da nota", () => {
    const text = buildRemessaAviso(
      {
        numero: 14600,
        ufOrigem: "RS",
        ufDestino: "SC",
        itens: [
          { tipo: "CASCO", quantidade: 2, codigo: "294" },
          { tipo: "GARANTIA", quantidade: 1, codigo: "4031195" },
        ],
      },
      new Date(2026, 9, 28, 15, 0),
    );
    expect(text).toContain("Boa tarde, tudo bem?");
    expect(text).toContain("PEÇAS RS X SC:");
    expect(text).toContain("🐢 CASCO:\n\n02 - 294");
    expect(text).toContain("🛡️ *GARANTIA:*\n\n01 - 4031195");
    expect(text).not.toContain("ESTOQUE");
  });

  it("acha o código da peça no produto, na descrição da nota ou usa o código da nota", () => {
    expect(codigoDoAviso("TURBO HOLSET HX40 4032382", "", "805")).toBe("4032382");
    expect(codigoDoAviso("CONJUNTO BC.0373", "", "806")).toBe("BC.0373");
    expect(codigoDoAviso(null, "CASCO", "294")).toBe("294");
    expect(codigoDoAviso(null, "TURBO 4031195 REMANUFATURADO", "807")).toBe("4031195");
  });

  it("saudação pela hora e o que fica fora do estoque", () => {
    expect(saudacao(new Date(2026, 0, 1, 19, 0))).toBe("Boa noite");
    expect(foraDoEstoque("CASCO")).toBe(true);
    expect(foraDoEstoque("GARANTIA")).toBe(true);
    expect(foraDoEstoque("SERVICO")).toBe(false);
    expect(foraDoEstoque(undefined)).toBe(false);
  });
});
