import { Stack, Text } from "@mantine/core";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/ui/PageHeader";
import {
  ActionGrid,
  ActionTile,
  AdvancedSection,
} from "../components/ui/SimpleScreen";
import { ADMIN_NAV, usePrefetchRoute } from "../app/navigation";
import AssistantSettingsPanel from "../components/settings/AssistantSettingsPanel";
import AppearanceSettingsPanel from "../components/settings/AppearanceSettingsPanel";
import DesktopSettingsPanel from "../components/settings/DesktopSettingsPanel";

export default function SettingsPage() {
  const navigate = useNavigate();
  const prefetch = usePrefetchRoute();
  const screens = ADMIN_NAV.flatMap((group) => group.items).filter(
    (item) => item.to !== "/configuracoes",
  );

  return (
    <Stack gap="lg">
      <PageHeader
        title="Configurações"
        subtitle="Aparência, este computador e as outras telas do Chronos."
      />

      <AppearanceSettingsPanel />

      <DesktopSettingsPanel />

      <Stack gap="sm">
        <Text className="ts-section-label">Outras telas</Text>
        <ActionGrid>
          {screens.map((item) => (
            <div key={item.to} onMouseEnter={() => prefetch(item.to)}>
              <ActionTile
                icon={item.icon}
                title={item.label}
                text={item.description ?? ""}
                onClick={() => navigate(item.to)}
              />
            </div>
          ))}
        </ActionGrid>
      </Stack>

      <AdvancedSection hint="Tabelas compactas e a chave do assistente de IA. Só para quem configura.">
        <AppearanceSettingsPanel part="extra" />
        <AssistantSettingsPanel />
      </AdvancedSection>
    </Stack>
  );
}
