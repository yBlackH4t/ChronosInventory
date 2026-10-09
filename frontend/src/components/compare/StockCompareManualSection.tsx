import {
  Accordion,
  Button,
  Group,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";

type Props = {
  leftLabel: string;
  onLeftLabelChange: (value: string) => void;
  leftPath: string;
  onLeftPathChange: (value: string) => void;
  rightLabel: string;
  onRightLabelChange: (value: string) => void;
  rightPath: string;
  onRightPathChange: (value: string) => void;
  currentDbPath: string;
  onUseCurrentDatabase: () => void;
  onChooseLeftFile: () => void;
  onChooseRightFile: () => void;
  onCompareManual: () => void;
  compareManualLoading: boolean;
};

export default function StockCompareManualSection({
  leftLabel,
  onLeftLabelChange,
  leftPath,
  onLeftPathChange,
  rightLabel,
  onRightLabelChange,
  rightPath,
  onRightPathChange,
  currentDbPath,
  onUseCurrentDatabase,
  onChooseLeftFile,
  onChooseRightFile,
  onCompareManual,
  compareManualLoading,
}: Props) {
  return (
    <div className="surface-panel" style={{ overflow: "hidden" }}>
    <Accordion chevronPosition="right">
      <Accordion.Item value="manual" style={{ borderBottom: 0 }}>
        <Accordion.Control>
          <Text size="sm" fw={600}>
            Comparação manual entre arquivos
          </Text>
          <Text size="xs" c="dimmed">
            Para comparar dois arquivos .db específicos sem usar o servidor local
          </Text>
        </Accordion.Control>
        <Accordion.Panel>
          <Stack gap="md">
            <SimpleGrid cols={{ base: 1, md: 2 }}>
              <Stack gap="sm">
                  <Text size="xs" fw={600} c="dimmed" tt="uppercase" lts="0.06em">Base A</Text>
                  <TextInput
                    label="Nome da base"
                    value={leftLabel}
                    onChange={(event) =>
                      onLeftLabelChange(event.currentTarget.value)
                    }
                    placeholder="Ex: Minha base"
                  />
                  <TextInput
                    label="Caminho do arquivo"
                    value={leftPath}
                    onChange={(event) =>
                      onLeftPathChange(event.currentTarget.value)
                    }
                    placeholder="Ex: C:\\Bases\\estoque.db"
                  />
                  <Group>
                    <Button variant="default" onClick={onChooseLeftFile}>
                      Escolher arquivo
                    </Button>
                    <Button
                      variant="subtle"
                      color="gray"
                      onClick={onUseCurrentDatabase}
                      disabled={!currentDbPath}
                    >
                      Usar base atual
                    </Button>
                  </Group>
                </Stack>

              <Stack gap="sm">
                  <Text size="xs" fw={600} c="dimmed" tt="uppercase" lts="0.06em">Base B</Text>
                  <TextInput
                    label="Nome da base"
                    value={rightLabel}
                    onChange={(event) =>
                      onRightLabelChange(event.currentTarget.value)
                    }
                    placeholder="Ex: Base colega"
                  />
                  <TextInput
                    label="Caminho do arquivo"
                    value={rightPath}
                    onChange={(event) =>
                      onRightPathChange(event.currentTarget.value)
                    }
                    placeholder="Ex: C:\\Bases\\colega\\estoque.db"
                  />
                  <Group>
                    <Button variant="default" onClick={onChooseRightFile}>
                      Escolher arquivo
                    </Button>
                  </Group>
                </Stack>
            </SimpleGrid>

            <Group justify="space-between" wrap="wrap">
              <Text size="xs" c="dimmed">
                Os itens são casados pelo ID do produto.
              </Text>
              <Button onClick={onCompareManual} loading={compareManualLoading}>
                Comparar manualmente
              </Button>
            </Group>
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
    </div>
  );
}
