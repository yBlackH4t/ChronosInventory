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
  WhatsAppDraft,
  DailySummary,
  DailySummaryUpdate,
  InterviewAnswer,
  InterviewDay,
  InterviewQuestion,
  InterviewSettings,
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

export type InterpretationExample = { pergunta: string; consulta: string };
export const listInterpretationExamples = () => adminRequest<InterpretationExample[]>("/exemplos");
export const saveInterpretationExamples = (examples: InterpretationExample[]) =>
  adminRequest<InterpretationExample[]>("/exemplos", { method: "PUT", body: examples });
export type WhatsAppAttendance = {
  id: number; cliente: string; estado: string; origem: string;
  pendencias: { pedido_id: string; campos: string[] }[];
};
export const listWhatsAppAttendances = () => adminRequest<WhatsAppAttendance[]>("/whatsapp/atendimentos");
export const closeWhatsAppAttendance = (id: number) =>
  adminRequest(`/whatsapp/atendimentos/${id}/encerrar`, { method: "POST" });

// ---------------------------------------------------------------------------
// Mock (VITE_ASSISTENTE_MOCK=1)
// ---------------------------------------------------------------------------

const MOCK_TOKEN = "mock-admin-token";

const PAIR_OPTIONS = [
  { valor: "igual", rotulo: "Igual" },
  { valor: "similar", rotulo: "Similar" },
  { valor: "diferente", rotulo: "Diferente" },
  { valor: "nao_sei", rotulo: "Não sei" },
];

const mockInterview = {
  config: { ativo: true, hora: "09:00", quantidade: 5, ultimo_envio: null } as InterviewSettings,
  questions: [
    {
      id: 1, numero: 1, tipo: "revisar", codigo_a: "3785479", codigo_b: null, produto_id: null, dados: {},
      pergunta: "Qual peça nossa serve no lugar da *3785479*?",
      motivo: "Perguntaram 3x e não achei no estoque nem no que você me ensinou.",
      dia: "2026-10-29", estado: "pendente", resposta: null, codigo_resposta: null, observacao: null, resultado: null,
      opcoes: [
        { valor: "igual", rotulo: "Igual a…" },
        { valor: "similar", rotulo: "Similar a…" },
        { valor: "nao_temos", rotulo: "Não temos" },
        { valor: "nao_sei", rotulo: "Não sei" },
      ],
    },
    {
      id: 2, numero: 2, tipo: "ficha", codigo_a: "4031195", codigo_b: "5351848", produto_id: 12, dados: { ficha: "805314" },
      pergunta: "*4031195* e *5351848* são a mesma peça?",
      motivo: "As duas estão na mesma ficha Master Power (805314 · MP530w), mas a mesma ficha não quer dizer que são iguais. Temos 2 da 4031195.",
      dia: "2026-10-29", estado: "pendente", resposta: null, codigo_resposta: null, observacao: null, resultado: null,
      opcoes: PAIR_OPTIONS,
    },
    {
      id: 3, numero: 3, tipo: "revisar_par", codigo_a: "4031196", codigo_b: "5455609", produto_id: 31, dados: {},
      pergunta: "*4031196* e *5455609* são a mesma peça?",
      motivo: "Perguntaram 2x a 4031196 e não soube responder; perguntaram se é igual. Temos 1 da 5455609.",
      dia: "2026-10-29", estado: "respondida", resposta: "similar", codigo_resposta: null, observacao: "muda o atuador",
      resultado: "✅ Aprendido: *4031196* similar *5455609* (muda o atuador). Vale para todos a partir de agora.",
      opcoes: PAIR_OPTIONS,
    },
    {
      id: 4, numero: 4, tipo: "cadastro", codigo_a: "53279907101", codigo_b: "53279907210", produto_id: 44, dados: {},
      pergunta: "*53279907101* e *53279907210* são a mesma peça?",
      motivo: "O cadastro junta as duas no produto \"TURBO K27 - 53279907101/7210\". Hoje eu digo \"provavelmente iguais\".",
      dia: "2026-10-29", estado: "pendente", resposta: null, codigo_resposta: null, observacao: null, resultado: null,
      opcoes: PAIR_OPTIONS,
    },
    {
      id: 5, numero: 5, tipo: "aplicacao", codigo_a: "4031196", codigo_b: null, produto_id: 31,
      dados: { ficha: "805314", veiculo: "Volvo FH 520" },
      pergunta: "A *4031196* vai no *Volvo FH 520* (MD13 460/480/500/520 HP Euro 5)?",
      motivo: "Está na ficha Master Power 805314, e o catálogo tem aplicações erradas.",
      dia: "2026-10-29", estado: "pendente", resposta: null, codigo_resposta: null, observacao: null, resultado: null,
      opcoes: [
        { valor: "sim", rotulo: "Vai, está certo" },
        { valor: "nao", rotulo: "Não vai" },
        { valor: "nao_sei", rotulo: "Não sei" },
      ],
    },
  ] as InterviewQuestion[],
};

const mock = {
  publicadora: true,
  senha: null as string | null,
  pinWhatsapp: null as string | null,
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
  return {
    maquina_publicadora: mock.publicadora,
    senha_definida: mock.senha !== null,
    autenticado: getAdminToken() === MOCK_TOKEN,
    pin_whatsapp_definido: mock.pinWhatsapp !== null,
  };
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

/** Cria, troca ou (com null) remove o PIN de /aprovar e /recusar pelo WhatsApp. */
export async function setWhatsAppPin(pin: string | null): Promise<AdminStatus> {
  if (isMockEnabled()) {
    await mockDelay();
    mock.pinWhatsapp = pin || null;
    return mockStatus();
  }
  return adminRequest<AdminStatus>("/admin/pin-whatsapp", { method: "POST", body: { pin } });
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

// ---------------------------------------------------------------------------
// Perguntas do dia (modo entrevista)
// ---------------------------------------------------------------------------

function mockInterviewDay(): InterviewDay {
  return {
    perguntas: mockInterview.questions.map((q) => ({ ...q })),
    config: { ...mockInterview.config },
    texto_whatsapp: "*Perguntas do dia*",
  };
}

export async function getInterviewDay(): Promise<InterviewDay> {
  if (isMockEnabled()) {
    await mockDelay();
    mockRequireAdmin();
    return mockInterviewDay();
  }
  return adminRequest<InterviewDay>("/entrevista");
}

export async function moreInterviewQuestions(): Promise<InterviewDay> {
  if (isMockEnabled()) {
    await mockDelay();
    return mockInterviewDay();
  }
  return adminRequest<InterviewDay>("/entrevista/mais", { method: "POST" });
}

export async function answerInterviewQuestion(id: number, body: InterviewAnswer): Promise<InterviewQuestion> {
  if (isMockEnabled()) {
    await mockDelay();
    const question = mockInterview.questions.find((q) => q.id === id);
    if (!question) throw new AssistantApiError("validation_error", 422, "Pergunta não encontrada.");
    Object.assign(question, {
      estado: body.resposta === "nao_sei" ? "nao_sei" : "respondida",
      resposta: body.resposta,
      observacao: body.observacao ?? null,
      codigo_resposta: body.codigo ?? null,
      resultado: body.resposta === "nao_sei" ? "Tudo bem, pergunto de novo daqui a um mês." : "✅ Aprendido. Vale para todos a partir de agora.",
    });
    return { ...question };
  }
  return adminRequest<InterviewQuestion>(`/entrevista/${id}/responder`, { method: "POST", body });
}

export async function updateInterviewSettings(body: Partial<InterviewSettings>): Promise<InterviewSettings> {
  if (isMockEnabled()) {
    await mockDelay();
    Object.assign(mockInterview.config, body);
    return { ...mockInterview.config };
  }
  return adminRequest<InterviewSettings>("/entrevista/config", { method: "PUT", body });
}

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


// Revisar antes de enviar: a resposta do robo vira rascunho ate o admin mandar.
export async function setWhatsAppReview(revisar: boolean): Promise<WhatsAppStatus> {
  return adminRequest<WhatsAppStatus>("/whatsapp/revisao", { method: "PUT", body: { revisar } });
}

export const setWhatsAppContextMinutes = (revisar: boolean, contexto_minutos: number) =>
  adminRequest<WhatsAppStatus>("/whatsapp/revisao", { method: "PUT", body: { revisar, contexto_minutos } });

export async function listWhatsAppDrafts(): Promise<WhatsAppDraft[]> {
  if (isMockEnabled()) return [];
  return adminRequest<WhatsAppDraft[]>("/whatsapp/rascunhos");
}

export async function sendWhatsAppDraft(id: number, texto: string): Promise<{ enviado: boolean }> {
  return adminRequest<{ enviado: boolean }>(`/whatsapp/rascunhos/${id}/enviar`, { method: "POST", body: { texto } });
}

export async function discardWhatsAppDraft(id: number): Promise<{ descartado: boolean }> {
  return adminRequest<{ descartado: boolean }>(`/whatsapp/rascunhos/${id}`, { method: "DELETE" });
}
