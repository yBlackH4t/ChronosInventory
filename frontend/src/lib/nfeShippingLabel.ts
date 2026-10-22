import type { ShippingLabelPrintableItem } from "./labelsPrint";

export type NfeShippingData = {
  cliente: string;
  cidade: string;
  estado: string;
  transportadora: string;
  numeroNota: string;
  volumes: number;
  pesoKg: string;
  endereco: string;
  cep: string;
  remetente: string;
  remetenteLocal: string;
};

function normalizeTag(value: string): string {
  return (value || "").toLowerCase();
}

function findChildrenByTag(node: Element, tag: string): Element[] {
  const normalizedTag = normalizeTag(tag);
  return Array.from(node.children).filter(
    (child) => normalizeTag(child.localName || child.tagName) === normalizedTag,
  );
}

function findFirstByPath(root: Element | null, path: string[]): Element | null {
  if (!root) return null;
  let current: Element | null = root;
  for (const segment of path) {
    if (!current) return null;
    current = findChildrenByTag(current, segment)[0] ?? null;
  }
  return current;
}

function findFirstDescendantByTag(
  root: Element | null,
  tag: string,
): Element | null {
  if (!root) return null;
  const normalizedTag = normalizeTag(tag);
  const stack: Element[] = [root];

  while (stack.length > 0) {
    const current = stack.shift()!;
    if (normalizeTag(current.localName || current.tagName) === normalizedTag) {
      return current;
    }
    stack.push(...Array.from(current.children));
  }
  return null;
}

function textOf(node: Element | null, fallback = "Não informado"): string {
  const value = (node?.textContent || "").trim();
  return value || fallback;
}

function parsePositiveInt(value: string | null | undefined): number {
  if (!value) return 0;
  const normalized = value.replace(",", ".").trim();
  const asNumber = Number.parseFloat(normalized);
  if (!Number.isFinite(asNumber) || asNumber <= 0) return 0;
  return Math.max(0, Math.round(asNumber));
}

function parsePositiveFloat(value: string | null | undefined): number {
  if (!value) return 0;
  const normalized = value.replace(",", ".").trim();
  const asNumber = Number.parseFloat(normalized);
  if (!Number.isFinite(asNumber) || asNumber <= 0) return 0;
  return asNumber;
}

function formatWeight(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "Não informado";
  if (Math.round(value) === value) return String(Math.round(value));
  return value.toFixed(2).replace(/\.?0+$/, "").replace(".", ",");
}

function formatCep(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length === 8 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : value;
}

function formatCnpj(value: string): string {
  const d = value.replace(/\D/g, "");
  if (d.length !== 14) return value;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/** "RUA X, 100 - SALA 2 · CENTRO": rua, número, complemento e bairro do que vier no XML. */
function formatAddress(ender: Element | null): string {
  const part = (tag: string) => textOf(findFirstByPath(ender, [tag]), "");
  const rua = [part("xLgr"), part("nro")].filter(Boolean).join(", ");
  const linha = [rua, part("xCpl")].filter(Boolean).join(" - ");
  return [linha, part("xBairro")].filter(Boolean).join(" · ") || "Não informado";
}

export function parseNfeShippingData(xmlText: string): NfeShippingData {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "application/xml");
  const parseErrorNode = doc.getElementsByTagName("parsererror")[0];
  if (parseErrorNode) {
    throw new Error("XML inválido ou corrompido.");
  }

  const root = doc.documentElement;
  const infNFe =
    findFirstDescendantByTag(root, "infNFe") ||
    findFirstDescendantByTag(root, "NFe") ||
    root;

  const dest = findFirstByPath(infNFe, ["dest"]);
  const transp = findFirstByPath(infNFe, ["transp"]);
  const transporta = findFirstByPath(transp, ["transporta"]);
  const ide = findFirstByPath(infNFe, ["ide"]);
  const emit = findFirstByPath(infNFe, ["emit"]);
  const enderDest = findFirstByPath(dest, ["enderDest"]);
  const enderEmit = findFirstByPath(emit, ["enderEmit"]);

  const cliente = textOf(findFirstByPath(dest, ["xNome"]));
  const cidade = textOf(findFirstByPath(dest, ["enderDest", "xMun"]));
  const estado = textOf(findFirstByPath(dest, ["enderDest", "UF"]));
  const transportadora = textOf(findFirstByPath(transporta, ["xNome"]));
  const numeroNota = textOf(findFirstByPath(ide, ["nNF"]));
  const endereco = formatAddress(enderDest);
  const cep = formatCep(textOf(findFirstByPath(enderDest, ["CEP"])));
  const remetente = textOf(findFirstByPath(emit, ["xNome"]));
  const emitCidade = [
    textOf(findFirstByPath(enderEmit, ["xMun"]), ""),
    textOf(findFirstByPath(enderEmit, ["UF"]), ""),
  ]
    .filter(Boolean)
    .join(" / ");
  const emitCnpj = textOf(findFirstByPath(emit, ["CNPJ"]), "");
  const remetenteLocal = [emitCidade, emitCnpj ? `CNPJ ${formatCnpj(emitCnpj)}` : ""]
    .filter(Boolean)
    .join(" · ");

  const volNodes = transp ? findChildrenByTag(transp, "vol") : [];
  let volumes = 0;
  let totalPeso = 0;

  if (volNodes.length > 0) {
    volNodes.forEach((volNode) => {
      volumes += parsePositiveInt(
        textOf(findFirstByPath(volNode, ["qVol"]), "0"),
      );
      const pesoL = parsePositiveFloat(
        textOf(findFirstByPath(volNode, ["pesoL"]), "0"),
      );
      const pesoB = parsePositiveFloat(
        textOf(findFirstByPath(volNode, ["pesoB"]), "0"),
      );
      totalPeso += pesoL > 0 ? pesoL : pesoB;
    });
  }

  volumes = Math.max(1, volumes || 0);
  const pesoKg = formatWeight(totalPeso);

  return {
    cliente,
    cidade,
    estado,
    transportadora,
    numeroNota,
    volumes,
    pesoKg,
    endereco,
    cep,
    remetente,
    remetenteLocal,
  };
}

/** Uma etiqueta por volume da nota (no máximo `max`), numeradas 1/N, 2/N... */
export function nfeShippingPrintItems(
  data: NfeShippingData,
  max: number,
): ShippingLabelPrintableItem[] {
  const total = Math.max(1, Math.min(data.volumes, max));
  return Array.from({ length: total }, (_, index) => ({
    cliente: data.cliente,
    cidade: data.cidade,
    estado: data.estado,
    transportadora: data.transportadora,
    numeroNota: data.numeroNota,
    pesoKg: data.pesoKg,
    volumeIndex: index + 1,
    volumeTotal: total,
    endereco: data.endereco,
    cep: data.cep,
    remetente: data.remetente,
    remetenteLocal: data.remetenteLocal,
  }));
}
