export type AssistantMessageRole = "usuario" | "assistente";

export interface AssistantMessage {
  papel: AssistantMessageRole;
  texto: string;
}

export interface AssistantChatRequest {
  mensagem: string;
  historico: AssistantMessage[];
}

export interface AssistantProduct {
  id: number;
  nome: string;
  categoria: string;
  estoque_total: number;
  estoque_por_local: Record<string, number>;
}

export interface AssistantChatResponse {
  resposta: string;
  produtos: AssistantProduct[];
  ferramentas_usadas: string[];
}
