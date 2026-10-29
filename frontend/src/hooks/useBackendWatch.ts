import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";

import { isTauri } from "../lib/tauri";

const NOTICE_ID = "chronos-backend-status";

/** Mostra quando o desktop religa o serviço do Chronos depois de uma queda. */
export function useBackendWatch() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    let disposed = false;

    void import("@tauri-apps/api/event").then(({ listen }) =>
      listen<string>("backend-status", ({ payload }) => {
        if (payload === "religando") {
          notifications.show({
            id: NOTICE_ID,
            title: "Reconectando...",
            message: "O serviço do Chronos parou e está sendo religado. Aguarde alguns segundos.",
            loading: true,
            autoClose: false,
            withCloseButton: false,
          });
        } else if (payload === "ok") {
          notifications.update({
            id: NOTICE_ID,
            title: "Chronos de volta",
            message: "Tudo funcionando de novo.",
            color: "success",
            loading: false,
            autoClose: 4000,
            withCloseButton: true,
          });
          void queryClient.invalidateQueries();
        } else {
          notifications.update({
            id: NOTICE_ID,
            title: "O Chronos parou",
            message: "Feche e abra o Chronos de novo. Se continuar, chame o suporte.",
            color: "danger",
            loading: false,
            autoClose: false,
            withCloseButton: true,
          });
        }
      }),
    ).then((stop) => {
      if (disposed) stop();
      else unlisten = stop;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [queryClient]);
}
