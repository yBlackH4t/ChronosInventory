import { useState } from "react";
import { Button, Group, Radio, ScrollArea, Stack, Text } from "@mantine/core";
import { modals } from "@mantine/modals";

import type { BackupListItemOut } from "../../types/api";
import { backupKind, friendlyDate } from "../../lib/backupLabels";

export const MODAL_ID = "chronos-voltar-copia";

export function RestorePicker({
  backups,
  onRestore,
}: {
  backups: BackupListItemOut[];
  onRestore: (name: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(
    backups[0]?.name ?? null,
  );

  if (backups.length === 0) {
    return (
      <Stack gap="md">
        <Text size="sm">
          Ainda não há nenhuma cópia guardada neste computador.
        </Text>
        <Group justify="flex-end">
          <Button onClick={() => modals.close(MODAL_ID)}>Fechar</Button>
        </Group>
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      <Text size="sm">
        Escolha de quando são os dados que você quer de volta. Tudo o que foi
        lançado depois disso some, mas o Chronos guarda uma cópia de agora
        antes.
      </Text>
      <ScrollArea.Autosize mah={320}>
        <Radio.Group value={selected} onChange={setSelected}>
          <Stack gap="xs">
            {backups.slice(0, 15).map((item) => {
              const kind = backupKind(item.name);
              return (
                <Radio
                  key={item.name}
                  value={item.name}
                  label={friendlyDate(item.created_at)}
                  description={kind || undefined}
                />
              );
            })}
          </Stack>
        </Radio.Group>
      </ScrollArea.Autosize>
      <Group justify="flex-end" gap="sm">
        <Button variant="default" onClick={() => modals.close(MODAL_ID)}>
          Cancelar
        </Button>
        <Button
          color="danger"
          disabled={!selected}
          onClick={() => {
            if (!selected) return;
            modals.close(MODAL_ID);
            onRestore(selected);
          }}
        >
          Voltar esta cópia
        </Button>
      </Group>
    </Stack>
  );
}
