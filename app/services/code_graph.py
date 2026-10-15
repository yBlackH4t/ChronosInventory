"""
Grafo de codigos de peca (2.4.5).

Cada no e uma peca (o codigo e as versoes nova/reman dele, juntos). Uma aresta diz por que
duas pecas sao a mesma:
- "mesmo produto": o nome de um produto nosso cita as duas ("4031195/4044201/3785479",
  "53279907101/7210", "53279907210 (USE 7101)");
- "igual, ensinado": regra IGUAL do especialista;
- "mesmo item na NF-e": o item da nota do fornecedor que ligamos a um produto nosso.
Regras DIFERENTE bloqueiam a passagem entre as duas pecas. "Similar" nao vira aresta (serve
com ressalva, nao e a mesma peca) e "mesma ficha do catalogo" tambem nao (uma ficha Master
Power junta centenas de codigos).

Codigo que aparece em muitos produtos (pedaco de codigo de kit, como 100001 em 82 produtos)
nao entra: ligaria pecas que nao tem nada a ver.

Usado por "A e igual a B?" (o caminho entre as duas) e pelas sugestoes do "Para revisar"
(as pecas a ate 2 passos).
"""

from __future__ import annotations

import threading
from collections import defaultdict, deque
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

from core.catalog.normalization import canonical_code, expand_family_codes

MIN_PART_DIGITS = 6
MAX_PRODUCTS_PER_CODE = 5  # mais que isso e codigo de kit/familia, nao de uma peca
MAX_PATH_STEPS = 3

REASON_PRODUCT = "mesmo produto"
REASON_EXPERT = "igual, ensinado pelo especialista"
REASON_NFE = "mesmo item na NF-e do fornecedor"

Step = Tuple[str, str, str]  # (de, para, motivo)


def piece_key(code: str) -> str:
    """A peca de um codigo: o menor codigo entre ele e as versoes nova/reman."""
    code = canonical_code(code)
    # Duas voltas: a expansao nao e simetrica (988 -> 990/991, mas 990 -> 988/970).
    return min(expand_family_codes(expand_family_codes([code])) or [code])


def _is_part(code: str) -> bool:
    return sum(ch.isdigit() for ch in code) >= MIN_PART_DIGITS


class CodeGraph:
    def __init__(
        self,
        products: Iterable[Dict[str, Any]],
        rules: Iterable[Dict[str, Any]],
        nfe_links: Iterable[Dict[str, Any]] = (),
    ) -> None:
        from app.services.assistant_knowledge_service import codes_cited_in_name

        self.edges: Dict[str, Dict[str, str]] = defaultdict(dict)
        self.blocked: Set[frozenset] = set()
        self.label: Dict[str, str] = {}

        cited_by_product: Dict[int, Tuple[str, List[str]]] = {}
        products_per_piece: Dict[str, int] = defaultdict(int)
        for product in products:
            codes = [c for c in codes_cited_in_name(product["nome"], expand_family=False) if _is_part(c)]
            pieces = sorted({piece_key(c) for c in codes})
            for code in codes:
                self.label.setdefault(piece_key(code), code)
            cited_by_product[int(product["id"])] = (product["nome"], pieces)
            for piece in pieces:
                products_per_piece[piece] += 1
        junk = {p for p, n in products_per_piece.items() if n > MAX_PRODUCTS_PER_CODE}

        for name, pieces in cited_by_product.values():
            useful = [p for p in pieces if p not in junk]
            for i, a in enumerate(useful):
                for b in useful[i + 1:]:
                    self._link(a, b, f"{REASON_PRODUCT}: {name}")

        for rule in rules:
            a, b = piece_key(rule["codigo_a_norm"]), piece_key(rule["codigo_b_norm"])
            self.label.setdefault(a, rule.get("codigo_a") or a)
            self.label.setdefault(b, rule.get("codigo_b") or b)
            if rule["tipo"] == "IGUAL":
                self._link(a, b, REASON_EXPERT)
            elif rule["tipo"] == "DIFERENTE":
                self.blocked.add(frozenset((a, b)))

        for link in nfe_links:
            supplier = canonical_code(link.get("codigo"))
            entry = cited_by_product.get(int(link.get("produto_id") or 0))
            if not entry or not _is_part(supplier):
                continue
            a = piece_key(supplier)
            self.label.setdefault(a, supplier)
            for b in entry[1]:
                if b not in junk and b != a:
                    self._link(a, b, REASON_NFE)

    def _link(self, a: str, b: str, reason: str) -> None:
        if a == b:
            return
        self.edges[a].setdefault(b, reason)
        self.edges[b].setdefault(a, reason)

    def _blocked(self, a: str, b: str) -> bool:
        return frozenset((a, b)) in self.blocked

    def path(self, code_a: str, code_b: str, max_steps: int = MAX_PATH_STEPS) -> Optional[List[Step]]:
        """O caminho de A ate B (cada passo com o motivo), ou None. "Diferente" bloqueia."""
        start, goal = piece_key(code_a), piece_key(code_b)
        if start == goal or self._blocked(start, goal):
            return None
        previous: Dict[str, Optional[str]] = {start: None}
        queue = deque([(start, 0)])
        while queue:
            node, depth = queue.popleft()
            if node == goal:
                break
            if depth >= max_steps:
                continue
            for neighbor in self.edges.get(node, {}):
                if neighbor in previous or self._blocked(node, neighbor) or self._blocked(start, neighbor):
                    continue
                previous[neighbor] = node
                queue.append((neighbor, depth + 1))
        if goal not in previous:
            return None
        steps: List[Step] = []
        node = goal
        while previous[node] is not None:
            before = previous[node]
            steps.append((self.label.get(before, before), self.label.get(node, node), self.edges[before][node]))
            node = before
        return list(reversed(steps))

    def neighbors(self, code: str, max_steps: int = 2) -> List[Tuple[str, List[Step]]]:
        """Pecas a ate `max_steps` passos, mais perto primeiro: [(codigo, caminho)]."""
        start = piece_key(code)
        previous: Dict[str, Optional[str]] = {start: None}
        order: List[str] = []
        queue = deque([(start, 0)])
        while queue:
            node, depth = queue.popleft()
            if depth >= max_steps:
                continue
            for neighbor in sorted(self.edges.get(node, {})):
                if neighbor in previous or self._blocked(node, neighbor) or self._blocked(start, neighbor):
                    continue
                previous[neighbor] = node
                order.append(neighbor)
                queue.append((neighbor, depth + 1))
        out = []
        for target in order:
            steps: List[Step] = []
            node = target
            while previous[node] is not None:
                before = previous[node]
                steps.append((self.label.get(before, before), self.label.get(node, node), self.edges[before][node]))
                node = before
            out.append((self.label.get(target, target), list(reversed(steps))))
        return out


_CACHE_LOCK = threading.Lock()
_CACHE: Dict[str, Any] = {"signature": None, "db": None, "graph": None}


def load_graph(repository: Any) -> CodeGraph:
    """O grafo do banco atual; so e remontado quando produtos, regras ou NF-e mudam."""
    signature = repository.graph_signature()
    db_key = getattr(getattr(repository, "db", None), "db_path", None) or id(repository)
    with _CACHE_LOCK:
        if _CACHE["graph"] is not None and _CACHE["signature"] == signature and _CACHE["db"] == db_key:
            return _CACHE["graph"]
    graph = CodeGraph(repository.active_product_names(), repository.all_rules(), repository.nfe_item_links())
    with _CACHE_LOCK:
        _CACHE.update({"signature": signature, "db": db_key, "graph": graph})
    return graph


def explain(steps: List[Step]) -> str:
    """'4031195 → 3785479 (mesmo produto: TURBO ...); 3785479 → 5452302 (igual, ensinado ...)'."""
    return "; ".join(f"{a} → {b} ({reason})" for a, b, reason in steps)

