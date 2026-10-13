"""
Busca direta: responde perguntas de estoque sem IA (docs/PLANO_IA.md).

Responde primeiro quando entende a pergunta (`try_answer`); tambem responde quando
nenhum provedor de IA esta configurado e quando a IA falha (limite gratuito atingido,
sem internet...). Regras simples:
- a mensagem tem codigo de peca -> buscar_por_codigo para cada codigo (ate 3);
  sem codigo, mas com "essa", "essa dai"... -> os codigos da mensagem anterior;
- senao -> buscar_por_aplicacao com o texto. Se a ultima resposta foi uma pergunta
  ("Qual e o motor?"), junta a pergunta anterior do usuario com a resposta dele
  ("scania 440" + "dc13").
A resposta e o "texto_pronto" que as proprias ferramentas montam
(app/services/assistant_answer_format.py), o mesmo que a IA recebe.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

from app.services.assistant_answer_format import (  # noqa: F401  (HELP_TEXT reexportado para os testes)
    HELP_TEXT,
    format_application_answer,
    format_code_answer,
    wants_core,
)
from app.services.assistant_common import MODE_DIRECT, cited_products, collect_products, make_result
from app.services.assistant_tools_service import AssistantToolsService
from core.catalog.normalization import canonical_code, extract_codes_from_name, search_words

MAX_CODES_PER_MESSAGE = 3
# "a 7101 é a mesma que a 7210?": pergunta sobre os dois codigos, nao sobre o estoque.
COMPARISON_WORDS = {
    "IGUAL", "IGUAIS", "MESMA", "MESMO", "MESMAS", "MESMOS", "EQUIVALENTE", "EQUIVALENTES", "EQUIVALE",
    "SUBSTITUI", "SUBSTITUTA", "SUBSTITUTO", "SERVE", "SERVEM", "TROCA", "BATE", "BATEM", "COMPATIVEL",
    "COMPATIVEIS", "DIFERENCA", "DIFERENTE", "DIFERENTES", "SIMILAR", "SIMILARES", "INTERCAMBIAVEL",
    "CORRESPONDE", "LUGAR",
}
# Palavras que apontam para o codigo da mensagem anterior ("temos essa daí?").
REFERENCE_WORDS = {"ESSA", "ESSE", "ESTA", "ESTE", "DESSA", "DESSE", "DESTA", "DESTE", "DAI", "ELA", "ELE", "ISSO", "MESMA"}
# Numero de chassi (VIN): 17 caracteres, sem I, O e Q. Nao e codigo de peca.
_VIN = re.compile(r"^[A-HJ-NPR-Z0-9]{17}$")
# Codigo falado que a transcricao escreveu com espacos: "5327 988 7101".
_SPACED_DIGITS = re.compile(r"(?<![\w.,])\d{2,7}(?: \d{2,7}){1,4}(?![\w.,])")
_YEAR = re.compile(r"^(19[5-9]\d|20[0-4]\d)$")
MIN_SPACED_CODE_LENGTH = 6
MAX_SPACED_CODE_LENGTH = 13
CHASSIS_TEXT = (
    "Pelo número do chassi não consigo achar a turbina. Mande o código da turbina (da plaqueta) "
    "ou o veículo e o motor (ex.: agrale 9200 mwm 4.10)."
)


def is_chassis_number(code: str) -> bool:
    return bool(_VIN.match(code or "")) and any(c.isalpha() for c in code) and any(c.isdigit() for c in code)


def _found_something(output: Dict[str, Any]) -> bool:
    return bool(
        "erro" not in output
        and (output.get("produtos") or output.get("fichas_catalogo") or output.get("conhecimento_especialista"))
    )


def _typed_code(message: str, code: str) -> str:
    """O codigo como a pessoa escreveu ('466646-5041S'), em vez da forma canonica ('4666465041')."""
    for token in re.split(r"[\s,;/()]+", message or ""):
        token = token.strip(" ?!.:;\"'")
        if token and canonical_code(token) == code:
            return token.upper()
    return code


class AssistantDirectService:
    def __init__(self, tools: Optional[AssistantToolsService] = None) -> None:
        self.tools = tools or AssistantToolsService()

    def answer(self, mensagem: str, historico: Optional[List[Dict[str, str]]] = None) -> Dict[str, Any]:
        return self._answer(mensagem, historico)[0]

    def try_answer(self, mensagem: str, historico: Optional[List[Dict[str, str]]] = None) -> Optional[Dict[str, Any]]:
        """A resposta, se a busca direta entendeu a pergunta (achou codigo ou aplicacao); senao None."""
        result, understood = self._answer(mensagem, historico)
        return result if understood else None

    def _answer(self, mensagem: str, historico: Optional[List[Dict[str, str]]]) -> Tuple[Dict[str, Any], bool]:
        found: Dict[int, Dict[str, Any]] = {}
        tools_used: List[str] = []

        codes = extract_codes_from_name(mensagem, expand_family=False)[:MAX_CODES_PER_MESSAGE]
        code_source = mensagem
        search_text = mensagem
        # Chassi so vale como codigo se o admin ensinou algo sobre ele; senao a busca vai pelo veiculo.
        chassis = [c for c in codes if is_chassis_number(c) and not self._known_code(c, tools_used)]
        if chassis:
            codes = [c for c in codes if c not in chassis]
            for vin in chassis:
                search_text = re.sub(re.escape(vin), " ", search_text, flags=re.IGNORECASE)
        if not codes and not chassis:
            # "temos essa daí?" logo depois de colar um código: usa o código da mensagem anterior.
            previous = self._previous_user_text(historico or [])
            if previous and REFERENCE_WORDS & set(search_words(mensagem)):
                codes = extract_codes_from_name(previous, expand_family=False)[:MAX_CODES_PER_MESSAGE]
                code_source = previous
        if not codes:
            spaced = self._spaced_codes(search_text, tools_used)
            if spaced:
                codes, code_source = spaced, " ".join(spaced)
        pairs = self._comparison_pairs(mensagem, codes, code_source, historico or [])
        if pairs:
            parts = []
            for first, second in pairs:
                output = self.tools.run_tool("comparar_codigos", {"codigo_a": first, "codigo_b": second})
                tools_used.append("comparar_codigos")
                parts.append(output.get("texto_pronto") or HELP_TEXT)
            return make_result("\n\n".join(parts), [], tools_used, MODE_DIRECT), True
        if codes:
            parts = []
            for code in codes:
                typed = _typed_code(code_source, code)
                output = self.tools.run_tool("buscar_por_codigo", {"codigo": typed})
                tools_used.append("buscar_por_codigo")
                collect_products(output, found)
                parts.append(output.get("texto_pronto") or format_code_answer(typed, output))
            text = "\n\n".join(parts)
            understood = True
        else:
            output = None
            for query in self._application_queries(search_text, historico or []):
                output = self.tools.run_tool("buscar_por_aplicacao", {"texto": query})
                tools_used.append("buscar_por_aplicacao")
                if "erro" not in output and output.get("total_fichas"):
                    break
            understood = bool(output and "erro" not in output and output.get("total_fichas"))
            useful_words = bool(output and "erro" not in output and output.get("termos_usados"))
            if chassis and not understood and not useful_words:
                # So o chassi, sem veiculo nem motor: explica o que mandar (a IA tambem nao acharia).
                text, understood = CHASSIS_TEXT, True
            elif output is None or "erro" in output:
                text = HELP_TEXT
            else:
                collect_products(output, found)
                text = output.get("texto_pronto") or format_application_answer(output, wants_core(mensagem))

        return make_result(text, cited_products(text, found), tools_used, MODE_DIRECT), understood

    def _known_code(self, code: str, tools_used: List[str]) -> bool:
        """
        A busca acha esse codigo exato (produto, catalogo ou o que o especialista ensinou)? Sem
        completar pelo final: um numero qualquer nao pode virar um codigo parecido.
        """
        output = self.tools.run_tool("buscar_por_codigo", {"codigo": code})
        tools_used.append("buscar_por_codigo")
        completed = "codigo_digitado" in output or "codigos_possiveis" in output
        return _found_something(output) and not completed

    def _spaced_codes(self, text: str, tools_used: List[str]) -> List[str]:
        """
        Codigo falado que a transcricao escreveu com espacos ("5327 988 7101"). So vale se a
        busca achar o codigo junto: "scania 440 2015" ou "460 500" continuam sendo veiculo.
        """
        codes: List[str] = []
        for match in _SPACED_DIGITS.finditer(text or ""):
            groups = match.group(0).split()
            joined = "".join(groups)
            if any(_YEAR.match(g) for g in groups):
                continue
            if not MIN_SPACED_CODE_LENGTH <= len(joined) <= MAX_SPACED_CODE_LENGTH:
                continue
            if self._known_code(joined, tools_used):
                codes.append(joined)
        return codes[:MAX_CODES_PER_MESSAGE]

    def _comparison_pairs(
        self, mensagem: str, codes: List[str], code_source: str, historico: List[Dict[str, str]]
    ) -> List[Tuple[str, str]]:
        """
        Pares de codigos de uma pergunta "e igual / a mesma / serve no lugar?" (o primeiro com
        cada um dos outros). Com um codigo so e "essa", o outro e o da mensagem anterior.
        """
        words = set(search_words(mensagem))
        if not COMPARISON_WORDS & words:
            return []
        typed = [_typed_code(code_source, c) for c in codes]
        if len(typed) == 1 and code_source == mensagem and REFERENCE_WORDS & words:
            previous = self._previous_user_text(historico)
            earlier = extract_codes_from_name(previous or "", expand_family=False)[:1]
            if earlier and earlier[0] != codes[0]:
                typed.insert(0, _typed_code(previous or "", earlier[0]))
        if len(typed) < 2:
            return []
        return [(typed[0], other) for other in typed[1:]]

    @staticmethod
    def _previous_user_text(historico: List[Dict[str, str]]) -> Optional[str]:
        for item in reversed(historico):
            if item.get("papel") == "usuario" and str(item.get("texto") or "").strip():
                return str(item["texto"])
        return None

    @staticmethod
    def _application_queries(mensagem: str, historico: List[Dict[str, str]]) -> List[str]:
        """Pergunta atual; antes dela, a pergunta anterior + a atual se o assistente tinha perguntado algo."""
        queries = [mensagem]
        if len(historico) >= 2:
            last, previous = historico[-1], historico[-2]
            asked_back = last.get("papel") == "assistente" and str(last.get("texto") or "").strip().endswith("?")
            previous_text = str(previous.get("texto") or "")
            if (
                asked_back
                and previous.get("papel") == "usuario"
                and not extract_codes_from_name(previous_text, expand_family=False)
            ):
                queries.insert(0, f"{previous_text} {mensagem}")
        return queries
