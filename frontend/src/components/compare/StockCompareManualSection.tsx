import { Accordion, Badge, Button, Card, Group, SimpleGrid, Stack, Text, TextInput } from "@mantine/core";

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
    <Accordion variant="separated">
      <Accordion.Item value="manual">
        <Accordion.Control>Modo avancado: comparacao manual</Accordion.Control>
        <Accordion.Panel>
          <Stack gap="md">
            <Text size="sm" c="dimmed">
              Use apenas quando precisar comparar dois arquivos especificos sem depender do servidor local.
            </Text>
            <SimpleGrid cols={{ base: 1, md: 2 }}>
              <Card withBorder>
                <Stack gap="sm">
                  <Text fw={600}>Base A</Text>
                  <TextInput
                    label="Nome da base"
                    value={leftLabel}
                    onChange={(event) => onLeftLabelChange(event.currentTarget.value)}
                    placeholder="Ex: Minha base"
                  />
                  <TextInput
                    label="Caminho do arquivo"
                    value={leftPath}
                    onChange={(event) => onLeftPathChange(event.currentTarget.value)}
                    placeholder="Ex: C:\\Bases\\estoque.db"
                  />
                  <Group>
                    <Button variant="light" onClick={onChooseLeftFile}>
                      Escolher arquivo
                    </Button>
                    <Button variant="subtle" onClick={onUseCurrentDatabase} disabled={!currentDbPath}>
                      Usar base atual
                    </Button>
                  </Group>
                </Stack>
              </Card>

              <Card withBorder>
                <Stack gap="sm">
                  <Text fw={600}>Base B</Text>
                  <TextInput
                    label="Nome da base"
                    value={rightLabel}
                    onChange={(event) => onRightLabelChange(event.currentTarget.value)}
                    placeholder="Ex: Base colega"
                  />
                  <TextInput
                    label="Caminho do arquivo"
                    value={rightPath}
                    onChange={(event) => onRightPathChange(event.currentTarget.value)}
                    placeholder="Ex: C:\\Bases\\colega\\estoque.db"
                  />
                  <Group>
                    <Button variant="light" onClick={onChooseRightFile}>
                      Escolher arquivo
                    </Button>
                  </Group>
                </Stack>
              </Card>
            </SimpleGrid>

            <Group justify="space-between" wrap="wrap">
              <Badge variant="light">Comparacao por ID do produto</Badge>
              <Button onClick={onCompareManual} loading={compareManualLoading}>
                Comparar manualmente
              </Button>
            </Group>
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}
