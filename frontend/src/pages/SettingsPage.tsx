import { SimpleGrid, Stack, Text } from "@mantine/core";
import { IconChevronRight } from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/ui/PageHeader";
import { ADMIN_NAV, usePrefetchRoute } from "../app/navigation";
import AssistantSettingsPanel from "../components/settings/AssistantSettingsPanel";

export default function SettingsPage() {
  const navigate = useNavigate();
  const prefetch = usePrefetchRoute();
  const groups = ADMIN_NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.to !== "/configuracoes"),
  }));

  return (
    <Stack gap="lg">
      <PageHeader
        title="Configurações"
        subtitle="Filiais, perfis de estoque, dados e manutenção do sistema."
      />

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg" verticalSpacing="lg">
        {groups.map((group) => (
          <Stack key={group.title} gap={8}>
            <Text size="xs" fw={600} c="dimmed" tt="uppercase" lts="0.06em">
              {group.title}
            </Text>
            <div className="surface-panel" style={{ overflow: "hidden" }}>
              {group.items.map((item) => (
                <button
                  key={item.to}
                  type="button"
                  className="settings-item"
                  onClick={() => navigate(item.to)}
                  onMouseEnter={() => prefetch(item.to)}
                >
                  <span className="settings-item-icon">
                    <item.icon size={18} stroke={1.5} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <Text size="sm" fw={600}>
                      {item.label}
                    </Text>
                    {item.description && (
                      <Text size="xs" c="dimmed" truncate>
                        {item.description}
                      </Text>
                    )}
                  </span>
                  <IconChevronRight
                    size={16}
                    stroke={1.5}
                    color="var(--text-subtle)"
                  />
                </button>
              ))}
            </div>
          </Stack>
        ))}
      </SimpleGrid>

      <AssistantSettingsPanel />
    </Stack>
  );
}
