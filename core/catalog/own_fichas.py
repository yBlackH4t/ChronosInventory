"""
Ficha propria: o que a empresa sabe de uma turbina que o catalogo Master Power nao tem
(lancamento de fabrica, por exemplo): aplicacoes (veiculo/motor/ano), outros codigos (OEM,
antigos) e uma observacao tecnica.

A ficha fica na tabela `fichas_proprias`, que o pacote do catalogo nunca toca. Depois de
cada mudanca (e na abertura do app) ela e copiada para as tabelas `catalogo_*` com a fonte
"Ficha própria". Assim a busca por codigo, a busca por veiculo do assistente, a aba Catalogo
do produto e o vinculo automatico (pelos codigos do nome) funcionam sem codigo novo.

As fichas viajam para as outras maquinas junto com o conhecimento do assistente
(app/services/assistant_knowledge_sync_service.py).
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
from typing import Any, Dict, List, Optional

from core.catalog.normalization import canonical_code, extract_codes_from_name, is_searchable_code
from core.exceptions import ValidationException

OWN_SOURCE_CODE = "PROPRIA"
OWN_SOURCE_NAME = "Ficha própria"
KEY_OWN_SIGNATURE = "own_fichas_signature"

BRANDS = ("HOLSET", "GARRETT", "BORGWARNER", "OUTRA")
CODE_MAKERS = ("OEM", "GARRETT", "HOLSET", "BORGWARNER", "MAHLE", "BIAGIO", "MASTER POWER", "OUTRO")
KINDS = {"TURBO": "TURBOCOMPRESSOR", "CONJUNTO": "CONJUNTO CENTRAL"}
MAX_ITEMS = 50
MAX_FIELD = 120
MAX_NOTE = 500
_EXPORT_FIELDS = ("codigo", "codigo_norm", "marca", "tipo", "modelo", "observacao", "aplicacoes", "codigos")


def _text(value: Any, limit: int = MAX_FIELD) -> Optional[str]:
    text = " ".join(str(value or "").split())
    return text[:limit] or None


def _single_code(raw: Any, label: str) -> str:
    text = _text(raw, 60) or ""
    codes = extract_codes_from_name(text, expand_family=False)
    if len(codes) > 1:
        raise ValidationException(f"{label}: um código por campo ({text!r} tem {len(codes)}).")
    if not is_searchable_code(canonical_code(text)):
        raise ValidationException(f"{label}: {text!r} não é um número de peça.")
    return text.upper()


def normalize_ficha(data: Dict[str, Any]) -> Dict[str, Any]:
    """Confere e limpa uma ficha (vinda da tela ou do arquivo publicado). Erro = ValidationException."""
    codigo = _single_code(data.get("codigo"), "Código da turbina")
    marca = str(data.get("marca") or "").strip().upper()
    if marca not in BRANDS:
        raise ValidationException("Marca inválida. Use Holset, Garrett, BorgWarner ou Outra.")
    tipo = str(data.get("tipo") or "TURBO").strip().upper()
    if tipo not in KINDS:
        raise ValidationException("Tipo inválido. Use turbo ou conjunto central.")

    raw_apps = data.get("aplicacoes") or []
    raw_codes = data.get("codigos") or []
    if not isinstance(raw_apps, list) or not isinstance(raw_codes, list):
        raise ValidationException("Aplicações e códigos precisam ser listas.")
    if len(raw_apps) > MAX_ITEMS or len(raw_codes) > MAX_ITEMS:
        raise ValidationException(f"No máximo {MAX_ITEMS} aplicações e {MAX_ITEMS} códigos por ficha.")

    aplicacoes = []
    for app in raw_apps:
        if not isinstance(app, dict):
            raise ValidationException("Aplicação inválida.")
        item = {k: _text(app.get(k)) for k in ("montadora", "veiculo", "motor", "complemento")}
        if not item["veiculo"]:
            if any(item.values()):
                raise ValidationException("Cada aplicação precisa do veículo (ex.: Foton Aumark).")
            continue  # linha vazia na tela
        aplicacoes.append(item)

    codigos = []
    seen = {canonical_code(codigo)}
    for code in raw_codes:
        if not isinstance(code, dict):
            raise ValidationException("Código inválido.")
        if not _text(code.get("numero")):
            continue
        numero = _single_code(code.get("numero"), "Outro código")
        fabricante = str(code.get("fabricante") or "OEM").strip().upper()
        if fabricante not in CODE_MAKERS:
            raise ValidationException(f"Fabricante inválido: {fabricante!r}.")
        if canonical_code(numero) in seen:
            continue
        seen.add(canonical_code(numero))
        codigos.append({"fabricante": fabricante, "numero": numero})

    return {
        "codigo": codigo,
        "codigo_norm": canonical_code(codigo),
        "marca": marca,
        "tipo": tipo,
        "modelo": _text(data.get("modelo"), 60),
        "observacao": _text(data.get("observacao"), MAX_NOTE),
        "aplicacoes": aplicacoes,
        "codigos": codigos,
    }


def _row_to_ficha(row: sqlite3.Row | tuple, columns: List[str]) -> Dict[str, Any]:
    data = dict(zip(columns, row))
    return {
        "id": data["id"],
        "codigo": data["codigo"],
        "codigo_norm": data["codigo_norm"],
        "marca": data["marca"],
        "tipo": data["tipo"],
        "modelo": data["modelo"],
        "observacao": data["observacao"],
        "aplicacoes": json.loads(data["aplicacoes_json"] or "[]"),
        "codigos": json.loads(data["codigos_json"] or "[]"),
        "atualizado_em": data.get("atualizado_em"),
    }


def list_fichas(conn: sqlite3.Connection) -> List[Dict[str, Any]]:
    cursor = conn.execute("SELECT * FROM fichas_proprias ORDER BY codigo_norm")
    columns = [d[0] for d in cursor.description]
    return [_row_to_ficha(row, columns) for row in cursor.fetchall()]


def fichas_hash(fichas: List[Dict[str, Any]]) -> str:
    essential = sorted(({k: f.get(k) for k in _EXPORT_FIELDS} for f in fichas), key=lambda f: str(f["codigo_norm"]))
    data = json.dumps(essential, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(data.encode("utf-8")).hexdigest()


def export_fichas(conn: sqlite3.Connection) -> List[Dict[str, Any]]:
    return [{k: f[k] for k in _EXPORT_FIELDS} for f in list_fichas(conn)]


def save_ficha(conn: sqlite3.Connection, data: Dict[str, Any], ficha_id: Optional[int] = None) -> int:
    """Cria (ou atualiza, com `ficha_id`) uma ficha. Nao faz commit."""
    ficha = normalize_ficha(data)
    other = conn.execute(
        "SELECT id FROM fichas_proprias WHERE codigo_norm = ?", (ficha["codigo_norm"],)
    ).fetchone()
    if other and int(other[0]) != (ficha_id or -1):
        raise ValidationException(f"Já existe uma ficha própria para {ficha['codigo']}.")
    values = (
        ficha["codigo"], ficha["codigo_norm"], ficha["marca"], ficha["tipo"], ficha["modelo"], ficha["observacao"],
        json.dumps(ficha["aplicacoes"], ensure_ascii=False), json.dumps(ficha["codigos"], ensure_ascii=False),
    )
    if ficha_id:
        cursor = conn.execute(
            """
            UPDATE fichas_proprias SET codigo = ?, codigo_norm = ?, marca = ?, tipo = ?, modelo = ?, observacao = ?,
                aplicacoes_json = ?, codigos_json = ?, atualizado_em = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (*values, ficha_id),
        )
        if not cursor.rowcount:
            raise ValidationException("Ficha própria não encontrada.")
        return int(ficha_id)
    cursor = conn.execute(
        """
        INSERT INTO fichas_proprias (codigo, codigo_norm, marca, tipo, modelo, observacao, aplicacoes_json, codigos_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        values,
    )
    return int(cursor.lastrowid)


def replace_all(conn: sqlite3.Connection, fichas: List[Dict[str, Any]]) -> None:
    """Troca as fichas desta maquina pelas publicadas (ja conferidas por normalize_ficha). Nao faz commit."""
    conn.execute("DELETE FROM fichas_proprias")
    for ficha in fichas:
        save_ficha(conn, ficha)


def materialize(conn: sqlite3.Connection) -> bool:
    """
    Copia as fichas proprias para as tabelas catalogo_* (fonte "Ficha própria"). So mexe se elas
    mudaram ou se o pacote do catalogo apagou a copia. Devolve True se mexeu (o chamador religa).
    Abre e fecha a propria transacao.
    """
    from core.catalog.bundle import _get_system, _manual_links, _restore_manual_links, _set_system

    fichas = list_fichas(conn)
    signature = fichas_hash(fichas)
    source = conn.execute("SELECT id FROM catalogo_fontes WHERE codigo = ?", (OWN_SOURCE_CODE,)).fetchone()
    copied = (
        conn.execute("SELECT COUNT(*) FROM catalogo_produtos WHERE fonte_id = ?", (source[0],)).fetchone()[0]
        if source
        else 0
    )
    if _get_system(conn, KEY_OWN_SIGNATURE) == signature and copied == len(fichas):
        return False

    conn.execute("BEGIN IMMEDIATE")
    try:
        manual = _manual_links(conn)
        if source:
            ids = [r[0] for r in conn.execute("SELECT id FROM catalogo_produtos WHERE fonte_id = ?", (source[0],))]
            for table, column in (
                ("produto_catalogo_vinculo", "catalogo_produto_id"),
                ("catalogo_referencias", "catalogo_produto_id"),
                ("catalogo_aplicacoes", "catalogo_produto_id"),
                ("catalogo_relacionados", "catalogo_produto_id"),
                ("catalogo_relacionados", "relacionado_id"),
            ):
                conn.executemany(f"DELETE FROM {table} WHERE {column} = ?", [(i,) for i in ids])
            conn.execute("DELETE FROM catalogo_produtos WHERE fonte_id = ?", (source[0],))
        if fichas:
            conn.execute(
                "INSERT OR IGNORE INTO catalogo_fontes (codigo, nome, versao) VALUES (?, ?, NULL)",
                (OWN_SOURCE_CODE, OWN_SOURCE_NAME),
            )
            source_id = conn.execute(
                "SELECT id FROM catalogo_fontes WHERE codigo = ?", (OWN_SOURCE_CODE,)
            ).fetchone()[0]
            for ficha in fichas:
                modelo = f"{OWN_SOURCE_NAME} ({ficha['modelo']})" if ficha["modelo"] else OWN_SOURCE_NAME
                cursor = conn.execute(
                    """
                    INSERT INTO catalogo_produtos (fonte_id, codigo, codigo_norm, descricao, grupo, modelo, observacao, ativo)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
                    """,
                    (
                        source_id, ficha["codigo"], ficha["codigo_norm"], OWN_SOURCE_NAME,
                        KINDS.get(ficha["tipo"], KINDS["TURBO"]), modelo, ficha["observacao"],
                    ),
                )
                cp_id = cursor.lastrowid
                refs = [(ficha["marca"], ficha["codigo"])] + [(c["fabricante"], c["numero"]) for c in ficha["codigos"]]
                conn.executemany(
                    "INSERT INTO catalogo_referencias (catalogo_produto_id, fabricante, numero, numero_norm) VALUES (?, ?, ?, ?)",
                    [(cp_id, maker, number, canonical_code(number)) for maker, number in refs],
                )
                conn.executemany(
                    """
                    INSERT INTO catalogo_aplicacoes (catalogo_produto_id, montadora, veiculo, motor, tipo, complemento)
                    VALUES (?, ?, ?, ?, NULL, ?)
                    """,
                    [(cp_id, a.get("montadora"), a["veiculo"], a.get("motor"), a.get("complemento")) for a in ficha["aplicacoes"]],
                )
        _restore_manual_links(conn, manual)
        _set_system(conn, KEY_OWN_SIGNATURE, signature)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    return True


def refresh(db_connection) -> None:
    """Depois de mudar as fichas: copia para o catalogo e religa os produtos."""
    from core.catalog.bundle import ensure_catalog_schema, relink_catalog, _ensure_system_info

    conn = db_connection.get_connection()
    try:
        ensure_catalog_schema(conn)
        _ensure_system_info(conn)
        conn.commit()
        materialize(conn)
    finally:
        conn.close()
    relink_catalog(db_connection)
