"""
Ferramentas de consulta do assistente de IA (Fase 1 do docs/PLANO_IA.md).

O modelo de linguagem nao consulta o banco sozinho: ele escolhe uma destas
ferramentas, o backend executa a busca (SQL deterministico) e devolve um JSON
enxuto. A resposta ao usuario e escrita so com o que voltou daqui, entao estas
funcoes sao a fonte da verdade sobre o que temos em estoque.

Todas sao somente leitura.
"""

from __future__ import annotations

import re
from collections import OrderedDict
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any, Callable, Dict, List, Optional, Tuple

from app.services.assistant_answer_format import (
    available_stock,
    display_code,
    format_application_answer,
    format_catalog_code_answer,
    format_code_answer,
    format_application_compact,
    format_code_compact,
    format_comparison_answer,
    format_movements_answer,
    short_applications,
    wants_core,
)
from app.services.assistant_common import (  # noqa: F401  (reexportados para quem ja importa daqui)
    CATEGORY_CORE,
    CATEGORY_TURBO,
    MATCH_CATALOG,
    MATCH_EXACT,
    MATCH_EXPERT_SAME,
    MATCH_EXPERT_SIMILAR,
    MATCH_FAMILY,
)
from app.services.assistant_knowledge_service import SOURCE_EXPERT, SOURCE_FAMILY, AssistantKnowledgeService
from core.catalog.company_register import SOURCE_CODE as REGISTER_SOURCE_CODE
from core.catalog.own_fichas import OWN_SOURCE_CODE
from core.catalog.normalization import (
    canonical_code,
    expand_family_codes,
    extract_codes_from_name,
    search_words,
)
from core.database.repositories.assistant_repository import AssistantRepository
from core.database.repositories.catalog_repository import CatalogRepository, MIN_PREFIX_SEARCH_LENGTH
from core.database.repositories.product_repository import ProductRepository
from core.exceptions import ValidationException

# Marcas com que a empresa trabalha. Referencias de outros fabricantes (OEM, Mahle,
# Master Power...) continuam valendo para a busca, mas nao aparecem nas respostas.
SERVED_BRANDS = ("GARRETT", "HOLSET", "BORGWARNER")
# Fichas da propria empresa (nao sao do catalogo Master Power).
COMPANY_SOURCES = (OWN_SOURCE_CODE, REGISTER_SOURCE_CODE)



@dataclass(frozen=True)
class ResultLimits:
    """Quanto cada ferramenta devolve. O modo compacto cabe em limites gratuitos (ex.: Groq)."""

    products: int = 15
    catalog_items: int = 12
    code_catalog_items: int = 5
    applications_per_item: int = 8
    detail_applications: int = 15
    refs_per_brand: int = 5


DEFAULT_LIMITS = ResultLimits()
COMPACT_LIMITS = ResultLimits(
    products=8, catalog_items=6, code_catalog_items=3, applications_per_item=3, detail_applications=6, refs_per_brand=3
)

# "Quanto saiu": saidas (vendas) dos ultimos dias, alem da ultima.
SALES_WINDOW_DAYS = 90

# Completar codigo pelo final ("988-7101"): so a partir de 6 digitos ("7101" bate com dezenas).
MIN_COMPLETION_LENGTH = 6
MAX_CODE_COMPLETIONS = 8

# Ordem na resposta: o que o especialista ensinou vale mais que o catalogo.
_MATCH_RANK = {MATCH_EXACT: 0, MATCH_FAMILY: 1, MATCH_EXPERT_SAME: 2, MATCH_EXPERT_SIMILAR: 3, MATCH_CATALOG: 4}

# Palavras da pergunta que nao ajudam a achar a aplicacao.
_STOPWORDS = {
    "A", "AS", "O", "OS", "E", "UM", "UMA", "DE", "DA", "DO", "DAS", "DOS", "PARA", "PRA", "PRO",
    "TEM", "TEMOS", "TENHO", "TENS", "QUAL", "QUAIS", "ESTOQUE", "NO", "NA",
    "TURBINA", "TURBINAS", "TURBO", "TURBOS", "TURBOCOMPRESSOR", "TURBOCOMPRESSORES",
    "CAMINHAO", "CAMINHOES", "ONIBUS", "MOTOR", "CV", "HP", "CAVALOS",
    "CONJUNTO", "CONJUNTOS", "CENTRAL", "CENTRAIS", "MIOLO", "CORE", "CHRA",
    # Palavras de conversa que aparecem em poucas aplicacoes ("Freightliner COM motor C12") e
    # por isso nao sao ignoradas sozinhas como as palavras que o catalogo nao tem.
    "COM", "SEM", "EM", "NOS", "NAS", "AO", "AOS", "POR", "PELO", "PELA", "QUE", "QUEM",
    "MEU", "MINHA", "SEU", "SUA", "ESSE", "ESSA", "ESTE", "ESTA", "ISSO", "AQUI",
    "OI", "OLA", "BOM", "BOA", "DIA", "TARDE", "NOITE", "ALGUM", "ALGUMA", "PRECISO", "PRECISA",
    "PECA", "PECAS", "CLIENTE", "VEICULO", "MODELO", "ANO",
    # Conversa e texto colado de uma resposta ("Não temos esse código, mas temos:" achava o OM 457LA
    # porque "NAO" aparece numa aplicacao).
    "NAO", "SIM", "MAS", "OU", "SE", "JA", "SO", "MAIS", "AINDA", "TAMBEM", "TB", "TMB", "VC", "VOCE",
    "CODIGO", "CODIGOS", "FAVOR", "OBRIGADO", "OBRIGADA", "TUDO", "NADA", "ENTAO", "PQ", "PORQUE",
    "COMO", "ONDE", "ALGUEM", "QUERO", "QUER", "TER", "TINHA", "TEMOS", "ESTA", "ESTAO", "SAO", "E",
    "MOMENTO", "AGORA", "HOJE", "OPCAO", "OPCOES",
}
# Motor Volvo: o chefe fala "D13", o catalogo escreve "D13" e "MD13".
_SYNONYMS_ENGINE_LETTER = {"D": ("D", "MD")}

# Apelidos de montadora -> palavras como aparecem no catalogo (qualquer uma serve).
_SYNONYMS = {
    "VW": ("VW", "VOLKSWAGEN"),
    "VOLKS": ("VOLKSWAGEN",),
    "MB": ("MB", "MERCEDES"),
    "MERCEDEZ": ("MERCEDES",),
    "CHEVROLET": ("CHEVROLET", "GM"),
    "CAT": ("CAT", "CATERPILLAR"),
    "MF": ("MF", "MASSEY"),
    "NH": ("NH", "HOLLAND"),
    "JD": ("JD", "DEERE"),
}

_PARENS = re.compile(r"\(([^)]*)\)")


def _is_year(term: str) -> bool:
    return len(term) == 4 and term.isdigit() and 1980 <= int(term) <= 2039


# Versao da turbina (o chefe pergunta "tem montada ou reman?").
VERSION_ORDER = ("nova", "reman", "montada")
_RX_IN_NAME = re.compile(r"\d{5,}\s*RX\b")
GARRETT_CODE_LENGTH = 10
GARRETT_BASE_LENGTH = 6
MAX_LOOKALIKES = 3


def _is_reman_code(code: str) -> bool:
    """Numero de reman da fabrica: BorgWarner 5327-990-xxxx / 90000..., Garrett 796155-9xxx."""
    if len(code) == 11 and code.isdigit():
        return code[4:7] in ("990", "991") or code.startswith("90000")
    if len(code) == 10 and code.isdigit():
        return code[6] == "9"
    return False


def product_condition(name: str, code: str) -> str:
    """'nova', 'reman' (Holset RX, BorgWarner 990, Garrett 9xxx) ou 'montada' (MONTADO no nome)."""
    upper = (name or "").upper()
    if "MONTAD" in upper:
        return "montada"
    if _RX_IN_NAME.search(upper) or "REMAN" in upper:
        return "reman"
    family = set(expand_family_codes([code]))
    if any(c in family and _is_reman_code(c) for c in extract_codes_from_name(name, expand_family=False)):
        return "reman"
    return "nova"


_YEAR_IN_TEXT = re.compile(r"(?<!\d)(19[89]\d|20[0-3]\d)(?!\d)")


def _year_range(text: str) -> Optional[Tuple[Optional[int], Optional[int]]]:
    """
    Anos em que a aplicacao vale, pelo texto do catalogo: 'A partir 2017' -> (2017, None),
    'Até final de 2018' -> (None, 2018), '2019 – 2023' -> (2019, 2023), '2011+' -> (2011, None).
    None quando o texto nao fala de ano.
    """
    upper = (text or "").upper().replace("É", "E")
    years = [int(y) for y in _YEAR_IN_TEXT.findall(upper)]
    if not years:
        return None
    low: Optional[int] = min(years)
    high: Optional[int] = max(years)
    if "PARTIR" in upper or "DESDE" in upper or re.search(r"(19|20)\d\d\s*\+", upper):
        high = None
    if re.search(r"\bATE\b", upper) and not re.search(r"(19|20)\d\d\s*(A|ATE|-|–)\s*(19|20)\d\d", upper):
        low = None
    return low, high


_EURO_IN_TEXT = re.compile(r"EURO\s*([1-6](?:\s*[,/e]\s*[1-6])*)")


def _euro_norms(terms: List[str]) -> Tuple[set, List[str]]:
    """Tira "EURO" + numero dos termos da pergunta e devolve as normas pedidas ({3})."""
    norms, rest, skip = set(), [], False
    for i, term in enumerate(terms):
        if skip:
            skip = False
            continue
        if term == "EURO" and i + 1 < len(terms) and terms[i + 1] in {"1", "2", "3", "4", "5", "6"}:
            norms.add(int(terms[i + 1]))
            skip = True
            continue
        rest.append(term)
    return norms, rest


def _euro_fits(app: Dict[str, Any], wanted: set) -> bool:
    """A aplicacao vale para a norma pedida? Sem norma escrita no catalogo: pode ser (fica)."""
    text = " ".join(str(app.get(k) or "") for k in ("veiculo", "motor", "complemento")).upper()
    found = {int(d) for group in _EURO_IN_TEXT.findall(text) for d in re.findall(r"[1-6]", group)}
    return not found or bool(found & wanted)


def _year_fits(app: Dict[str, Any], year: int) -> bool:
    """A aplicacao vale para esse ano? Sem ano no catalogo: pode ser (fica na lista)."""
    span = _year_range(" ".join(str(app.get(k) or "") for k in ("veiculo", "motor", "complemento")))
    if span is None:
        return True
    low, high = span
    return (low is None or year >= low) and (high is None or year <= high)


def _product_category(nome: str) -> str:
    upper = (nome or "").upper()
    return CATEGORY_CORE if ("CONJ" in upper or "CENTRAL" in upper or "MIOLO" in upper) else CATEGORY_TURBO


def _turbo_models(modelo: Optional[str]) -> Optional[str]:
    """'MP530w (HX55W HE500WG)' -> 'HX55W HE500WG' (o que vem antes e o modelo Master Power)."""
    if not modelo:
        return None
    match = _PARENS.search(modelo)
    return (match.group(1) if match else modelo).strip() or None


def _application_label(app: Dict[str, Any]) -> Dict[str, Any]:
    item = {
        "montadora": app.get("montadora"),
        "veiculo": app.get("veiculo"),
        "motor": app.get("motor"),
    }
    complemento = " ".join(str(app.get("complemento") or "").split())
    if complemento:
        item["obs"] = complemento
    return item


class AssistantToolsService:
    """Buscas que o assistente pode pedir. Cada metodo devolve um dict pronto para virar JSON."""

    def __init__(
        self,
        repository: Optional[AssistantRepository] = None,
        product_repository: Optional[ProductRepository] = None,
        catalog_repository: Optional[CatalogRepository] = None,
        limits: ResultLimits = DEFAULT_LIMITS,
        knowledge: Optional[AssistantKnowledgeService] = None,
    ) -> None:
        self.repository = repository or AssistantRepository()
        self.products = product_repository or ProductRepository()
        self.catalog = catalog_repository or CatalogRepository()
        self.limits = limits
        self.knowledge = knowledge or AssistantKnowledgeService(product_repository=self.products)

    def with_limits(self, limits: ResultLimits) -> "AssistantToolsService":
        """Mesmo servico (mesmos repositorios) com outros limites de tamanho."""
        return AssistantToolsService(self.repository, self.products, self.catalog, limits, self.knowledge)

    # ------------------------------------------------------------------
    # Ferramentas
    # ------------------------------------------------------------------

    def search_by_code(
        self, codigo: str, complete: bool = True, versions: Optional[List[str]] = None, location: Optional[str] = None
    ) -> Dict[str, Any]:
        """`versions`: o que a pessoa perguntou ("tem reman? montada?"); a resposta diz de cada uma."""
        typed = " ".join(str(codigo or "").split()).upper()
        # O modelo as vezes manda o codigo junto com texto ("HE200WG 3785294"): separa os codigos.
        codes_in_text = extract_codes_from_name(typed, expand_family=False)
        code = canonical_code(typed)
        other_codes: List[str] = []
        if codes_in_text and code not in codes_in_text:
            code, other_codes = codes_in_text[0], codes_in_text[1:]
            typed = next((t for t in typed.replace(",", " ").split() if canonical_code(t) == code), code)
        if len(code) < 4 or not any(ch.isdigit() for ch in code):
            raise ValidationException(
                "Codigo muito curto. Informe o numero da peca (ex.: 4031196, 466646-5041S)."
            )

        locations = self.repository.get_location_labels()
        if location:
            locations = {key: label for key, label in locations.items() if search_words(label) == search_words(location)}
            if not locations:
                raise ValidationException("Filial não identificada. Confirme o nome do local antes de consultar o saldo.")
        knowledge = self.knowledge.relations(code)
        blocked = knowledge["diferentes"]
        by_id: Dict[int, Dict[str, Any]] = {}
        for p in self.products.get_all(search_term=code, status="ATIVO"):
            match = self._code_match(code, p["nome"])
            # O especialista disse que nao serve: esconde o "equivalente pelo catalogo".
            if match == MATCH_CATALOG and blocked & set(extract_codes_from_name(p["nome"])):
                continue
            by_id[int(p["id"])] = {
                **self._product_summary(p, locations),
                "correspondencia": match,
                "condicao": product_condition(p["nome"], code),
            }

        # Codigos que o especialista ensinou como iguais ou similares.
        for relation, match in ((knowledge["iguais"], MATCH_EXPERT_SAME), (knowledge["similares"], MATCH_EXPERT_SIMILAR)):
            for item in relation:
                for p in self.products.get_all(search_term=item["codigo_norm"], status="ATIVO"):
                    if self._code_match(item["codigo_norm"], p["nome"]) not in (MATCH_EXACT, MATCH_FAMILY):
                        continue
                    current = by_id.get(int(p["id"]))
                    if current and _MATCH_RANK[current["correspondencia"]] <= _MATCH_RANK[match]:
                        continue
                    entry = {
                        **self._product_summary(p, locations),
                        "correspondencia": match,
                        "codigo_relacionado": item["codigo"],
                        "condicao": product_condition(p["nome"], item["codigo_norm"]),
                    }
                    if item.get("obs"):
                        entry["obs_especialista"] = item["obs"]
                    by_id[int(p["id"])] = entry

        # Montada pelo conjunto so vale para o proprio codigo, e a mesma peca nao aparece duas vezes:
        # o conjunto que ja aparece como montada sai da lista, a menos que o codigo seja o dele.
        own_matches = (MATCH_EXACT, MATCH_FAMILY)
        for product in list(by_id.values()):
            assembled = product.get("montada_no_conjunto")
            if not assembled:
                continue
            parent = by_id.get(assembled["id"])
            if product["correspondencia"] not in own_matches or (parent and parent["correspondencia"] in own_matches):
                product.pop("montada_no_conjunto")
            elif parent:
                by_id.pop(assembled["id"])

        products = sorted(
            by_id.values(), key=lambda p: (_MATCH_RANK[p["correspondencia"]], -available_stock(p), p["nome"])
        )
        # Dois turbos no mesmo conjunto (ex.: 4031196 e 4031196RX): a montada fica so no primeiro.
        cores_shown: set = set()
        for product in products:
            assembled = product.get("montada_no_conjunto")
            if assembled and assembled["id"] in cores_shown:
                product.pop("montada_no_conjunto")
            elif assembled:
                cores_shown.add(assembled["id"])

        catalog_ids = [int(row["id"]) for row in self.catalog.search_catalog(code, limit=self.limits.code_catalog_items)]
        family = expand_family_codes([code])
        catalog_items = self._catalog_items(catalog_ids, highlight=set(family))
        # De que fabricante e o codigo pesquisado em cada ficha ("é código OEM da turbina tal").
        brands: Dict[int, List[str]] = {}
        for ref in self.repository.get_reference_brands(catalog_ids, family):
            names = brands.setdefault(int(ref["catalogo_produto_id"]), [])
            if ref["fabricante"] not in names:
                names.append(ref["fabricante"])
        for item in catalog_items:
            if canonical_code(item["ficha"]) in family and not item["ficha_propria"]:
                item["e_o_codigo_da_ficha"] = True  # o proprio codigo Master Power
            item["codigo_pesquisado_e"] = brands.get(item["id"], [])
        applications = self._group_applications(self.repository.get_applications(catalog_ids))
        for item in catalog_items:
            apps = applications.get(item["id"], [])
            item["aplicacoes"] = [_application_label(a) for a in apps[:self.limits.applications_per_item]]
            if len(apps) > self.limits.applications_per_item:
                item["aplicacoes_omitidas"] = len(apps) - self.limits.applications_per_item

        result: Dict[str, Any] = {
            "codigo_pesquisado": code,
            "temos_em_estoque": any(available_stock(p) > 0 for p in products),
            "produtos": products[:self.limits.products],
        }
        if len(products) > self.limits.products:
            result["produtos_omitidos"] = len(products) - self.limits.products
        taught = [
            {"codigo": i["codigo"], "relacao": "igual", **({"obs": i["obs"]} if i.get("obs") else {})}
            for i in knowledge["iguais"]
        ] + [
            {"codigo": i["codigo"], "relacao": "similar", **({"obs": i["obs"]} if i.get("obs") else {})}
            for i in knowledge["similares"]
        ]
        if taught:
            result["conhecimento_especialista"] = taught
        result["fichas_catalogo"] = [self._public_item(i) for i in catalog_items]
        if other_codes:
            result["outros_codigos_no_texto"] = other_codes
            result["atencao"] = "O texto tinha mais de um codigo: pesquise cada um dos outros_codigos_no_texto."
        label = display_code(typed, garrett=self._is_garrett(code, products, catalog_items))

        # Nada com o codigo como veio: pode ser o final de um codigo ("988-7101" -> 5327-988-7101).
        if complete and not products and not catalog_items and not taught:
            full_codes = self._complete_code(code)
            chosen, alternatives = None, []
            if len(full_codes) == 1:
                chosen = full_codes[0]
            elif len(full_codes) > 1:
                # Varias familias terminam assim (K24/K27/K31...): se so uma e conhecida da empresa
                # (produto nosso ou regra do especialista), usa essa e avisa das outras.
                known = [c for c in full_codes if c in self.repository.known_codes(full_codes)]
                if len(known) == 1:
                    chosen, alternatives = known[0], [c for c in full_codes if c != known[0]]
            if chosen:
                resolved = self.search_by_code(chosen, complete=False, versions=versions, location=location)
                resolved["codigo_digitado"] = typed
                note = f"(Entendi *{label}* como *{chosen}*"
                if alternatives:
                    resolved["outros_codigos_possiveis"] = alternatives[:MAX_CODE_COMPLETIONS]
                    note += f"; também existem: {', '.join(self._code_labels(alternatives[:MAX_CODE_COMPLETIONS]))}"
                resolved["texto_pronto"] = f"{note}.)\n" + resolved["texto_pronto"]
                if other_codes:
                    resolved["outros_codigos_no_texto"] = other_codes
                return resolved
            if full_codes:
                shown = full_codes[:MAX_CODE_COMPLETIONS]
                result["codigos_possiveis"] = shown
                result["texto_pronto"] = (
                    f"*{label}*: achei mais de um código que termina assim: "
                    f"{', '.join(self._code_labels(shown))}. Qual deles?"
                )
                return result

        if versions:
            result["versoes_pedidas"] = [v for v in VERSION_ORDER if v in versions]
        if not products and not catalog_items and not taught:
            # Codigo falado e transcrito errado ("876271515151517" para a Garrett 876271-5017):
            # as turbinas Garrett nossas com o mesmo comeco.
            lookalikes = self._garrett_lookalikes(code, locations)
            if lookalikes:
                result["parecidos"] = lookalikes
        result["texto_pronto"] = format_code_answer(label, result)
        compact = format_code_compact(label, result, list(locations.values()))
        if compact:
            result["texto_compacto"] = compact  # formato do chefe no WhatsApp
        full_codes = sorted({candidate for product in products
                             for candidate in extract_codes_from_name(product["nome"], expand_family=False)
                             if candidate.startswith(code) and len(candidate) > len(code)})
        families = {tuple(sorted(expand_family_codes([candidate]))) for candidate in full_codes}
        exact = any(code in extract_codes_from_name(product["nome"], expand_family=False) for product in products)
        if len(families) > 1 and not exact:
            result["codigo_incompleto"] = True
            result["codigos_possiveis"] = full_codes[:20]
            result["texto_pronto"] = (f"*{label}*: encontrei peças diferentes com esse início: "
                + ", ".join(display_code(candidate) for candidate in full_codes[:20])
                + ". Qual é o código completo? Não somei os saldos dessas peças.")
            result.pop("texto_compacto", None)
        return result

    def _garrett_lookalikes(self, code: str, locations: Dict[int, str]) -> List[Dict[str, Any]]:
        """
        Nossas turbinas Garrett (base de 6 digitos + 4) com o mesmo comeco de um numero que nao
        existe e e comprido demais para ser Garrett. A base Garrett e o modelo da turbina, entao o
        mesmo comeco e um bom palpite; para os outros fabricantes nao e (todo K27 comeca igual).
        """
        if not code.isdigit() or len(code) <= GARRETT_CODE_LENGTH:
            return []
        rows = self.knowledge.repository.product_codes_with_prefix(code[:GARRETT_BASE_LENGTH], GARRETT_CODE_LENGTH)
        by_product: Dict[int, str] = {}
        for row in rows:
            by_product.setdefault(int(row["produto_id"]), row["numero_norm"])
        out = []
        for product in self.products.get_by_ids(list(by_product)):
            if not product.get("ativo", 1):
                continue
            summary = self._product_summary(product, locations)
            out.append({**summary, "codigo_parecido": display_code(by_product[int(product["id"])], garrett=True)})
        out.sort(key=lambda p: (-p["estoque_total"], p["nome"]))
        return out[:MAX_LOOKALIKES]

    @staticmethod
    def _is_garrett(code: str, products: List[Dict[str, Any]], catalog_items: List[Dict[str, Any]]) -> bool:
        """O codigo e Garrett (mostra com hifen, 796155-5002)? Pelo nome do nosso produto ou pelo catalogo."""
        if len(code) != 10 or not code.isdigit():
            return False
        if any(f"{code[:6]}-{code[6:]}" in str(p.get("nome") or "") for p in products):
            return True
        return any(
            canonical_code(number) == code
            for item in catalog_items
            for number in (item.get("referencias") or {}).get("GARRETT", [])
        )

    def _code_labels(self, codes: List[str]) -> List[str]:
        """'53279887101 (K27)': o modelo da turbina pela ficha do catalogo, quando houver."""
        labels = []
        for candidate in codes:
            rows = self.catalog.search_catalog(candidate, limit=1)
            model = _turbo_models(rows[0].get("modelo")) if rows else None
            first = model.replace("/", " ").split()[0] if model else None
            labels.append(f"{candidate} ({first})" if first else candidate)
        return labels

    def _complete_code(self, code: str) -> List[str]:
        """Codigos completos que terminam com `code` (uma entrada por familia nova/reman)."""
        if len(code) < MIN_COMPLETION_LENGTH or not code.isdigit():
            return []
        seen: set = set()
        out: List[str] = []
        for candidate in self.repository.codes_ending_with(code):
            if candidate in seen:
                continue
            seen |= set(expand_family_codes([candidate]))
            out.append(candidate)
        return out

    def compare_codes(self, codigo_a: str, codigo_b: str) -> Dict[str, Any]:
        """"A e B sao a mesma peca?": responde a pergunta, nao o estoque."""
        typed = [" ".join(str(c or "").split()).upper() for c in (codigo_a, codigo_b)]
        codes = [canonical_code(t) for t in typed]
        for raw, code in zip(typed, codes):
            if len(code) < 4 or not any(ch.isdigit() for ch in code):
                raise ValidationException(f"Codigo invalido: {raw!r}. Informe os numeros das duas pecas.")
        relation = self.knowledge.relation_between(codes[0], codes[1])
        labels = [display_code(t) for t in typed]
        result: Dict[str, Any] = {
            "codigo_pesquisado": codes[0],
            "outro_codigo": codes[1],
            "relacao": relation["relacao"],
            "fonte": relation["fonte"],
        }
        catalog = []
        if relation["fonte"] not in (SOURCE_FAMILY, SOURCE_EXPERT):
            # O especialista ainda nao disse: o que o catalogo sabe de cada um ajuda a decidir.
            for code, label in zip(codes, labels):
                rows = self.catalog.search_catalog(code, limit=1)
                if not rows:
                    catalog.append(f"• {label}: não está no catálogo")
                    continue
                apps = self._group_applications(self.repository.get_applications([int(rows[0]["id"])]))
                item = {"aplicacoes": [_application_label(a) for a in apps.get(int(rows[0]["id"]), [])]}
                model = _turbo_models(rows[0].get("modelo")) or rows[0].get("codigo")
                uses = short_applications(item)
                catalog.append(f"• {label}: {model}" + (f" — {uses}" if uses else ""))
            family = self._same_catalog_model(codes[0], codes[1])
            if family and relation["fonte"] != "cadastro":
                result["mesmo_modelo_catalogo"] = family
                relation = {**relation, "relacao": "mesmo_modelo", "modelo": family}
        result["texto_pronto"] = format_comparison_answer(labels[0], labels[1], relation, catalog)
        return result

    def _same_catalog_model(self, code_a: str, code_b: str) -> Optional[str]:
        """
        Fichas diferentes do catalogo, mas do mesmo modelo Master Power e da mesma turbina
        (4031196 na 805314 e 5455609 na 808191, as duas "MP530w (HE500WG)"): provavelmente servem.
        Devolve "MP530w / HE500WG", ou None. "MP530" e "MP530w" sao modelos diferentes.
        """
        def models(code: str) -> List[Tuple[str, set]]:
            found = []
            for row in self.catalog.search_catalog(code, limit=10):
                text = str(row.get("modelo") or "")
                master = text.partition("(")[0].strip().upper()
                turbos = set(re.findall(r"[A-Z]+\d+[A-Z0-9]*", (_turbo_models(text) or "").upper()))
                if master and turbos:
                    found.append((master, turbos))
            return found

        for master_a, turbos_a in models(code_a):
            for master_b, turbos_b in models(code_b):
                shared = sorted(turbos_a & turbos_b)
                if master_a == master_b and shared:
                    # "MP530W" -> "MP530w", como o catalogo escreve
                    return f"{master_a[:2]}{master_a[2:].lower()} / {' / '.join(shared)}"
        return None

    def _our_products_for_code(self, code: str) -> List[Dict[str, Any]]:
        """Nossos produtos (ativos e inativos) com o codigo ou a versao nova/reman dele."""
        return [
            p
            for p in self.products.get_all(search_term=code, status="TODOS")
            if self._code_match(code, p["nome"]) in (MATCH_EXACT, MATCH_FAMILY)
        ]

    @staticmethod
    def _checked_code(codigo: str) -> Tuple[str, str]:
        typed = " ".join(str(codigo or "").split()).upper()
        codes = extract_codes_from_name(typed, expand_family=False)
        code = codes[0] if codes else canonical_code(typed)
        if len(code) < 4 or not any(ch.isdigit() for ch in code):
            raise ValidationException("Codigo muito curto. Informe o numero da peca (ex.: 4031196, 409300-5031).")
        typed = next((t for t in re.split(r"[\s,;/()]+", typed) if canonical_code(t) == code), code)
        return code, typed

    def product_movements(self, codigo: str, today: Optional[date] = None) -> Dict[str, Any]:
        """Ultima saida, entrada e transferencia do codigo (e da versao nova/reman), e quanto saiu."""
        code, typed = self._checked_code(codigo)
        products = self._our_products_for_code(code)
        rows = self.repository.get_movements([int(p["id"]) for p in products])
        # Estorno desfaz um lancamento errado: nao e "a ultima vez que saiu".
        rows = [r for r in rows if str(r.get("natureza") or "").upper() != "ESTORNO"]
        today = today or date.today()
        since = (today - timedelta(days=SALES_WINDOW_DAYS)).isoformat()
        sales = [r for r in rows if r["tipo"] == "SAIDA" and str(r.get("natureza") or "OPERACAO_NORMAL") == "OPERACAO_NORMAL"]
        result: Dict[str, Any] = {
            "codigo_pesquisado": code,
            "produtos_cadastrados": [p["nome"] for p in products],
            "ultimas": {
                kind: next(({k: v for k, v in r.items() if k != "id"} for r in rows if r["tipo"] == kind), None)
                for kind in ("SAIDA", "ENTRADA", "TRANSFERENCIA")
            },
            "saidas_ultimos_dias": sum(int(r["quantidade"] or 0) for r in sales if str(r["data_hora"]) >= since),
            "saidas_total": sum(int(r["quantidade"] or 0) for r in sales),
            "registros_desde": self.repository.first_movement_date(),
        }
        result["texto_pronto"] = format_movements_answer(display_code(typed), result, SALES_WINDOW_DAYS)
        return result

    def catalog_code(self, codigo: str) -> Dict[str, Any]:
        """Codigo Master Power (ficha do catalogo) de uma peca: pela referencia ou pelo vinculo do nosso produto."""
        code, typed = self._checked_code(codigo)
        ids: List[int] = []
        for variant in expand_family_codes([code]):
            for row in self.catalog.search_catalog(variant, limit=5):
                if int(row["id"]) not in ids:
                    ids.append(int(row["id"]))
        products = [p for p in self._our_products_for_code(code) if p.get("ativo", 1)]
        for link in self.repository.get_product_catalog_ids([int(p["id"]) for p in products]):
            if int(link["catalogo_produto_id"]) not in ids:
                ids.append(int(link["catalogo_produto_id"]))
        # So o catalogo Master Power: a ficha propria e o cadastro da empresa nao tem codigo Master Power.
        rows = {
            int(r["id"]): r for r in self.repository.get_catalog_products(ids) if r.get("fonte") not in COMPANY_SOURCES
        }
        fichas = [
            {
                "codigo": rows[i]["codigo"],
                "modelo": rows[i].get("modelo"),
                "tipo": CATEGORY_CORE if "CONJUNTO" in str(rows[i].get("grupo") or "").upper() else CATEGORY_TURBO,
            }
            for i in ids
            if i in rows
        ]
        fichas.sort(key=lambda f: 0 if f["tipo"] == CATEGORY_TURBO else 1)  # a turbina antes do conjunto central
        result = {"codigo_pesquisado": code, "fichas_master_power": fichas}
        result["texto_pronto"] = format_catalog_code_answer(display_code(typed), fichas)
        return result

    def search_by_application(self, texto: str) -> Dict[str, Any]:
        terms = [w for w in search_words(texto) if w not in _STOPWORDS]
        # "Euro 3" e filtro, nao palavra obrigatoria: tira a aplicacao so de outra norma (Euro 5) e
        # mantem a que nao diz a norma ("MD13 (A partir 2017)").
        euro, terms = _euro_norms(terms)
        if not terms:
            raise ValidationException(
                "Informe a montadora, o modelo do veiculo ou o motor (ex.: 'scania 440', 'volvo fh 460', 'om 366')."
            )
        indexed: List[Tuple[Dict[str, Any], set]] = []
        vocabulary: set = set()
        for app in self.repository.list_applications():
            words = set(
                search_words(
                    " ".join(str(app.get(k) or "") for k in ("montadora", "veiculo", "motor", "complemento"))
                )
            )
            indexed.append((app, words))
            vocabulary |= words

        # Palavra (so letras) que nao existe em nenhuma aplicacao ("com", "meu", "tio") e ignorada.
        # Numero desconhecido continua obrigatorio ("scania 999" nao vira "qualquer Scania").
        # Ano ("dc13 2015") quase nunca esta escrito na aplicacao: vira filtro opcional, usado
        # so se alguma aplicacao tiver aquele numero (ex.: Axor 2035 continua funcionando).
        synonyms = {**_SYNONYMS, **_SYNONYMS_ENGINE_LETTER}
        ignored = [t for t in terms if t.isalpha() and not (set(synonyms.get(t, (t,))) & vocabulary)]
        known = [t for t in terms if t not in ignored]
        if known and all(_is_year(t) for t in known):
            # So o ano ("2015"), sem veiculo nem motor: acharia qualquer aplicacao daquele ano.
            raise ValidationException("Informe o veiculo ou o motor junto com o ano (ex.: 'volvo fh 2015').")
        required = [t for t in known if not _is_year(t)] or known
        optional = [t for t in known if t not in required]
        alternatives = [set(synonyms.get(term, (term,))) for term in required]

        def matching(alts: List[set]) -> List[Tuple[Dict[str, Any], set]]:
            return [(app, words) for app, words in indexed if alts and all(o & words for o in alts)]

        year_outside: Optional[str] = None
        candidates = matching(alternatives)
        # Nenhuma aplicacao tem todas as palavras ("scania SUPER r460": "super" nao esta no
        # catalogo junto com R 460): tira a palavra (so letras) que impede, uma por vez, ficando
        # com a busca mais especifica. Numero nunca sai ("scania 999" nao vira "qualquer Scania"), nem a
        # montadora, nem a letra da linha ("R" 440 nao vira G 440).
        brands = set() if candidates else {w for a, _ in indexed for w in search_words(str(a.get("montadora") or ""))}
        while not candidates:
            options = []
            for index, term in enumerate(required):
                if term.isalpha() and len(term) > 2 and term not in brands and len(required) > 1:
                    rest = alternatives[:index] + alternatives[index + 1 :]
                    found = matching(rest)
                    if found:
                        options.append((len(found), index, found))
            if not options:
                break
            _, index, candidates = min(options, key=lambda o: o[0])
            ignored.append(required.pop(index))
            alternatives.pop(index)
        if euro:
            candidates = [(app, words) for app, words in candidates if _euro_fits(app, euro)]
        for term in optional:
            # Ano: vale o que o catalogo diz ("A partir 2017", "Até final de 2018", "2019 – 2023");
            # aplicacao sem ano continua na lista.
            # Senao, o numero pode ser parte do modelo (Axor 2035).
            by_year = [(app, words) for app, words in candidates if _year_fits(app, int(term))]
            by_word = [(app, words) for app, words in candidates if term in words]
            if by_year and len(by_year) < len(candidates):
                candidates = by_year
            elif by_word:
                candidates = by_word
            else:
                ignored.append(term)
                if _is_year(term) and candidates and not by_year:
                    year_outside = term  # "2023" e o catalogo so tem ate 2015: avisa na resposta

        matched: "OrderedDict[int, List[Dict[str, Any]]]" = OrderedDict()
        for app, _ in candidates:
            matched.setdefault(int(app["catalogo_produto_id"]), []).append(app)

        catalog_items = self._catalog_items(list(matched.keys()))
        self._attach_our_products(catalog_items)
        for item in catalog_items:
            apps = self._dedupe_applications(matched[item["id"]])
            item["aplicacoes"] = [_application_label(a) for a in apps[:self.limits.applications_per_item]]
            if len(apps) > self.limits.applications_per_item:
                item["aplicacoes_omitidas"] = len(apps) - self.limits.applications_per_item

        catalog_items.sort(
            key=lambda i: (
                -sum(available_stock(p) for p in i["nossos_produtos"]),
                0 if i["nossos_produtos"] else 1,
                0 if i["atendemos_marca"] else 1,
                0 if i["tipo"] == CATEGORY_TURBO else 1,
                i["ficha"],
            )
        )

        result: Dict[str, Any] = {"termos_usados": [t for t in terms if t not in ignored]}
        if ignored:
            result["termos_ignorados"] = ignored
        if year_outside:
            result["ano_fora_do_catalogo"] = year_outside
            result["obs_termos_ignorados"] = "Palavras que nao aparecem nas aplicacoes do catalogo; a busca seguiu sem elas."
        result["total_fichas"] = len(catalog_items)
        # Aviso explicito no resultado: modelos menores seguem melhor isso do que o prompt.
        turbo_options = [i for i in catalog_items if i["atendemos_marca"] and i["tipo"] == CATEGORY_TURBO]
        if len(turbo_options) > 1:
            engines = {
                str(((i.get("aplicacoes") or [{}])[0]).get("motor") or "").strip().upper() for i in turbo_options
            }
            differs = "o motor" if len(engines) > 1 else "o ano ou o veiculo"
            result["atencao"] = (
                f"Ha {len(turbo_options)} turbinas diferentes para essa aplicacao (mudam conforme {differs}). "
                "Nao responda so 'sim': use o texto_pronto, que lista as opcoes."
            )
        result["temos_em_estoque"] = any(available_stock(p) > 0 for i in catalog_items for p in i["nossos_produtos"])
        result["fichas_catalogo"] = [self._public_item(i) for i in catalog_items[: self.limits.catalog_items]]
        if len(catalog_items) > self.limits.catalog_items:
            result["fichas_omitidas"] = len(catalog_items) - self.limits.catalog_items
            result["dica"] = "Muitos resultados: peca ao usuario o motor, o ano ou o modelo exato."
        if not catalog_items:
            result["dica"] = "Nada encontrado com todas as palavras. Tente com menos palavras ou so o motor."
        result["texto_pronto"] = format_application_answer(result, wants_core(texto))
        compact = format_application_compact(
            result, wants_core(texto), list(self.repository.get_location_labels().values())
        )
        if compact:
            result["texto_compacto"] = compact  # formato do chefe no WhatsApp
        return result

    def product_details(self, produto_id: int) -> Dict[str, Any]:
        product = self.products.get_by_id(int(produto_id))
        if not product:
            raise ValidationException(f"Produto {produto_id} nao encontrado.")

        summary = self._product_summary(product, self.repository.get_location_labels())
        summary["ativo"] = bool(product.get("ativo", 1))
        if product.get("observacao"):
            summary["observacao"] = str(product["observacao"])[:300]

        catalog_ids = [int(r["catalogo_produto_id"]) for r in self.repository.get_product_catalog_ids([product["id"]])]
        catalog_items = self._catalog_items(catalog_ids, highlight=set(extract_codes_from_name(product["nome"])))
        applications = self._group_applications(self.repository.get_applications(catalog_ids))
        for item in catalog_items:
            apps = applications.get(item["id"], [])
            item["aplicacoes"] = [_application_label(a) for a in apps[: self.limits.detail_applications]]
            if len(apps) > self.limits.detail_applications:
                item["aplicacoes_omitidas"] = len(apps) - self.limits.detail_applications
        summary["fichas_catalogo"] = [self._public_item(i) for i in catalog_items]
        return summary

    # ------------------------------------------------------------------
    # Execucao por nome (usado pelo modelo de linguagem)
    # ------------------------------------------------------------------

    def run_tool(self, name: str, arguments: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        """Executa uma ferramenta pelo nome. Erros voltam como {'erro': ...} para o modelo ler."""
        handlers: Dict[str, Callable[[Dict[str, Any]], Dict[str, Any]]] = {
            "buscar_por_codigo": lambda a: self.search_by_code(str(a["codigo"]), versions=a.get("versoes"), location=a.get("local")),
            "buscar_por_aplicacao": lambda a: self.search_by_application(str(a["texto"])),
            "detalhe_produto": lambda a: self.product_details(int(a["produto_id"])),
            "comparar_codigos": lambda a: self.compare_codes(str(a["codigo_a"]), str(a["codigo_b"])),
            "movimentacoes_produto": lambda a: self.product_movements(str(a["codigo"])),
            "codigo_master_power": lambda a: self.catalog_code(str(a["codigo"])),
        }
        handler = handlers.get(name)
        if handler is None:
            return {"erro": f"Ferramenta desconhecida: {name}"}
        try:
            return handler(arguments or {})
        except KeyError as exc:
            return {"erro": f"Parametro obrigatorio ausente: {exc.args[0]}"}
        except (TypeError, ValueError):
            return {"erro": "Parametro invalido."}
        except ValidationException as exc:
            return {"erro": str(exc)}

    # ------------------------------------------------------------------
    # Montagem das respostas
    # ------------------------------------------------------------------

    @staticmethod
    def _product_summary(product: Dict[str, Any], locations: Dict[int, str]) -> Dict[str, Any]:
        stock: Dict[str, int] = {}
        for location_id, qty in (product.get("inventories") or {}).items():
            qty = int(qty or 0)
            if qty and int(location_id) in locations:
                stock[locations[int(location_id)]] = qty
        summary = {
            "id": int(product["id"]),
            "nome": product["nome"],
            "categoria": _product_category(product["nome"]),
            "estoque_total": sum(stock.values()),
            "estoque_por_local": stock,
        }
        # Turbo montado faturado pelo conjunto central: o saldo e do conjunto (o pai do vinculo).
        # Vai a parte, para nao somar no estoque_total do turbo.
        parent_stock: Dict[str, int] = {}
        for location_id, qty in (product.get("produto_vinculado_inventories") or {}).items():
            qty = int(qty or 0)
            if qty and int(location_id) in locations:
                parent_stock[locations[int(location_id)]] = qty
        parent_name = product.get("produto_vinculado_nome") or ""
        if (
            product.get("produto_vinculado_id")
            and parent_stock
            and summary["categoria"] == CATEGORY_TURBO
            and _product_category(parent_name) == CATEGORY_CORE
        ):
            summary["montada_no_conjunto"] = {
                "id": int(product["produto_vinculado_id"]),
                "nome": parent_name,
                "estoque_total": sum(parent_stock.values()),
                "estoque_por_local": parent_stock,
            }
        return summary

    @staticmethod
    def _code_match(code: str, nome: str) -> str:
        own = extract_codes_from_name(nome, expand_family=False)
        prefix_ok = len(code) >= MIN_PREFIX_SEARCH_LENGTH
        if any(c == code or (prefix_ok and c.startswith(code)) for c in own):
            return MATCH_EXACT
        family = set(expand_family_codes([code])) - {code}
        if any(c in family for c in extract_codes_from_name(nome)):
            return MATCH_FAMILY
        if code in canonical_code(nome):
            return MATCH_EXACT
        return MATCH_CATALOG

    def _catalog_items(self, catalog_ids: List[int], highlight: Optional[set] = None) -> List[Dict[str, Any]]:
        """Resumo das fichas. Referencias em `highlight` (o codigo pesquisado) vem primeiro."""
        if not catalog_ids:
            return []
        rows = {int(r["id"]): r for r in self.repository.get_catalog_products(catalog_ids)}
        refs: Dict[int, Dict[str, List[str]]] = {}
        references = self.repository.get_references(catalog_ids, SERVED_BRANDS)
        if highlight:
            references.sort(key=lambda r: 0 if canonical_code(r["numero"]) in highlight else 1)
        for ref in references:
            by_brand = refs.setdefault(int(ref["catalogo_produto_id"]), {})
            numbers = by_brand.setdefault(ref["fabricante"], [])
            if ref["numero"] not in numbers:
                numbers.append(ref["numero"])

        items = []
        for cp_id in catalog_ids:
            row = rows.get(cp_id)
            if not row:
                continue
            brand_refs = refs.get(cp_id, {})
            items.append(
                {
                    "id": cp_id,
                    "ficha": row["codigo"],
                    "tipo": CATEGORY_CORE if "CONJUNTO" in str(row.get("grupo") or "").upper() else CATEGORY_TURBO,
                    "modelo": _turbo_models(row.get("modelo")),
                    "modelo_master_power": str(row.get("modelo") or "").partition("(")[0].strip() or None,
                    "ficha_propria": row.get("fonte") in COMPANY_SOURCES,
                    "cadastro_empresa": row.get("fonte") == REGISTER_SOURCE_CODE,
                    "atendemos_marca": bool(brand_refs),
                    "referencias": {
                        brand: numbers[:self.limits.refs_per_brand] for brand, numbers in brand_refs.items()
                    },
                }
            )
        return items

    def _attach_our_products(self, items: List[Dict[str, Any]]) -> None:
        links = self.repository.get_linked_product_ids([i["id"] for i in items])
        product_ids = sorted({int(link["produto_id"]) for link in links})
        locations = self.repository.get_location_labels()
        products = {
            int(p["id"]): self._product_summary(p, locations) for p in self.products.get_by_ids(product_ids)
        }
        by_item: Dict[int, List[Dict[str, Any]]] = {}
        for link in links:
            summary = products.get(int(link["produto_id"]))
            if summary:
                by_item.setdefault(int(link["catalogo_produto_id"]), []).append(summary)
        for item in items:
            ours = by_item.get(item["id"], [])
            ours.sort(key=lambda p: (-p["estoque_total"], -available_stock(p), p["nome"]))
            item["nossos_produtos"] = ours

    @staticmethod
    def _group_applications(rows: List[Dict[str, Any]]) -> Dict[int, List[Dict[str, Any]]]:
        grouped: Dict[int, List[Dict[str, Any]]] = {}
        for row in rows:
            grouped.setdefault(int(row["catalogo_produto_id"]), []).append(row)
        return {k: AssistantToolsService._dedupe_applications(v) for k, v in grouped.items()}

    @staticmethod
    def _dedupe_applications(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        seen = set()
        out = []
        for row in rows:
            key = (row.get("montadora"), row.get("veiculo"), row.get("motor"), row.get("complemento"))
            if key not in seen:
                seen.add(key)
                out.append(row)
        return out

    @staticmethod
    def _public_item(item: Dict[str, Any]) -> Dict[str, Any]:
        """Tira o id interno da ficha (o modelo usa o codigo da ficha, nao o id)."""
        return {k: v for k, v in item.items() if k != "id"}


# Definicao das ferramentas para o modelo de linguagem (formato tool use: name,
# description, input_schema). As descricoes sao as instrucoes que o modelo le.
ASSISTANT_TOOLS: List[Dict[str, Any]] = [
    {
        "name": "buscar_por_codigo",
        "description": (
            "Procura no estoque pelo codigo de UMA peca (um codigo por chamada): numero Holset, Garrett, "
            "BorgWarner, codigo OEM da montadora ou Master Power, como o usuario escreveu (com hifen, "
            "sufixo S ou RX). Devolve 'texto_pronto' (a resposta pronta para enviar ao usuario) e os dados: "
            "nossos produtos com estoque por local e a correspondencia ('exato', 'familia' = versao "
            "nova/reman, 'igual_especialista' / 'similar_especialista' = ensinado pelo especialista, "
            "'equivalente_catalogo'), o conhecimento do especialista e as fichas do catalogo."
        ),
        "strict": True,
        "input_schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "codigo": {"type": "string", "description": "Codigo da peca, ex.: 4031196, 466646-5041S, 53279887116."}
            },
            "required": ["codigo"],
        },
    },
    {
        "name": "buscar_por_aplicacao",
        "description": (
            "Procura turbinas pela aplicacao: montadora, modelo do veiculo ou maquina, potencia e/ou motor "
            "(ex.: 'scania 440', 'volvo fh 460', 'mercedes om 366', 'dc13'). Devolve 'texto_pronto' (a "
            "resposta pronta para enviar: lista as opcoes por motor/ano, com nossos produtos e estoque) e os "
            "dados de cada ficha. Se nada voltar, tente de novo com menos palavras. So encontra produtos "
            "ligados a uma ficha do catalogo."
        ),
        "strict": True,
        "input_schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "texto": {"type": "string", "description": "Montadora, modelo e/ou motor, ex.: 'scania r 440 dc13'."}
            },
            "required": ["texto"],
        },
    },
    {
        "name": "comparar_codigos",
        "description": (
            "Responde se duas pecas sao a mesma ('a 53279887101 e igual a 53279887210?', 'serve no lugar?', "
            "'e equivalente?'): o que o especialista ensinou (igual, similar, diferente), o cadastro e o "
            "catalogo. Nao fala de estoque. Devolve 'texto_pronto' (a resposta pronta para enviar)."
        ),
        "strict": True,
        "input_schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "codigo_a": {"type": "string", "description": "Primeiro codigo, como o usuario escreveu."},
                "codigo_b": {"type": "string", "description": "Segundo codigo, como o usuario escreveu."},
            },
            "required": ["codigo_a", "codigo_b"],
        },
    },
    {
        "name": "movimentacoes_produto",
        "description": (
            "Historico de movimentacoes de uma peca pelo codigo: ultima saida (venda), ultima entrada, ultima "
            "transferencia (data, quantidade, local, nota) e quanto saiu nos ultimos 90 dias. Use para 'quando "
            "saiu?', 'quando vendemos?', 'quando chegou?', 'quantas saíram?'. Devolve 'texto_pronto'."
        ),
        "strict": True,
        "input_schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {"codigo": {"type": "string", "description": "Codigo da peca, ex.: 409300-5031."}},
            "required": ["codigo"],
        },
    },
    {
        "name": "codigo_master_power",
        "description": (
            "Codigo Master Power (ficha do catalogo) de uma peca: 'qual o codigo master power da 409300-5031?'. "
            "Devolve 'texto_pronto'."
        ),
        "strict": True,
        "input_schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {"codigo": {"type": "string", "description": "Codigo da peca, ex.: 409300-5031."}},
            "required": ["codigo"],
        },
    },
    {
        "name": "detalhe_produto",
        "description": (
            "Detalhes de um produto nosso pelo id (que vem nas outras buscas): estoque por local, "
            "observacao e todas as fichas do catalogo ligadas a ele, com referencias e aplicacoes."
        ),
        "strict": True,
        "input_schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {"produto_id": {"type": "integer"}},
            "required": ["produto_id"],
        },
    },
]


# Ferramentas que nao vao para o cliente no WhatsApp: historico de vendas/entradas e interno.
WHATSAPP_BLOCKED_TOOLS = frozenset({"movimentacoes_produto"})


def tool_definitions(tools: Any = None) -> List[Dict[str, Any]]:
    """As ferramentas que o modelo pode ver, sem as bloqueadas para este canal (`blocked_tools`)."""
    blocked = getattr(tools, "blocked_tools", None) or ()
    return [tool for tool in ASSISTANT_TOOLS if tool["name"] not in blocked]
