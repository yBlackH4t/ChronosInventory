// Aviso de remessa entre matriz e filial no WhatsApp (2.7.15). Lógica pura, para testar.
import type { NfeTipoAviso } from "../types/api";
import { findProductCode } from "./productView";

export const TIPOS_AVISO: { value: NfeTipoAviso; label: string; emoji: string; titulo: string }[] = [
  { value: "ESTOQUE", label: "Estoque", emoji: "📦", titulo: "ESTOQUE:" },
  { value: "SERVICO", label: "Serviço", emoji: "🛠️", titulo: "SERVIÇO/MONTAGEM:" },
  { value: "CASCO", label: "Casco", emoji: "🐢", titulo: "CASCO:" },
  { value: "GARANTIA", label: "Garantia", emoji: "🛡️", titulo: "*GARANTIA:*" },
];

/** Casco e garantia só vão na mensagem: não entram nem saem do estoque. */
export function foraDoEstoque(tipo: NfeTipoAviso | undefined): boolean {
  return tipo === "CASCO" || tipo === "GARANTIA";
}

export type AvisoItem = {
  tipo: NfeTipoAviso;
  quantidade: number;
  codigo: string;
};

export type AvisoNota = {
  numero: number;
  ufOrigem?: string;
  ufDestino?: string;
  itens: AvisoItem[];
};

function firstCodeToken(text: string): string | null {
  const token = (text ?? "")
    .split(/\s+/)
    .map((t) => t.replace(/^[^\w]+|[^\w]+$/g, ""))
    .find((t) => t.length >= 3 && /\d/.test(t));
  return token || null;
}

/** Código que vai na mensagem: o da peça no nome do produto (4032382, BC.0373); sem produto, o da nota. */
export function codigoDoAviso(produtoNome: string | null | undefined, descricao: string, codigoNota: string): string {
  if (produtoNome) {
    const code = findProductCode(produtoNome)?.value ?? firstCodeToken(produtoNome);
    if (code) return code;
  }
  return firstCodeToken(descricao) ?? codigoNota;
}

export function saudacao(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

/** A mensagem no padrão que a equipe já manda ao chefe (só os grupos que têm peça). */
export function buildRemessaAviso(nota: AvisoNota, now: Date = new Date()): string {
  const rota = nota.ufOrigem && nota.ufDestino ? ` ${nota.ufOrigem} X ${nota.ufDestino}` : "";
  const parts = [`${saudacao(now)}, tudo bem?`, `🗒️ SEGUE RELAÇÃO DE PEÇAS${rota}:`];
  for (const tipo of TIPOS_AVISO) {
    const totals = new Map<string, number>();
    for (const item of nota.itens) {
      if (item.tipo !== tipo.value) continue;
      totals.set(item.codigo, (totals.get(item.codigo) ?? 0) + item.quantidade);
    }
    if (totals.size === 0) continue;
    const lines = [...totals].map(([codigo, qtd]) => `${String(qtd).padStart(2, "0")} - ${codigo}`);
    parts.push(`${tipo.emoji} ${tipo.titulo}\n\n${lines.join("\n")}`);
  }
  parts.push(`📄 NF: ${nota.numero}`);
  return parts.join("\n\n");
}
