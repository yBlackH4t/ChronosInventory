import { describe, expect, it } from "vitest";

import {
  buildShippingLabelsDesignerPrintHtml,
  halfSheetShippingLabelLayout,
  normalizeShippingLabelDesignerLayout,
  rawShippingLabelLayout,
} from "./labelsPrint";
import { nfeShippingPrintItems, type NfeShippingData } from "./nfeShippingLabel";

const NOTA: NfeShippingData = {
  cliente: "T C WINDBERG SERVICOS EM BOMBAS INJETORAS - EIRELI",
  cidade: "GARIBALDI",
  estado: "RS",
  transportadora: "REDE NACIONAL DE ENCOMENDAS LTDA",
  numeroNota: "14590",
  volumes: 2,
  pesoKg: "18.4",
  endereco: "RUA EXEMPLO, 100 · CENTRO",
  cep: "95720-000",
  remetente: "MONTREAL COMERCIO DE PECAS - CANOAS",
  remetenteLocal: "CANOAS / RS · CNPJ 03.897.158/0002-85",
};

describe("etiqueta de expedição da NF", () => {
  it("gera uma etiqueta por volume, numerada", () => {
    const items = nfeShippingPrintItems(NOTA, 400);
    expect(items.map((i) => `${i.volumeIndex}/${i.volumeTotal}`)).toEqual(["1/2", "2/2"]);
    expect(nfeShippingPrintItems({ ...NOTA, volumes: 900 }, 400)).toHaveLength(400);
  });

  it("modelo meia folha traz endereço, CEP, cidade/UF, remetente e o logo de antes", () => {
    const layout = halfSheetShippingLabelLayout("data:image/png;base64,AAAA");
    const html = buildShippingLabelsDesignerPrintHtml(nfeShippingPrintItems(NOTA, 400), layout);
    expect(html).toContain("RUA EXEMPLO, 100 · CENTRO");
    expect(html).toContain("CEP 95720-000");
    expect(html).toContain("GARIBALDI / RS");
    expect(html).toContain("CNPJ 03.897.158/0002-85");
    expect(html).toContain("data:image/png;base64,AAAA");
    expect(html).toContain("background:#000;color:#fff;"); // volume em destaque
    expect(html.match(/designer-card"/g)).toHaveLength(2);
  });

  it("perfil cru não leva logo nem remetente, só o destino e a nota", () => {
    const html = buildShippingLabelsDesignerPrintHtml(nfeShippingPrintItems(NOTA, 400), rawShippingLabelLayout());
    expect(html).not.toContain("MONTREAL");
    expect(html).not.toContain("CNPJ 03.897.158");
    expect(html).not.toContain("REMETENTE");
    expect(html).not.toContain("<img");
    expect(html).toContain("RUA EXEMPLO, 100 · CENTRO");
    expect(html).toContain("GARIBALDI / RS");
    expect(html).toContain(">14590</div>");
  });

  it("moldura e fundo preto sobrevivem a salvar e carregar o layout", () => {
    const layout = normalizeShippingLabelDesignerLayout(
      JSON.parse(JSON.stringify(halfSheetShippingLabelLayout())),
    );
    const volume = layout.items.find((i) => i.id === "caixa_volume");
    expect(volume?.frame).toBe(true);
    expect(volume?.inverted).toBe(true);
    expect(layout.heightPx).toBe(540);
  });
});

describe("impressão igual ao desenho", () => {
  it("o texto do bloco não ganha linha em branco nem recuo antes", () => {
    const html = buildShippingLabelsDesignerPrintHtml(
      nfeShippingPrintItems(NOTA, 400),
      halfSheetShippingLabelLayout(),
    );
    expect(html).toContain(">14590</div>");
    expect(html).not.toMatch(/>\s+14590/);
  });
});
