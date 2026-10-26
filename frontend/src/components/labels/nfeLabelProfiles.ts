import {
  normalizeShippingLabelDesignerLayout,
  rawShippingLabelLayout,
  type ShippingLabelDesignerLayout,
} from "../../lib/labelsPrint";
import { loadLayoutFromStorage, makeId } from "./nfeDesignerUtils";

// Perfis de layout da etiqueta de expedição (Perfil 1, Perfil 2, Crua...), guardados nesta máquina.
export type NfeLabelProfile = {
  id: string;
  nome: string;
  layout: ShippingLabelDesignerLayout;
};

export const PROFILES_KEY = "chronos.nfe.etiqueta_perfis.v1";
export const ACTIVE_PROFILE_KEY = "chronos.nfe.etiqueta_perfil_ativo";
export const RAW_PROFILE_NAME = "Crua (sem marca)";
export const MAX_PROFILES = 20;

export function rawProfile(): NfeLabelProfile {
  return { id: makeId(), nome: RAW_PROFILE_NAME, layout: rawShippingLabelLayout() };
}

/** Primeira vez: o layout de hoje vira o "Perfil 1" e já vem um perfil cru. */
function seedProfiles(): NfeLabelProfile[] {
  const seed = [{ id: makeId(), nome: "Perfil 1", layout: loadLayoutFromStorage() }, rawProfile()];
  saveProfiles(seed);
  return seed;
}

export function loadProfiles(): NfeLabelProfile[] {
  try {
    const raw = window.localStorage.getItem(PROFILES_KEY);
    if (!raw) return seedProfiles();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return seedProfiles();
    const profiles = parsed
      .filter((p): p is { id: unknown; nome: unknown; layout: unknown } => typeof p === "object" && p !== null)
      .map((p) => ({
        id: typeof p.id === "string" && p.id ? p.id : makeId(),
        nome: typeof p.nome === "string" && p.nome.trim() ? p.nome.trim().slice(0, 40) : "Perfil",
        layout: normalizeShippingLabelDesignerLayout(p.layout),
      }));
    return profiles.length ? profiles.slice(0, MAX_PROFILES) : seedProfiles();
  } catch {
    return seedProfiles();
  }
}

export function saveProfiles(profiles: NfeLabelProfile[]): void {
  try {
    window.localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
  } catch {
    // Sem storage: os perfis valem só nesta sessão.
  }
}

export function loadActiveProfileId(profiles: NfeLabelProfile[]): string {
  try {
    const id = window.localStorage.getItem(ACTIVE_PROFILE_KEY);
    if (id && profiles.some((p) => p.id === id)) return id;
  } catch {
    // Sem storage: usa o primeiro.
  }
  return profiles[0].id;
}

export function saveActiveProfileId(id: string): void {
  try {
    window.localStorage.setItem(ACTIVE_PROFILE_KEY, id);
  } catch {
    // Sem storage: vale só nesta sessão.
  }
}
