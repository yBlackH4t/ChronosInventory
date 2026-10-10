export interface AdminStatus {
  maquina_publicadora: boolean;
  senha_definida: boolean;
  autenticado: boolean;
}

export interface AdminPasswordRequest {
  senha_nova: string;
  senha_atual?: string;
}

export interface AdminLoginResponse {
  token: string;
  expira_em: number;
}

export type KnowledgeRelation = "igual" | "similar" | "diferente";

export interface KnowledgeRule {
  id: number;
  codigo_a: string;
  codigo_b: string;
  tipo: KnowledgeRelation;
  observacao: string | null;
  criado_em: string | null;
  atualizado_em: string | null;
}

export interface KnowledgeRuleRequest {
  codigo_a: string;
  codigo_b: string;
  tipo: KnowledgeRelation;
  observacao?: string;
}

export interface ReviewSuggestion {
  codigo: string;
  produto_id: number;
  nome: string;
  estoque_total: number;
  motivo: string;
}

export interface ReviewRelation {
  codigo: string;
  relacao: "igual" | "similar";
  obs: string | null;
}

export interface ReviewItem {
  codigo: string;
  vezes: number;
  ultima_vez: string;
  exemplo: string;
  conversas: number[];
  conhecimento: ReviewRelation[];
  sugestoes: ReviewSuggestion[];
}

export interface Conversation {
  id: number;
  data: string;
  canal: string;
  autor: string | null;
  historico: Array<Record<string, unknown>>;
  pergunta: string;
  resposta: string;
  modo: string;
  aviso: string | null;
  consultas: Array<Record<string, unknown>>;
  codigos_sem_estoque: string[];
  resposta_correta: string | null;
  observacao_admin: string | null;
}

export interface CorrectionRequest {
  resposta_correta: string;
  observacao?: string;
}

export type ProposalStatus = "pendente" | "aprovada" | "recusada";

export interface Proposal {
  id: number;
  criado_em: string;
  autor: string | null;
  codigo_a: string;
  codigo_b: string;
  tipo: KnowledgeRelation;
  observacao: string | null;
  status: ProposalStatus;
  decidido_em: string | null;
}

export type WhatsAppState =
  | "parado"
  | "conectando"
  | "aguardando_qr"
  | "conectado"
  | "reconectando"
  | "desconectado"
  | "erro";

export interface WhatsAppStatus {
  estado: WhatsAppState;
  qr: string | null;
  numero: string | null;
  erro: string | null;
  ativo: boolean;
}

