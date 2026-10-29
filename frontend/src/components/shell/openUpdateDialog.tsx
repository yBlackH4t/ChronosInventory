import { modals } from "@mantine/modals";
import type { Update } from "@tauri-apps/plugin-updater";

import { MODAL_ID, UpdateDialogBody } from "./UpdateDialog";

export function openUpdateDialog(update: Update) {
  modals.open({
    modalId: MODAL_ID,
    title: "Atualização do Chronos",
    centered: true,
    closeOnClickOutside: false,
    children: <UpdateDialogBody update={update} />,
  });
}
