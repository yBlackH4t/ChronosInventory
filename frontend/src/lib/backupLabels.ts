import dayjs from "dayjs";

const KIND_LABELS: Array<[string, string]> = [
  ["backup_pre_update_", "antes de atualizar o Chronos"],
  ["backup_pre_base_oficial_", "antes de pegar a base da principal"],
  ["backup_pre_restore_", "antes de voltar uma cópia"],
  ["backup_pre_recuperar_fotos_", "antes de recuperar fotos"],
  ["backup_auto_", ""],
];

/** "Hoje às 18:00", "Ontem às 09:12" ou "27/10 às 18:00". */
export function friendlyDate(value: string | Date): string {
  const date = dayjs(value);
  const time = date.format("HH:mm");
  if (date.isSame(dayjs(), "day")) return `Hoje às ${time}`;
  if (date.isSame(dayjs().subtract(1, "day"), "day")) return `Ontem às ${time}`;
  return `${date.format("DD/MM")} às ${time}`;
}

/** Nome do arquivo de backup em palavras: quando foi feito e por quê. */
export function backupKind(name: string): string {
  const found = KIND_LABELS.find(([prefix]) => name.startsWith(prefix));
  return found ? found[1] : "cópia guardada à mão";
}
