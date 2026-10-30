import { useEffect, useState } from "react";
import { Tooltip } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getAssistantPanel } from "../../lib/dashboardApi";
import { robotStatus } from "../../lib/dashboardBento";
import { useProfileScope } from "../../state/profileScope";
import { saveUptimeSample } from "../../lib/whatsappUptime";

// Robô do WhatsApp na barra de cima: o ponto "bate" enquanto está ligado e, quando chega
// pergunta nova, sobe um balãozinho "+1 pergunta". Sem a rota (backend antigo), some.
export default function WhatsAppPill() {
  const { profileScopeKey } = useProfileScope();
  const query = useQuery({
    queryKey: ["assistant-panel", profileScopeKey],
    queryFn: ({ signal }) => getAssistantPanel(signal),
    retry: false,
    refetchInterval: 60_000,
  });
  const panel = query.data;
  const [previous, setPrevious] = useState<number | null>(null);
  const [bubble, setBubble] = useState<{ key: number; count: number } | null>(null);

  // Pergunta nova desde a última conferência: balãozinho (ele mesmo some pelo CSS).
  if (panel && panel.perguntas_hoje !== previous) {
    if (previous !== null && panel.perguntas_hoje > previous) {
      setBubble({ key: panel.perguntas_hoje, count: panel.perguntas_hoje - previous });
    }
    setPrevious(panel.perguntas_hoje);
  }

  // Cada conferência entra na faixa "WhatsApp hoje" do Painel.
  useEffect(() => {
    if (!panel || !panel.whatsapp_ativo) return;
    saveUptimeSample(panel.whatsapp_estado === "conectado");
  }, [panel, query.dataUpdatedAt]);


  if (!panel || query.isError) return null;
  if (!panel.whatsapp_ativo && panel.whatsapp_estado !== "conectado") return null;
  const robot = robotStatus(panel.whatsapp_estado, panel.whatsapp_ativo);
  const tone = robot.tone === "success" ? "ok" : robot.tone === "warning" ? "warn" : robot.tone === "danger" ? "danger" : "off";

  return (
    <Tooltip label={`${robot.label} · ${panel.perguntas_hoje} ${panel.perguntas_hoje === 1 ? "pergunta" : "perguntas"} hoje`}>
      <Link to="/assistente" className="profile-pill vv-wa-pill" aria-label={robot.label}>
        <span className="vv-wa-dot" data-tone={tone} data-beat={robot.pulse || undefined} aria-hidden />
        WhatsApp
        {bubble ? (
          <span key={bubble.key} className="vv-wa-bubble" aria-live="polite">
            +{bubble.count} {bubble.count === 1 ? "pergunta" : "perguntas"}
          </span>
        ) : null}
      </Link>
    </Tooltip>
  );
}
