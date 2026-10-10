import { useSyncExternalStore } from "react";

/**
 * Sessão do admin do assistente.
 *
 * O token fica SÓ em memória (variável de módulo): sobrevive à troca de tela,
 * mas some ao recarregar o app. Nunca gravar em localStorage/IndexedDB.
 */
export interface AdminSession {
  token: string | null;
  /** Motivo de a sessão ter sido encerrada pelo backend (ex.: mensagem do 403). */
  notice: string | null;
}

let session: AdminSession = { token: null, notice: null };
const listeners = new Set<() => void>();

function update(next: AdminSession) {
  if (next.token === session.token && next.notice === session.notice) return;
  session = next;
  listeners.forEach((listener) => listener());
}

export function getAdminToken(): string | null {
  return session.token;
}

export function setAdminToken(token: string | null, notice: string | null = null) {
  update({ token, notice: token ? null : notice });
}

export function clearAdminNotice() {
  update({ ...session, notice: null });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): AdminSession {
  return session;
}

export function useAdminSession(): AdminSession {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
