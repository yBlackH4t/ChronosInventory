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
