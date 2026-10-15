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
  categoria: string | null;
  estoque_total: number;
  estoque_por_local: Record<string, number>;
}

export type AssistantResponseMode = "ia" | "busca_direta";

export interface AssistantChatResponse {
  resposta: string;
  produtos: AssistantProduct[];
  ferramentas_usadas: string[];
  modo: AssistantResponseMode;
  aviso: string | null;
  leitura_foto?: string | null;
  /** A IA não soube se os dois códigos são a mesma peça: botões Igual / Similar / Diferente. */
  ensinar?: { codigo_a: string; codigo_b: string; pesquisar?: boolean } | null;
}

export type AssistantProviderId = "groq" | "gemini" | "ollama" | "anthropic" | "nenhum";

export type AssistantEffort = "low" | "medium" | "high" | "xhigh" | "max";

export type AssistantKeyOrigin = "configuracoes" | "ambiente" | null;

export interface AssistantProvider {
  id: AssistantProviderId;
  nome: string;
  gratuito: boolean;
  precisa_chave: boolean;
  configurado: boolean;
  origem_chave: AssistantKeyOrigin;
  chave_mascarada: string | null;
  modelo: string | null;
}

export interface AssistantConfig {
  provedor: AssistantProviderId;
  configurado: boolean;
  origem_chave: AssistantKeyOrigin;
  chave_mascarada: string | null;
  modelo: string | null;
  esforco: AssistantEffort;
  provedores: AssistantProvider[];
}

export interface AssistantConfigUpdate {
  provedor?: AssistantProviderId;
  api_key?: string;
  modelo?: string;
  esforco?: AssistantEffort;
}
