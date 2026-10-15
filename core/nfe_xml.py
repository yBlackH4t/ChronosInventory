"""
Leitura de NF-e: chave de acesso (codigo de barras do DANFE) e XML autorizado.

O codigo de barras do DANFE guarda so a chave de 44 digitos; os itens vem do XML
que o emissor (ex.: Questor) salva numa pasta da maquina.
"""

from __future__ import annotations

import os
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from typing import Iterable, List, Optional

_DIGITS = re.compile(r"\D")
_NS = "{http://www.portalfiscal.inf.br/nfe}"

# Ate onde ler cada arquivo quando o nome nao traz a chave: no nfeProc o
# atributo Id="NFe<chave>" aparece logo no comeco.
_HEAD_BYTES = 4096
_MAX_XML_BYTES = 20 * 1024 * 1024


def chave_from_code(code: Optional[str]) -> Optional[str]:
    """Devolve a chave de acesso se o codigo lido for uma chave valida (44 digitos + DV)."""
    if not code:
        return None
    raw = str(code).strip()
    # Leitor pode mandar com espacos (como impresso no DANFE) ou com prefixo "NFe".
    if raw.upper().startswith("NFE"):
        raw = raw[3:]
    if re.search(r"[^\d\s.]", raw):
        return None
    digits = _DIGITS.sub("", raw)
    if len(digits) != 44 or not chave_dv_ok(digits):
        return None
    return digits


def chave_dv_ok(chave: str) -> bool:
    """Digito verificador da chave (modulo 11, pesos 2..9 da direita para a esquerda)."""
    if len(chave) != 44 or not chave.isdigit():
        return False
    total = 0
    weight = 2
    for ch in reversed(chave[:43]):
        total += int(ch) * weight
        weight = 2 if weight == 9 else weight + 1
    dv = 11 - (total % 11)
    if dv >= 10:
        dv = 0
    return dv == int(chave[43])


def chave_numero(chave: str) -> tuple[int, int]:
    """(serie, numero) contidos na chave."""
    return int(chave[22:25]), int(chave[25:34])


@dataclass
class NfeItem:
    item: int
    codigo: str
    ean: str
    descricao: str
    unidade: str
    quantidade: Decimal


@dataclass
class NfeDocumento:
    chave: str
    numero: int
    serie: int
    tipo_nf: int  # 0 = entrada, 1 = saida (do ponto de vista do emissor)
    natureza_operacao: str
    emissao: str
    emitente_cnpj: str
    emitente_nome: str
    destinatario_nome: str
    destinatario_documento: str
    autorizada: bool
    cancelada: bool = False
    arquivo: str = ""
    itens: List[NfeItem] = field(default_factory=list)


def _text(node: Optional[ET.Element], path: str) -> str:
    if node is None:
        return ""
    found = node.find(path)
    return (found.text or "").strip() if found is not None and found.text else ""


def _q(path: str) -> str:
    return "/".join(f"{_NS}{part}" for part in path.split("/"))


def parse_nfe_xml(content: bytes, *, arquivo: str = "") -> NfeDocumento:
    """Le o XML da NF-e (nfeProc ou NFe) e devolve cabecalho e itens."""
    if b"<!DOCTYPE" in content[:2048].upper():
        raise ValueError("XML com DOCTYPE nao e aceito.")
    root = ET.fromstring(content)
    if root.tag == f"{_NS}infNFe":
        inf = root
    else:
        inf = root.find(f".//{_NS}infNFe")
    if inf is None:
        raise ValueError("O arquivo nao e uma NF-e.")

    chave = _DIGITS.sub("", inf.get("Id") or "")
    ide = inf.find(_q("ide"))
    emit = inf.find(_q("emit"))
    dest = inf.find(_q("dest"))

    c_stat = _text(root, f".//{_NS}protNFe/{_NS}infProt/{_NS}cStat")
    itens: List[NfeItem] = []
    for det in inf.findall(_q("det")):
        prod = det.find(_q("prod"))
        if prod is None:
            continue
        try:
            quantidade = Decimal(_text(prod, _q("qCom")) or "0")
        except InvalidOperation:
            quantidade = Decimal(0)
        ean = _text(prod, _q("cEAN"))
        itens.append(
            NfeItem(
                item=int(det.get("nItem") or len(itens) + 1),
                codigo=_text(prod, _q("cProd")),
                ean="" if ean.upper() == "SEM GTIN" else ean,
                descricao=_text(prod, _q("xProd")),
                unidade=_text(prod, _q("uCom")),
                quantidade=quantidade,
            )
        )

    return NfeDocumento(
        chave=chave,
        numero=int(_text(ide, _q("nNF")) or 0),
        serie=int(_text(ide, _q("serie")) or 0),
        tipo_nf=int(_text(ide, _q("tpNF")) or 1),
        natureza_operacao=_text(ide, _q("natOp")),
        emissao=_text(ide, _q("dhEmi")) or _text(ide, _q("dEmi")),
        emitente_cnpj=_text(emit, _q("CNPJ")) or _text(emit, _q("CPF")),
        emitente_nome=_text(emit, _q("xNome")),
        destinatario_nome=_text(dest, _q("xNome")),
        destinatario_documento=_text(dest, _q("CNPJ")) or _text(dest, _q("CPF")),
        # Autorizada (100) ou autorizada fora de prazo (150).
        autorizada=c_stat in {"100", "150"},
        arquivo=arquivo,
        itens=itens,
    )


def _is_cancel_event(content: bytes, chave: str) -> bool:
    return chave.encode() in content and b"<tpEvento>110111</tpEvento>" in content


def _xml_files(folders: Iterable[str]) -> List[str]:
    files: List[str] = []
    for folder in folders:
        if not folder or not os.path.isdir(folder):
            continue
        for dirpath, _dirnames, filenames in os.walk(folder):
            for name in filenames:
                if name.lower().endswith(".xml"):
                    files.append(os.path.join(dirpath, name))
    return files


def _read(path: str, limit: int = _MAX_XML_BYTES) -> bytes:
    with open(path, "rb") as fh:
        return fh.read(limit)


def find_nfe_by_chave(chave: str, folders: Iterable[str]) -> Optional[NfeDocumento]:
    """
    Procura nas pastas o XML autorizado da chave.
    Primeiro pelo nome do arquivo; se nao achar, pelo comeco do conteudo.
    Tambem marca a nota como cancelada se houver o evento de cancelamento.
    """
    files = _xml_files(folders)
    named = [path for path in files if chave in os.path.basename(path)]

    # O emissor pode guardar mais de um XML da mesma chave (ex.: o assinado, antes da SEFAZ
    # responder, e o "procNFe" com o protocolo). Vale o autorizado; sem ele, o primeiro achado.
    documento: Optional[NfeDocumento] = None
    cancelada = False

    def consider(path: str, content: bytes) -> None:
        nonlocal documento, cancelada
        if _is_cancel_event(content, chave):
            cancelada = True
            return
        if b"infNFe" not in content:
            return
        try:
            parsed = parse_nfe_xml(content, arquivo=path)
        except (ET.ParseError, ValueError):
            return
        if parsed.chave != chave:
            return
        if documento is None or (parsed.autorizada and not documento.autorizada):
            documento = parsed

    for path in named:
        try:
            consider(path, _read(path))
        except OSError:
            continue

    if documento is None or not documento.autorizada:
        needle = chave.encode()
        named_set = set(named)
        others = [path for path in files if path not in named_set]
        others.sort(key=lambda p: os.path.getmtime(p) if os.path.exists(p) else 0, reverse=True)
        for path in others:
            try:
                head = _read(path, _HEAD_BYTES)
                if needle not in head:
                    continue
                consider(path, _read(path))
            except OSError:
                continue
            if documento is not None and documento.autorizada:
                break

    if documento is not None:
        documento.cancelada = cancelada
    return documento
