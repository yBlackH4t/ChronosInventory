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
# Palavras que apontam para o codigo da mensagem anterior ("temos essa daí?").
REFERENCE_WORDS = {"ESSA", "ESSE", "ESTA", "ESTE", "DESSA", "DESSE", "DESTA", "DESTE", "DAI", "ELA", "ELE", "ISSO", "MESMA"}


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
        if not codes:
            # "temos essa daí?" logo depois de colar um código: usa o código da mensagem anterior.
            previous = self._previous_user_text(historico or [])
            if previous and REFERENCE_WORDS & set(search_words(mensagem)):
                codes = extract_codes_from_name(previous, expand_family=False)[:MAX_CODES_PER_MESSAGE]
                code_source = previous
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
            for query in self._application_queries(mensagem, historico or []):
                output = self.tools.run_tool("buscar_por_aplicacao", {"texto": query})
                tools_used.append("buscar_por_aplicacao")
                if "erro" not in output and output.get("total_fichas"):
                    break
            understood = bool(output and "erro" not in output and output.get("total_fichas"))
            if output is None or "erro" in output:
                text = HELP_TEXT
            else:
                collect_products(output, found)
                text = output.get("texto_pronto") or format_application_answer(output, wants_core(mensagem))

        return make_result(text, cited_products(text, found), tools_used, MODE_DIRECT), understood

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
