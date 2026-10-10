from typing import Literal

from pydantic import BaseModel, Field


class ChatHistoryItemIn(BaseModel):
    papel: Literal["usuario", "assistente"]
    texto: str = Field(max_length=4000)


class ChatIn(BaseModel):
    mensagem: str = Field(min_length=1, max_length=1000)
    historico: list[ChatHistoryItemIn] = Field(default_factory=list, max_length=40)
    canal: Literal["app", "whatsapp"] = "app"
    autor: str | None = Field(default=None, max_length=80)


class ChatProductOut(BaseModel):
    id: int
    nome: str
    categoria: str | None = None
    estoque_total: int
    estoque_por_local: dict[str, int]


class ChatOut(BaseModel):
    resposta: str
    produtos: list[ChatProductOut]
    ferramentas_usadas: list[str]
    modo: Literal["ia", "busca_direta"]
    aviso: str | None = None
    # So em POST /assistente/chat/foto: o que foi lido na foto ("Foto da plaqueta: 466646-5041S").
    leitura_foto: str | None = None


class AssistantProviderOut(BaseModel):
    id: str
    nome: str
    gratuito: bool
    precisa_chave: bool
    configurado: bool
    origem_chave: Literal["configuracoes", "ambiente"] | None = None
    chave_mascarada: str | None = None
    modelo: str | None = None


class AssistantConfigOut(BaseModel):
    provedor: str
    configurado: bool
    origem_chave: Literal["configuracoes", "ambiente"] | None = None
    chave_mascarada: str | None = None
    modelo: str | None = None
    esforco: str
    provedores: list[AssistantProviderOut]


class AssistantConfigIn(BaseModel):
    provedor: Literal["groq", "gemini", "ollama", "anthropic", "nenhum"] | None = None
    api_key: str | None = Field(default=None, max_length=300)
    modelo: str | None = Field(default=None, max_length=80)
    esforco: Literal["low", "medium", "high", "xhigh", "max"] | None = None


# ----------------------------------------------------------------------
# Admin, base de conhecimento, revisao e historico
# ----------------------------------------------------------------------


class AdminStatusOut(BaseModel):
    maquina_publicadora: bool
    senha_definida: bool
    autenticado: bool


class AdminPasswordIn(BaseModel):
    senha_nova: str = Field(min_length=6, max_length=128)
    senha_atual: str | None = Field(default=None, max_length=128)


class AdminLoginIn(BaseModel):
    senha: str = Field(min_length=1, max_length=128)


class AdminLoginOut(BaseModel):
    token: str
    expira_em: int


class KnowledgeRuleIn(BaseModel):
    codigo_a: str = Field(min_length=1, max_length=60)
    codigo_b: str = Field(min_length=1, max_length=60)
    tipo: Literal["igual", "similar", "diferente"]
    observacao: str | None = Field(default=None, max_length=300)


class KnowledgeRuleOut(BaseModel):
    id: int
    codigo_a: str
    codigo_b: str
    tipo: str
    observacao: str | None = None
    criado_em: str | None = None
    atualizado_em: str | None = None


class KnowledgeSyncOut(BaseModel):
    """Conhecimento entre as maquinas: o que esta maquina publicou (publicadora) ou recebeu."""

    papel: str
    fonte: str | None = None
    publicado_em: str | None = None
    maquina: str | None = None
    total_regras: int = 0
    atualizado_em: str | None = None
    verificado_em: str | None = None
    erro: str | None = None


class ReviewSuggestionOut(BaseModel):
    codigo: str
    produto_id: int
    nome: str
    estoque_total: int
    motivo: str


class ReviewRelationOut(BaseModel):
    codigo: str
    relacao: Literal["igual", "similar"]
    obs: str | None = None


class ReviewItemOut(BaseModel):
    codigo: str
    vezes: int
    ultima_vez: str
    exemplo: str
    conversas: list[int]
    conhecimento: list[ReviewRelationOut]
    sugestoes: list[ReviewSuggestionOut]


class ConversationOut(BaseModel):
    id: int
    data: str
    canal: str
    autor: str | None = None
    historico: list[dict]
    pergunta: str
    resposta: str
    modo: str
    aviso: str | None = None
    consultas: list[dict]
    codigos_sem_estoque: list[str]
    resposta_correta: str | None = None
    observacao_admin: str | None = None


class CorrectionIn(BaseModel):
    resposta_correta: str = Field(min_length=1, max_length=4000)
    observacao: str | None = Field(default=None, max_length=1000)


class ProposalOut(BaseModel):
    id: int
    criado_em: str
    autor: str | None = None
    codigo_a: str
    codigo_b: str
    tipo: str
    observacao: str | None = None
    status: Literal["pendente", "aprovada", "recusada"]
    decidido_em: str | None = None


class DailySummaryOut(BaseModel):
    """Resumo diario na "Mensagem para mim": o texto de hoje e a configuracao."""

    texto: str
    ativo: bool
    hora: str
    ultimo_envio: str | None = None


class DailySummaryIn(BaseModel):
    ativo: bool | None = None
    hora: str | None = Field(default=None, max_length=5)


class WhatsAppStatusOut(BaseModel):
    estado: Literal["parado", "conectando", "aguardando_qr", "conectado", "reconectando", "desconectado", "erro"]
    qr: str | None = None
    numero: str | None = None
    erro: str | None = None
    ativo: bool
