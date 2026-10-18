"""
Download do XML de uma NF-e recebida, pela chave, no Ambiente Nacional da SEFAZ
(servico NFeDistribuicaoDFe), com o certificado digital A1 da empresa.

So consulta: nao registra ciencia nem manifesta a nota.
"""

from __future__ import annotations

import base64
import os
import re
import secrets
import tempfile
import zlib
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

URL = "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx"
ACTION = "http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse"
_NS = "{http://www.portalfiscal.inf.br/nfe}"
# Um XML de NF-e tem alguns KB; 20 MB descompactados ja e muito (protege contra "zip bomb").
MAX_DOC_BYTES = 20 * 1024 * 1024

MOTIVOS = {
    "137": "A SEFAZ nao tem esta nota para o CNPJ desta loja. Confira o CNPJ da loja nas configuracoes da NF-e.",
    "593": "O CNPJ da loja nao tem a mesma raiz do certificado.",
    "632": "A nota tem mais de 90 dias: a SEFAZ nao entrega pela chave.",
    "640": "O CNPJ desta loja nao e destinatario desta nota.",
    "641": "O CNPJ desta loja nao e destinatario desta nota.",
    "656": "A SEFAZ bloqueou por excesso de consultas. Espere 1 hora e tente de novo.",
}


class SefazError(Exception):
    """Erro com mensagem pronta para mostrar na tela."""


@dataclass
class CertificateInfo:
    titular: str
    cnpj: Optional[str]
    validade: datetime


@dataclass
class SefazResult:
    c_stat: str
    motivo: str
    xml: Optional[bytes] = None
    so_resumo: bool = False


def load_certificate(pfx: bytes, senha: str):
    from cryptography.hazmat.primitives.serialization import pkcs12

    try:
        key, cert, extras = pkcs12.load_key_and_certificates(pfx, senha.encode("utf-8"))
    except ValueError as exc:
        raise SefazError("Senha errada ou arquivo de certificado invalido.") from exc
    if key is None or cert is None:
        raise SefazError("O arquivo nao tem a chave do certificado (precisa ser o .pfx do A1).")
    return key, cert, extras or []


def certificate_info(pfx: bytes, senha: str) -> CertificateInfo:
    _key, cert, _extras = load_certificate(pfx, senha)
    subject = cert.subject.rfc4514_string()
    found = re.search(r":(\d{14})\b", subject) or re.search(r"\b(\d{14})\b", subject)
    cn = subject.split(",")[0].removeprefix("CN=")
    return CertificateInfo(
        titular=cn.split(":")[0],
        cnpj=found.group(1) if found else None,
        validade=cert.not_valid_after_utc,
    )


def _envelope(cnpj: str, uf: str, chave: str) -> bytes:
    return f"""<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body>
<nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe"><nfeDadosMsg>
<distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">
<tpAmb>1</tpAmb><cUFAutor>{uf}</cUFAutor><CNPJ>{cnpj}</CNPJ>
<consChNFe><chNFe>{chave}</chNFe></consChNFe>
</distDFeInt></nfeDadosMsg></nfeDistDFeInteresse></soap12:Body></soap12:Envelope>""".encode("utf-8")


_truststore_ready = False


def _use_system_trust() -> None:
    """A SEFAZ usa a cadeia ICP-Brasil: confia nos certificados do Windows."""
    global _truststore_ready
    if _truststore_ready:
        return
    try:
        import truststore

        truststore.inject_into_ssl()
    except ImportError:
        pass
    _truststore_ready = True


def _reject_doctype(content: bytes) -> None:
    if b"<!DOCTYPE" in content[:2048].upper():
        raise SefazError("Resposta da SEFAZ com DOCTYPE nao e aceita.")


def _gunzip_limited(data: bytes, limit: Optional[int] = None) -> bytes:
    """gzip.decompress com teto: para de descompactar ao passar do limite."""
    limit = MAX_DOC_BYTES if limit is None else limit
    try:
        inflater = zlib.decompressobj(16 + zlib.MAX_WBITS)
        out = inflater.decompress(data, limit + 1)
    except zlib.error as exc:
        raise SefazError("Documento compactado invalido na resposta da SEFAZ.") from exc
    if len(out) > limit or inflater.unconsumed_tail:
        raise SefazError("Documento grande demais na resposta da SEFAZ.")
    return out


def parse_response(content: bytes) -> SefazResult:
    _reject_doctype(content)
    root = ET.fromstring(content)
    ret = root.find(f".//{_NS}retDistDFeInt")
    if ret is None:
        raise SefazError("Resposta inesperada da SEFAZ.")
    result = SefazResult(
        c_stat=(ret.findtext(f"{_NS}cStat") or "").strip(),
        motivo=(ret.findtext(f"{_NS}xMotivo") or "").strip(),
    )
    for doc in ret.iter(f"{_NS}docZip"):
        schema = doc.get("schema", "")
        data = _gunzip_limited(base64.b64decode(doc.text or ""))
        _reject_doctype(data)
        if schema.startswith("procNFe"):
            result.xml = data
        elif schema.startswith("resNFe"):
            result.so_resumo = True
    return result


def _client_cert_session(cert_file: str, key_file: str, password: bytes):
    """Sessao do requests com o certificado do cliente ja carregado no contexto TLS."""
    import ssl

    import requests
    from requests.adapters import HTTPAdapter

    context = ssl.create_default_context()  # com o truststore: certificados do Windows
    context.load_cert_chain(cert_file, key_file, password=password)

    class _ClientCertAdapter(HTTPAdapter):
        def init_poolmanager(self, *args, **kwargs):
            kwargs["ssl_context"] = context
            return super().init_poolmanager(*args, **kwargs)

        def proxy_manager_for(self, *args, **kwargs):
            kwargs["ssl_context"] = context
            return super().proxy_manager_for(*args, **kwargs)

    session = requests.Session()
    session.mount("https://", _ClientCertAdapter())
    return session


def write_temp_credentials(key, cert, extras, folder: str) -> tuple[str, str, bytes]:
    """
    Grava o certificado e a chave privada em PEM numa pasta temporaria. A chave vai cifrada
    com uma senha aleatoria, que so existe na memoria: o arquivo sozinho nao serve para nada.
    """
    from cryptography.hazmat.primitives import serialization

    password = secrets.token_urlsafe(32).encode("ascii")
    cert_file, key_file = os.path.join(folder, "c.pem"), os.path.join(folder, "k.pem")
    with open(cert_file, "wb") as fh:
        fh.write(cert.public_bytes(serialization.Encoding.PEM))
        for extra in extras:
            fh.write(extra.public_bytes(serialization.Encoding.PEM))
    with open(key_file, "wb") as fh:
        fh.write(key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.BestAvailableEncryption(password),
        ))
    return cert_file, key_file, password


def download_nfe(chave: str, *, pfx: bytes, senha: str, cnpj: str, uf: str = "43", timeout: int = 40) -> SefazResult:
    import requests

    _use_system_trust()
    key, cert, extras = load_certificate(pfx, senha)

    folder = tempfile.mkdtemp(prefix="chronos_nfe_")
    cert_file, key_file = os.path.join(folder, "c.pem"), os.path.join(folder, "k.pem")
    try:
        cert_file, key_file, password = write_temp_credentials(key, cert, extras, folder)
        try:
            session = _client_cert_session(cert_file, key_file, password)
        except Exception as exc:
            raise SefazError("Nao consegui usar o certificado digital para falar com a SEFAZ.") from exc
        try:
            with session:
                response = session.post(
                    URL,
                    data=_envelope(cnpj, uf, chave),
                    headers={"Content-Type": f'application/soap+xml; charset=utf-8; action="{ACTION}"'},
                    timeout=timeout,
                )
        except requests.exceptions.RequestException as exc:
            raise SefazError(f"Nao consegui falar com a SEFAZ (internet?): {type(exc).__name__}.") from exc
    finally:
        for path in (cert_file, key_file):
            try:
                os.remove(path)
            except OSError:
                pass
        try:
            os.rmdir(folder)
        except OSError:
            pass

    if response.status_code != 200:
        raise SefazError(f"A SEFAZ respondeu com erro (HTTP {response.status_code}). Tente de novo mais tarde.")
    return parse_response(response.content)
