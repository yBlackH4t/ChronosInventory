import { useEffect, useMemo, useRef, useState } from "react";
import type { MovementOut } from "../lib/api";

const EVENT = "chronos:estorno";
/** Tempo da linha estornada riscando e encolhendo antes de sumir (vivo.css). */
const LEAVE_MS = 1100;

/** Avisa as listas que a movimentação `id` acabou de ser estornada. */
export function announceEstorno(id: number): void {
  window.dispatchEvent(new CustomEvent<number>(EVENT, { detail: id }));
}

/**
 * Linha estornada agora: fica um instante na tela riscando (e, se "Mostrar estornados"
 * estiver desligado, encolhendo até sumir) em vez de desaparecer de uma vez.
 * Devolve as linhas para desenhar e os ids que estão nessa saída.
 */
export function useEstornoLeaving(rows: MovementOut[]) {
  const rowsRef = useRef(rows);
  const [leaving, setLeaving] = useState<Map<number, MovementOut>>(new Map());

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    const timers: number[] = [];
    const onEstorno = (event: Event) => {
      const id = (event as CustomEvent<number>).detail;
      const row = rowsRef.current.find((item) => item.id === id);
      if (!row) return;
      setLeaving((current) => new Map(current).set(id, row));
      timers.push(
        window.setTimeout(() => {
          setLeaving((current) => {
            const next = new Map(current);
            next.delete(id);
            return next;
          });
        }, LEAVE_MS),
      );
    };
    window.addEventListener(EVENT, onEstorno);
    return () => {
      window.removeEventListener(EVENT, onEstorno);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  const displayRows = useMemo(() => {
    if (leaving.size === 0) return rows;
    const present = new Set(rows.map((row) => row.id));
    const ghosts = [...leaving.values()].filter((row) => !present.has(row.id));
    if (ghosts.length === 0) return rows;
    return [...rows, ...ghosts].sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : b.id - a.id));
  }, [rows, leaving]);

  const present = useMemo(() => new Set(rows.map((row) => row.id)), [rows]);
  return { displayRows, leaving, present };
}
