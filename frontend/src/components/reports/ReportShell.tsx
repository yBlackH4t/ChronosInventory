import type { ReactNode } from "react";
import { Badge, Divider, Group, Stack, Text } from "@mantine/core";
import { IconFileTypePdf } from "@tabler/icons-react";

import "../../styles/vidro-telas.css";

type ReportShellProps = {
  title: string;
  description: ReactNode;
  /** Parameters of the report (dates, scope, item list...). */
  children?: ReactNode;
  /** Left side of the footer: hint text. */
  footerHint?: ReactNode;
  /** Right side of the footer: the generate button. */
  action: ReactNode;
  /** Miniatura do PDF (ReportPaperPreview), à direita. */
  preview?: ReactNode;
};

// Shared frame for every report: what it is, its parameters, a preview, one action.
export default function ReportShell({
  title,
  description,
  children,
  footerHint,
  action,
  preview,
}: ReportShellProps) {
  return (
    <div className="vt-report surface-panel">
      <div className="vt-report-body" data-has-preview={preview ? true : undefined}>
        <Stack gap="md" miw={0} style={{ flex: 1 }}>
          <Group gap="sm" wrap="nowrap" align="flex-start">
            <span className="vt-report-icon" aria-hidden>
              <IconFileTypePdf size={20} stroke={1.6} />
            </span>
            <Stack gap={4} miw={0}>
              <Group gap="xs">
                <Text fw={650} size="lg" lh={1.25}>
                  {title}
                </Text>
                <Badge size="xs" variant="light" radius="sm">
                  PDF
                </Badge>
              </Group>
              <Text size="sm" c="dimmed" maw={560}>
                {description}
              </Text>
            </Stack>
          </Group>
          {children ? <div className="vt-report-params">{children}</div> : null}
        </Stack>
        {preview}
      </div>
      <Divider color="var(--border)" />
      <Group justify="space-between" px="lg" py="sm" wrap="wrap" gap="sm" className="vt-report-foot">
        <Text size="xs" c="dimmed">
          {footerHint}
        </Text>
        {action}
      </Group>
    </div>
  );
}
