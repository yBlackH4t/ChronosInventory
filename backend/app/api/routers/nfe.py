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


class NfeConfigIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    pastas_xml: List[str] = Field(default_factory=list, max_length=nfe_service.MAX_FOLDERS)
    cnpj_loja: Optional[str] = Field(default=None, max_length=20)


class NfeCertificadoIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    arquivo: str = Field(min_length=1, max_length=260)
    senha: str = Field(min_length=1, max_length=200)


class NfeBaixaItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    item: int = Field(ge=1)
    produto_id: int = Field(ge=1)
    quantidade: int = Field(ge=1)


class NfeBaixaIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tipo: Literal["SAIDA", "ENTRADA"]
    location_id: int = Field(ge=1)
    itens: List[NfeBaixaItem] = Field(min_length=1, max_length=990)


@router.get("/config")
def get_config():
    return ok(nfe_service.load_config())


@router.put("/config")
def put_config(payload: NfeConfigIn):
    return ok(nfe_service.save_config(payload.pastas_xml, payload.cnpj_loja))


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


@router.post("/{chave}/baixa", status_code=201)
def baixar(chave: str, payload: NfeBaixaIn, service: NfeService = Depends(get_nfe_service)):
    result = service.baixar(
        chave,
        tipo=payload.tipo,
        location_id=payload.location_id,
        itens=[i.model_dump() for i in payload.itens],
    )
    return ok(result, status_code=201)
