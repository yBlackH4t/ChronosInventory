import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Drawer,
  Modal,
  NumberInput,
  Select,
  Table,
  TextInput,
  Textarea,
  createTheme,
  rem,
} from "@mantine/core";

// Semantic color aliases for consistent status communication across the app.
export const statusColors = {
  success: "success",
  danger: "danger",
  warning: "warning",
  info: "info",
} as const;

export const appTheme = createTheme({
  primaryColor: "brand",
  primaryShade: { light: 6, dark: 5 },

  colors: {
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
    lg: rem(14),
    xl: rem(18),
  },

  spacing: {
    xs: rem(8),
    sm: rem(12),
    md: rem(16),
    lg: rem(24),
    xl: rem(32),
  },

  fontFamily: "Manrope, Segoe UI, system-ui, sans-serif",
  fontSizes: {
    xs: rem(12),
    sm: rem(14),
    md: rem(15),
    lg: rem(17),
    xl: rem(20),
  },

  headings: {
    fontFamily: "Manrope, Segoe UI, system-ui, sans-serif",
    sizes: {
      h1: { fontSize: rem(32), lineHeight: "1.15", fontWeight: "700" },
      h2: { fontSize: rem(28), lineHeight: "1.2", fontWeight: "700" },
      h3: { fontSize: rem(20), lineHeight: "1.25", fontWeight: "700" },
      h4: { fontSize: rem(17), lineHeight: "1.3", fontWeight: "650" },
      h5: { fontSize: rem(15), lineHeight: "1.35", fontWeight: "650" },
      h6: { fontSize: rem(14), lineHeight: "1.35", fontWeight: "600" },
    },
  },

  shadows: {
    xs: "0 1px 2px rgba(15, 23, 42, 0.05)",
    sm: "0 2px 6px rgba(15, 23, 42, 0.08)",
    md: "0 6px 18px rgba(15, 23, 42, 0.12)",
    lg: "0 10px 30px rgba(15, 23, 42, 0.16)",
    xl: "0 18px 40px rgba(15, 23, 42, 0.2)",
  },

  components: {
    Button: Button.extend({
      defaultProps: {
        size: "sm",
        radius: "md",
        fw: 600,
      },
      styles: {
        root: {
          transition: "transform 120ms ease, box-shadow 120ms ease, background-color 120ms ease",
        },
      },
    }),

    ActionIcon: ActionIcon.extend({
      defaultProps: {
        radius: "md",
        variant: "light",
      },
    }),

    Card: Card.extend({
      defaultProps: {
        withBorder: true,
        radius: "md",
        shadow: "xs",
        p: "lg",
      },
    }),

    TextInput: TextInput.extend({
      defaultProps: { size: "sm" },
      styles: {
        input: {
          borderColor: "var(--mantine-color-slate-3)",
        },
      },
    }),

    NumberInput: NumberInput.extend({
      defaultProps: { size: "sm" },
      styles: {
        input: {
          borderColor: "var(--mantine-color-slate-3)",
        },
      },
    }),

    Select: Select.extend({
      defaultProps: { size: "sm" },
      styles: {
        input: {
          borderColor: "var(--mantine-color-slate-3)",
        },
      },
    }),

    Textarea: Textarea.extend({
      defaultProps: { size: "sm" },
      styles: {
        input: {
          borderColor: "var(--mantine-color-slate-3)",
        },
      },
    }),

    Badge: Badge.extend({
      defaultProps: {
        radius: "sm",
        variant: "light",
      },
    }),

    Table: Table.extend({
      defaultProps: {
        withTableBorder: true,
        stickyHeader: true,
        horizontalSpacing: "sm",
        verticalSpacing: "sm",
      },
      styles: {
        th: {
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          fontSize: rem(11),
          fontWeight: 700,
        },
      },
    }),

    Modal: Modal.extend({
      defaultProps: {
        centered: true,
        radius: "lg",
        shadow: "md",
        overlayProps: {
          backgroundOpacity: 0.35,
          blur: 3,
        },
      },
    }),

    Drawer: Drawer.extend({
      defaultProps: {
        radius: "lg",
        shadow: "md",
        overlayProps: {
          backgroundOpacity: 0.3,
          blur: 2,
        },
      },
    }),
  },
});
