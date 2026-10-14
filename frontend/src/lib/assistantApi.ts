import { baseUrl } from "./apiClient";
import type {
  AssistantChatRequest,
  AssistantChatResponse,
  AssistantConfig,
  AssistantConfigUpdate,
  AssistantMessage,
  AssistantProvider,
} from "../types/assistant";
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

export function isMockEnabled(): boolean {
  const flag = import.meta.env.VITE_ASSISTENTE_MOCK;
  return flag === "1" || flag === "true";
}

export async function parseResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const err = (json as ErrorResponse)?.error || {
      code: "http_error",
      message: response.statusText || "Ocorreu um erro na requisição.",
    };
    throw new AssistantApiError(err.code, response.status, err.message);
  }

  return (json as SuccessResponse<T>).data;
}

// ---------------------------------------------------------------------------
// Mock (VITE_ASSISTENTE_MOCK=1) — simula o contrato da seção 4 do HANDOFF.
// ---------------------------------------------------------------------------

const mockState: { provedor: AssistantConfig["provedor"]; esforco: AssistantConfig["esforco"]; provedores: AssistantProvider[] } = {
  provedor: "groq",
  esforco: "medium",
  provedores: [
    { id: "groq", nome: "Groq", gratuito: true, precisa_chave: true, configurado: false, origem_chave: null, chave_mascarada: null, modelo: "llama-3.3-70b-versatile" },
    { id: "gemini", nome: "Google Gemini", gratuito: true, precisa_chave: true, configurado: false, origem_chave: null, chave_mascarada: null, modelo: "gemini-2.5-flash" },
    { id: "ollama", nome: "Ollama (local)", gratuito: true, precisa_chave: false, configurado: true, origem_chave: null, chave_mascarada: null, modelo: "llama3.1" },
    { id: "anthropic", nome: "Claude (Anthropic)", gratuito: false, precisa_chave: true, configurado: false, origem_chave: null, chave_mascarada: null, modelo: "claude-opus-5-5" },
    { id: "nenhum", nome: "Nenhum (só busca direta)", gratuito: true, precisa_chave: false, configurado: true, origem_chave: null, chave_mascarada: null, modelo: null },
  ],
};

function buildMockConfig(): AssistantConfig {
  const atual = mockState.provedores.find((p) => p.id === mockState.provedor) ?? mockState.provedores[0];
  return {
    provedor: atual.id,
    configurado: atual.configurado,
    origem_chave: atual.origem_chave,
    chave_mascarada: atual.chave_mascarada,
    modelo: atual.modelo,
    esforco: mockState.esforco,
    provedores: mockState.provedores.map((p) => ({ ...p })),
  };
}

function applyMockUpdate(data: AssistantConfigUpdate): AssistantConfig {
  if (data.provedor) mockState.provedor = data.provedor;
  if (data.esforco) mockState.esforco = data.esforco;
  const alvo = mockState.provedores.find((p) => p.id === mockState.provedor);
  if (alvo) {
    if (data.api_key !== undefined) {
      const key = data.api_key.trim();
      alvo.chave_mascarada = key ? `${key.slice(0, 4)}...${key.slice(-4)}` : null;
      alvo.origem_chave = key ? "configuracoes" : null;
      alvo.configurado = key ? true : !alvo.precisa_chave;
    }
    if (data.modelo) alvo.modelo = data.modelo;
  }
  return buildMockConfig();
}

async function mockChat(req: AssistantChatRequest): Promise<AssistantChatResponse> {
  // Atraso para simular o "pensando" da rede
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const texto = req.mensagem.toLowerCase();

  if (texto.includes("erro") || texto.includes("indisponivel")) {
    throw new AssistantApiError("assistente_indisponivel", 503, "O assistente está indisponível no momento.");
  }

  const config = buildMockConfig();
  const semIa = config.provedor === "nenhum" || !config.configurado || texto.includes("busca");

  if (semIa) {
    return {
      resposta: "Encontrei 1 produto para *4031196*:\n• *TURBINA HOLSET HX55W 4031196* — 2 em Canoas",
      produtos: [
        { id: 3, nome: "TURBINA HOLSET HX55W 4031196", categoria: "TURBO", estoque_total: 2, estoque_por_local: { Canoas: 2 } },
      ],
      ferramentas_usadas: ["buscar_por_codigo"],
      modo: "busca_direta",
      aviso:
        config.provedor === "nenhum"
          ? null
          : !config.configurado
            ? "Chave do Groq não configurada. Resposta pela busca direta (sem IA)."
            : "Limite de uso do Groq atingido. Resposta pela busca direta (sem IA).",
    };
  }

  return {
    resposta: "Scania 440 depende do motor:\n• DC13 Euro 5 (2012+) → *temos 2* (Canoas)\n• DT12 Turbo Compound → *não temos*\nQual é o motor?",
    produtos: [
      { id: 7, nome: "TURBO GTA42S - 779839-0025", categoria: "TURBO", estoque_total: 2, estoque_por_local: { Canoas: 2 } },
    ],
    ferramentas_usadas: ["buscar_por_aplicacao"],
    modo: "ia",
    aviso: null,
  };
}

// ---------------------------------------------------------------------------
// API real
// ---------------------------------------------------------------------------

export async function sendAssistantMessage(req: AssistantChatRequest): Promise<AssistantChatResponse> {
  if (isMockEnabled()) return mockChat(req);

  const response = await fetch(`${baseUrl}/assistente/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  return parseResponse<AssistantChatResponse>(response);
}

export async function sendAssistantPhotoMessage(
  foto: File,
  mensagem?: string,
  historico: AssistantMessage[] = [],
): Promise<AssistantChatResponse> {
  if (isMockEnabled()) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    return {
      resposta: "Identifiquei a plaqueta como *466646-5041S*.\n• *TURBO GT2052S 466646-5041S* — 1 em Canoas.",
      produtos: [
        {
          id: 8,
          nome: "TURBO GT2052S 466646-5041S",
          categoria: "TURBO",
          estoque_total: 1,
          estoque_por_local: { Canoas: 1 },
        },
      ],
      ferramentas_usadas: ["buscar_por_codigo"],
      modo: "ia",
      aviso: null,
      leitura_foto: "Foto da plaqueta: 466646-5041S",
    };
  }

  const formData = new FormData();
  formData.append("foto", foto);
  if (mensagem && mensagem.trim()) {
    formData.append("mensagem", mensagem.trim());
  }
  if (historico && historico.length > 0) {
    formData.append("historico", JSON.stringify(historico));
  }

  const response = await fetch(`${baseUrl}/assistente/chat/foto`, {
    method: "POST",
    body: formData,
  });
  return parseResponse<AssistantChatResponse>(response);
}

export async function getAssistantConfig(): Promise<AssistantConfig> {
  if (isMockEnabled()) return buildMockConfig();

  const response = await fetch(`${baseUrl}/assistente/config`);
  return parseResponse<AssistantConfig>(response);
}

export async function updateAssistantConfig(data: AssistantConfigUpdate): Promise<AssistantConfig> {
  if (isMockEnabled()) return applyMockUpdate(data);

  const response = await fetch(`${baseUrl}/assistente/config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return parseResponse<AssistantConfig>(response);
}

export type ProposalSuggestion = {
  codigo_a: string;
  codigo_b: string;
  tipo: "igual" | "similar" | "diferente";
  observacao?: string;
  autor?: string;
};

/** "Sugerir ao admin": vai para a maquina publicadora (ou fica aqui, se esta e a que aprova). */
export async function suggestProposal(
  data: ProposalSuggestion,
): Promise<{ id: number | null; destino: "esta_maquina" | "publicadora" }> {
  const response = await fetch(`${baseUrl}/assistente/propostas`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return parseResponse(response);
}
