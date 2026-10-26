"""
Normalizacao de codigos e textos para o catalogo de referencias.

Regras centrais (usadas tanto na importacao quanto na busca e no vinculo):
- canonical_code(): forma canonica de um codigo de peca para comparacao exata.
- extract_codes_from_name(): extrai codigos do nome livre dos nossos produtos.
- fix_mojibake(), rtf_to_text(): limpeza de texto vindo de catalogos externos.
- search_words(): palavras normalizadas para busca em texto livre (aplicacoes).
"""

from __future__ import annotations

import re
import unicodedata
from typing import Iterable, List, Optional, Set

_NON_ALNUM = re.compile(r"[^0-9A-Z]")

# Separadores de tokens no nome dos nossos produtos. Hifen isolado (" - ") separa,
# mas hifen colado (827729-5003S, 8G17-200-379) faz parte do codigo.
_NAME_SPLIT = re.compile(r"\s+-\s+|[\s/,;()\[\]]+")

# Separadores dentro do campo de referencia do catalogo ("4031195 – 3785479").
_REF_SPLIT = re.compile(r"\s*[–—/;,]\s*|\s+-\s+")

MIN_CODE_DIGITS = 4
MIN_CODE_LENGTH = 5


def canonical_code(value: Optional[str]) -> str:
    """
    Forma canonica de um codigo para comparacao.

    - Mantem apenas A-Z/0-9 em maiusculas.
    - Remove sufixo de remanufaturado 'RX' (4045630RX -> 4045630).
    - Remove sufixo 'S' de codigos numericos Garrett (8277295003S -> 8277295003).
    """
    if not value:
        return ""
    code = _NON_ALNUM.sub("", str(value).upper())
    if code.endswith("RX") and any(ch.isdigit() for ch in code[:-2]):
        code = code[:-2]
    if code.endswith("S") and code[:-1].isdigit():
        code = code[:-1]
    return code


def _digit_count(value: str) -> int:
    return sum(1 for ch in value if ch.isdigit())


def is_searchable_code(code: str) -> bool:
    """Um codigo canonico e considerado 'codigo de peca' (e nao modelo como HX55W)."""
    return len(code) >= MIN_CODE_LENGTH and _digit_count(code) >= MIN_CODE_DIGITS


def expand_family_codes(codes: Iterable[str]) -> List[str]:
    """
    Expande codigos para incluir variantes de familia equivalentes (Nova <-> Reman):
    - BorgWarner 11 digitos:
        * Miolo 988/970 (Nova) <-> 990/991 (Reman) (ex: 53279887101 <-> 53279907101)
        * Prefixo 70000 (Nova) <-> 90000 (Reman) (ex: 70000174060 <-> 90000174060)
    - BorgWarner / Schwitzer 6 digitos:
        * 7xxxxx (Nova) <-> 9xxxxx (Reman) (ex: 770429 <-> 970429)
    - Garrett: 6 digitos base + [0|5|9] + 3 digitos (796155-5005 <-> 796155-9005)
    - Holset: sufixo RX ja tratado por canonical_code
    """
    seen: Set[str] = set()
    result: List[str] = []

    for c in codes:
        clean = _NON_ALNUM.sub("", str(c).upper())
        if not clean:
            continue
        if clean not in seen:
            seen.add(clean)
            result.append(clean)

        # 1. BorgWarner: 11 digitos XXXX [970-988] YYYY <-> XXXX [990-998] YYYY
        m_bw_mid = re.match(r"^(\d{4})(9[78]\d|99\d)(\d{4})$", clean)
        if m_bw_mid:
            prefix, mid, suffix = m_bw_mid.groups()
            if mid.startswith("99"):
                variants = [f"{prefix}988{suffix}", f"{prefix}970{suffix}"]
            else:
                variants = [f"{prefix}990{suffix}", f"{prefix}991{suffix}"]
            for v in variants:
                if v not in seen:
                    seen.add(v)
                    result.append(v)

        # 2. BorgWarner: 11 digitos prefixo 70000 (Nova) <-> 90000 (Reman)
        m_bw_prefix = re.match(r"^([79])(0000\d{6})$", clean)
        if m_bw_prefix:
            prefix_digit, rest = m_bw_prefix.groups()
            other_prefix = "9" if prefix_digit == "7" else "7"
            v = f"{other_prefix}{rest}"
            if v not in seen:
                seen.add(v)
                result.append(v)
            # Extrai o codigo curto interno de 6 digitos (ex: 70000174060 -> 174060)
            short_code = rest[4:]
            if short_code not in seen:
                seen.add(short_code)
                result.append(short_code)

        # 3. BorgWarner / Schwitzer: 6 digitos 7xxxxx (Nova) <-> 9xxxxx (Reman)
        m_bw_6 = re.match(r"^([79])(\d{5})$", clean)
        if m_bw_6:
            first_digit, rest5 = m_bw_6.groups()
            other_first = "9" if first_digit == "7" else "7"
            v = f"{other_first}{rest5}"
            if v not in seen:
                seen.add(v)
                result.append(v)

        # 4. Garrett: 6 digitos base + tipo [0|5|9] + 3 digitos
        m_gt = re.match(r"^(\d{6})([059])(\d{3})$", clean)
        if m_gt:
            base, type_digit, suffix = m_gt.groups()
            if type_digit == "9":
                variants = [f"{base}5{suffix}", f"{base}0{suffix}"]
            else:
                variants = [f"{base}9{suffix}"]
            for v in variants:
                if v not in seen:
                    seen.add(v)
                    result.append(v)

    return result


def extract_codes_from_name(name: Optional[str], expand_family: bool = True) -> List[str]:
    """
    Extrai codigos canonicos do nome livre de um produto.

    Ex.: 'TURBO HOLSET HX55 - 4031195/4044201/3785479RX' -> ['4031195', '4044201', '3785479']
    Modelos curtos (HX55, K16, S400, EURO5) sao ignorados.
    Se expand_family=True, inclui as variantes de familia (Nova <-> Reman).
    """
    if not name:
        return []
    seen: Set[str] = set()
    result: List[str] = []
    for token in _NAME_SPLIT.split(str(name).upper()):
        token = token.strip(" .-")
        if not token:
            continue
        code = canonical_code(token)
        if is_searchable_code(code) and code not in seen:
            seen.add(code)
            result.append(code)
    if expand_family:
        return expand_family_codes(result)
    return result


def split_reference_numbers(raw: Optional[str]) -> List[tuple[str, str]]:
    """
    Divide o campo de referencia de um catalogo em (texto_original, codigo_canonico).

    '4031195 – 3785479'           -> [('4031195', '4031195'), ('3785479', '3785479')]
    '4031406 ALUMINIO FRESSADO'   -> [('4031406 ALUMINIO FRESSADO', '4031406')]
    'A 906 096 04 99'             -> [('A 906 096 04 99', 'A9060960499')]
    """
    if not raw:
        return []
    out: List[tuple[str, str]] = []
    seen: Set[str] = set()
    for part in _REF_SPLIT.split(str(raw).strip()):
        part = part.strip()
        if not part:
            continue
        code_tokens: List[str] = []
        for tok in part.split():
            # Para quando aparece uma palavra descritiva (ALUMINIO, FUNDIDO...).
            if tok.isalpha() and len(tok) >= 3 and code_tokens:
                break
            code_tokens.append(tok)
        code = canonical_code("".join(code_tokens))
        if len(code) >= 3 and code not in seen:
            seen.add(code)
            out.append((part, code))
    return out


def fix_mojibake(value: Optional[str]) -> Optional[str]:
    """
    Corrige texto UTF-8 que foi lido como Latin-1/CP1252 ('CAMINHÃƒO' -> 'CAMINHÃO').
    Textos ja corretos sao devolvidos sem alteracao.
    """
    if value is None:
        return None
    text = str(value)
    if not any(marker in text for marker in ("Ã", "Â", "â€")):
        return text
    raw = bytearray()
    for ch in text:
        try:
            raw.extend(ch.encode("cp1252"))
        except UnicodeEncodeError:
            if ord(ch) < 256:
                raw.append(ord(ch))
            else:
                return text
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return text


def clean_text(value: Optional[str]) -> Optional[str]:
    """fix_mojibake + trim + colapsa espacos. Retorna None para vazio."""
    if value is None:
        return None
    text = fix_mojibake(str(value)) or ""
    text = re.sub(r"[ \t]+", " ", text).strip()
    return text or None


_RTF_DESTINATIONS = re.compile(r"\{\\(?:\*|fonttbl|colortbl|stylesheet|info|generator)[^{}]*(?:\{[^{}]*\}[^{}]*)*\}")
_RTF_HEX = re.compile(r"\\'([0-9a-fA-F]{2})")
_RTF_CONTROL = re.compile(r"\\[a-zA-Z]+-?\d* ?")


def rtf_to_text(value: Optional[str]) -> Optional[str]:
    """Converte RTF simples (como as observacoes do catalogo) em texto puro."""
    if value is None:
        return None
    text = str(value)
    if not text.lstrip().startswith("{\\rtf"):
        return clean_text(text)
    text = _RTF_DESTINATIONS.sub("", text)
    text = re.sub(r"\\par[d]?\b ?", lambda m: "" if m.group(0).startswith("\\pard") else "\n", text)
    text = _RTF_HEX.sub(lambda m: bytes.fromhex(m.group(1)).decode("cp1252", errors="replace"), text)
    text = _RTF_CONTROL.sub("", text)
    text = text.replace("{", "").replace("}", "").replace("\\\\", "\\")
    lines = [re.sub(r"[ \t]+", " ", ln).strip() for ln in text.replace("\r", "").split("\n")]
    joined = "\n".join(ln for ln in lines if ln)
    return clean_text(joined) if "\n" not in joined else (fix_mojibake(joined) or None)


# Mapeamento oficial de fabricantes acordado com especialista em turbinas
_BRAND_MAPPING = {
    # BorgWarner e suas marcas/siglas adquiridas
    "BW": "BORGWARNER",
    "BW / KKK / SCHWITZER": "BORGWARNER",
    "BW / KKK": "BORGWARNER",
    "SCHWITZER": "BORGWARNER",
    "S200": "BORGWARNER",
    "CONJUNTO CENTRAL": "BORGWARNER",

    # Holset
    "HOLSET": "HOLSET",

    # Garrett
    "GARRETT": "GARRETT",

    # Mitsubishi Heavy Industries
    "MITSUBISHI": "MITSUBISHI",
    "MHI": "MITSUBISHI",

    # IHI
    "IHI": "IHI",

    # Mahle e BMTS (Bosch Mahle Turbo Systems)
    "MAHLE": "MAHLE",
    "BMTS": "MAHLE",

    # Master Power
    "MASTER POWER": "MASTER POWER",
    "MASTER  POWER": "MASTER POWER",
    "MASTER PARTS": "MASTER POWER",
    "MASTER MPARTS": "MASTER POWER",

    # Montadoras (OEM)
    "OEM": "OEM",
    "TOYOTA": "OEM",
    "CITROEN": "OEM",
    "KIA": "OEM",
    "STEMAC": "OEM",

    # Outros fabricantes e aftermarket
    "MWM": "MWM",
    "BIAGIO": "BIAGIO",
    "ALLIANCE": "ALLIANCE",
    "BTS": "BTS",
    "CZ": "CZ",
    "HITACHI": "HITACHI",
    "PAI": "PAI",
}


def normalize_manufacturer(value: Optional[str]) -> str:
    """
    Normaliza nome de fabricante aplicando o agrupamento oficial de marcas.
    Exemplo: 'BW / KKK / SCHWITZER' -> 'BORGWARNER', 'MHI' -> 'MITSUBISHI'.
    """
    text = clean_text(value) or ""
    upper = re.sub(r"\s+", " ", text).upper()
    return _BRAND_MAPPING.get(upper, upper)


_LETTER_DIGIT_BOUNDARY = re.compile(r"(?<=[A-Z])(?=[0-9])|(?<=[0-9])(?=[A-Z])")
_DOTTED_NUMBER = re.compile(r"(?<=\d)\.(?=\d)")


def search_words(value: Optional[str]) -> List[str]:
    """
    Palavras normalizadas para comparar texto livre (veiculo, motor, pergunta).

    Maiusculas, sem acentos, so A-Z/0-9, e letras separadas de numeros, para que
    as variacoes de escrita virem as mesmas palavras. Numero com ponto fica junto
    (modelo 8.150 nao e '8' + '150'):
    'Scania R440'      -> ['SCANIA', 'R', '440']
    'Ônibus K 440'     -> ['ONIBUS', 'K', '440']
    'OM 366LA'         -> ['OM', '366', 'LA']
    'DC13 Euro 3,4,5'  -> ['DC', '13', 'EURO', '3', '4', '5']
    'Caminhão 8.150e'  -> ['CAMINHAO', '8150', 'E']
    """
    if not value:
        return []
    text = unicodedata.normalize("NFKD", fix_mojibake(str(value)) or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch)).upper()
    text = _DOTTED_NUMBER.sub("", text)
    text = re.sub(r"[^0-9A-Z]+", " ", text)
    text = _LETTER_DIGIT_BOUNDARY.sub(" ", text)
    return text.split()


def unique(values: Iterable[str]) -> List[str]:
    seen: Set[str] = set()
    out: List[str] = []
    for v in values:
        if v and v not in seen:
            seen.add(v)
            out.append(v)
    return out
