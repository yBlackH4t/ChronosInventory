"""
Leitura da etiqueta da caixa pelo celular.

A foto de uma caixa traz varios codigos de barras: o da peca e tambem numero de serie, modelo,
lote, EAN, quantidade ("1"), pais ("BR")... O celular le todos e manda para ca; aqui fica so o
codigo da peca:

- etiqueta do Chronos (CI-<id>) ganha de tudo;
- depois, o codigo que bate com uma peca cadastrada (codigo no nome do produto);
- modelo (GT4594BNS, HE500WG) so vale se nada mais bater, porque serve para varias pecas;
- lixo ("1", "BR", links do QR) nunca vira leitura.

Padroes das marcas (para sugerir o codigo quando a peca nao esta cadastrada):
- Garrett: ITEM 876272-5017S (o de barras vem sem hifen: 8762725017S); serie DE50473 e
  modelo GT4594BNS ficam de fora;
- BorgWarner: 15.17559-2.A (e 11 digitos nas turbinas, 53279887101); EM7559, lote 2412M...
  e EAN 789... ficam de fora;
- Holset: 5457622 (7 digitos, o primeiro codigo); QTY, BR e CNPJ ficam de fora.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Optional

from core.catalog.normalization import (
    canonical_code,
    expand_family_codes,
    extract_codes_from_name,
    is_searchable_code,
)
from core.database.connection import DatabaseConnection
from core.nfe_xml import chave_from_code

MAX_CODES = 20
MAX_CHOICES = 6

_LABEL = re.compile(r"^CI-(\d+)$", re.IGNORECASE)
# Modelo de turbina: letras + ate 4 digitos + letras (GT4594BNS, HE500WG, HX55W, K27, S410).
_MODEL = re.compile(r"^[A-Z]{1,4}\d{2,4}[A-Z]{0,5}$")
_GARRETT = re.compile(r"^\d{6}-?\d{4}[A-Z]?$")
_BORG_VISCOSA = re.compile(r"^\d{2}\.\d{5}-\d\.[A-Z]$")
_DIGITS_ONLY = re.compile(r"^\d+$")


@dataclass
class _Candidate:
    raw: str
    code: str
    tier: int
    products: List[int] = field(default_factory=list)


def _ean_ok(digits: str) -> bool:
    if len(digits) not in (8, 12, 13, 14) or not digits.isdigit():
        return False
    body, check = digits[:-1], int(digits[-1])
    total = sum(int(d) * (3 if i % 2 == 0 else 1) for i, d in enumerate(reversed(body)))
    return (10 - total % 10) % 10 == check


def is_junk(raw: str) -> bool:
    """Codigos que nunca sao a peca: quantidade, pais, link do QR, numeros curtos."""
    text = raw.strip()
    if _LABEL.match(text):
        return False
    if not text or "://" in text or text.lower().startswith("www."):
        return True
    code = canonical_code(text)
    digits = sum(1 for ch in code if ch.isdigit())
    if _DIGITS_ONLY.match(code) and int(code) < 1000:
        return True  # quantidade (1, 00001)
    return len(code) < 4 or digits < 3


def part_number_score(raw: str) -> int:
    """Quanto o texto tem cara de codigo de peca das nossas marcas (0 = nao parece)."""
    text = raw.strip().upper()
    if is_junk(text) or _LABEL.match(text) or chave_from_code(text):
        return 0
    code = canonical_code(text)
    if _GARRETT.match(text.replace(" ", "")):
        return 5
    if _BORG_VISCOSA.match(text):
        return 5
    if _DIGITS_ONLY.match(code):
        if _ean_ok(code) and code.startswith(("789", "790")):
            return 0  # EAN brasileiro da caixa
        if len(code) == 14:
            return 0  # CNPJ
        if len(code) in (7, 11):
            return 4  # Holset 7 digitos; BorgWarner 11 digitos
        if 5 <= len(code) <= 10:
            return 2
        return 1
    if _MODEL.match(code):
        return 0
    return 1 if is_searchable_code(code) else 0


class LabelReaderService:
    def __init__(self, db: Optional[DatabaseConnection] = None) -> None:
        self.db = db or DatabaseConnection()

    def resolve(self, codes: Iterable[str]) -> Dict:
        """
        Decide qual dos codigos lidos e a peca.

        Devolve {"situacao": "nf" | "produto" | "escolher" | "nenhum", ...}:
        - nf: achou a chave de uma NF-e (44 digitos);
        - produto: uma peca so ("produtos" com 1 item);
        - escolher: mais de uma peca bate, o celular pergunta qual;
        - nenhum: nada cadastrado; "sugestao" traz o codigo com mais cara de peca.
        """
        cleaned: List[str] = []
        for raw in codes:
            text = str(raw or "").strip()
            if text and text not in cleaned:
                cleaned.append(text)
        cleaned = cleaned[:MAX_CODES]

        chaves = [chave for chave in (chave_from_code(text) for text in cleaned) if chave]
        ignored = [text for text in cleaned if is_junk(text)]
        result: Dict = {"lidos": cleaned, "ignorados": ignored, "chave": chaves[0] if chaves else None}

        candidates = self._match(text for text in cleaned if not is_junk(text) and not chave_from_code(text))
        matched = [c for c in candidates if c.products]
        if matched:
            best_tier = min(c.tier for c in matched)
            product_ids: List[int] = []
            codes_by_product: Dict[int, str] = {}
            for candidate in matched:
                if candidate.tier != best_tier:
                    continue
                for product_id in candidate.products:
                    if product_id not in product_ids:
                        product_ids.append(product_id)
                        codes_by_product[product_id] = candidate.raw
            produtos = self._products(product_ids[:MAX_CHOICES], codes_by_product)
            if produtos:
                result["situacao"] = "produto" if len(produtos) == 1 else "escolher"
                result["produtos"] = produtos
                return result

        if chaves:
            result["situacao"] = "nf"
            result["produtos"] = []
            return result

        scored = sorted(
            ((part_number_score(text), index, text) for index, text in enumerate(cleaned)),
            key=lambda item: (-item[0], item[1]),
        )
        result["situacao"] = "nenhum"
        result["produtos"] = []
        result["sugestao"] = scored[0][2] if scored and scored[0][0] > 0 else None
        return result

    # ------------------------------------------------------------------

    def _match(self, texts: Iterable[str]) -> List[_Candidate]:
        conn = self.db.get_connection()
        try:
            index = self._code_index(conn)
            active = {product_id for ids in index.values() for product_id in ids}
            found: List[_Candidate] = []
            for text in texts:
                label = _LABEL.match(text)
                if label:
                    row = conn.execute(
                        "SELECT id FROM produtos WHERE id = ? AND COALESCE(ativo, 1) = 1", (int(label.group(1)),)
                    ).fetchone()
                    found.append(_Candidate(text, text.upper(), 0, [int(row[0])] if row else []))
                    continue
                code = canonical_code(text)
                if not code:
                    continue
                model = bool(_MODEL.match(code)) and not _DIGITS_ONLY.match(code)
                exact = list(index.get(code, []))
                if exact:
                    found.append(_Candidate(text, code, 4 if model else 1, exact))
                    continue
                if model:
                    continue
                family: List[int] = []
                for variant in expand_family_codes([code]):
                    if variant != code and len(variant) >= 5:
                        family.extend(i for i in index.get(variant, []) if i not in family)
                found.append(_Candidate(text, code, 2, [i for i in family if i in active]))
            return found
        finally:
            conn.close()

    @staticmethod
    def _code_index(conn) -> Dict[str, List[int]]:
        """
        Codigo canonico -> produtos ativos. Le o nome de cada produto na hora (o cadastro muda
        sem passar pela tabela de codigos) e soma os codigos antigos do cadastro da empresa.
        """
        index: Dict[str, List[int]] = {}

        def add(code: str, product_id: int) -> None:
            ids = index.setdefault(code, [])
            if product_id not in ids:
                ids.append(product_id)

        for product_id, nome in conn.execute(
            "SELECT id, nome FROM produtos WHERE COALESCE(ativo, 1) = 1 ORDER BY id"
        ).fetchall():
            for code in extract_codes_from_name(nome, expand_family=False):
                add(code, int(product_id))
            # Modelo no nome (GT4594BNS): so vale quando a foto nao tem o codigo da peca.
            for token in re.split(r"[\s/,;()\[\]]+|\s+-\s+", str(nome or "").upper()):
                code = canonical_code(token.strip(" .-"))
                if _MODEL.match(code) and sum(ch.isdigit() for ch in code) >= 3:
                    add(code, int(product_id))
        try:
            rows = conn.execute(
                """
                SELECT pc.numero_norm, pc.produto_id
                FROM produto_codigos pc
                JOIN produtos p ON p.id = pc.produto_id
                WHERE pc.origem <> 'NOME' AND COALESCE(p.ativo, 1) = 1
                """
            ).fetchall()
        except Exception:
            rows = []
        for code, product_id in rows:
            add(str(code), int(product_id))
        return index

    def _products(self, product_ids: List[int], codes_by_product: Dict[int, str]) -> List[Dict]:
        if not product_ids:
            return []
        conn = self.db.get_connection()
        try:
            placeholders = ",".join("?" for _ in product_ids)
            names = {
                int(row[0]): str(row[1])
                for row in conn.execute(
                    f"SELECT id, nome FROM produtos WHERE id IN ({placeholders})", tuple(product_ids)
                ).fetchall()
            }
        finally:
            conn.close()
        return [
            {"id": product_id, "nome": names[product_id], "codigo_lido": codes_by_product.get(product_id)}
            for product_id in product_ids
            if product_id in names
        ]
