import { baseUrl } from "./apiClient";
import { AssistantApiError, isMockEnabled, parseResponse } from "./assistantApi";
import { getAdminToken, setAdminToken } from "../state/assistantAdminSession";
import type {
  AdminLoginResponse,
  AdminPasswordRequest,
  AdminStatus,
  Conversation,
  CorrectionRequest,
  KnowledgeRule,
  KnowledgeRuleRequest,
  KnowledgeSyncStatus,
  Proposal,
  ProposalStatus,
  ReviewItem,
  WhatsAppState,
  WhatsAppStatus,
  DailySummary,
  DailySummaryUpdate,
} from "../types/assistantAdmin";

export const ADMIN_TOKEN_HEADER = "X-Admin-Token";

/** Erro de permissão do admin (sessão expirada, máquina não publicadora, etc.). */
export function isAdminRequiredError(error: unknown): boolean {
  return error instanceof AssistantApiError && error.code === "admin_necessario";
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  auth?: boolean;
};

async function adminFetch(path: string, { method = "GET", body, auth = true }: RequestOptions = {}): Promise<Response> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const token = getAdminToken();
  if (auth && token) headers[ADMIN_TOKEN_HEADER] = token;

  return fetch(`${baseUrl}/assistente${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function adminRequest<T>(path: string, options?: RequestOptions): Promise<T> {
  const response = await adminFetch(path, options);
  try {
    return await parseResponse<T>(response);
  } catch (error) {
    // Token inválido/expirado: derruba a sessão local para voltar à tela de login.
    if (isAdminRequiredError(error)) {
      setAdminToken(null, (error as AssistantApiError).message || "Acesso de administrador expirado ou necessário.");
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Mock (VITE_ASSISTENTE_MOCK=1)
// ---------------------------------------------------------------------------

const MOCK_TOKEN = "mock-admin-token";

const mock = {
  publicadora: true,
  senha: null as string | null,
  nextRuleId: 3,
  rules: [
    { id: 1, codigo_a: "4031196", codigo_b: "4031195", tipo: "igual", observacao: null, criado_em: "2026-10-08T14:02:00", atualizado_em: "2026-10-08T14:02:00" },
    { id: 2, codigo_a: "779839-0025", codigo_b: "758160-0007", tipo: "similar", observacao: "muda o atuador", criado_em: "2026-10-09T09:30:00", atualizado_em: "2026-10-09T09:30:00" },
  ] as KnowledgeRule[],
  review: [
    {
      codigo: "53279887101",
      vezes: 4,
      ultima_vez: "2026-10-09T18:41:00",
      exemplo: "tem a turbina 53279887101?",
      conversas: [12, 15, 19, 22],
      conhecimento: [],
      sugestoes: [
        { codigo: "53279887102", produto_id: 31, nome: "TURBO K31 53279887102", estoque_total: 3, motivo: "Mesmo início de código e mesma família (K31)" },
        { codigo: "452174-0001", produto_id: 44, nome: "TURBO GT4594 452174-0001", estoque_total: 1, motivo: "Mesma aplicação (Volvo FH 460)" },
      ],
    },
    {
      codigo: "3594150",
      vezes: 2,
      ultima_vez: "2026-10-09T11:05:00",
      exemplo: "holset 3594150 tem?",
      conversas: [8, 17],
      conhecimento: [{ codigo: "3594151", relacao: "similar", obs: "muda a flange" }],
      sugestoes: [],
    },
  ] as ReviewItem[],
  conversations: Array.from({ length: 27 }, (_, i): Conversation => {
    const id = 27 - i;
    const direta = id % 3 === 0;
    return {
      id,
      data: new Date(Date.UTC(2026, 9, 9, 21 - Math.floor(i / 3), 59 - i * 2)).toISOString(),
      canal: id % 4 === 0 ? "whatsapp" : "app",
      autor: id % 4 === 0 ? "+55 51 99999-0000" : null,
      historico: [],
      pergunta: direta ? `tem a turbina 532798871${id}?` : "temos turbina do scania 440?",
      resposta: direta
        ? "Não encontrei *532798871" + id + "* no estoque.\nQuer que eu procure um similar?"
        : "Scania 440 depende do motor:\n• DC13 Euro 5 (2012+) → *temos 2* (Canoas)\n• DT12 Turbo Compound → *não temos*",
      modo: direta ? "busca_direta" : "ia",
      aviso: direta ? "Limite de uso do Groq atingido. Resposta pela busca direta (sem IA)." : null,
      consultas: [],
      codigos_sem_estoque: direta ? [`532798871${id}`] : [],
      resposta_correta: null,
      observacao_admin: null,
    };
  }),
  proposals: [
    {
      id: 1,
      criado_em: "2026-10-09T20:15:00",
      autor: "+55 51 99999-1234",
      codigo_a: "805314",
      codigo_b: "805315",
      tipo: "similar",
      observacao: "mesmo conjunto rotativo, muda a carcaça",
      status: "pendente",
      decidido_em: null,
    },
  ] as Proposal[],
  whatsapp: {
    estado: "parado" as WhatsAppState,
    qr: null as string | null,
    numero: null as string | null,
    erro: null as string | null,
    ativo: false,
  } as WhatsAppStatus,
  dailySummary: {
    texto: "Resumo do dia (10/10/2026):\n• *TURBO K31 53279887102* — zerou desde ontem\n• *TURBINA HOLSET HX55W 4031196* — 4 saídas em 7 dias\n• *53279887101* — 4 buscas sem estoque em 7 dias",
    ativo: false,
    hora: "08:00",
    ultimo_envio: null as string | null,
  } as DailySummary,
};

function mockStatus(): AdminStatus {
  return { maquina_publicadora: mock.publicadora, senha_definida: mock.senha !== null, autenticado: getAdminToken() === MOCK_TOKEN };
}

let mockSyncLastUpdated: string | null = "2026-10-09T22:30:00Z";

function mockSyncStatus(): KnowledgeSyncStatus {
  return {
    papel: mock.publicadora ? "publisher" : "subscriber",
    fonte: mock.publicadora ? "pasta compartilhada" : "servidor local (192.168.1.10:8000)",
    publicado_em: mock.publicadora ? mockSyncLastUpdated : null,
    maquina: mock.publicadora ? null : "SERVIDOR-CANOAS",
    total_regras: mock.rules.length,
    atualizado_em: mockSyncLastUpdated,
    verificado_em: new Date().toISOString(),
    erro: null,
  };
}

function mockRequireAdmin() {
  if (!mock.publicadora || getAdminToken() !== MOCK_TOKEN) {
    setAdminToken(null);
    throw new AssistantApiError("admin_necessario", 403, "Entre como admin para continuar.");
  }
}

async function mockDelay() {
  await new Promise((resolve) => setTimeout(resolve, 300));
}

// ---------------------------------------------------------------------------
// Admin: status, senha e sessão
// ---------------------------------------------------------------------------

export async function getAdminStatus(): Promise<AdminStatus> {
  if (isMockEnabled()) {
    await mockDelay();
    return mockStatus();
  }
  return adminRequest<AdminStatus>("/admin/status");
}

export async function setAdminPassword(body: AdminPasswordRequest): Promise<AdminStatus> {
  if (isMockEnabled()) {
    await mockDelay();
    if (mock.senha !== null && body.senha_atual !== mock.senha) {
      throw new AssistantApiError("validation_error", 422, "Senha atual incorreta.");
    }
    mock.senha = body.senha_nova;
    setAdminToken(null);
    return mockStatus();
  }
  const status = await adminRequest<AdminStatus>("/admin/senha", { method: "POST", body });
  // Trocar a senha encerra as sessões no backend.
  if (!status.autenticado) setAdminToken(null);
  return status;
}

export async function adminLogin(senha: string): Promise<AdminLoginResponse> {
  if (isMockEnabled()) {
    await mockDelay();
    if (senha !== mock.senha) throw new AssistantApiError("senha_incorreta", 401, "Senha incorreta.");
    setAdminToken(MOCK_TOKEN);
    return { token: MOCK_TOKEN, expira_em: Math.floor(Date.now() / 1000) + 8 * 3600 };
  }
  const result = await adminRequest<AdminLoginResponse>("/admin/login", { method: "POST", body: { senha }, auth: false });
  setAdminToken(result.token);
  return result;
}

export async function adminLogout(): Promise<void> {
  try {
    if (!isMockEnabled()) await adminRequest<AdminStatus>("/admin/logout", { method: "POST" });
  } finally {
    setAdminToken(null);
  }
}

// ---------------------------------------------------------------------------
// Base de conhecimento
// ---------------------------------------------------------------------------

export async function listKnowledge(busca?: string, limite = 200, offset = 0): Promise<KnowledgeRule[]> {
  if (isMockEnabled()) {
    await mockDelay();
    const termo = (busca ?? "").trim().toLowerCase();
    return mock.rules
      .filter((r) => !termo || r.codigo_a.toLowerCase().includes(termo) || r.codigo_b.toLowerCase().includes(termo))
      .slice(offset, offset + limite);
  }
  const params = new URLSearchParams({ limite: String(limite), offset: String(offset) });
  if (busca?.trim()) params.set("busca", busca.trim());
  return adminRequest<KnowledgeRule[]>(`/conhecimento?${params.toString()}`);
}

export async function addKnowledgeRule(body: KnowledgeRuleRequest): Promise<KnowledgeRule> {
  if (isMockEnabled()) {
    await mockDelay();
    mockRequireAdmin();
    const agora = new Date().toISOString();
    const existente = mock.rules.find(
      (r) =>
        (r.codigo_a === body.codigo_a && r.codigo_b === body.codigo_b) ||
        (r.codigo_a === body.codigo_b && r.codigo_b === body.codigo_a),
    );
    if (existente) {
      Object.assign(existente, { tipo: body.tipo, observacao: body.observacao ?? null, atualizado_em: agora });
    } else {
      mock.rules.unshift({ id: mock.nextRuleId++, ...body, observacao: body.observacao ?? null, criado_em: agora, atualizado_em: agora });
    }
    mock.review = mock.review.filter((item) => item.codigo !== body.codigo_a && item.codigo !== body.codigo_b);
    return existente ?? mock.rules[0];
  }
  return adminRequest<KnowledgeRule>("/conhecimento", { method: "POST", body });
}

export async function deleteKnowledgeRule(id: number): Promise<void> {
  if (isMockEnabled()) {
    await mockDelay();
    mockRequireAdmin();
    mock.rules = mock.rules.filter((r) => r.id !== id);
    return;
  }
  await adminRequest<{ removido: boolean }>(`/conhecimento/${id}`, { method: "DELETE" });
}

export async function getKnowledgeSyncStatus(): Promise<KnowledgeSyncStatus> {
  if (isMockEnabled()) {
    await mockDelay();
    return mockSyncStatus();
  }
  return adminRequest<KnowledgeSyncStatus>("/conhecimento/sincronizacao", { method: "GET", auth: false });
}

export async function syncKnowledge(): Promise<KnowledgeSyncStatus> {
  if (isMockEnabled()) {
    await mockDelay();
    mockSyncLastUpdated = new Date().toISOString();
    return mockSyncStatus();
  }
  return adminRequest<KnowledgeSyncStatus>("/conhecimento/sincronizar", { method: "POST", auth: false });
}

// ---------------------------------------------------------------------------
// Revisão ("Para revisar")
// ---------------------------------------------------------------------------

export async function getReviewList(): Promise<ReviewItem[]> {
  if (isMockEnabled()) {
    await mockDelay();
    mockRequireAdmin();
    return mock.review.map((item) => ({ ...item }));
  }
  return adminRequest<ReviewItem[]>("/revisao");
}

export async function concludeReview(codigo: string): Promise<void> {
  if (isMockEnabled()) {
    await mockDelay();
    mockRequireAdmin();
    mock.review = mock.review.filter((item) => item.codigo !== codigo);
    return;
  }
  await adminRequest<{ concluido: boolean }>(`/revisao/${encodeURIComponent(codigo)}/concluir`, { method: "POST" });
}

// ---------------------------------------------------------------------------
// Histórico
// ---------------------------------------------------------------------------

export async function listHistory(limite: number, offset: number): Promise<Conversation[]> {
  if (isMockEnabled()) {
    await mockDelay();
    mockRequireAdmin();
    return mock.conversations.slice(offset, offset + limite).map((c) => ({ ...c }));
  }
  return adminRequest<Conversation[]>(`/historico?limite=${limite}&offset=${offset}`);
}

export async function correctConversation(id: number, body: CorrectionRequest): Promise<void> {
  if (isMockEnabled()) {
    await mockDelay();
    mockRequireAdmin();
    const conversa = mock.conversations.find((c) => c.id === id);
    if (conversa) {
      conversa.resposta_correta = body.resposta_correta;
      conversa.observacao_admin = body.observacao ?? null;
    }
    return;
  }
  await adminRequest<{ corrigido: boolean }>(`/historico/${id}/correcao`, { method: "PUT", body });
}

export async function exportHistoryJsonl(): Promise<Blob> {
  if (isMockEnabled()) {
    await mockDelay();
    mockRequireAdmin();
    const linhas = mock.conversations.map((item) => {
      const copy: Record<string, unknown> = { ...item };
      delete copy.autor;
      return JSON.stringify(copy);
    }).join("\n");
    return new Blob([linhas + "\n"], { type: "application/x-ndjson" });
  }
  const response = await adminFetch("/historico/exportar");
  if (!response.ok) {
    // Erros vêm no envelope JSON padrão.
    await adminRequestError(response);
  }
  return response.blob();
}

async function adminRequestError(response: Response): Promise<never> {
  try {
    await parseResponse<unknown>(response);
  } catch (error) {
    if (isAdminRequiredError(error)) {
      setAdminToken(null, (error as AssistantApiError).message || "Acesso de administrador expirado ou necessário.");
    }
    throw error;
  }
  throw new AssistantApiError("http_error", response.status, response.statusText || "Falha ao exportar.");
}

// ---------------------------------------------------------------------------
// Propostas (/ensinar via WhatsApp)
// ---------------------------------------------------------------------------

export async function listProposals(status: ProposalStatus | "todas" = "pendente"): Promise<Proposal[]> {
  if (isMockEnabled()) {
    await mockDelay();
    mockRequireAdmin();
    return mock.proposals
      .filter((p) => status === "todas" || p.status === status)
      .map((p) => ({ ...p }));
  }
  return adminRequest<Proposal[]>(`/propostas?status=${status}`);
}

export async function approveProposal(proposalId: number): Promise<KnowledgeRule> {
  if (isMockEnabled()) {
    await mockDelay();
    mockRequireAdmin();
    const prop = mock.proposals.find((p) => p.id === proposalId);
    if (!prop || prop.status !== "pendente") {
      throw new AssistantApiError("not_found", 404, "Proposta pendente não encontrada.");
    }
    prop.status = "aprovada";
    prop.decidido_em = new Date().toISOString();
    return addKnowledgeRule({
      codigo_a: prop.codigo_a,
      codigo_b: prop.codigo_b,
      tipo: prop.tipo,
      observacao: prop.observacao || undefined,
    });
  }
  return adminRequest<KnowledgeRule>(`/propostas/${proposalId}/aprovar`, { method: "POST" });
}

export async function rejectProposal(proposalId: number): Promise<void> {
  if (isMockEnabled()) {
    await mockDelay();
    mockRequireAdmin();
    const prop = mock.proposals.find((p) => p.id === proposalId);
    if (!prop || prop.status !== "pendente") {
      throw new AssistantApiError("not_found", 404, "Proposta pendente não encontrada.");
    }
    prop.status = "recusada";
    prop.decidido_em = new Date().toISOString();
    return;
  }
  await adminRequest<{ recusada: boolean }>(`/propostas/${proposalId}/recusar`, { method: "POST" });
}

// ---------------------------------------------------------------------------
// WhatsApp (modo copiloto)
// ---------------------------------------------------------------------------

export async function getWhatsAppStatus(): Promise<WhatsAppStatus> {
  if (isMockEnabled()) {
    await mockDelay();
    mockRequireAdmin();
    return { ...mock.whatsapp };
  }
  return adminRequest<WhatsAppStatus>("/whatsapp/status");
}

export async function startWhatsApp(): Promise<WhatsAppStatus> {
  if (isMockEnabled()) {
    await mockDelay();
    mockRequireAdmin();
    mock.whatsapp.ativo = true;
    mock.whatsapp.estado = "aguardando_qr";
    mock.whatsapp.qr = "2@mock-qr-code-whatsapp-pairing-chronos-1234567890";
    return { ...mock.whatsapp };
  }
  return adminRequest<WhatsAppStatus>("/whatsapp/iniciar", { method: "POST" });
}

export async function stopWhatsApp(): Promise<WhatsAppStatus> {
  if (isMockEnabled()) {
    await mockDelay();
    mockRequireAdmin();
    mock.whatsapp.ativo = false;
    mock.whatsapp.estado = "parado";
    mock.whatsapp.qr = null;
    return { ...mock.whatsapp };
  }
  return adminRequest<WhatsAppStatus>("/whatsapp/parar", { method: "POST" });
}

export async function logoutWhatsApp(): Promise<WhatsAppStatus> {
  if (isMockEnabled()) {
    await mockDelay();
    mockRequireAdmin();
    mock.whatsapp.ativo = false;
    mock.whatsapp.estado = "desconectado";
    mock.whatsapp.qr = null;
    mock.whatsapp.numero = null;
    return { ...mock.whatsapp };
  }
  return adminRequest<WhatsAppStatus>("/whatsapp/desconectar", { method: "POST" });
}

// ---------------------------------------------------------------------------
// Resumo diário
// ---------------------------------------------------------------------------

export async function getDailySummary(): Promise<DailySummary> {
  if (isMockEnabled()) {
    await mockDelay();
    return { ...mock.dailySummary };
  }
  return adminRequest<DailySummary>("/resumo", { method: "GET" });
}

export async function updateDailySummary(body: DailySummaryUpdate): Promise<DailySummary> {
  if (isMockEnabled()) {
    await mockDelay();
    mockRequireAdmin();
    if (body.ativo !== undefined) mock.dailySummary.ativo = body.ativo;
    if (body.hora !== undefined) mock.dailySummary.hora = body.hora;
    return { ...mock.dailySummary };
  }
  return adminRequest<DailySummary>("/resumo", { method: "PUT", body });
}

