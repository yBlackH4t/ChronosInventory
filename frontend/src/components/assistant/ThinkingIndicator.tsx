import { IconMessageChatbot } from "@tabler/icons-react";

// "Pensando": três pontos num balão enquanto a resposta não chega. Pulam no "Completo",
// piscam no "Suave" e ficam parados no "Nenhum" (assistantChat.css).
export default function ThinkingIndicator({ label }: { label: string }) {
  return (
    <div className="chat-row" data-from="assistente">
      {/* Bolinha que "respira" enquanto a IA procura (2.7.25). */}
      <span className="chat-avatar vv-orb-avatar" aria-hidden>
        <span className="vv-orb" />
        <IconMessageChatbot size={16} className="vv-orb-icon" />
      </span>
      <div className="chat-thinking" role="status" aria-live="polite">
        <span className="chat-dots" aria-hidden>
          <span />
          <span />
          <span />
        </span>
        <span className="chat-thinking-label">{label}</span>
      </div>
    </div>
  );
}
