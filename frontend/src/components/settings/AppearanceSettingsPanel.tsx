import {
  Badge,
  Group,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  useMantineColorScheme,
} from "@mantine/core";
import { IconPalette } from "@tabler/icons-react";

import Panel from "../ui/Panel";
import {
  ACCENT_OPTIONS,
  type AppAccent,
  useAppAccent,
  useAppDensity,
} from "../../lib/appearance";
import { VERSION_COLORS } from "../../lib/semantic";

// Aparência desta máquina: cor principal, tema claro/escuro e tabelas compactas.
export default function AppearanceSettingsPanel() {
  const [accent, setAccent] = useAppAccent();
  const [density, setDensity] = useAppDensity();
  const { colorScheme, setColorScheme } = useMantineColorScheme();

  return (
    <Panel
      title={
        <Group gap={8}>
          <IconPalette size={16} stroke={1.5} />
          Aparência
        </Group>
      }
      subtitle="Vale só para este computador."
    >
      <SimpleGrid cols={{ base: 1, md: 3 }} spacing="lg">
        <Stack gap={6}>
          <Text size="sm" fw={600}>
            Cor principal
          </Text>
          <SegmentedControl
            fullWidth
            value={accent}
            onChange={(value) => setAccent(value as AppAccent)}
            data={ACCENT_OPTIONS}
          />
          <Text size="xs" c="dimmed">
            Botões, abas e destaques. As cores de entrada, saída e versão não mudam.
          </Text>
        </Stack>

        <Stack gap={6}>
          <Text size="sm" fw={600}>
            Tema
          </Text>
          <SegmentedControl
            fullWidth
            value={colorScheme === "dark" ? "dark" : "light"}
            onChange={(value) => setColorScheme(value as "light" | "dark")}
            data={[
              { value: "light", label: "Claro" },
              { value: "dark", label: "Escuro" },
            ]}
          />
        </Stack>

        <Stack gap={6}>
          <Text size="sm" fw={600}>
            Tabelas
          </Text>
          <Switch
            checked={density === "compact"}
            onChange={(event) =>
              setDensity(event.currentTarget.checked ? "compact" : "normal")
            }
            label="Modo compacto (linhas mais baixas)"
          />
          <Text size="xs" c="dimmed">
            Cabe mais produto e movimentação na tela sem rolar.
          </Text>
        </Stack>
      </SimpleGrid>

      <Group gap="xs" mt="lg">
        <Text size="xs" c="dimmed">
          Cores fixas:
        </Text>
        <Badge color="success">Entrada</Badge>
        <Badge color="orange">Saída</Badge>
        <Badge color="info">Transferência</Badge>
        <Badge color="gray">Ajuste</Badge>
        <Badge color={VERSION_COLORS.NOVA} variant="outline">
          Nova
        </Badge>
        <Badge color={VERSION_COLORS.REMAN} variant="outline">
          Reman
        </Badge>
        <Badge color={VERSION_COLORS.MONTADA} variant="outline">
          Montada
        </Badge>
        <Badge color="danger">Zerado</Badge>
      </Group>
    </Panel>
  );
}
