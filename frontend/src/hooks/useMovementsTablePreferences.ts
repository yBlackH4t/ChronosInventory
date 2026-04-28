import { useEffect, useMemo, useState } from "react";

import {
  DEFAULT_TABLE_PREFERENCES,
  getViewportWidth,
  loadTablePreferences,
  resolveMovementTableLayout,
  saveTablePreferences,
  type MovementsTablePreferences,
} from "../lib/movements";

export function useMovementsTablePreferences() {
  const [viewportWidth, setViewportWidth] = useState<number>(() => getViewportWidth());
  const [tablePreferences, setTablePreferences] = useState<MovementsTablePreferences>(() =>
    loadTablePreferences()
  );

  useEffect(() => {
    saveTablePreferences(tablePreferences);
  }, [tablePreferences]);

  useEffect(() => {
    const onResize = () => setViewportWidth(getViewportWidth());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const tableLayout = useMemo(
    () => resolveMovementTableLayout(tablePreferences.viewMode, viewportWidth),
    [tablePreferences.viewMode, viewportWidth]
  );

  const resetTablePreferences = () => {
    setTablePreferences(DEFAULT_TABLE_PREFERENCES);
  };

  return {
    viewportWidth,
    tablePreferences,
    setTablePreferences,
    tableLayout,
    resetTablePreferences,
  };
}
