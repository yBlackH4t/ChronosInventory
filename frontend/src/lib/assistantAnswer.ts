// Resposta do assistente em blocos e com os códigos de peça destacados. Lógica pura.
//
// O texto vem no estilo WhatsApp (`*negrito*`, uma informação por linha). Cada linha vira um
// bloco, que entra em sequência na tela; cada código de peça vira uma etiqueta.

export type AnswerSegment = {
  text: string;
  bold: boolean;
  /** Código de peça (etiqueta com borda). */
  code: boolean;
};

export type AnswerBlock = {
  segments: AnswerSegment[];
  /** Linha em branco antes deste bloco no texto (fica um respiro maior). */
  gapBefore: boolean;
};

// Códigos de peça como o assistente escreve: Garrett com hífen (796155-5002, 452308-500,
// 876272-5017S) e os outros só com números (4031196, 53279887101). Não pega pedaços de
// palavras (GT4594, MP530w), anos ou quantidades.
const CODE_PATTERN = /(?<![\w-])(\d{6}-\d{3,4}[A-Z]?|\d{6,14})(?![\w-])/g;

/** Separa os códigos de peça de um trecho de texto. */
export function splitCodes(text: string, bold: boolean): AnswerSegment[] {
  const out: AnswerSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(CODE_PATTERN)) {
    const start = match.index ?? 0;
    if (start > last) out.push({ text: text.slice(last, start), bold, code: false });
    out.push({ text: match[0], bold, code: true });
    last = start + match[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), bold, code: false });
  return out;
}

/** Uma linha do texto: negrito do WhatsApp e códigos de peça. */
export function tokenizeAnswerLine(line: string): AnswerSegment[] {
  const out: AnswerSegment[] = [];
  for (const part of line.split(/(\*[^*]+\*)/g)) {
    if (!part) continue;
    const bold = part.length > 2 && part.startsWith("*") && part.endsWith("*");
    out.push(...splitCodes(bold ? part.slice(1, -1) : part, bold));
  }
  return out;
}

/** O texto inteiro em blocos (um por linha não vazia). */
export function splitAnswerBlocks(text: string): AnswerBlock[] {
  const blocks: AnswerBlock[] = [];
  let pendingGap = false;
  for (const raw of (text ?? "").split("\n")) {
    if (!raw.trim()) {
      pendingGap = blocks.length > 0;
      continue;
    }
    blocks.push({ segments: tokenizeAnswerLine(raw), gapBefore: pendingGap });
    pendingGap = false;
  }
  return blocks;
}
