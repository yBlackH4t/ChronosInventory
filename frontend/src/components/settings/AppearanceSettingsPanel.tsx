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
  MOTION_OPTIONS,
  type AppAccent,
  useAppAccent,
  useAppDensity,
  useAppMotion,
} from "../../lib/appearance";
import { isMotionLevel, type MotionLevel } from "../../lib/motion";
import { useMotionLevel } from "../../lib/motionContext";
import { VERSION_COLORS } from "../../lib/semantic";

const MOTION_HINT: Record<MotionLevel, string> = {
  completo: "Fundo que se move, telas que deslizam e números que rolam.",
  suave: "Só esmaece ao trocar de tela. Nada se desloca.",
  nenhum: "Sem animação e sem desfoque. Para computadores mais lentos.",
};

// Aparência desta máquina: cor principal, tema claro/escuro, animações e tabelas compactas.
export default function AppearanceSettingsPanel() {
  const [accent, setAccent] = useAppAccent();
  const [density, setDensity] = useAppDensity();
  const [motion, setMotion] = useAppMotion();
  const effectiveMotion = useMotionLevel();
  const motionChoice: MotionLevel = isMotionLevel(motion) ? motion : "completo";
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
      <SimpleGrid cols={{ base: 1, md: 2, xl: 4 }} spacing="lg">
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
            Animações
          </Text>
          <SegmentedControl
            fullWidth
            value={motionChoice}
            onChange={(value) => {
              if (isMotionLevel(value)) setMotion(value);
            }}
            data={MOTION_OPTIONS}
          />
          <Text size="xs" c="dimmed">
            {MOTION_HINT[motionChoice]}
            {effectiveMotion !== motionChoice &&
              " O Windows está com “Efeitos de animação” desligado, então fica no Suave."}
          </Text>
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
