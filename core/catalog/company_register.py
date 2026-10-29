"""
Cadastro da empresa: o arquivo de produtos do sistema da loja (produtos_completos.csv), com o
codigo da peca, o nome e as aplicacoes em texto livre ("VW 17.210 - MOTOR: MWM 6.10 TCA",
"SIMILAR HOLSET: 4047413 / ...").

O arquivo e lido aqui em "fichas do cadastro": uma por codigo de peca, com as aplicacoes e os
codigos similares. Elas ficam na tabela `cadastro_fichas` (o pacote do catalogo nunca toca) e
sao copiadas para as tabelas catalogo_* com a fonte "Cadastro da empresa", como as fichas
proprias (core/catalog/own_fichas.py). Assim a busca por veiculo e por codigo do assistente,
a aba Catalogo do produto e o vinculo automatico funcionam sem codigo novo.

So entram turbos e conjuntos centrais que o catalogo Master Power nao tem: a ficha Master
Power e mais completa e duas fichas para a mesma peca so confundiriam a resposta.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import re
import sqlite3
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

from core.catalog.normalization import canonical_code, expand_family_codes, extract_codes_from_name, is_searchable_code
from core.exceptions import ValidationException

SOURCE_CODE = "CADASTRO"
SOURCE_NAME = "Cadastro da empresa"
KEY_SIGNATURE = "cadastro_fichas_signature"

KIND_TURBO = "TURBO"
KIND_CORE = "CONJUNTO"
GROUPS = {KIND_TURBO: "TURBOCOMPRESSOR", KIND_CORE: "CONJUNTO CENTRAL"}
HEADER = ("CD_MATERIAL", "DS_MATERIAL", "CD_IDENTIFICACAO")

MAX_FIELD = 200
MAX_NOTE = 500
MAX_ITEMS = 80

# O arquivo ja vem com alguns acentos trocados por "?" (CAMINH?O). Os mais comuns voltam.
_ACCENT_FIXES = (
    ("CAMINH?ES", "CAMINHÕES"), ("CAMINH?O", "CAMINHÃO"), ("?NIBUS", "ÔNIBUS"), ("C?DIGO", "CÓDIGO"),
    ("C?D.", "CÓD."), ("TAMB?M", "TAMBÉM"), ("S?RIE", "SÉRIE"), ("ELETR?NIC", "ELETRÔNIC"),
    ("MEC?NIC", "MECÂNIC"), ("ALUM?NIO", "ALUMÍNIO"), ("V?LVULA", "VÁLVULA"), ("AT? ", "ATÉ "),
    ("M?QUINA", "MÁQUINA"), ("PE?A", "PEÇA"), ("VERS?O", "VERSÃO"), ("REVIS?O", "REVISÃO"),
    ("APLICA??O", "APLICAÇÃO"), ("N?O", "NÃO"), ("SA?DA", "SAÍDA"), ("?LEO", "ÓLEO"), ("?GUA", "ÁGUA"),
    ("CAMINH? ", "CAMINHÃO "), ("ESTACION?IO", "ESTACIONÁRIO"), ("ESTACION?RIO", "ESTACIONÁRIO"),
)

# Onde comeca um trecho que nao e aplicacao: codigos similares/originais ou anotacao tecnica.
_REF_START = re.compile(
    r"(?<![A-Z0-9])(?:SIMILAR(?:ES)?|EQUIVALENTE|"
    r"C[OÓ?]D(?:IGO)?\.?\s+(?:OEM|ORIGINAL|MASTER\s+POWER|ALTERNATIVO)|OEM|OE|ORIGINAL\s+MONTADORA|"
    r"REF(?:ER[EÊ]NCIA)?\.?|COMPATIBILIDADE|BULLCHARGER|REFONE)(?![A-Z])"
)
_NOTE_START = re.compile(
    r"(?<![A-Z0-9])(?:EIXO|ROTOR|OBS\.?|OBSERVA[CÇ?][AÃ?]O|(?:GARRETT?\s+E\s+HOLSET\s+)?N[AÃ?]O\s+TEMOS|"
    r"N[AÃ?]O\s+(?:VENDE|EXISTE|[EÉ]\s+(?:APLIC|O\s+CONJ))|ATEN[CÇ?][AÃ?]O|NECESS[AÁ?]RIO|TEM\s+QUE|URG[EÊ?]NCIA|"
    r"SOMENTE\s+(?:TROCA|USAR|EIXO)|PRATO|\*{3,})(?![A-Z])"
)

# Relacoes que o texto descreve entre esta peca e outra (2.7.18). So similar e igual dizem que e
# "a mesma ficha"; as outras (par do biturbo, conjunto, substitui) ficam em cadastro_relacoes.
REL_SIMILAR = "SIMILAR"  # serve, de outra marca ("SIMILAR GARRETT 806589-5001S", "EQUIVALENTE")
REL_SAME = "IGUAL"  # igual, mesmo, codigo antigo, reman
REL_PAIR = "PAR"  # biturbo: faz par com o outro turbo (grande + pequeno)
REL_CORE = "CONJUNTO"  # turbo -> o conjunto central dele
REL_TURBO = "TURBO"  # conjunto -> o turbo onde ele vai
REL_REPLACES = "SUBSTITUI"  # esta peca serve no lugar da outra
REL_REPLACED_BY = "TROCAR_POR"  # esta peca pode ser trocada pela outra
RELATION_TYPES = (REL_SIMILAR, REL_SAME, REL_PAIR, REL_CORE, REL_TURBO, REL_REPLACES, REL_REPLACED_BY)
# Visto do outro codigo: A faz par com B = B faz par com A; A substitui B = B pode ser trocada por A.
REVERSE_RELATION = {
    REL_SIMILAR: REL_SIMILAR, REL_SAME: REL_SAME, REL_PAIR: REL_PAIR, REL_CORE: REL_TURBO, REL_TURBO: REL_CORE,
    REL_REPLACES: REL_REPLACED_BY, REL_REPLACED_BY: REL_REPLACES,
}

_BRAND_PREFIX = r"(?:(?:JRONE|J\s?RONE|BORG|HOLSET|GARRETT?|IMPORTADOS?|REFONE)\s*:?\s*)?"
_CODE_AHEAD = r"(?=\s*[:\-]?\s*" + _BRAND_PREFIX + r"(?:BC\.|SL\.|ACR-|IMP\s+|[A-Z]{1,2})?\d[\d.\-]?\d)"
# (tipo, padrao). Num empate na mesma posicao vale o primeiro da lista.
_RELATION_MARKS = (
    ("par", re.compile(r"(?<![A-Z])(?:FAZ\s+PAR(?:\s+COM)?|PAR\s+COM)(?![A-Z])\s*:?(?:\s*O\s+TURBO(?![A-Z]))?")),
    ("trocar", re.compile(
        r"(?<![A-Z])(?:[EÉ?]\s+)?(?:POSS[IÍ?]VEL\s+)?SUBSTITUIR\s+PEL[OA](?:\s+TURBO)?|"
        r"PODE\s+SER\s+INSTALAD[OA]")),
    ("subst", re.compile(
        r"(?<![A-Z])(?:SUBSTITUI(?:\s+O(?:\s+(?:TURBO|CONJUNTO(?:\s+CENTRAL)?))?(?:\s+ORIGINAL)?)?(?![A-Z])\s*:?|"
        r"PODE\s+SER\s+APLICADO\s+NO\s+LUGAR\s+D[OA]|D[AÁ?]\s+PARA\s+ADAPTAR\s+NO\s+LUGAR\s+D[OA]|"
        r"PODE\s+SE\s+ADAPTAR)")),
    ("turbo", re.compile(
        r"(?<![A-Z])(?:APLICA-?SE\s+NOS?\s+TURBOS?|SE\s+APLICA\s+NO(?:\s+BI-?TURBO)?|TURBOS?\s+DE\s+ENCAIXE|"
        r"CONJUNTO\s+DA(?=\s+\d)|CONJUNTO(?:\s+CENTRAL)?\s+(?:PARA\s+O(?:\s+TURBO)?|APLICA\s+NO)|"
        r"TURBO\s*/\s*OEM|(?<![/])TURBOS?(?=\s*:))(?![A-Z])\s*:?")),
    ("igual", re.compile(
        r"(?<![A-Z])(?:IGUAL(?:\s+(?:A\s+DA|AO|A|CONJUNTO))?|O\s+MESMO|MESMOS?(?:\s+C[OÓ?]DIGOS?(?:\s+BORG)?|\s+TURBO)?|"
        r"(?:PN\s+TURBO\s+)?ANTIGOS?|C[OÓ?]D(?:IGO)?S?\.?\s+ANTIGOS?(?:\s+DA\s+[A-Z]+)?|REMAN)(?![A-Z])\s*:?" + _CODE_AHEAD
        + r"|MESMOS?\s+C[OÓ?]DIGOS?(?:\s+BORG)?\s*:?\s*$")),
    ("conj", re.compile(
        r"(?<![A-Z])(?:CONJUNTOS?\s+(?:APLIC[A-Z]+|DE\s+ENCAIXE)[^:]{0,40}:|MONTAR(?=\s+(?:JRONE|J\s?RONE|BC\.|SL\.))|(?:CONJ(?:UNTO)?S?\.?|CONUNTO)(?!\s*MONTAD)"
        r"(?:\s+CENTRA(?:L|IS))?(?:\s+(?:IMPORTADOS?|SIMILAR(?:ES)?|REMAN))*)(?![A-Z])\s*:?" + _CODE_AHEAD)),
)
_RELATION_KIND = {"par": REL_PAIR, "trocar": REL_REPLACED_BY, "subst": REL_REPLACES, "turbo": REL_TURBO,
                  "igual": REL_SAME, "conj": REL_CORE}
_MOTOR = re.compile(
    r"(?<![A-Z])MOTOR(?:IZA[CÇ?][AÃ?]O)?(?!\s+(?:TRASEIRO|DIANTEIRO|MAR[IÍ?]TIMO|ESTACION|DE\s))\s*:?\s*"
)
_LEADING_LABEL = re.compile(
    r"^\s*(?:APLICA-?SE(?:\s+TAMB[EÉ?]M)?\s*:?|APLICA[CÇ?][AÃ?]O\s*:|-?\s*CONJUNTO\s+MONTADO\s*-?|"
    r"TURBINA\s+(?:GRANDE|PEQUENA)\s*,?|TURBO\s+(?:GRANDE|PEQUENO)\s*,?)\s*"
)
# Linha tecnica (medidas, conexoes) ou aviso interno: vai para a observacao, nao e aplicacao.
_TECH_LINE = re.compile(
    r"^(?:FAM[IÍ?]LIA|ENTRADA|SA[IÍ?]DA|DI[AÂ?]METRO|PRATO|CARCA[CÇ?]A|PALHETAS?|ROTOR|EIXO|MEDIDAS?|"
    r"SENTIDO|MATERIAL|#NOME|#VALOR|N[AÃ?]O\s+EXISTE|SOMENTE\s+TROCA|CONJUNTOS?\s*:?$|"
    r"URG[EÊ?]NCIA|CINTA\s|C[OÓ?]DIGO\s+(?:ALTERNATIVO|INTERNO)\s*:?$|COMPATIBILIDADE\s*:?/?$)"
)
# "EIXO: 42/49,95 / ROTOR: 39,4/56" e o comeco da anotacao; o texto que vem depois volta a ser aplicacao.
_MEASURES = re.compile(r"^(?:(?:EIXO|ROTOR)[A-ZÀ-Ü? ]*:?\s*[\d.,/xX*\s:-]*(?:MM)?\s*/?\s*)+")
_SCIENTIFIC = re.compile(r"^-?\d+(?:[.,]\d+)?E[+-]?\d+$")
_CONTINUES = ("/", "-", ",", ":", "+")

_BRAND_WORDS = (("HOLSET", "HOLSET"), ("GARRETT", "GARRETT"), ("BORG", "BORGWARNER"), ("BW", "BORGWARNER"))
_BRAND_MODELS = (
    (re.compile(r"(?<![A-Z0-9])H[EXY]\d"), "HOLSET"),
    (re.compile(r"(?<![A-Z0-9])(?:GTA?|GT[BV]|TB|TO?4[A-Z]?|T0\d)\d"), "GARRETT"),
    (re.compile(r"(?<![A-Z0-9])(?:K\d{2}|S[1-5]\d{2}|S[1-5][A-Z]{1,3}|B[1-3]\d|BV\d)"), "BORGWARNER"),
)
_LABEL_MAKERS = (
    ("HOLSET", "HOLSET"), ("GARRETT", "GARRETT"), ("GARRET", "GARRETT"), ("BORG", "BORGWARNER"),
    ("BORGWARNER", "BORGWARNER"), ("JRONE", "JRONE"), ("RONE", "JRONE"), ("BULLCHARGER", "BULLCHARGER"),
    ("REFONE", "REFONE"), ("REMAN", "REMAN"), ("ANTIGO", "CODIGO ANTIGO"), ("ANTIGOS", "CODIGO ANTIGO"),
    ("OEM", "OEM"), ("ORIGINAL", "OEM"), ("MONTADORA", "OEM"), ("OE", "OEM"),
    ("MASTER", "MASTER POWER"), ("BIAGIO", "BIAGIO"), ("MAHLE", "MAHLE"),
)
# Marca pelo jeito do numero, quando o texto nao diz: Garrett 806589-5001S, BorgWarner 53299887201,
# Bullcharger BC.0219, JRONE 1000-030-118T, Refone (IMP) 7100-002-0070.
_CODE_MAKERS = (
    (re.compile(r"^\d{6}-\d{4}[A-Z]?$"), "GARRETT"),
    (re.compile(r"^(?:53|54|10|11|12|13|14|70|90)\d{9}$"), "BORGWARNER"),
    (re.compile(r"^BC\.\d{3,4}"), "BULLCHARGER"),
    (re.compile(r"^(?:1000|1100|1102|1200|2300|2063)-\d{3}-\d{3}"), "JRONE"),
    (re.compile(r"^(?:7100|7003|7004|7110|7101|7320)-\d{3}-\d{4}"), "REFONE"),
)


# ---------------------------------------------------------------------------
# 1. Ler o arquivo
# ---------------------------------------------------------------------------

def _decode(data: bytes) -> str:
    for encoding in ("utf-8-sig", "cp1252"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    return data.decode("cp1252", errors="replace")


def fix_text(value: Any) -> str:
    text = " ".join(str(value or "").replace("\t", " ").split())
    upper = text.upper()
    if "?" in upper:
        for wrong, right in _ACCENT_FIXES:
            upper = upper.replace(wrong, right)
    return upper


def read_items(data: bytes) -> List[Dict[str, Any]]:
    """
    Os itens do arquivo: [{cd_material, nome, codigo, linhas}]. Cada item comeca numa linha
    com o numero do material; as aplicacoes (DS_PRODUCAO) continuam nas linhas de baixo.
    """
    rows = list(csv.reader(io.StringIO(_decode(data), newline=""), delimiter=";"))
    if not rows or tuple(c.strip().upper() for c in rows[0][:3]) != HEADER:
        raise ValidationException(
            "O arquivo não parece ser o cadastro de produtos (a primeira linha precisa ter "
            "CD_MATERIAL;DS_MATERIAL;CD_IDENTIFICACAO)."
        )
    columns = [c.strip().upper() for c in rows[0]]
    col_app = columns.index("DS_PRODUCAO") if "DS_PRODUCAO" in columns else None
    col_obs = columns.index("DS_OBS") if "DS_OBS" in columns else None

    items: List[Dict[str, Any]] = []
    for row in rows[1:]:
        first = row[0].strip() if row else ""
        if first.isdigit() and len(row) >= 3 and row[1].strip():
            lines = []
            for col in (col_app, col_obs):
                if col is not None and col < len(row):
                    lines.append(row[col])
            items.append(
                {
                    "cd_material": int(first),
                    "nome": fix_text(row[1]),
                    "codigo": fix_text(row[2]) if row[2].strip().upper() != "NULL" else "",
                    "linhas": lines,
                }
            )
        elif items:
            # Continuacao: o texto da aplicacao quebrou em varias linhas do arquivo.
            text = " ".join(cell for cell in row if cell.strip())
            if text.strip():
                items[-1]["linhas"].append(text)
    if not items:
        raise ValidationException("Nenhum produto encontrado no arquivo.")
    for item in items:
        lines = (fix_text(line) for line in item["linhas"])
        item["linhas"] = [line for line in lines if line and line != "NULL" and not _SCIENTIFIC.match(line)]
    return items


# ---------------------------------------------------------------------------
# 2. Item do arquivo -> ficha
# ---------------------------------------------------------------------------

def item_kind(nome: str) -> Optional[str]:
    """Turbo ou conjunto central; None para as outras pecas (embreagem, atuador, abracadeira...)."""
    if "CONJ" in nome or "CENTRAL" in nome:
        return KIND_CORE
    if "TURBO" in nome or nome.startswith("IMP "):
        return KIND_TURBO
    return None


_MODEL = re.compile(
    r"^(?:H[EXY]\d{2,3}[A-Z]{0,3}|GTA?\d{2,4}[A-Z]{0,3}|GT[BV]\d{2,4}[A-Z]{0,3}|TO?4[A-Z]\d{0,3}|K\d{2}|"
    r"S[1-5]\d{2}[A-Z]{0,2}|S[1-5][A-Z]{1,3}|B[1-3]\d|BV\d{2}|TD\d{2}[A-Z]?|TF\d{3}[A-Z]?|RHF\d|R2S|CT\d{2}[A-Z]?|"
    r"3LM|4LE|4LF|TV\d{2}|TB\d{2,4})$"
)


def item_model(nome: str) -> Optional[str]:
    """Modelo da turbina escrito no nome ('TURBO BORG S2EL 766595' -> 'S2EL')."""
    for token in re.split(r"[\s/,;()\[\]]+|\s-\s", nome):
        token = token.strip(" .-")
        if _MODEL.match(token):
            return token
    return None


def item_brand(nome: str) -> str:
    words = set(re.split(r"[^A-Z0-9]+", nome))
    for word, brand in _BRAND_WORDS:
        if word in words or (word == "BORG" and "BORGWARNER" in words):
            return brand
    for pattern, brand in _BRAND_MODELS:
        if pattern.search(nome):
            return brand
    return "OUTRA"


def codes_with_text(text: str) -> List[Tuple[str, str]]:
    """[(como esta escrito, canonico)] dos codigos de peca de um texto, na ordem."""
    out: List[Tuple[str, str]] = []
    seen: Set[str] = set()
    for token in re.split(r"\s+-\s+|[\s/,;:()\[\]*\\]+", text):
        token = token.strip(" .-:*")
        code = canonical_code(token)
        if is_searchable_code(code) and code not in seen:
            seen.add(code)
            out.append((token, code))
    return out


def own_codes(item: Dict[str, Any]) -> List[Tuple[str, str]]:
    """Codigos da propria peca: o campo do codigo primeiro, depois os do nome."""
    codes = codes_with_text(item["codigo"]) if item["codigo"] else []
    known = {c for _, c in codes}
    codes += [(raw, code) for raw, code in codes_with_text(item["nome"]) if code not in known]
    return codes


def _label_maker(label: str, default: str) -> str:
    words = set(re.split(r"[^A-Z0-9]+", label))
    for word, maker in _LABEL_MAKERS:
        if word in words:
            return maker
    return default


def code_maker(raw: str, default: str) -> str:
    for pattern, maker in _CODE_MAKERS:
        if pattern.match(raw):
            return maker
    return default


def is_relation_code(raw: str, code: str) -> bool:
    """Numero de peca que pode ser o outro lado de uma relacao (nao modelo, ano nem medida)."""
    if not is_searchable_code(code) or _MODEL.match(code):
        return False
    if code.isdigit():
        return len(code) >= 5
    return sum(ch.isdigit() for ch in code) >= 4


def _paren_depth(line: str, position: int) -> int:
    return line[:position].count("(") - line[:position].count(")")


def _marks(line: str, kind: str) -> List[Tuple[int, int, str]]:
    """Onde comeca cada trecho que nao e aplicacao: [(inicio, fim do rotulo, tipo)]."""
    found: List[Tuple[int, int, int, str]] = []
    for order, (name, pattern) in enumerate(_RELATION_MARKS):
        if name == "turbo" and kind != KIND_CORE:
            continue  # "TURBO:" so diz o turbo de um conjunto
        for m in pattern.finditer(line):
            found.append((m.start(), order, m.end(), name))
    for m in _REF_START.finditer(line):
        found.append((m.start(), len(_RELATION_MARKS), m.start(), "ref"))
    for m in _NOTE_START.finditer(line):
        # Dentro de parenteses e ressalva do codigo ("(ATENCAO, POSICAO ONIBUS)"), nao anotacao nova.
        if _paren_depth(line, m.start()) <= 0:
            found.append((m.start(), len(_RELATION_MARKS) + 1, m.start(), "nota"))
    found.sort()
    marks: List[Tuple[int, int, str]] = []
    last_end = -1
    turbo_seen = False
    for start, _, end, name in found:
        if kind == KIND_CORE and name == "igual" and (turbo_seen or line[start:end].startswith("MESMO")):
            # Num conjunto, "MESMO CODIGOS BORG: ..." e os "ANTIGOS"/"REMAN" depois de "TURBO/OEM:"
            # sao os turbos onde ele vai, nao o proprio conjunto.
            name = "turbo"
        turbo_seen = turbo_seen or name == "turbo"
        if start < last_end:
            continue  # sobreposto ao rotulo anterior
        if marks and marks[-1][2] in ("par", "trocar", "subst") and name == "nota":
            continue  # "PODE SE ADAPTAR X, POREM TEM QUE..." : a ressalva fica com a relacao
        if name == "conj" and kind == KIND_CORE:
            name = "ref"  # num conjunto, "CONJUNTO: BC.0182" sao os conjuntos de outras marcas
        marks.append((start, end, name))
        last_end = end
    return marks


def _split_segments(line: str, kind: str = KIND_TURBO) -> Tuple[str, List[Tuple[str, str]]]:
    """Separa a aplicacao (comeco da linha) dos trechos de codigos e anotacoes: (aplicacao, [(tipo, trecho)])."""
    marks = _marks(line, kind)
    if not marks:
        return line, []
    application = line[: marks[0][0]]
    segments = []
    for index, (start, end, name) in enumerate(marks):
        stop = marks[index + 1][0] if index + 1 < len(marks) else len(line)
        if name in ("ref", "nota"):
            segments.append((name, line[start:stop].strip(" -/;")))
        else:
            segments.append((name, (line[start:end] + "\x00" + line[end:stop]).strip(" -/;")))
    return application, segments


def _code_note(text: str, raw: str) -> Optional[str]:
    """A ressalva escrita logo depois do codigo: "53279887213 (ROTOR TITANIO)" -> "ROTOR TITANIO"."""
    at = text.find(raw)
    if at < 0:
        return None
    rest = text[at + len(raw):].lstrip(" *")
    if rest.startswith("("):
        depth, end = 0, None
        for i, ch in enumerate(rest):
            depth += ch == "("
            depth -= ch == ")"
            if depth == 0:
                end = i
                break
        note = rest[1:end] if end else rest[1:]
        note = note.strip(" ,(")
        if re.search(r"[A-Z]{3}", note):
            return note[:MAX_FIELD]
    return None


def _relation_rows(kind: str, label: str, body: str, default_maker: str) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], Optional[str]]:
    """Trecho de uma relacao -> (codigos para a ficha, relacoes, ressalva do trecho)."""
    codes: List[Dict[str, Any]] = []
    relations: List[Dict[str, Any]] = []
    found = [(raw, code) for raw, code in codes_with_text(body) if is_relation_code(raw, code)]
    rest = body
    for raw, _ in found:
        rest = rest.replace(raw, " ")
    rest = re.sub(r"\([^)]*\)?", " ", rest)
    words = " ".join(rest.replace("*", " ").split()).strip(" ,.-/;:")
    words = re.sub(r"^(?:E|OU)\s*,?\s+", "", words).strip(" ,")
    segment_note = words[:MAX_FIELD] if re.search(r"[A-Z]{4}", words) else None
    cursor = 0
    for raw, code in found:
        at = body.find(raw, cursor)
        before = body[cursor:at] if at >= 0 else ""
        cursor = at + len(raw) if at >= 0 else cursor
        maker = _label_maker(before, "") or _label_maker(label, "") or code_maker(raw, default_maker)
        note = _code_note(body, raw)
        if kind in (REL_SIMILAR, REL_SAME):
            codes.append({"fabricante": maker, "numero": raw[:60], "numero_norm": code})
        relations.append({"tipo": kind, "numero": raw[:60], "numero_norm": code, "observacao": note,
                          "fabricante": maker})
    if kind in (REL_PAIR, REL_REPLACES, REL_REPLACED_BY) and segment_note:
        for relation in relations:
            relation["observacao"] = relation["observacao"] or segment_note
    return codes, relations, segment_note


def _application(text: str) -> Optional[Dict[str, Optional[str]]]:
    text = _LEADING_LABEL.sub("", text.replace("*", " ")).strip(" -/;:")
    if not text:
        return None
    match = _MOTOR.search(text)
    vehicle, motor = (text[: match.start()], text[match.end():]) if match else (text, "")
    vehicle = vehicle.strip(" -/;:,")
    motor = motor.strip(" -/;:,")
    if not vehicle:
        vehicle, motor = motor, ""
    if not vehicle or not re.search(r"[A-Z]{2}", vehicle) or vehicle in ("CONJUNTO", "CONJUNTOS"):
        return None
    return {"montadora": None, "veiculo": vehicle[:MAX_FIELD], "motor": motor[:MAX_FIELD] or None, "complemento": None}


def _only_codes(line: str) -> bool:
    """Linha so com codigos de peca ("1000-030-200T + 1102-017-009"), sem veiculo."""
    tokens = [t.strip(" .-:*") for t in re.split(r"\s+-\s+|[\s/,;()\[\]+]+", line)]
    tokens = [t for t in tokens if t]
    return bool(tokens) and all(is_searchable_code(canonical_code(t)) and re.search(r"\d.*\d.*\d", t) and
                                not re.fullmatch(r"\d{4,5}[A-Z]?", t) for t in tokens)


def parse_details(lines: Iterable[str], kind: str = KIND_TURBO) -> Dict[str, Any]:
    """
    Texto livre das aplicacoes -> {aplicacoes, codigos, relacoes, notas}. Uma aplicacao junta as
    linhas ate o motor ("MASSEY FERGUSON MF7350 / 7370 /" + "7415 MOTOR: 620DS"); o texto depois de
    SIMILAR / OE / CONJUNTO JRONE vira codigo; EIXO, ROTOR e OBS viram anotacao.

    Relacoes (2.7.18): "FAZ PAR COM", "SUBSTITUI", "SUBSTITUIR PELO", "IGUAL", "CODIGO ANTIGO",
    o conjunto central do turbo e o turbo do conjunto. Par, conjunto e substituto nao entram nos
    codigos da ficha: nao sao a mesma peca.
    """
    applications: List[Dict[str, Optional[str]]] = []
    codes: List[Dict[str, str]] = []
    relations: List[Dict[str, Any]] = []
    notes: List[str] = []
    buffer: List[str] = []
    waiting_motor = False
    carry: Optional[str] = None  # relacao cujo codigo ficou na linha de baixo

    def flush() -> None:
        nonlocal waiting_motor
        if buffer:
            text = " ".join(buffer)
            app = _application(text)
            if app and applications and len(text) <= 10 and " " not in text:
                # Sobra do motor da linha de cima ("OM 366A" + "210CV").
                last = applications[-1]
                if last["motor"]:
                    last["motor"] = f"{last['motor']} {text}"[:MAX_FIELD]
                else:
                    last["veiculo"] = f"{last['veiculo']} {text}"[:MAX_FIELD]
            elif app and app not in applications:
                applications.append(app)
        buffer.clear()
        waiting_motor = False

    def add_note(text: str) -> None:
        text = text.replace("\x00", " ").strip(" -/;*")
        text = " ".join(text.split())
        if text and text not in notes:
            notes.append(text)

    def add_relation(name: str, text: str) -> bool:
        """Grava o trecho de uma relacao; False se nao tinha codigo (pode estar na linha de baixo)."""
        label, _, body = text.partition("\x00")
        rel_kind = REL_SIMILAR if name == "ref" else _RELATION_KIND[name]
        found, rels, _ = _relation_rows(rel_kind, label, body if _ else label, "OUTRO")
        for code in found:
            codes.append({k: code[k] for k in ("fabricante", "numero", "numero_norm")})
        for rel in rels:
            relations.append(rel)
        if rel_kind not in (REL_SIMILAR, REL_SAME) and (rels or not body.strip()):
            add_note(text)  # a anotacao continua aparecendo na ficha, inteira
        return bool(rels)

    def add_ref(segment: str, label_from: str = "") -> None:
        found = codes_with_text(segment)
        label = label_from or (segment.split(found[0][0])[0] if found else segment)
        maker = _label_maker(label, "OUTRO")
        similar = bool(re.match(r"(?:SIMILAR|EQUIVALENTE)", label))
        for raw, code in found:
            at = segment.find(raw)
            near = _label_maker(segment[max(0, at - 14):at], "")
            made = near or (maker if maker != "OUTRO" else code_maker(raw, "OUTRO"))
            codes.append({"fabricante": made, "numero": raw[:60], "numero_norm": code})
            if similar and is_relation_code(raw, code):
                relations.append({"tipo": REL_SIMILAR, "numero": raw[:60], "numero_norm": code,
                                  "observacao": _code_note(segment, raw), "fabricante": made})

    def starts_with_code(text: str) -> bool:
        first = codes_with_text(text.split(" ", 1)[0]) if text.strip() else []
        return bool(first) and is_relation_code(*first[0])

    lines = list(lines)
    last_kind: Optional[str] = None  # tipo do ultimo trecho da linha de cima (lista de codigos que continua)
    for index, line in enumerate(lines):
        previous_kind, last_kind = last_kind, None
        if previous_kind not in (None, "par", "subst", "trocar") and not carry and starts_with_code(line.strip(" /-*")):
            # "SIMILARES BORG 53279887227 /" + "70000175096 / 90000175096 (ATENCAO, POSICAO ONIBUS)"
            flush()
            application, segments = _split_segments(line, kind)
            if previous_kind in ("ref", "similar"):
                add_ref(application, "SIMILAR" if previous_kind == "similar" else "OEM")
            else:
                add_relation(previous_kind, "\x00" + application)
            last_kind = previous_kind
            application = ""
        elif carry:
            name, carry = carry, None
            application, segments = _split_segments(line, kind)
            if application.strip():
                add_relation(name, "\x00" + application)
                last_kind = name
                application = ""
        elif _TECH_LINE.match(line):
            flush()
            add_note(line)
            continue
        elif _only_codes(line):
            # So codigos ("1000-030-200T + 1102-017-009"), sem nome de veiculo.
            flush()
            for raw, code in codes_with_text(line):
                codes.append({"fabricante": code_maker(raw, "OUTRO"), "numero": raw[:60], "numero_norm": code})
            continue
        else:
            application, segments = _split_segments(line, kind)
        application = application.strip()
        if application:
            buffer.append(application)
            motors = list(_MOTOR.finditer(application))
            next_line = lines[index + 1] if index + 1 < len(lines) else ""
            text = " ".join(buffer)
            open_paren = text.count("(") > text.count(")")
            # "... MOTOR:" ou "MOTOR: OM": o motor continua na linha de baixo.
            next_motor = _MOTOR.search(next_line)
            motor_soon = bool(next_motor) and len(next_line[: next_motor.start()].strip(" -/")) <= 10
            if motors and len(application[motors[-1].end():].strip(" -/")) <= 3:
                waiting_motor = True
            elif open_paren or application.endswith(_CONTINUES) or (not motors and motor_soon):
                if motors or waiting_motor:
                    waiting_motor = True
            else:
                flush()
        if segments:
            flush()
        for position, (name, segment) in enumerate(segments):
            if name == "nota":
                last_kind = None
                measures = _MEASURES.match(segment)
                rest = segment[measures.end():].strip(" -/;") if measures and measures.end() else ""
                if rest and re.search(r"[A-Z]{3}", rest) and not _NOTE_START.match(rest):
                    segment = segment[: measures.end()].strip(" -/;")
                    app = _application(rest)
                    if app and app not in applications:
                        applications.append(app)
                add_note(segment)
                continue
            if name == "ref":
                add_ref(segment)
                last_kind = "similar" if re.match(r"(?:SIMILAR|EQUIVALENTE)", segment) else "ref"
                continue
            last_kind = name
            if not add_relation(name, segment) and position == len(segments) - 1:
                carry = name
    flush()
    return {"aplicacoes": applications, "codigos": codes, "relacoes": relations, "notas": notes}


def build_fichas(items: List[Dict[str, Any]], catalog_codes: Set[str]) -> Dict[str, Any]:
    """
    Fichas do cadastro (uma por codigo de peca) e o que ficou de fora. `catalog_codes` = codigos
    que o catalogo Master Power ja conhece (essas pecas ficam com a ficha da Master Power).
    """
    fichas: Dict[str, Dict[str, Any]] = {}
    skipped = {"outras_pecas": 0, "sem_codigo": 0, "no_catalogo_master_power": 0, "sem_aplicacao": 0}
    for item in items:
        kind = item_kind(item["nome"])
        if not kind:
            skipped["outras_pecas"] += 1
            continue
        codes = own_codes(item)
        if not codes:
            skipped["sem_codigo"] += 1
            continue
        if any(code in catalog_codes for _, code in codes):
            skipped["no_catalogo_master_power"] += 1
            continue
        details = parse_details(item["linhas"], kind)
        if not details["aplicacoes"] and not details["codigos"]:
            skipped["sem_aplicacao"] += 1
            continue
        main_raw, main_norm = codes[0]
        brand = item_brand(item["nome"])
        ficha = fichas.get(main_norm)
        if not ficha:
            ficha = fichas[main_norm] = {
                "codigo": main_raw[:60],
                "codigo_norm": main_norm,
                "marca": brand,
                "tipo": kind,
                "descricao": item["nome"][:MAX_FIELD],
                "modelo": item_model(item["nome"]),
                "observacao": None,
                "aplicacoes": [],
                "codigos": [],
                "materiais": [],
            }
        ficha["materiais"].append(item["cd_material"])
        maker = brand if brand != "OUTRA" else "OUTRO"
        known = {ficha["codigo_norm"]} | {c["numero_norm"] for c in ficha["codigos"]}
        for raw, code in codes[1:]:
            if code not in known:
                known.add(code)
                ficha["codigos"].append({"fabricante": maker, "numero": raw[:60], "numero_norm": code})
        for code in details["codigos"]:
            if code["numero_norm"] not in known and len(ficha["codigos"]) < MAX_ITEMS:
                known.add(code["numero_norm"])
                ficha["codigos"].append(code)
        for app in details["aplicacoes"]:
            if app not in ficha["aplicacoes"] and len(ficha["aplicacoes"]) < MAX_ITEMS:
                ficha["aplicacoes"].append(app)
        if details["notas"]:
            note = " / ".join(filter(None, [ficha["observacao"], *details["notas"]]))
            ficha["observacao"] = note[:MAX_NOTE]
    return {"fichas": list(fichas.values()), "ignorados": skipped}


def part_codes(item: Dict[str, Any]) -> List[Tuple[str, str]]:
    """Os numeros de peca do item (sem o modelo, como GT1238MZ), o do campo do codigo primeiro."""
    return [(raw, code) for raw, code in own_codes(item) if is_relation_code(raw, code)]


def build_relations(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Relacoes escritas nas observacoes de todos os itens (turbo, conjunto e as outras pecas, com ou
    sem ficha Master Power): [{origem, origem_norm, tipo, numero, numero_norm, observacao, material}].
    A relacao com o proprio codigo (ou a versao nova/reman dele) sai.
    """
    rows: List[Dict[str, Any]] = []
    seen: Set[Tuple[str, str, str]] = set()
    for item in items:
        own = part_codes(item)
        if not own or not item["linhas"]:
            continue
        family = set(expand_family_codes([code for _, code in own]))
        details = parse_details(item["linhas"], item_kind(item["nome"]) or KIND_TURBO)
        for rel in details["relacoes"]:
            target = rel["numero_norm"]
            if target in family or set(expand_family_codes([target])) & family:
                continue
            # Uma linha por codigo da peca ("3770052/4309099"): a busca por qualquer um acha a relacao.
            for origin_raw, origin in own:
                key = (origin, rel["tipo"], target)
                if key in seen:
                    continue
                seen.add(key)
                rows.append({
                    "origem": origin_raw[:60], "origem_norm": origin, "tipo": rel["tipo"], "numero": rel["numero"],
                    "numero_norm": target, "observacao": (rel.get("observacao") or None),
                    "material": item["cd_material"],
                })
    return rows


# ---------------------------------------------------------------------------
# 3. Guardar e copiar para o catalogo
# ---------------------------------------------------------------------------

def list_fichas(conn: sqlite3.Connection) -> List[Dict[str, Any]]:
    cursor = conn.execute(
        """
        SELECT codigo, codigo_norm, marca, tipo, descricao, observacao, aplicacoes_json, codigos_json, materiais, modelo
        FROM cadastro_fichas ORDER BY codigo_norm
        """
    )
    return [
        {
            "codigo": row[0], "codigo_norm": row[1], "marca": row[2], "tipo": row[3], "descricao": row[4],
            "observacao": row[5], "aplicacoes": json.loads(row[6] or "[]"), "codigos": json.loads(row[7] or "[]"),
            "materiais": [int(m) for m in str(row[8] or "").split(",") if m.strip().isdigit()], "modelo": row[9],
        }
        for row in cursor.fetchall()
    ]


def replace_all(
    conn: sqlite3.Connection, fichas: List[Dict[str, Any]], relations: Optional[List[Dict[str, Any]]] = None
) -> None:
    """Troca as fichas (e as relacoes) do cadastro desta maquina pelas do arquivo novo. Nao faz commit."""
    if relations is not None:
        conn.execute("DELETE FROM cadastro_relacoes")
        conn.executemany(
            """
            INSERT INTO cadastro_relacoes (origem, origem_norm, tipo, numero, numero_norm, observacao, material)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            [(r["origem"], r["origem_norm"], r["tipo"], r["numero"], r["numero_norm"], r.get("observacao"),
              r.get("material")) for r in relations],
        )
    conn.execute("DELETE FROM cadastro_fichas")
    conn.executemany(
        """
        INSERT INTO cadastro_fichas (
            codigo, codigo_norm, marca, tipo, modelo, descricao, observacao, aplicacoes_json, codigos_json, materiais
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (
                f["codigo"], f["codigo_norm"], f["marca"], f["tipo"], f.get("modelo"), f["descricao"], f["observacao"],
                json.dumps(f["aplicacoes"], ensure_ascii=False), json.dumps(f["codigos"], ensure_ascii=False),
                ",".join(str(m) for m in f.get("materiais") or []),
            )
            for f in fichas
        ],
    )


def _signature(fichas: List[Dict[str, Any]]) -> str:
    data = json.dumps(fichas, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(data.encode("utf-8")).hexdigest()


def materialize(conn: sqlite3.Connection) -> bool:
    """
    Copia as fichas do cadastro para as tabelas catalogo_* (fonte "Cadastro da empresa"). So mexe
    se elas mudaram ou se o pacote do catalogo apagou a copia. Devolve True se mexeu (o chamador
    religa). Abre e fecha a propria transacao.
    """
    from core.catalog.bundle import _get_system, _manual_links, _restore_manual_links, _set_system

    fichas = list_fichas(conn)
    signature = _signature(fichas)
    source = conn.execute("SELECT id FROM catalogo_fontes WHERE codigo = ?", (SOURCE_CODE,)).fetchone()
    copied = (
        conn.execute("SELECT COUNT(*) FROM catalogo_produtos WHERE fonte_id = ?", (source[0],)).fetchone()[0]
        if source
        else 0
    )
    if _get_system(conn, KEY_SIGNATURE) == signature and copied == len(fichas):
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
                (SOURCE_CODE, SOURCE_NAME),
            )
            source_id = conn.execute("SELECT id FROM catalogo_fontes WHERE codigo = ?", (SOURCE_CODE,)).fetchone()[0]
            for ficha in fichas:
                cursor = conn.execute(
                    """
                    INSERT INTO catalogo_produtos (fonte_id, codigo, codigo_norm, descricao, grupo, modelo, observacao, ativo)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
                    """,
                    (
                        source_id, ficha["codigo"], ficha["codigo_norm"], ficha["descricao"],
                        GROUPS.get(ficha["tipo"], GROUPS[KIND_TURBO]),
                        f"{SOURCE_NAME} ({ficha['modelo']})" if ficha.get("modelo") else None, ficha["observacao"],
                    ),
                )
                cp_id = cursor.lastrowid
                maker = ficha["marca"] if ficha["marca"] != "OUTRA" else "OUTRO"
                refs = [(maker, ficha["codigo"], ficha["codigo_norm"])] + [
                    (c["fabricante"], c["numero"], c["numero_norm"]) for c in ficha["codigos"]
                ]
                conn.executemany(
                    "INSERT INTO catalogo_referencias (catalogo_produto_id, fabricante, numero, numero_norm) VALUES (?, ?, ?, ?)",
                    [(cp_id, m, number, norm) for m, number, norm in refs],
                )
                conn.executemany(
                    """
                    INSERT INTO catalogo_aplicacoes (catalogo_produto_id, montadora, veiculo, motor, tipo, complemento)
                    VALUES (?, ?, ?, ?, NULL, ?)
                    """,
                    [(cp_id, a.get("montadora"), a["veiculo"], a.get("motor"), a.get("complemento")) for a in ficha["aplicacoes"]],
                )
        _restore_manual_links(conn, manual)
        _set_system(conn, KEY_SIGNATURE, signature)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    return True


# ---------------------------------------------------------------------------
# 4. Item do arquivo <-> nosso produto
# ---------------------------------------------------------------------------

def name_key(nome: str) -> str:
    return " ".join(re.sub(r"[^0-9A-Z]+", " ", str(nome or "").upper()).split())


def _versions(nome: str) -> Tuple[bool, bool]:
    upper = str(nome or "").upper()
    return "MONTAD" in upper, "REMAN" in upper


# ----------------------------------------------------------------------
# Ids iguais aos do sistema da loja
# ----------------------------------------------------------------------
# O cadastro do Chronos veio desse sistema: o id do produto (#866) e o CD_MATERIAL (866). A
# importacao deixa os dois iguais: nome do arquivo para o mesmo id, id do arquivo para o mesmo
# nome. O que parece outra peca nao muda sozinho: vai para a lista "Para conferir".

PRODUCT_ID_COLUMNS = ("produto_id", "product_id", "produto_vinculado_id")
REVIEW_OTHER_PART = "OUTRA_PECA"  # mesmo id, nome e codigo diferentes, com saldo ou movimentacao
OLD_NAME_NOTE = "Nome antes da importação do cadastro da empresa: {nome}"


def plan_ids(conn: sqlite3.Connection, items: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Compara o id de cada produto com o CD_MATERIAL do arquivo.

    Primeiro as trocas de id: um produto do Chronos com o nome de um item cujo numero o Chronos
    ainda nao usa passa para esse numero, quando o id atual dele nao esta no arquivo ou, no
    arquivo, e outra peca (o Chronos criou o produto num numero que a loja deu para outra coisa).
    Vale tambem para o mesmo codigo com outro nome, se for o mesmo tipo e a mesma versao; ai o
    nome tambem passa a ser o do arquivo.

    Depois, item por item:
    - mesmo id e mesmo nome: nada muda (iguais);
    - mesmo id e mesmo codigo, nome diferente: fica o nome do arquivo (renomear);
    - mesmo id e outra peca: fica o nome do arquivo so se o produto nunca teve saldo nem
      movimentacao; senao vai para conferir;
    - o resto e produto novo, cadastrado com o id do arquivo (criar), inclusive no numero que
      ficou livre com uma troca.
    """
    products = {pid: nome for pid, nome in conn.execute("SELECT id, nome FROM produtos")}
    stock = dict(conn.execute("SELECT produto_id, COALESCE(SUM(quantidade), 0) FROM produto_estoque GROUP BY produto_id"))
    moves = dict(conn.execute("SELECT produto_id, COUNT(*) FROM movimentacoes GROUP BY produto_id"))
    by_name: Dict[str, List[int]] = {}
    for pid in sorted(products):
        by_name.setdefault(name_key(products[pid]), []).append(pid)
    by_id = {item["cd_material"]: item for item in items}

    def codes(text: str) -> Set[str]:
        """So numeros de peca (5+ digitos): modelo como GT1749V ou T04E66 nao diz que e a mesma peca."""
        return {c for c in extract_codes_from_name(text, expand_family=False) if sum(ch.isdigit() for ch in c) >= 5}

    def item_codes(item: Dict[str, Any]) -> Set[str]:
        return codes(item["nome"]) | {c for _, c in own_codes(item) if sum(ch.isdigit() for ch in c) >= 5}

    def same_part(item: Dict[str, Any], pid: int) -> bool:
        current = products[pid]
        return name_key(current) == name_key(item["nome"]) or bool(codes(current) & item_codes(item))

    def can_leave(pid: int) -> bool:
        """O produto pode sair do id atual: o arquivo nao usa esse numero, ou usa para outra peca."""
        return pid not in by_id or not same_part(by_id[pid], pid)

    def review(item: Dict[str, Any], pid: int, reason: str) -> Dict[str, Any]:
        return {"cd_material": item["cd_material"], "nome_arquivo": item["nome"], "produto_id": pid,
                "nome_chronos": products[pid], "saldo": int(stock.get(pid, 0) or 0),
                "movimentacoes": int(moves.get(pid, 0) or 0), "motivo": reason}

    plan: Dict[str, Any] = {"iguais": 0, "renomear": [], "mudar_id": [], "criar": [], "conferir": []}
    # Indice por codigo so dos produtos que podem mudar de numero.
    leaving = [pid for pid in sorted(products) if can_leave(pid)]
    by_code: Dict[str, List[int]] = {}
    for pid in leaving:
        for code in codes(products[pid]):
            by_code.setdefault(code, []).append(pid)

    def similar_to(item: Dict[str, Any]) -> Optional[int]:
        """Produto que pode mudar de numero com o mesmo codigo, tipo e versao (nova/reman/montada)."""
        found = sorted({p for code in item_codes(item) for p in by_code.get(code, [])})
        for pid in found:
            if pid not in moved and item_kind(products[pid]) == item_kind(item["nome"]) and _versions(products[pid]) == _versions(item["nome"]):
                return pid
        return None

    moved: Set[int] = set()
    targets: Set[int] = set()
    for item in items:
        cd, nome = item["cd_material"], item["nome"]
        if cd in products:
            continue
        free = [p for p in by_name.get(name_key(nome), []) if p not in moved and can_leave(p)]
        if not free:
            similar = similar_to(item)
            free = [similar] if similar is not None else []
        if free:
            moved.add(free[0])
            targets.add(cd)
            plan["mudar_id"].append({"de": free[0], "para": cd, "nome": nome, "nome_antigo": products[free[0]]})

    for item in items:
        cd, nome = item["cd_material"], item["nome"]
        if cd in targets:
            continue
        if cd in products and cd not in moved:
            current = products[cd]
            if name_key(current) == name_key(nome):
                plan["iguais"] += 1
            elif same_part(item, cd) or (not stock.get(cd) and not moves.get(cd)):
                plan["renomear"].append({"id": cd, "de": current, "para": nome})
            else:
                plan["conferir"].append(review(item, cd, REVIEW_OTHER_PART))
        else:
            plan["criar"].append(item)
    plan["fora_do_arquivo"] = [
        {"produto_id": pid, "nome": products[pid], "saldo": int(stock.get(pid, 0) or 0)}
        for pid in sorted(products) if pid not in by_id and pid not in moved
    ]
    return plan


def product_id_columns(conn: sqlite3.Connection) -> List[Tuple[str, str]]:
    """Todas as colunas que guardam o id de um produto (movimentacoes, saldo, fotos, NF...)."""
    tables = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")]
    found = []
    for table in tables:
        for col in conn.execute(f'PRAGMA table_info("{table}")'):
            if col[1] in PRODUCT_ID_COLUMNS:
                found.append((table, col[1]))
    return found


def apply_ids(conn: sqlite3.Connection, plan: Dict[str, Any], note: str) -> Dict[str, int]:
    """
    Grava o plano dentro da transacao aberta por quem chama. A troca de id passa por todas as
    tabelas que guardam o id do produto; as chaves estrangeiras so sao conferidas no commit.
    """
    conn.execute("PRAGMA defer_foreign_keys = ON")
    columns = product_id_columns(conn)
    renames = list(plan["renomear"])
    for move in plan["mudar_id"]:
        conn.execute("UPDATE produtos SET id = ? WHERE id = ?", (move["para"], move["de"]))
        for table, column in columns:
            conn.execute(f'UPDATE "{table}" SET "{column}" = ? WHERE "{column}" = ?', (move["para"], move["de"]))
        if name_key(move["nome_antigo"]) != name_key(move["nome"]):
            renames.append({"id": move["para"], "de": move["nome_antigo"], "para": move["nome"]})

    locations = [r[0] for r in conn.execute("SELECT id FROM locais WHERE ativo = 1")]
    for item in plan["criar"]:
        conn.execute(
            "INSERT INTO produtos (id, nome, observacao, ativo) VALUES (?, ?, ?, 1)",
            (item["cd_material"], item["nome"], note.format(cd=item["cd_material"])),
        )
        conn.executemany(
            "INSERT INTO produto_estoque (produto_id, local_id, quantidade, atualizado_em) VALUES (?, ?, 0, datetime('now'))",
            [(item["cd_material"], loc) for loc in locations],
        )

    for change in renames:
        old_note = conn.execute("SELECT observacao FROM produtos WHERE id = ?", (change["id"],)).fetchone()[0]
        extra = OLD_NAME_NOTE.format(nome=change["de"])
        conn.execute(
            "UPDATE produtos SET nome = ?, observacao = ? WHERE id = ?",
            (change["para"], f"{old_note}\n{extra}" if old_note else extra, change["id"]),
        )
        # Os codigos que so estavam no nome antigo continuam achando o produto na busca.
        lost = codes_lost(change["de"], change["para"])
        conn.executemany(
            "INSERT OR IGNORE INTO produto_codigos (produto_id, numero_norm, origem) VALUES (?, ?, 'NOME_ANTIGO')",
            [(change["id"], code) for code in lost],
        )

    # Os ids do arquivo passam do maior id ja usado: o proximo produto do Chronos vem depois deles.
    conn.execute(
        "UPDATE sqlite_sequence SET seq = MAX(seq, (SELECT MAX(id) FROM produtos)) WHERE name = 'produtos'"
    )
    return {"produtos_criados": len(plan["criar"]), "ids_trocados": len(plan["mudar_id"]),
            "nomes_trocados": len(plan["renomear"])}


def codes_lost(old_name: str, new_name: str) -> List[str]:
    new = set(extract_codes_from_name(new_name))
    return [code for code in extract_codes_from_name(old_name) if code not in new]
