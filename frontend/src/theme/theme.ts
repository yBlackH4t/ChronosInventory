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

const FONT_STACK =
  '"Inter Variable", Inter, "Segoe UI Variable", "Segoe UI", system-ui, sans-serif';

export const appTheme = createTheme({
  primaryColor: "brand",
  primaryShade: { light: 6, dark: 5 },

  colors: {
    // Slate-tinted dark scale: Mantine uses it for every dark-mode surface
    // (inputs, segmented controls, menus), so it must match the app tokens.
    dark: [
      "#e2e8f0",
      "#cbd5e1",
      "#94a3b8",
      "#64748b",
      "#2a3850",
      "#1a2740",
      "#162235",
      "#0f172a",
      "#0b0f17",
      "#070a10",
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

    // Accent support color for informational emphasis.
    accent: [
      "#ecfeff",
      "#cffafe",
      "#a5f3fc",
      "#67e8f9",
      "#22d3ee",
      "#06b6d4",
      "#0891b2",
      "#0e7490",
      "#155e75",
      "#164e63",
    ],

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

  black: "#0f172a",
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
    fontWeight: "650",
    sizes: {
      h1: { fontSize: rem(30), lineHeight: "1.15", fontWeight: "650" },
      h2: { fontSize: rem(24), lineHeight: "1.2", fontWeight: "650" },
      h3: { fontSize: rem(19), lineHeight: "1.25", fontWeight: "650" },
      h4: { fontSize: rem(16), lineHeight: "1.3", fontWeight: "600" },
      h5: { fontSize: rem(14.5), lineHeight: "1.35", fontWeight: "600" },
      h6: { fontSize: rem(13.5), lineHeight: "1.35", fontWeight: "600" },
    },
  },

  shadows: {
    xs: "0 1px 2px rgba(15, 23, 42, 0.05)",
    sm: "0 2px 8px rgba(15, 23, 42, 0.06)",
    md: "0 8px 24px rgba(15, 23, 42, 0.10)",
    lg: "0 12px 32px rgba(15, 23, 42, 0.16)",
    xl: "0 24px 56px rgba(15, 23, 42, 0.24)",
  },

  components: {
    Button: Button.extend({
      defaultProps: {
        size: "sm",
        radius: "md",
        fw: 550,
      },
      styles: {
        root: {
          transition:
            "background-color 120ms ease, border-color 120ms ease, color 120ms ease",
        },
      },
    }),

    ActionIcon: ActionIcon.extend({
      defaultProps: {
        radius: "md",
        variant: "subtle",
      },
    }),

    Card: Card.extend({
      defaultProps: {
        withBorder: true,
        radius: "lg",
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
        comboboxProps: { shadow: "md", radius: "md" },
      },
    }),

    Textarea: Textarea.extend({
      defaultProps: { size: "sm", radius: "md" },
    }),

    SegmentedControl: SegmentedControl.extend({
      defaultProps: { radius: "md" },
    }),

    Badge: Badge.extend({
      defaultProps: {
        radius: "sm",
        variant: "light",
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
        radius: "md",
        shadow: "md",
        transitionProps: { transition: "pop-top-right", duration: 120 },
      },
    }),

    Popover: Popover.extend({
      defaultProps: {
        radius: "md",
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
        radius: "lg",
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

// Aligns Mantine's own surface variables with the tokens in global.css.
export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {},
  light: {
    "--mantine-color-body": "#f8fafc",
    "--mantine-color-default-border": "#e2e8f0",
    "--mantine-color-dimmed": "#64748b",
  },
  dark: {
    "--mantine-color-body": "#0b0f17",
    "--mantine-color-default-border": "rgba(148, 163, 184, 0.16)",
    "--mantine-color-dimmed": "#94a3b8",
  },
});
