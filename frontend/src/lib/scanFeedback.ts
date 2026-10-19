// Retorno da leitura de código (Movimentação em lote): bipe opcional, desligado por padrão,
// lembrado só nesta máquina.

export const SCAN_BEEP_KEY = "chronos.scanner.bipe";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Bipe ligado? Sem valor salvo (ou sem acesso ao armazenamento): desligado. */
export function readBeepPreference(storage: StorageLike | null = defaultStorage()): boolean {
  try {
    return storage?.getItem(SCAN_BEEP_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeBeepPreference(on: boolean, storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.setItem(SCAN_BEEP_KEY, on ? "1" : "0");
  } catch {
    // sem armazenamento (modo privado): vale só até fechar
  }
}

/** Tom do bipe: agudo e curto quando achou; grave e mais longo quando não achou. */
export function beepTone(found: boolean): { frequency: number; duration: number } {
  return found ? { frequency: 1000, duration: 0.12 } : { frequency: 320, duration: 0.25 };
}

let audioCtx: AudioContext | null = null;

/** Toca o bipe (Web Audio, sem arquivo de som). Falha em silêncio. */
export function playBeep(found = true): void {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audioCtx ??= new Ctx();
    if (audioCtx.state === "suspended") void audioCtx.resume();
    const { frequency, duration } = beepTone(found);
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + duration);
  } catch {
    // sem som disponível
  }
}
