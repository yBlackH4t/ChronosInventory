"""
Baixa de estoque por NF-e: o leitor manda a chave do DANFE e o app le o XML da nota.
"""

from __future__ import annotations

from typing import List, Literal, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field

from app.services import nfe_service
from app.services.nfe_service import NfeService
from backend.app.api.responses import ok

router = APIRouter(prefix="/nfe", tags=["nfe"])


def get_nfe_service() -> NfeService:
    return NfeService()


class NfeCnpjIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    cnpj: str = Field(max_length=20)
    nome: str = Field(default="", max_length=60)


class NfeContatoIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    nome: str = Field(default="", max_length=40)
    numero: str = Field(max_length=30)


class NfeConfigIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    pastas_xml: List[str] = Field(default_factory=list, max_length=nfe_service.MAX_FOLDERS)
    cnpj_loja: Optional[str] = Field(default=None, max_length=20)
    # Lista de CNPJs da empresa; o primeiro e o desta loja. Quando vem, substitui o cnpj_loja.
    cnpjs: Optional[List[NfeCnpjIn]] = Field(default=None, max_length=nfe_service.MAX_CNPJS)
    # Quem recebe o aviso de remessa no WhatsApp. Quando vem, substitui a lista.
    contatos_aviso: Optional[List[NfeContatoIn]] = Field(default=None, max_length=nfe_service.MAX_CONTATOS)


class NfeAvisoIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    numero: str = Field(min_length=10, max_length=30)
    texto: str = Field(min_length=1, max_length=4000)


class NfeCertificadoIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    arquivo: str = Field(min_length=1, max_length=260)
    senha: str = Field(min_length=1, max_length=200)


class NfeBaixaItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    item: int = Field(ge=1)
    produto_id: Optional[int] = Field(default=None, ge=1)
    quantidade: int = Field(default=1, ge=1)
    ignorar: bool = False  # item que nao e estoque (ex.: casco): nao movimenta
    # So em remessa entre matriz e filial: casco e garantia nao movimentam, so vao no aviso.
    tipo_aviso: Optional[Literal["ESTOQUE", "SERVICO", "CASCO", "GARANTIA"]] = None


class NfeBaixaIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tipo: Literal["SAIDA", "ENTRADA"]
    location_id: int = Field(ge=1)
    itens: List[NfeBaixaItem] = Field(min_length=1, max_length=990)
    natureza: Literal["OPERACAO_NORMAL", "TRANSFERENCIA_EXTERNA", "AJUSTE"] = "OPERACAO_NORMAL"
    local_externo: Optional[str] = Field(default=None, max_length=120)
    motivo_ajuste: Optional[str] = Field(default=None, max_length=40)
    observacao: Optional[str] = Field(default=None, max_length=200)


@router.get("/config")
def get_config():
    return ok(nfe_service.load_config())


@router.put("/config")
def put_config(payload: NfeConfigIn):
    cnpjs = [c.model_dump() for c in payload.cnpjs] if payload.cnpjs is not None else None
    contatos = [c.model_dump() for c in payload.contatos_aviso] if payload.contatos_aviso is not None else None
    return ok(nfe_service.save_config(payload.pastas_xml, payload.cnpj_loja, cnpjs, contatos))


@router.post("/aviso/enviar")
def enviar_aviso(payload: NfeAvisoIn):
    """Aviso de remessa (matriz/filial) pelo robo do WhatsApp deste PC; a tela ja mostrou o texto."""
    from app.services.whatsapp_service import WhatsAppService

    WhatsAppService.instance().send_text(nfe_service._phone(payload.numero), payload.texto)
    return ok({"enviado": True})


@router.put("/certificado")
def put_certificado(payload: NfeCertificadoIn):
    """Certificado A1 desta maquina: o Chronos guarda uma copia e a senha protegida pelo Windows."""
    return ok(nfe_service.save_certificate(payload.arquivo, payload.senha))


@router.delete("/certificado")
def delete_certificado():
    return ok(nfe_service.remove_certificate())


@router.get("/{chave}")
def preview(chave: str, service: NfeService = Depends(get_nfe_service)):
    return ok(service.preview(chave))


@router.get("/{chave}/xml")
def xml(chave: str, service: NfeService = Depends(get_nfe_service)):
    """XML da nota, para imprimir a etiqueta de expedicao depois da baixa."""
    return ok(service.xml(chave))


@router.post("/{chave}/baixa", status_code=201)
def baixar(chave: str, payload: NfeBaixaIn, service: NfeService = Depends(get_nfe_service)):
    result = service.baixar(
        chave,
        tipo=payload.tipo,
        location_id=payload.location_id,
        itens=[i.model_dump() for i in payload.itens],
        natureza=payload.natureza,
        local_externo=payload.local_externo,
        motivo_ajuste=payload.motivo_ajuste,
        observacao=payload.observacao,
    )
    return ok(result, status_code=201)
