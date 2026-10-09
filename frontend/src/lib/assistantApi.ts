import { baseUrl } from "./apiClient";
import type { AssistantChatRequest, AssistantChatResponse } from "../types/assistant";
import type { SuccessResponse, ErrorResponse } from "../types/api";

export class AssistantApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number, message: string) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = "AssistantApiError";
  }
}

export async function sendAssistantMessage(req: AssistantChatRequest): Promise<AssistantChatResponse> {
  const isMock = import.meta.env.VITE_ASSISTENTE_MOCK === "1" || import.meta.env.VITE_ASSISTENTE_MOCK === "true";
  
  if (isMock) {
    // Atraso para simular o "pensando" da rede
    await new Promise((resolve) => setTimeout(resolve, 1500));
    
    if (req.mensagem.toLowerCase().includes("erro") || req.mensagem.toLowerCase().includes("indisponivel")) {
      throw new AssistantApiError("assistente_indisponivel", 503, "O assistente não está disponível ou sem internet.");
    }
    
    return {
      resposta: "Scania 440 depende do motor:\n• DC13 Euro 5 (2012+) → *temos 2* (Canoas)\n• DT12 Turbo Compound → *não temos*\nQual é o motor?",
      produtos: [
        {
          id: 7,
          nome: "TURBO GTA42S - 779839-0025",
          categoria: "TURBO",
          estoque_total: 2,
          estoque_por_local: { "Canoas": 2 }
        }
      ],
      ferramentas_usadas: ["buscar_por_aplicacao"]
    };
  }

  const response = await fetch(`${baseUrl}/assistente/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(req),
  });

  const text = await response.text();
  const json = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const err = (json as ErrorResponse)?.error || {
      code: "http_error",
      message: response.statusText || "Ocorreu um erro na requisição.",
    };
    throw new AssistantApiError(err.code, response.status, err.message);
  }

  return (json as SuccessResponse<AssistantChatResponse>).data;
}
