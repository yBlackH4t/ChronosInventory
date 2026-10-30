import {
  Badge,
  Button,
  ColorInput,
  Group,
  SegmentedControl,
  SimpleGrid,
  Slider,
  Stack,
  Switch,
  Text,
  UnstyledButton,
  useMantineColorScheme,
} from "@mantine/core";
import { IconCheck, IconPalette } from "@tabler/icons-react";

import Panel from "../ui/Panel";
import {
  BACKDROP_OPTIONS,
  CORNER_OPTIONS,
  MENU_OPTIONS,
  MOTION_OPTIONS,
  type Backdrop,
  type Corners,
  type MenuStyle,
  type SchemeMode,
  useAppDensity,
  useAppMotion,
  useAppPalette,
  useBackdrop,
  useCorners,
  useCustomColors,
  useGlow,
  useMenuStyle,
  useSchemeSchedule,
} from "../../lib/appearance";
import { isMotionLevel, type MotionLevel } from "../../lib/motion";
import { useMotionLevel } from "../../lib/motionContext";
import { PALETTES, customPalette, type PaletteDef, type PaletteSeed } from "../../lib/palettes";
import { VERSION_COLORS } from "../../lib/semantic";

const MOTION_HINT: Record<MotionLevel, string> = {
  completo: "Fundo que se move, ícones que pulsam, gráficos com lupa e números que rolam.",
  suave: "Só esmaece ao trocar de tela. Nada se desloca e nada fica piscando.",
  nenhum: "Sem animação e sem desfoque. Para computadores mais lentos.",
};

const SCHEME_HINT: Record<SchemeMode, string> = {
  light: "Sempre claro.",
  dark: "Sempre escuro.",
  sistema: "Segue o claro/escuro do Windows.",
  horario: "Escurece sozinho às 18h e clareia às 7h.",
};

function PaletteHalf({ seed }: { seed: PaletteSeed }) {
  return (
    <span className="vv-pal-half" style={{ background: seed.bg }}>
      <span className="vv-pal-bar" style={{ background: seed.solid }}>
        <i style={{ background: seed.accent }} />
        <i style={{ background: seed.muted, opacity: 0.5 }} />
      </span>
      <span className="vv-pal-body" style={{ background: seed.solid }}>
        <span className="vv-pal-ring" style={{ borderColor: seed.accent, borderRightColor: seed.accent2 }} />
      </span>
    </span>
  );
}

function PaletteCard({ def, active, onPick }: { def: PaletteDef; active: boolean; onPick: () => void }) {
  return (
    <UnstyledButton className="vv-pal" data-active={active || undefined} onClick={onPick} aria-pressed={active}>
      <span className="vv-pal-mini" aria-hidden>
        <PaletteHalf seed={def.light} />
        <PaletteHalf seed={def.dark} />
      </span>
      <span className="vv-pal-check" aria-hidden>
        <IconCheck size={12} stroke={3} />
      </span>
      <span className="vv-pal-meta">
        {def.label}
        <small>{def.hint}</small>
      </span>
    </UnstyledButton>
  );
}

// Aparência desta máquina. "basico": tema, animações, paleta, menu, fundo, cantos e brilho;
// "extra": tabelas compactas e a legenda das cores fixas.
export default function AppearanceSettingsPanel({
  part = "basico",
}: {
  part?: "basico" | "extra";
}) {
  const [palette, setPalette] = useAppPalette();
  const [custom, setCustom] = useCustomColors();
  const [menu, setMenu] = useMenuStyle();
  const [backdrop, setBackdrop] = useBackdrop();
  const [corners, setCorners] = useCorners();
  const [glow, setGlow] = useGlow();
  const [schedule, setSchedule] = useSchemeSchedule();
  const [density, setDensity] = useAppDensity();
  const [motion, setMotion] = useAppMotion();
  const effectiveMotion = useMotionLevel();
  const motionChoice: MotionLevel = isMotionLevel(motion) ? motion : "completo";
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const schemeMode: SchemeMode = schedule
    ? "horario"
    : colorScheme === "auto"
      ? "sistema"
      : colorScheme === "dark"
        ? "dark"
        : "light";

  const pickScheme = (value: SchemeMode) => {
    setSchedule(value === "horario");
    if (value === "sistema") setColorScheme("auto");
    else if (value === "light" || value === "dark") setColorScheme(value);
  };

  if (part === "extra") {
    return (
      <Panel
        title={
          <Group gap={8}>
            <IconPalette size={16} stroke={1.5} />
            Tabelas e cores fixas
          </Group>
        }
        subtitle="Vale só para este computador."
      >
        <Stack gap={6}>
          <Text size="sm" fw={600}>
            Tabelas
          </Text>
          <Switch
            checked={density === "compact"}
            onChange={(event) => setDensity(event.currentTarget.checked ? "compact" : "normal")}
            label="Modo compacto (linhas mais baixas)"
          />
          <Text size="xs" c="dimmed">
            Cabe mais produto e movimentação na tela sem rolar.
          </Text>
        </Stack>
        <Group gap="xs" mt="lg">
          <Text size="xs" c="dimmed">
            Cores fixas em todas as paletas:
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

  return (
    <Panel
      title={
        <Group gap={8}>
          <IconPalette size={16} stroke={1.5} />
          Aparência
        </Group>
      }
      subtitle="Vale só para este computador. Entrada, saída, zerado e versão mantêm as cores em todas as paletas."
    >
      <Stack gap="lg">
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
          <Stack gap={6}>
            <Text size="sm" fw={600}>
              Tema
            </Text>
            <SegmentedControl
              fullWidth
              size="md"
              value={schemeMode}
              onChange={(value) => pickScheme(value as SchemeMode)}
              data={[
                { value: "light", label: "Claro" },
                { value: "dark", label: "Escuro" },
                { value: "sistema", label: "Windows" },
                { value: "horario", label: "Pelo horário" },
              ]}
            />
            <Text size="xs" c="dimmed">
              {SCHEME_HINT[schemeMode]}
            </Text>
          </Stack>

          <Stack gap={6}>
            <Text size="sm" fw={600}>
              Animações
            </Text>
            <SegmentedControl
              fullWidth
              size="md"
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
        </SimpleGrid>

        <Stack gap={8}>
          <Text size="sm" fw={600}>
            Paleta
          </Text>
          <Text size="xs" c="dimmed">
            Troca fundo, painéis, menu, botões e destaques. Na miniatura, a esquerda é o claro e a direita o escuro.
          </Text>
          <div className="vv-pals">
            {PALETTES.map((def) => (
              <PaletteCard key={def.id} def={def} active={palette === def.id} onPick={() => setPalette(def.id)} />
            ))}
            <PaletteCard def={customPalette(custom)} active={palette === "minha"} onPick={() => setPalette("minha")} />
          </div>
          <Group gap="sm" align="flex-end" wrap="wrap">
            <ColorInput
              label="Minha cor: principal"
              value={custom.primary}
              onChange={(value) => setCustom({ ...custom, primary: value })}
              format="hex"
              w={190}
              swatches={["#e11d48", "#7c3aed", "#0d9488", "#ea580c", "#2563eb", "#16a34a", "#db2777", "#475569"]}
            />
            <ColorInput
              label="Segunda cor"
              value={custom.second}
              onChange={(value) => setCustom({ ...custom, second: value })}
              format="hex"
              w={190}
              swatches={["#f59e0b", "#06b6d4", "#a3e635", "#f472b6", "#818cf8", "#facc15"]}
            />
            <Button variant="light" onClick={() => setPalette("minha")} disabled={palette === "minha"}>
              Usar minhas cores
            </Button>
          </Group>
        </Stack>

        <SimpleGrid cols={{ base: 1, md: 3 }} spacing="lg">
          <Stack gap={6}>
            <Text size="sm" fw={600}>
              Menu de cima
            </Text>
            <SegmentedControl fullWidth value={menu} onChange={(value) => setMenu(value as MenuStyle)} data={MENU_OPTIONS} />
          </Stack>
          <Stack gap={6}>
            <Text size="sm" fw={600}>
              Fundo
            </Text>
            <SegmentedControl
              fullWidth
              value={backdrop}
              onChange={(value) => setBackdrop(value as Backdrop)}
              data={BACKDROP_OPTIONS}
            />
            <Text size="xs" c="dimmed">
              "Liso" é o mais leve. Com animação "Nenhum" o fundo fica parado.
            </Text>
          </Stack>
          <Stack gap={6}>
            <Text size="sm" fw={600}>
              Cantos dos painéis
            </Text>
            <SegmentedControl
              fullWidth
              value={corners}
              onChange={(value) => setCorners(value as Corners)}
              data={CORNER_OPTIONS}
            />
          </Stack>
        </SimpleGrid>

        <Stack gap={6} maw={420}>
          <Text size="sm" fw={600}>
            Brilho dos destaques
          </Text>
          <Slider
            value={glow}
            onChange={setGlow}
            min={0}
            max={100}
            step={5}
            label={(value) => `${value}%`}
            marks={[{ value: 0, label: "Sóbrio" }, { value: 100, label: "Neon" }]}
            mb="md"
          />
        </Stack>
      </Stack>
    </Panel>
  );
}
