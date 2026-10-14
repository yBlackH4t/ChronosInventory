"""
Guarda segredos locais (ex.: senha do certificado digital) fora do texto puro.

No Windows usa o DPAPI do usuario: so este usuario, nesta maquina, consegue abrir.
Em outros sistemas (testes, desenvolvimento) guarda em base64, sem protecao real.
"""

from __future__ import annotations

import base64
import sys

_DPAPI = "dpapi:"
_PLAIN = "b64:"


def _dpapi(data: bytes, protect: bool) -> bytes:
    import ctypes
    from ctypes import wintypes

    class DATA_BLOB(ctypes.Structure):
        _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]

    buffer = ctypes.create_string_buffer(data, len(data))
    blob_in = DATA_BLOB(len(data), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_char)))
    blob_out = DATA_BLOB()
    crypt32 = ctypes.windll.crypt32
    fn = crypt32.CryptProtectData if protect else crypt32.CryptUnprotectData
    ok = fn(ctypes.byref(blob_in), None, None, None, None, 0, ctypes.byref(blob_out))
    if not ok:
        raise OSError("Nao foi possivel proteger/abrir o segredo com o Windows (DPAPI).")
    try:
        return ctypes.string_at(blob_out.pbData, blob_out.cbData)
    finally:
        ctypes.windll.kernel32.LocalFree(blob_out.pbData)


def protect(secret: str) -> str:
    raw = secret.encode("utf-8")
    if sys.platform == "win32":
        return _DPAPI + base64.b64encode(_dpapi(raw, True)).decode("ascii")
    return _PLAIN + base64.b64encode(raw).decode("ascii")


def unprotect(stored: str) -> str:
    if stored.startswith(_DPAPI):
        return _dpapi(base64.b64decode(stored[len(_DPAPI):]), False).decode("utf-8")
    if stored.startswith(_PLAIN):
        return base64.b64decode(stored[len(_PLAIN):]).decode("utf-8")
    raise ValueError("Segredo em formato desconhecido.")
