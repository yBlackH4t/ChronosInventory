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

export interface AssistantConfig {
  configurado: boolean;
  origem_chave: "configuracoes" | "ambiente" | null;
  chave_mascarada: string | null;
  modelo: string;
  esforco: "low" | "medium" | "high" | "xhigh" | "max";
}

export interface AssistantConfigUpdate {
  api_key?: string;
  modelo?: string;
  esforco?: "low" | "medium" | "high" | "xhigh" | "max";
}
