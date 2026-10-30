import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Drawer,
  Menu,
  Modal,
  NumberInput,
  Pagination,
  Popover,
  SegmentedControl,
  Select,
  Table,
  Tabs,
  TextInput,
  Textarea,
  Tooltip,
  createTheme,
  rem,
  type CSSVariablesResolver,
} from "@mantine/core";

// Semantic color aliases for consistent status communication across the app.
export const statusColors = {
  success: "success",
  danger: "danger",
  warning: "warning",
  info: "info",
} as const;

// Sora vem embutida no app (@fontsource/sora), sem internet.
const FONT_STACK =
  'Sora, "Segoe UI Variable", "Segoe UI", system-ui, sans-serif';

export const appTheme = createTheme({
  // Estilo "Vidro suave" (2.6.0): azul-petróleo #0E7490 (tom 6) com degradê até o
  // céu #38BDF8.
  primaryColor: "petrol",
  primaryShade: { light: 6, dark: 6 },
  defaultGradient: { from: "#0e7490", to: "#38bdf8", deg: 135 },

  colors: {
    // Escala escura puxada para o petróleo: o Mantine a usa em toda superfície do tema
    // escuro (campos, controles, menus), então segue os tokens do global.css.
    dark: [
      "#e6eef3",
      "#c5d3dc",
      "#9bb0be",
      "#6b8394",
      "#2c3f4c",
      "#213441",
      "#182a36",
      "#11202b",
      "#0c1821",
      "#070f15",
    ],

    // Cor principal: azul-petróleo, construída em volta de #0E7490 (tom 6).
    petrol: [
      "#e7f6f9",
      "#cfedf3",
      "#a3dde8",
      "#6fc8da",
      "#3fafc7",
      "#1a93ae",
      "#0e7490",
      "#0b5f77",
      "#0a4d61",
      "#083c4c",
    ],

    // Céu: fim do degradê da cor principal e destaque no tema escuro.
    sky: [
      "#f0f9ff",
      "#e0f2fe",
      "#bae6fd",
      "#7dd3fc",
      "#38bdf8",
      "#0ea5e9",
      "#0284c7",
      "#0369a1",
      "#075985",
      "#0c4a6e",
    ],

    // Neutral scale used for text, borders, and surfaces.
    slate: [
      "#f8fafc",
      "#f1f5f9",
      "#e2e8f0",
      "#cbd5e1",
      "#94a3b8",
      "#64748b",
      "#475569",
      "#334155",
      "#1e293b",
      "#0f172a",
    ],

    // Primary brand action color.
    brand: [
      "#eef2ff",
      "#e0e7ff",
      "#c7d2fe",
      "#a5b4fc",
      "#818cf8",
      "#6366f1",
      "#4f46e5",
      "#4338ca",
      "#3730a3",
      "#312e81",
    ],


    // Paletas de Configurações > Aparência (2.7.25): cor principal de cada uma (tom 6).
    esmeralda: ["#ecfdf5", "#d1fae5", "#a7f3d0", "#6ee7b7", "#34d399", "#10b981", "#047857", "#065f46", "#064e3b", "#022c22"],
    oficina: ["#fffbeb", "#fef3c7", "#fde68a", "#fcd34d", "#fbbf24", "#d97706", "#b45309", "#92400e", "#78350f", "#451a03"],
    violeta: ["#f5f3ff", "#ede9fe", "#ddd6fe", "#c4b5fd", "#a78bfa", "#8b5cf6", "#6d28d9", "#5b21b6", "#4c1d95", "#2e1065"],
    turbo: ["#fff1f2", "#ffe4e6", "#fecdd3", "#fda4af", "#fb7185", "#f43f5e", "#be123c", "#9f1239", "#881337", "#4c0519"],
    oceano: ["#eff6ff", "#dbeafe", "#bfdbfe", "#93c5fd", "#60a5fa", "#3b82f6", "#1d4ed8", "#1e40af", "#1e3a8a", "#172554"],
    cyber: ["#ecfeff", "#cffafe", "#a5f3fc", "#67e8f9", "#22d3ee", "#06b6d4", "#0891b2", "#0e7490", "#155e75", "#083344"],

    success: [
      "#ecfdf3",
      "#d1fae5",
      "#a7f3d0",
      "#6ee7b7",
      "#34d399",
      "#10b981",
      "#059669",
      "#047857",
      "#065f46",
      "#064e3b",
    ],

    warning: [
      "#fffbeb",
      "#fef3c7",
      "#fde68a",
      "#fcd34d",
      "#fbbf24",
      "#f59e0b",
      "#d97706",
      "#b45309",
      "#92400e",
      "#78350f",
    ],

    danger: [
      "#fef2f2",
      "#fee2e2",
      "#fecaca",
      "#fca5a5",
      "#f87171",
      "#ef4444",
      "#dc2626",
      "#b91c1c",
      "#991b1b",
      "#7f1d1d",
    ],

    info: [
      "#eff6ff",
      "#dbeafe",
      "#bfdbfe",
      "#93c5fd",
      "#60a5fa",
      "#3b82f6",
      "#2563eb",
      "#1d4ed8",
      "#1e40af",
      "#1e3a8a",
    ],
  },

  black: "#10222e",
  white: "#ffffff",

  defaultRadius: "md",
  radius: {
    xs: rem(6),
    sm: rem(8),
    md: rem(10),
    lg: rem(12),
    xl: rem(16),
  },

  spacing: {
    xs: rem(8),
    sm: rem(12),
    md: rem(16),
    lg: rem(24),
    xl: rem(32),
  },

  fontFamily: FONT_STACK,
  fontFamilyMonospace:
    '"Cascadia Mono", "Cascadia Code", Consolas, ui-monospace, monospace',
  fontSizes: {
    xs: rem(12),
    sm: rem(13.5),
    md: rem(14.5),
    lg: rem(16),
    xl: rem(19),
  },

  headings: {
    fontFamily: FONT_STACK,
    fontWeight: "600",
    sizes: {
      h1: { fontSize: rem(28), lineHeight: "1.15", fontWeight: "600" },
      h2: { fontSize: rem(23), lineHeight: "1.2", fontWeight: "600" },
      h3: { fontSize: rem(18), lineHeight: "1.25", fontWeight: "600" },
      h4: { fontSize: rem(16), lineHeight: "1.3", fontWeight: "600" },
      h5: { fontSize: rem(14.5), lineHeight: "1.35", fontWeight: "600" },
      h6: { fontSize: rem(13.5), lineHeight: "1.35", fontWeight: "600" },
    },
  },

  // Sombras suaves e largas do vidro (azuladas, nunca pretas).
  shadows: {
    xs: "0 1px 2px rgba(15, 40, 60, 0.05)",
    sm: "0 1px 2px rgba(15, 40, 60, 0.04), 0 8px 28px rgba(15, 40, 60, 0.07)",
    md: "0 2px 6px rgba(15, 40, 60, 0.06), 0 16px 40px rgba(15, 40, 60, 0.12)",
    lg: "0 4px 10px rgba(15, 40, 60, 0.08), 0 20px 48px rgba(15, 40, 60, 0.16)",
    xl: "0 8px 16px rgba(15, 40, 60, 0.10), 0 28px 64px rgba(15, 40, 60, 0.22)",
  },

  components: {
    Button: Button.extend({
      defaultProps: {
        size: "sm",
        radius: "md",
        fw: 550,
      },
    }),

    ActionIcon: ActionIcon.extend({
      defaultProps: {
        radius: "md",
        variant: "subtle",
      },
    }),

    // Vidro (fundo, borda, sombra e desfoque) vem do global.css.
    Card: Card.extend({
      defaultProps: {
        withBorder: true,
        radius: "xl",
        shadow: "none",
        p: "lg",
      },
    }),

    TextInput: TextInput.extend({
      defaultProps: { size: "sm", radius: "md" },
    }),

    NumberInput: NumberInput.extend({
      defaultProps: { size: "sm", radius: "md" },
    }),

    Select: Select.extend({
      defaultProps: {
        size: "sm",
        radius: "md",
        comboboxProps: { shadow: "md", radius: "lg" },
      },
    }),

    Textarea: Textarea.extend({
      defaultProps: { size: "sm", radius: "md" },
    }),

    SegmentedControl: SegmentedControl.extend({
      defaultProps: { radius: "lg" },
    }),

    Badge: Badge.extend({
      defaultProps: {
        radius: "sm",
        variant: "light",
      },
      // Dois tamanhos só: pequeno (xs/sm, 11px) e normal (md em diante, 12px).
      // O padrão do Mantine descia a 9px no "xs", ilegível no balcão.
      vars: (_theme, props) => {
        const small = props.size === "xs" || props.size === "sm";
        return {
          root: {
            "--badge-fz": small ? rem(11) : rem(12),
            "--badge-height": small ? rem(20) : rem(22),
          },
        };
      },
      styles: {
        root: { fontWeight: 600, letterSpacing: "0.02em" },
      },
    }),

    Tooltip: Tooltip.extend({
      defaultProps: {
        openDelay: 300,
        radius: "sm",
      },
    }),

    Menu: Menu.extend({
      defaultProps: {
        radius: "lg",
        shadow: "md",
        transitionProps: { transition: "pop-top-right", duration: 120 },
      },
    }),

    Popover: Popover.extend({
      defaultProps: {
        radius: "lg",
        shadow: "md",
        transitionProps: { transition: "pop", duration: 120 },
      },
    }),

    Pagination: Pagination.extend({
      defaultProps: { radius: "md" },
    }),

    Tabs: Tabs.extend({
      defaultProps: { radius: "md" },
    }),

    Table: Table.extend({
      defaultProps: {
        stickyHeader: true,
        highlightOnHover: true,
        horizontalSpacing: "md",
        verticalSpacing: "sm",
      },
    }),

    Modal: Modal.extend({
      defaultProps: {
        centered: true,
        radius: "xl",
        shadow: "xl",
        overlayProps: {
          backgroundOpacity: 0.45,
          blur: 3,
        },
        transitionProps: { transition: "pop", duration: 160 },
      },
    }),

    Drawer: Drawer.extend({
      defaultProps: {
        radius: 0,
        shadow: "xl",
        overlayProps: {
          backgroundOpacity: 0.45,
          blur: 3,
        },
        transitionProps: { duration: 180 },
      },
    }),
  },
});

// No tema claro, o tom padrão (6) de âmbar e verde não dá contraste de texto
// (d97706 3,2:1; 059669 3,8:1). Texto, contorno e variante "light" usam um tom
// mais escuro; "filled" usa o tom 7, que segura texto branco (>= 4,5:1).
const LIGHT_TEXT_SHADES: Record<string, number> = {
  petrol: 7,
  warning: 8,
  success: 8,
  danger: 7,
  info: 7,
};

const lightTextOverrides: Record<string, string> = Object.fromEntries(
  Object.entries(LIGHT_TEXT_SHADES).flatMap(([name, shade]) => [
    [`--mantine-color-${name}-text`, `var(--mantine-color-${name}-${shade})`],
    [`--mantine-color-${name}-light-color`, `var(--mantine-color-${name}-${shade})`],
    [`--mantine-color-${name}-outline`, `var(--mantine-color-${name}-${shade})`],
  ]),
);

// Aligns Mantine's own surface variables with the tokens in global.css.
export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {},
  light: {
    // Fundo de Paper/campos; a página usa --bg (global.css), com as manchas de cor.
    "--mantine-color-body": "#ffffff",
    "--mantine-color-default-border": "#d5dee4",
    // #4F6371: 5,6:1 sobre o fundo #EEF3F6 e mais sobre o vidro.
    "--mantine-color-dimmed": "#4f6371",
    "--mantine-color-text": "#10222e",
    ...lightTextOverrides,
    "--mantine-color-warning-filled": "var(--mantine-color-warning-7)",
    "--mantine-color-warning-filled-hover": "var(--mantine-color-warning-8)",
    "--mantine-color-success-filled": "var(--mantine-color-success-7)",
    "--mantine-color-success-filled-hover": "var(--mantine-color-success-8)",
  },
  dark: {
    "--mantine-color-body": "#11202b",
    "--mantine-color-default-border": "rgba(155, 176, 190, 0.18)",
    "--mantine-color-dimmed": "#9bb0be",
    "--mantine-color-text": "#e6eef3",
  },
});
