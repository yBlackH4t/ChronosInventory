import { modals } from "@mantine/modals";

import type { BackupListItemOut } from "../../types/api";
import { MODAL_ID, RestorePicker } from "./RestorePickerModal";

export function openRestorePicker(
  backups: BackupListItemOut[],
  onRestore: (name: string) => void,
) {
  modals.open({
    modalId: MODAL_ID,
    title: "Voltar uma cópia",
    centered: true,
    children: <RestorePicker backups={backups} onRestore={onRestore} />,
  });
}
