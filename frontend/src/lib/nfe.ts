/**
 * Chave de acesso da NF-e: e o que o codigo de barras do DANFE guarda (44 digitos).
 * Aceita a chave com espacos (como vem impressa) ou com o prefixo "NFe".
 */
export function parseNfeKey(code: string | null | undefined): string | null {
  if (!code) return null;
  let raw = code.trim();
  if (/^nfe/i.test(raw)) raw = raw.slice(3);
  if (/[^\d\s.]/.test(raw)) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 44) return null;
  let total = 0;
  let weight = 2;
  for (let i = 42; i >= 0; i -= 1) {
    total += Number(digits[i]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  let dv = 11 - (total % 11);
  if (dv >= 10) dv = 0;
  return dv === Number(digits[43]) ? digits : null;
}

export function formatNfeKey(chave: string): string {
  return chave.replace(/(\d{4})(?=\d)/g, "$1 ");
}

export const NFE_OPEN_EVENT = "chronos:nfe-open";

/** Abre a baixa por NF-e (com a chave, se ja tiver); quem mostra e o NfeScanHost do layout. */
export function openNfeMovement(chave?: string) {
  window.dispatchEvent(new CustomEvent<string | undefined>(NFE_OPEN_EVENT, { detail: chave }));
}
