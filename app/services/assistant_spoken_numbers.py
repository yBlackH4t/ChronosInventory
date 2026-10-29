"""
Codigo de peca falado por extenso vira algarismos antes da busca (2.7.16).

A busca e a conferencia dos codigos que a IA le so reconhecem codigo escrito em algarismos.
Na fala (ou digitando como fala) o vendedor manda:
- digito por digito: "cinco quatro cinco cinco meia zero nove" -> 5455609 ("meia" = 6);
- em pedacos: "quatrocentos e três, onze, noventa e cinco" -> 4031195;
- misturado: "403 um um nove cinco" -> 4031195.

So junta uma sequencia com pelo menos 2 numeros por extenso e 5 digitos, para "um turbo",
"dois zero" ou "fh quinhentos e vinte" ficarem como estao. "Uma" e "duas" ficam de fora: na
fala sao quantidade ou artigo ("uma turbina", "duas pecas"). Quebra de linha, codigo ja escrito
inteiro e pedaco que sozinho ja e um codigo separam os pedidos ("4031196, cinco quatro ...").
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from typing import List, Optional

MIN_SPOKEN_WORDS = 2
MIN_CODE_DIGITS = 5

UNITS = {
    "ZERO": 0, "UM": 1, "DOIS": 2, "TRES": 3, "QUATRO": 4, "CINCO": 5,
    "SEIS": 6, "MEIA": 6, "SETE": 7, "OITO": 8, "NOVE": 9,
}
TEENS = {
    "DEZ": 10, "ONZE": 11, "DOZE": 12, "TREZE": 13, "QUATORZE": 14, "CATORZE": 14, "QUINZE": 15,
    "DEZESSEIS": 16, "DEZESSETE": 17, "DEZOITO": 18, "DEZENOVE": 19,
}
TENS = {
    "VINTE": 20, "TRINTA": 30, "QUARENTA": 40, "CINQUENTA": 50, "SESSENTA": 60,
    "SETENTA": 70, "OITENTA": 80, "NOVENTA": 90,
}
HUNDREDS = {
    "CEM": 100, "CENTO": 100, "DUZENTOS": 200, "TREZENTOS": 300, "QUATROCENTOS": 400,
    "QUINHENTOS": 500, "SEISCENTOS": 600, "SETECENTOS": 700, "OITOCENTOS": 800, "NOVECENTOS": 900,
}
THOUSAND = "MIL"
AND = "E"

_TOKEN = re.compile(r"[^\W\d_]+|\d+")
_SAME_PIECE = re.compile(r"[ \t\-]*")
_COMMA = re.compile(r"[ \t\-]*,[ \t\-]*")


@dataclass
class _Number:
    """Um numero dito de uma vez ("quatrocentos e três", "onze", "cinco", "403")."""

    start: int
    end: int
    value: int = 0
    level: int = 1  # o menor valor que ainda cabe nele: 1000 (mil), 100 (centena), 10 (dezena), 0 (fechado)
    written: Optional[str] = None  # algarismos que ja vieram escritos
    words: int = 0
    thousand: bool = False  # dito com "mil": ano ou quantidade, nao pedaco de codigo

    @property
    def digits(self) -> str:
        return self.written if self.written is not None else str(self.value)


@dataclass
class _Piece:
    """Numeros sem virgula entre eles."""

    numbers: List[_Number] = field(default_factory=list)


def _plain(token: str) -> str:
    return unicodedata.normalize("NFKD", token).encode("ascii", "ignore").decode().upper()


def _kind(word: str) -> Optional[str]:
    if word in UNITS:
        return "unit"
    if word in TEENS:
        return "teen"
    if word in TENS:
        return "ten"
    if word in HUNDREDS:
        return "hundred"
    if word == THOUSAND:
        return "thousand"
    return None


def _value(word: str) -> int:
    return UNITS.get(word) or TEENS.get(word) or TENS.get(word) or HUNDREDS.get(word) or 0


def _fits(number: _Number, kind: str, joined_by_and: bool) -> bool:
    """A palavra completa o numero aberto ("quatrocentos" + "e três")?"""
    if number.written is not None or number.level == 0:
        return False
    if number.level == 1000:  # "dois mil quinhentos", "dois mil e quinze"
        return kind in ("hundred", "ten", "teen", "unit")
    if not joined_by_and:
        return False
    if number.level == 100:
        return kind in ("ten", "teen", "unit")
    return number.level == 10 and kind == "unit"


def _level_after(kind: str) -> int:
    return {"hundred": 100, "ten": 10}.get(kind, 0)


def _runs(text: str) -> List[List[_Piece]]:
    """Sequencias de numeros, cada uma em pedacos separados por virgula."""
    runs: List[List[_Piece]] = []
    current: Optional[_Number] = None
    pending_and = False
    previous_end: Optional[int] = None

    def close_run() -> None:
        nonlocal current, pending_and, previous_end
        current, pending_and, previous_end = None, False, None

    for match in _TOKEN.finditer(text):
        token = match.group()
        word = _plain(token)
        if previous_end is not None:
            gap = text[previous_end:match.start()]
            if _COMMA.fullmatch(gap) and not pending_and:
                runs[-1].append(_Piece())
                current = None
            elif not _SAME_PIECE.fullmatch(gap):
                close_run()
        if word == AND and current is not None and current.written is None and not pending_and:
            pending_and, previous_end = True, match.end()
            continue
        if token.isdigit():
            if pending_and or len(token) >= MIN_CODE_DIGITS:
                close_run()  # "403 e 5455609", codigo ja escrito inteiro: outro pedido
                continue
            number = _Number(match.start(), match.end(), written=token, level=0)
        else:
            kind = _kind(word)
            if kind is None:
                close_run()
                continue
            if current is not None and _fits(current, kind, pending_and):
                current.value += _value(word)
                current.level = _level_after(kind)
                current.end, current.words = match.end(), current.words + 1
                pending_and, previous_end = False, match.end()
                continue
            if kind == "thousand":
                if current is not None and current.written is None and current.level != 1000:
                    current.value, current.level, current.thousand = (current.value or 1) * 1000, 1000, True
                    current.end, current.words = match.end(), current.words + 1
                    pending_and, previous_end = False, match.end()
                    continue
                number = _Number(match.start(), match.end(), value=1000, level=1000, words=1, thousand=True)
            else:
                if pending_and:
                    close_run()  # "e" solto entre numeros que nao se completam: outro pedido
                number = _Number(match.start(), match.end(), value=_value(word), level=_level_after(kind), words=1)
        if previous_end is None:
            runs.append([_Piece()])
        runs[-1][-1].numbers.append(number)
        current, pending_and, previous_end = number, False, match.end()
    return runs


def _codes(run: List[_Piece]) -> List[List[_Number]]:
    """
    Junta os pedacos de uma sequencia em codigos: "quatrocentos e três, onze, noventa e cinco"
    e um codigo so. Fica sozinho (outro pedido) o pedaco que ja tem 5 digitos e o numero dito
    com "mil" ("scania quatrocentos e quarenta dois mil e quinze" nao vira codigo).
    """
    parts: List[tuple] = []  # (numeros, fica sozinho)
    for piece in run:
        buffer: List[_Number] = []
        for number in piece.numbers:
            if number.thousand:
                if buffer:
                    parts.append((buffer, False))
                parts.append(([number], True))
                buffer = []
            else:
                buffer.append(number)
        if buffer:
            parts.append((buffer, len("".join(n.digits for n in buffer)) >= MIN_CODE_DIGITS))
    codes: List[List[_Number]] = []
    last_alone = True
    for numbers, alone in parts:
        if alone or last_alone:
            codes.append(list(numbers))
        else:
            codes[-1].extend(numbers)
        last_alone = alone
    return codes


def spoken_digits_to_numbers(text: str) -> str:
    """
    Troca o codigo falado por extenso pelos algarismos: "tem a cinco quatro cinco cinco meia
    zero nove?" -> "tem a 5455609?"; "quatrocentos e três, onze, noventa e cinco" -> "4031195".
    """
    if not text:
        return text
    replacements = []
    for run in _runs(text):
        for numbers in _codes(run):
            digits = "".join(n.digits for n in numbers)
            if sum(n.words for n in numbers) < MIN_SPOKEN_WORDS or len(digits) < MIN_CODE_DIGITS:
                continue
            replacements.append((numbers[0].start, numbers[-1].end, digits))
    for start, end, digits in reversed(replacements):
        text = text[:start] + digits + text[end:]
    return text
