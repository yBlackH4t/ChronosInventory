from typing import Literal

from pydantic import BaseModel, Field


class ChatHistoryItemIn(BaseModel):
    papel: Literal["usuario", "assistente"]
    texto: str = Field(max_length=4000)


class ChatIn(BaseModel):
    mensagem: str = Field(min_length=1, max_length=1000)
    historico: list[ChatHistoryItemIn] = Field(default_factory=list, max_length=40)


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
