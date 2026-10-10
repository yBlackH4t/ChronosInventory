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

from collections import defaultdict, deque
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

from core.catalog.normalization import canonical_code, expand_family_codes, is_searchable_code
from core.database.repositories.knowledge_repository import KnowledgeRepository
from core.database.repositories.product_repository import ProductRepository
from core.exceptions import ValidationException

TYPE_SAME = "IGUAL"
TYPE_SIMILAR = "SIMILAR"
TYPE_DIFFERENT = "DIFERENTE"
VALID_TYPES = (TYPE_SAME, TYPE_SIMILAR, TYPE_DIFFERENT)

MAX_NOTE_LENGTH = 300
# Sugestao por inicio de codigo: so para codigos numericos longos (BorgWarner 11 digitos).
SUGGESTION_MIN_LENGTH = 10
SUGGESTION_PREFIX_LENGTH = 7


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

    def suggestions(self, code: str, limit: int = 5) -> List[Dict[str, Any]]:
        """
        Possiveis similares de um codigo sem estoque, para o admin confirmar ou recusar.
        Hoje: nossos produtos com o mesmo inicio de codigo BorgWarner (5327-988-....).
        """
        code = canonical_code(code)
        if not (code.isdigit() and len(code) >= SUGGESTION_MIN_LENGTH):
            return []
        relations = self.relations(code)
        known = _family([code]) | relations["diferentes"]
        for item in relations["iguais"] + relations["similares"]:
            known |= _family([item["codigo_norm"]])

        prefix = code[:SUGGESTION_PREFIX_LENGTH]
        by_product: Dict[int, str] = {}
        for row in self.repository.product_codes_with_prefix(prefix, len(code)):
            if row["numero_norm"] in known:
                continue
            by_product.setdefault(int(row["produto_id"]), row["numero_norm"])
        if not by_product:
            return []

        out = []
        for product in self.products.get_by_ids(list(by_product)):
            stock = sum(int(q or 0) for q in (product.get("inventories") or {}).values())
            out.append(
                {
                    "codigo": by_product[int(product["id"])],
                    "produto_id": int(product["id"]),
                    "nome": product["nome"],
                    "estoque_total": stock,
                    "motivo": f"mesmo início de código ({prefix[:4]}-{prefix[4:]})",
                }
            )
        out.sort(key=lambda s: (-s["estoque_total"], s["codigo"]))
        return out[:limit]

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
