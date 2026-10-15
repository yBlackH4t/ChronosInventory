"""
Base de conhecimento do especialista (docs/PLANO_IA.md).

O admin ensina relacoes entre codigos que o catalogo nao conhece:
- IGUAL: mesma peca, troca direta. Transitivo: A = B e B = C -> A = C.
- SIMILAR: serve com ressalva (observacao). Vale para todo o grupo de iguais.
- DIFERENTE: nao serve. Usado para sugestao recusada e para esconder um
  "equivalente pelo catalogo" que o especialista sabe que nao serve.

Versoes nova/reman do mesmo codigo (expand_family_codes) contam como o mesmo
codigo: ensinar a 5327-988-7101 vale tambem para a 5327-990-7101.
"""

from __future__ import annotations

import re
from collections import defaultdict, deque
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

from core.catalog.normalization import (
    canonical_code,
    expand_family_codes,
    extract_codes_from_name,
    is_searchable_code,
)
from app.services.code_graph import REASON_PRODUCT, CodeGraph, explain, load_graph
from core.database.repositories.knowledge_repository import KnowledgeRepository
from core.database.repositories.product_repository import ProductRepository
from core.exceptions import ValidationException

TYPE_SAME = "IGUAL"
TYPE_SIMILAR = "SIMILAR"
TYPE_DIFFERENT = "DIFERENTE"
VALID_TYPES = (TYPE_SAME, TYPE_SIMILAR, TYPE_DIFFERENT)

# Resposta a "A e B sao a mesma peca?" (relation_between).
RELATION_SAME_PART = "mesma_peca"  # mesmo codigo ou versao nova/reman
RELATION_SAME = "igual"
RELATION_SIMILAR = "similar"
RELATION_DIFFERENT = "diferente"
RELATION_PROBABLY_SAME = "provavel_igual"  # o cadastro junta os dois; o especialista confirma
SOURCE_FAMILY = "familia"
SOURCE_EXPERT = "especialista"
SOURCE_REGISTRY = "cadastro"

MAX_NOTE_LENGTH = 300
MAX_SUGGESTIONS = 5
# Final abreviado no nome do produto: "53279907101/7210" ou "53279907210 (USE 7101)".
_NAME_TOKEN = re.compile(r"[A-Z0-9][A-Z0-9.\-]*")
_SHORT_SUFFIX_DIGITS = (3, 5)
_MIN_FULL_CODE_DIGITS = 7
_MIN_SUGGESTION_DIGITS = 6


def codes_cited_in_name(name: Optional[str], expand_family: bool = True) -> Set[str]:
    """
    Codigos que o nome do produto cita, inclusive os finais abreviados depois de um codigo
    completo: 'TURBO K27 - 53279907101/7210' -> {53279907101, 53279907210} (com as versoes
    nova/reman). O cadastro da empresa junta assim as pecas que sao iguais.
    """
    codes: Set[str] = set(extract_codes_from_name(name or "", expand_family=False))
    last_full: Optional[str] = None
    previous = ""
    for token in _NAME_TOKEN.findall(str(name or "").upper()):
        token = token.strip(".-")
        code = canonical_code(token)
        if code.isdigit() and len(code) >= _MIN_FULL_CODE_DIGITS:
            last_full = code
        elif (
            last_full
            and code.isdigit()
            and _SHORT_SUFFIX_DIGITS[0] <= len(code) <= _SHORT_SUFFIX_DIGITS[1]
            and (previous == last_full or previous == "USE" or previous.startswith("+"))
        ):
            codes.add(last_full[: -len(code)] + code)
            previous = "+" + code  # "7101/7210/7218": cada final completa o mesmo codigo
            continue
        previous = code if code.isdigit() and len(code) >= _MIN_FULL_CODE_DIGITS else token
    return set(expand_family_codes(sorted(codes))) if expand_family else codes


def _is_part_number(code: str) -> bool:
    """Numero de peca de verdade (4031196, 53279887101, 7151895006), nao modelo como GTB2060."""
    return is_searchable_code(code) and sum(ch.isdigit() for ch in code) >= _MIN_SUGGESTION_DIGITS


def _as_written(name: str, code: str) -> str:
    """O codigo como esta no nome do produto ('802774-9007'), em vez da forma canonica."""
    for token in _NAME_TOKEN.findall(str(name or "").upper()):
        if canonical_code(token.strip(".-")) == code:
            return token.strip(".-")
    return code


def _closure(start: Iterable[str], edges: Dict[str, Set[str]]) -> Set[str]:
    seen = set(start)
    queue = deque(seen)
    while queue:
        node = queue.popleft()
        for neighbor in edges.get(node, ()):
            if neighbor not in seen:
                seen.add(neighbor)
                queue.append(neighbor)
    return seen


def _family(codes: Iterable[str]) -> Set[str]:
    return set(expand_family_codes(list(codes)))


def _stock(product: Dict[str, Any]) -> int:
    return sum(int(q or 0) for q in (product.get("inventories") or {}).values())


def check_single_code(raw: str) -> None:
    """
    Um codigo por campo. "465819-5003 OU 53169887185" virava um codigo so (que ninguem pergunta)
    e a regra nunca valia: o admin precisa criar uma regra para cada codigo.
    """
    codes = extract_codes_from_name(raw or "", expand_family=False)
    if len(codes) > 1:
        raise ValidationException(
            f"Um código por regra: {str(raw).strip()!r} tem {len(codes)} códigos. "
            "Crie uma regra para cada um."
        )


class AssistantKnowledgeService:
    def __init__(
        self,
        repository: Optional[KnowledgeRepository] = None,
        product_repository: Optional[ProductRepository] = None,
    ) -> None:
        self.repository = repository or KnowledgeRepository()
        self.products = product_repository or ProductRepository()

    # ------------------------------------------------------------------
    # Consulta (usada pela busca do assistente)
    # ------------------------------------------------------------------

    def relations(self, code: str) -> Dict[str, Any]:
        """
        O que o especialista ensinou sobre um codigo:
        {"iguais": [{codigo_norm, codigo, obs}], "similares": [...], "diferentes": {codigo_norm}}
        """
        empty: Dict[str, Any] = {"iguais": [], "similares": [], "diferentes": set()}
        code = canonical_code(code)
        if not code:
            return empty
        rules = self.repository.all_rules()
        if not rules:
            return empty

        same: Dict[str, Set[str]] = defaultdict(set)
        similar: Dict[str, List[Tuple[str, Optional[str]]]] = defaultdict(list)
        different: Dict[str, Set[str]] = defaultdict(set)
        same_note: Dict[str, Optional[str]] = {}
        display: Dict[str, str] = {}
        for rule in rules:
            a, b = rule["codigo_a_norm"], rule["codigo_b_norm"]
            display.setdefault(a, rule["codigo_a"])
            display.setdefault(b, rule["codigo_b"])
            # Cada lado vale para as versoes nova/reman dele.
            side_a, side_b = _family([a]), _family([b])
            if rule["tipo"] == TYPE_SAME:
                for x in side_a:
                    same[x] |= side_b
                for y in side_b:
                    same[y] |= side_a
                if rule.get("observacao"):
                    same_note.setdefault(a, rule["observacao"])
                    same_note.setdefault(b, rule["observacao"])
            elif rule["tipo"] == TYPE_SIMILAR:
                for x in side_a:
                    similar[x].append((b, rule.get("observacao")))
                for y in side_b:
                    similar[y].append((a, rule.get("observacao")))
            elif rule["tipo"] == TYPE_DIFFERENT:
                for x in side_a:
                    different[x] |= side_b
                for y in side_b:
                    different[y] |= side_a

        own = _family([code])
        group = _closure(own, same)
        iguais = []
        for node in sorted(group - own):
            if node in display:  # so os codigos ensinados (nao as variantes geradas)
                iguais.append({"codigo_norm": node, "codigo": display[node], "obs": same_note.get(node)})

        similares: Dict[str, Dict[str, Any]] = {}
        for member in group:
            for neighbor, note in similar.get(member, ()):
                for node in _closure(_family([neighbor]), same):
                    if node in group or node in similares or node not in display:
                        continue
                    similares[node] = {"codigo_norm": node, "codigo": display[node], "obs": note}

        diferentes: Set[str] = set()
        for member in group:
            diferentes |= different.get(member, set())
        return {"iguais": iguais, "similares": list(similares.values()), "diferentes": diferentes - group}

    # ------------------------------------------------------------------
    # Edicao (so admin; quem chama verifica)
    # ------------------------------------------------------------------

    def list_rules(self, busca: Optional[str] = None, limite: int = 200, offset: int = 0) -> List[Dict[str, Any]]:
        search = canonical_code(busca) if busca else None
        return [self._public_rule(r) for r in self.repository.list_rules(search or None, limite, offset)]

    def add_rule(self, codigo_a: str, codigo_b: str, tipo: str, observacao: Optional[str] = None) -> Dict[str, Any]:
        for raw in (codigo_a, codigo_b):
            check_single_code(raw)
        a_norm, b_norm = canonical_code(codigo_a), canonical_code(codigo_b)
        for raw, norm in ((codigo_a, a_norm), (codigo_b, b_norm)):
            if not is_searchable_code(norm):
                raise ValidationException(f"Código inválido: {raw!r} (precisa ser o número da peça).")
        if a_norm == b_norm or b_norm in _family([a_norm]):
            raise ValidationException("Esses códigos já são a mesma peça (mesmo código ou versão nova/reman).")
        tipo = (tipo or "").strip().upper()
        if tipo not in VALID_TYPES:
            raise ValidationException("Tipo inválido. Use igual, similar ou diferente.")
        note = " ".join((observacao or "").split())[:MAX_NOTE_LENGTH] or None

        display_a, display_b = codigo_a.strip().upper(), codigo_b.strip().upper()
        if a_norm > b_norm:
            a_norm, b_norm, display_a, display_b = b_norm, a_norm, display_b, display_a
        rule_id = self.repository.upsert_rule(display_a, a_norm, display_b, b_norm, tipo, note)
        return self._public_rule(self.repository.get_rule(rule_id) or {})

    def remove_rule(self, rule_id: int) -> bool:
        return self.repository.delete_rule(int(rule_id))

    # ------------------------------------------------------------------
    # Sugestoes para o admin (nunca mostradas ao chefe)
    # ------------------------------------------------------------------

    def relation_between(self, code_a: str, code_b: str) -> Dict[str, Any]:
        """
        O que se sabe sobre "A e B sao a mesma peca?":
        {"relacao": RELATION_*, "fonte": SOURCE_*, "obs", "produto" (cadastro), "ficha" (catalogo)}.
        Vale primeiro o que o especialista ensinou; depois o cadastro da empresa (um produto que
        cita os dois codigos) e o catalogo (os dois na mesma ficha), que o especialista ainda
        precisa confirmar.
        """
        a, b = canonical_code(code_a), canonical_code(code_b)
        family_a, family_b = _family([a]), _family([b])
        if family_a & family_b:
            return {"relacao": RELATION_SAME_PART, "fonte": SOURCE_FAMILY}

        relations = self.relations(a)
        for key, relation in (("iguais", RELATION_SAME), ("similares", RELATION_SIMILAR)):
            for item in relations[key]:
                if _family([item["codigo_norm"]]) & family_b:
                    return {"relacao": relation, "fonte": SOURCE_EXPERT, "obs": item.get("obs")}
        if relations["diferentes"] & family_b:
            return {"relacao": RELATION_DIFFERENT, "fonte": SOURCE_EXPERT}

        # Grafo de codigos (produtos, regras "igual", itens de NF-e): o caminho de A ate B.
        # "Mesma ficha do catalogo" nao vale: uma ficha Master Power lista tudo o que ela substitui
        # (centenas de codigos), entao ela nao diz que duas pecas sao iguais.
        steps = self.graph().path(a, b)
        if steps:
            found: Dict[str, Any] = {"relacao": RELATION_PROBABLY_SAME, "fonte": SOURCE_REGISTRY, "caminho": steps}
            if len(steps) == 1 and steps[0][2].startswith(f"{REASON_PRODUCT}: "):
                found["produto"] = steps[0][2][len(REASON_PRODUCT) + 2:]
            return found
        return {"relacao": None, "fonte": None}

    def graph(self) -> CodeGraph:
        return load_graph(self.repository)

    def suggestions(
        self, code: str, limit: int = MAX_SUGGESTIONS, asked_with: Iterable[str] = ()
    ) -> List[Dict[str, Any]]:
        """
        Possiveis iguais de um codigo, para o admin confirmar ou recusar. So com motivo:
        1. o codigo com que perguntaram se ele e igual ("a 7101 e a mesma que a 7210?");
        2. o cadastro da empresa cita os dois ("53279907101/7210", "53279907210 (USE 7101)").
        Nem "mesmo inicio de codigo" (todo K27 comeca com 5327988) nem "mesma ficha do catalogo"
        (uma ficha Master Power junta centenas de codigos): as duas davam listas sem sentido.
        O que ja foi ensinado (inclusive "nao serve") sai da lista.
        """
        code = canonical_code(code)
        if not is_searchable_code(code):
            return []
        relations = self.relations(code)
        known = _family([code]) | relations["diferentes"]
        for item in relations["iguais"] + relations["similares"]:
            known |= _family([item["codigo_norm"]])

        # (codigo, como escrever, motivo)
        candidates: List[Tuple[str, str, str]] = [
            (canonical_code(c), str(c), "perguntaram se é igual") for c in asked_with
        ]
        # Grafo de codigos: as pecas a ate 2 passos (o mesmo produto cita as duas, regra "igual",
        # item de NF-e), com o caminho como motivo.
        for cited, steps in self.graph().neighbors(code, max_steps=2):
            if len(steps) == 1 and steps[0][2].startswith(f"{REASON_PRODUCT}: "):
                reason = f"o cadastro junta os dois: {steps[0][2][len(REASON_PRODUCT) + 2:]}"
            else:
                reason = f"pelo caminho {explain(steps)}"
            candidates.append((canonical_code(cited), cited, reason))

        out: List[Dict[str, Any]] = []
        for candidate, written, reason in candidates:
            if len(out) >= limit:
                break
            if not _is_part_number(candidate) or _family([candidate]) & known:
                continue
            known |= _family([candidate])
            product = self._product_with_code(candidate)
            out.append(
                {
                    "codigo": written,
                    "produto_id": int(product["id"]) if product else None,
                    "nome": product["nome"] if product else "Não cadastrado no estoque",
                    "estoque_total": _stock(product) if product else 0,
                    "motivo": reason,
                }
            )
        return out

    def _product_with_code(self, code: str) -> Optional[Dict[str, Any]]:
        """O nosso produto daquele codigo (ou da versao nova/reman), o de mais estoque."""
        family = _family([code])
        found: Dict[int, Dict[str, Any]] = {}
        for variant in sorted(family):
            for product in self.products.get_all(search_term=variant, status="ATIVO"):
                if set(extract_codes_from_name(product["nome"])) & family:
                    found[int(product["id"])] = product
        return max(found.values(), key=lambda p: (_stock(p), -int(p["id"])), default=None)

    @staticmethod
    def _public_rule(rule: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "id": rule.get("id"),
            "codigo_a": rule.get("codigo_a"),
            "codigo_b": rule.get("codigo_b"),
            "tipo": str(rule.get("tipo") or "").lower(),
            "observacao": rule.get("observacao"),
            "criado_em": rule.get("criado_em"),
            "atualizado_em": rule.get("atualizado_em"),
        }
