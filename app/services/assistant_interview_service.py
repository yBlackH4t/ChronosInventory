"""
Modo entrevista: a IA pergunta ao especialista o que ela nao sabe, todo dia (2.7.17).

Com uma equipe pequena, pouca gente pergunta e pouca coisa chega ao "Para revisar". Entao a
propria IA escolhe algumas duvidas por dia (5 por padrao) e pergunta ao dono, no app (Assistente >
Admin > Perguntas do dia) e na conversa "Mensagem para mim" do WhatsApp. As duvidas saem de:

1. codigos perguntados que ela nao soube responder ("Para revisar");
2. dois produtos nossos na mesma ficha Master Power (a mesma ficha NAO quer dizer "igual");
3. o nome de um produto nosso que junta dois codigos ("53279907101/7210");
4. uma aplicacao do catalogo de uma peca nossa (o catalogo tem aplicacoes erradas).

Vem primeiro o que tem estoque e o que mais sai. A resposta usa o que ja existe: igual, similar e
diferente viram regra do especialista (AssistantTeachService), "nao temos" conclui o codigo do
"Para revisar" e "nao vai" marca a aplicacao como "Não se aplica". Nada de saldo e aprendido aqui:
o saldo continua vindo do banco. "Nao sei" tira a pergunta por 30 dias.

As perguntas ficam no assistente_historico.db (desta maquina, fora da base oficial); o que se
aprende viaja para as outras maquinas junto com o conhecimento.
"""

from __future__ import annotations

import json
import logging
import re
import sqlite3
from datetime import datetime, timedelta
from typing import Any, Callable, Dict, Iterable, List, Optional, Set, Tuple

from app.services.assistant_answer_format import display_code
from app.services.assistant_config_store import AssistantConfigStore
from app.services.assistant_knowledge_service import (
    _as_written,
    _family,
    _is_part_number,
    codes_cited_in_name,
)
from app.services.assistant_teach_service import parse_teach_reply
from core.catalog.normalization import canonical_code, extract_codes_from_name, search_words
from core.exceptions import ValidationException

LOG = logging.getLogger(__name__)

SECTION = "entrevista"
DEFAULT_HOUR = "09:00"
DEFAULT_COUNT = 5
MAX_COUNT = 10
MAX_PER_KIND = 2  # variedade: no maximo 2 do mesmo tipo por dia, se houver dos outros
UNSURE_DAYS = 30
SALES_DAYS = 180
TOP_PRODUCTS = 300  # so as pecas que mais importam entram na busca de duvidas
_HOUR = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")

KIND_REVIEW_PAIR = "revisar_par"  # perguntaram A e o cadastro/a pergunta sugere B
KIND_REVIEW_OPEN = "revisar"  # perguntaram A e nao ha sugestao: qual codigo nosso serve?
KIND_FICHA = "ficha"  # dois produtos nossos na mesma ficha Master Power
KIND_REGISTRY = "cadastro"  # o nome de um produto nosso junta dois codigos
KIND_APPLICATION = "aplicacao"  # uma aplicacao do catalogo de uma peca nossa
PAIR_KINDS = (KIND_REVIEW_PAIR, KIND_FICHA, KIND_REGISTRY)

STATE_PENDING = "pendente"
STATE_WAITING = "aguardando"  # respondida no WhatsApp, espera o /confirmar com o PIN
STATE_ANSWERED = "respondida"
STATE_UNSURE = "nao_sei"
STATE_DROPPED = "descartada"  # ja se sabia (os dados da empresa ligam o par); nao aparece mais

ANSWER_SAME, ANSWER_SIMILAR, ANSWER_DIFFERENT = "igual", "similar", "diferente"
ANSWER_UNSURE = "nao_sei"
ANSWER_NOT_STOCKED = "nao_temos"
ANSWER_YES, ANSWER_NO = "sim", "nao"

OPTIONS: Dict[str, List[Tuple[str, str]]] = {
    "par": [(ANSWER_SAME, "Igual"), (ANSWER_SIMILAR, "Similar"), (ANSWER_DIFFERENT, "Diferente"), (ANSWER_UNSURE, "Não sei")],
    KIND_REVIEW_OPEN: [
        (ANSWER_SAME, "Igual a…"), (ANSWER_SIMILAR, "Similar a…"),
        (ANSWER_NOT_STOCKED, "Não temos"), (ANSWER_UNSURE, "Não sei"),
    ],
    KIND_APPLICATION: [(ANSWER_YES, "Vai, está certo"), (ANSWER_NO, "Não vai"), (ANSWER_UNSURE, "Não sei")],
}

_SCHEMA = (
    """
    CREATE TABLE IF NOT EXISTS entrevista (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chave TEXT NOT NULL,
        tipo TEXT NOT NULL,
        codigo_a TEXT NOT NULL,
        codigo_b TEXT,
        produto_id INTEGER,
        dados_json TEXT,
        pergunta TEXT NOT NULL,
        motivo TEXT,
        dia TEXT NOT NULL,
        criado_em TEXT NOT NULL,
        estado TEXT NOT NULL DEFAULT 'pendente',
        resposta TEXT,
        codigo_resposta TEXT,
        observacao TEXT,
        resultado TEXT,
        respondido_em TEXT
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_entrevista_dia ON entrevista(dia)",
    "CREATE INDEX IF NOT EXISTS idx_entrevista_chave ON entrevista(chave)",
)

_UNSURE_WORDS = ("NAO SEI", "NÃO SEI", "NAOSEI", "NÃOSEI", "SEI LA", "SEI LÁ", "PULAR", "PULA")
_NOT_STOCKED_WORDS = ("NAO TEMOS", "NÃO TEMOS", "NAOTEMOS", "NÃOTEMOS", "NAO TEM", "NÃO TEM")
_YES_WORDS = {"SIM", "VAI", "SERVE", "CERTO", "CERTA", "CONFERE", "OK", "CORRETO", "CORRETA"}
_NO_WORDS = {"NAO", "NÃO", "ERRADO", "ERRADA", "NAOVAI", "NÃOVAI"}


def _now() -> datetime:
    return datetime.now()


def _pair_key(a: str, b: str) -> str:
    x, y = sorted((canonical_code(a), canonical_code(b)))
    return f"par|{x}|{y}"


def _main_code(name: str) -> Optional[Tuple[str, str]]:
    """(canonico, como esta escrito) do primeiro numero de peca do nome do produto."""
    for code in extract_codes_from_name(name or "", expand_family=False):
        if _is_part_number(code):
            return code, _as_written(name, code)
    return None


def _shown(code: str) -> str:
    """'4031196RX' -> '4031196RX (reman)': o RX da Holset e a remanufaturada da mesma peca."""
    text = display_code(code)
    return f"{text} (reman)" if text.upper().endswith("RX") and canonical_code(text) != text.upper() else text


def _upper_text(text: str) -> str:
    return " ".join(str(text or "").upper().split())


def parse_answer(kind: str, text: str) -> Optional[Dict[str, Any]]:
    """
    Resposta escrita ('igual', 'similar, muda o atuador', 'não sei', 'sim', 'não vai',
    'a certa é a 5455609') -> {"resposta", "observacao", "codigo"}. None se nao entendeu.
    """
    raw = " ".join(str(text or "").split())
    if not raw:
        return None
    upper = _upper_text(raw)
    if any(upper.startswith(word) for word in _UNSURE_WORDS) or upper in {"?", "N/S"}:
        return {"resposta": ANSWER_UNSURE}
    if kind == KIND_APPLICATION:
        first = (search_words(raw) or [""])[0]
        if upper.startswith("NAO SE APLICA") or upper.startswith("NÃO SE APLICA") or first in _NO_WORDS:
            return {"resposta": ANSWER_NO, "observacao": None}
        if first in _YES_WORDS:
            return {"resposta": ANSWER_YES}
        return None
    if kind == KIND_REVIEW_OPEN:
        if any(upper.startswith(word) for word in _NOT_STOCKED_WORDS):
            return {"resposta": ANSWER_NOT_STOCKED}
        codes = [c for c in extract_codes_from_name(raw, expand_family=False) if _is_part_number(c)]
        teach = parse_teach_reply(raw)
        if not codes:
            return None
        written = _as_written(raw, codes[0])
        tipo = teach[0] if teach and teach[0] in (ANSWER_SAME, ANSWER_SIMILAR) else ANSWER_SAME
        note = raw.split(written, 1)[1].strip(" ,.;:-") if written in raw else None
        return {"resposta": tipo, "codigo": written, "observacao": note or None}
    teach = parse_teach_reply(raw)
    if not teach:
        return None
    return {"resposta": teach[0], "observacao": teach[1]}


class AssistantInterviewService:
    def __init__(
        self,
        history: Any = None,
        knowledge: Any = None,
        teacher: Any = None,
        db: Any = None,
        config_store: Optional[AssistantConfigStore] = None,
        clock: Callable[[], datetime] = _now,
        hide_application: Optional[Callable[[Dict[str, Any]], None]] = None,
    ) -> None:
        self._history, self._knowledge, self._teacher, self._db = history, knowledge, teacher, db
        self.config_store = config_store or AssistantConfigStore()
        self.clock = clock
        self._hide_application = hide_application or self._hide_in_catalog
        self._relations_cache: Dict[str, Set[str]] = {}
        self._register_links: Optional[Dict[str, Set[str]]] = None
        self._graph: Any = None

    # ------------------------------------------------------------------
    # Dependencias (criadas so quando usadas)
    # ------------------------------------------------------------------

    @property
    def history(self) -> Any:
        if self._history is None:
            from app.services.assistant_history_service import AssistantHistoryService

            self._history = AssistantHistoryService()
        return self._history

    @property
    def knowledge(self) -> Any:
        if self._knowledge is None:
            from app.services.assistant_knowledge_service import AssistantKnowledgeService

            self._knowledge = AssistantKnowledgeService()
        return self._knowledge

    @property
    def teacher(self) -> Any:
        if self._teacher is None:
            from app.services.assistant_teach_service import AssistantTeachService

            self._teacher = AssistantTeachService(knowledge=self.knowledge, history=self.history)
        return self._teacher

    @property
    def db(self) -> Any:
        if self._db is None:
            from core.database.connection import DatabaseConnection

            self._db = DatabaseConnection()
        return self._db

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.history.db_path, timeout=10)
        conn.row_factory = sqlite3.Row
        for statement in _SCHEMA:
            conn.execute(statement)
        return conn

    def _query(self, sql: str, params: Tuple[Any, ...] = ()) -> List[Dict[str, Any]]:
        conn = self.db.get_connection()
        try:
            conn.row_factory = sqlite3.Row
            return [dict(row) for row in conn.execute(sql, params).fetchall()]
        finally:
            conn.close()

    # ------------------------------------------------------------------
    # Perguntas do dia
    # ------------------------------------------------------------------

    def today(self) -> List[Dict[str, Any]]:
        """As perguntas de hoje (cria na primeira vez do dia, levando as que ficaram sem resposta)."""
        day = self.clock().date().isoformat()
        conn = self._connect()
        try:
            if not conn.execute("SELECT 1 FROM entrevista WHERE dia = ? LIMIT 1", (day,)).fetchone():
                self._fill(conn, day, self.settings()["quantidade"])
            self._drop_already_known(conn, day)
            rows = conn.execute(
                "SELECT * FROM entrevista WHERE dia = ? AND estado <> ? ORDER BY id", (day, STATE_DROPPED)
            ).fetchall()
        finally:
            conn.close()
        return [self._public(row) for row in rows]

    def _drop_already_known(self, conn: sqlite3.Connection, day: str) -> None:
        """
        Pergunta ainda sem resposta sobre um par que ja se sabe (ensinado depois, ou que os dados
        da empresa ja ligam, como a 3797851 e a 4031196RX) sai da lista sem incomodar ninguem.
        """
        rows = conn.execute(
            "SELECT id, tipo, codigo_a, codigo_b FROM entrevista WHERE dia = ? AND estado = ? AND tipo IN (?, ?)",
            (day, STATE_PENDING, KIND_FICHA, KIND_REVIEW_PAIR),
        ).fetchall()
        if not rows:
            return
        self._relations_cache, self._register_links, self._graph = {}, None, None
        known = [
            row["id"] for row in rows
            if self._known(row["codigo_a"], row["codigo_b"])
            or (row["tipo"] == KIND_FICHA and self._company_relates(row["codigo_a"], row["codigo_b"]))
        ]
        if known:
            conn.executemany("UPDATE entrevista SET estado = ? WHERE id = ?", [(STATE_DROPPED, qid) for qid in known])
            conn.commit()

    def more(self) -> List[Dict[str, Any]]:
        """"Mais perguntas": outra rodada hoje, para quem tem tempo."""
        day = self.clock().date().isoformat()
        self.today()
        conn = self._connect()
        try:
            self._fill(conn, day, self.settings()["quantidade"], carry=False)
        finally:
            conn.close()
        return self.today()

    def _fill(self, conn: sqlite3.Connection, day: str, count: int, carry: bool = True) -> None:
        # Primeiro so leituras: escolher as duvidas abre o mesmo arquivo (o "Para revisar") e uma
        # escrita aberta aqui travaria essa leitura ("database is locked").
        left = []
        if carry:  # as que ficaram sem resposta voltam primeiro
            left = [row["id"] for row in conn.execute(
                "SELECT id FROM entrevista WHERE estado = ? AND dia < ? ORDER BY id LIMIT ?",
                (STATE_PENDING, day, count),
            ).fetchall()]
        now = self.clock()
        new = self.pick(count - len(left), self._skip_keys(conn, now)) if count > len(left) else []
        conn.executemany("UPDATE entrevista SET dia = ? WHERE id = ?", [(day, qid) for qid in left])
        for item in new:
            conn.execute(
                """
                INSERT INTO entrevista
                    (chave, tipo, codigo_a, codigo_b, produto_id, dados_json, pergunta, motivo, dia, criado_em)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    item["chave"], item["tipo"], item["codigo_a"], item.get("codigo_b"), item.get("produto_id"),
                    json.dumps(item.get("dados") or {}, ensure_ascii=False), item["pergunta"],
                    item.get("motivo"), day, now.isoformat(timespec="seconds"),
                ),
            )
        conn.commit()

    @staticmethod
    def _skip_keys(conn: sqlite3.Connection, now: datetime) -> Set[str]:
        """Ja perguntadas: respondidas, esperando ou "nao sei" ha menos de 30 dias."""
        since = (now - timedelta(days=UNSURE_DAYS)).isoformat(timespec="seconds")
        rows = conn.execute(
            "SELECT chave FROM entrevista WHERE estado <> ? OR COALESCE(respondido_em, criado_em) >= ?",
            (STATE_UNSURE, since),
        ).fetchall()
        return {row["chave"] for row in rows}

    def pick(self, count: int, skip: Iterable[str] = ()) -> List[Dict[str, Any]]:
        """Escolhe as duvidas: as de maior peso, no maximo 2 de cada tipo (se houver de outros)."""
        skip = set(skip)
        self._relations_cache = {}
        self._register_links: Optional[Dict[str, Set[str]]] = None
        self._graph: Any = None
        candidates: List[Dict[str, Any]] = []
        for source in (self._review_candidates, self._ficha_candidates, self._registry_candidates,
                       self._application_candidates):
            try:
                candidates += source()
            except Exception:  # uma fonte que falha nao derruba as outras
                LOG.exception("entrevista: falha ao buscar duvidas em %s", source.__name__)
        candidates.sort(key=lambda item: -item["peso"])
        chosen: List[Dict[str, Any]] = []
        seen: Set[str] = set(skip)
        per_kind: Dict[str, int] = {}
        leftovers: List[Dict[str, Any]] = []
        for item in candidates:
            if item["chave"] in seen:
                continue
            # Uma aplicacao por peca por dia: a mesma turbina cinco vezes cansa.
            if item["tipo"] == KIND_APPLICATION and f"app-produto|{item.get('produto_id')}" in seen:
                continue
            seen.add(item["chave"])
            if item["tipo"] == KIND_APPLICATION:
                seen.add(f"app-produto|{item.get('produto_id')}")
            group = KIND_REVIEW_PAIR if item["tipo"] == KIND_REVIEW_OPEN else item["tipo"]
            if per_kind.get(group, 0) >= MAX_PER_KIND:
                leftovers.append(item)
                continue
            per_kind[group] = per_kind.get(group, 0) + 1
            chosen.append(item)
        chosen += leftovers[: max(0, count - len(chosen))]
        chosen = sorted(chosen, key=lambda item: -item["peso"])[:count]
        return chosen

    # ------------------------------------------------------------------
    # De onde saem as duvidas
    # ------------------------------------------------------------------

    def _priority_products(self) -> List[Dict[str, Any]]:
        """Produtos ativos com estoque ou saida nos ultimos 180 dias, os mais importantes primeiro."""
        since = (self.clock() - timedelta(days=SALES_DAYS)).isoformat(sep=" ", timespec="seconds")
        rows = self._query(
            """
            SELECT p.id, p.nome,
                   COALESCE((SELECT SUM(e.quantidade) FROM produto_estoque e WHERE e.produto_id = p.id), 0) AS estoque,
                   COALESCE((SELECT SUM(m.quantidade) FROM movimentacoes m
                             WHERE m.produto_id = p.id AND m.tipo = 'SAIDA' AND m.data_hora >= ?), 0) AS saidas
            FROM produtos p
            WHERE p.ativo = 1
            """,
            (since,),
        )
        rows = [r for r in rows if int(r["estoque"] or 0) > 0 or int(r["saidas"] or 0) > 0]
        for row in rows:
            row["peso"] = int(row["saidas"] or 0) * 3 + int(row["estoque"] or 0)
        rows.sort(key=lambda r: (-r["peso"], int(r["id"])))
        return rows[:TOP_PRODUCTS]

    def _known(self, a: str, b: str) -> bool:
        """O especialista ja disse algo sobre A e B (ou sao a mesma peca)?"""
        a, b = canonical_code(a), canonical_code(b)
        if _family([a]) & _family([b]):
            return True
        if a not in self._relations_cache:
            relations = self.knowledge.relations(a)
            known: Set[str] = set(relations["diferentes"])
            for item in relations["iguais"] + relations["similares"]:
                known |= _family([item["codigo_norm"]])
            self._relations_cache[a] = known
        return bool(self._relations_cache[a] & _family([b]))

    def _company_relates(self, a: str, b: str) -> bool:
        """
        Os dados da empresa ja ligam A e B: um produto que cita os dois no nome
        ("3797851/4031196"), um item de NF-e ou as observacoes do cadastro ("SIMILAR HOLSET
        3797851 4031196"). Com o RX tirado (4031196RX = reman da 4031196), a nova e a reman
        entram pelo mesmo caminho. Nao vale perguntar o que a empresa ja escreveu.
        """
        a, b = canonical_code(a), canonical_code(b)
        if self._register_links is None:
            self._register_links = {}
            try:
                rows = self._query("SELECT origem_norm, numero_norm FROM cadastro_relacoes")
            except Exception:  # cadastro da empresa ainda nao importado nesta maquina
                rows = []
            for row in rows:
                x, y = str(row["origem_norm"] or ""), str(row["numero_norm"] or "")
                self._register_links.setdefault(x, set()).add(y)
                self._register_links.setdefault(y, set()).add(x)
        family_b = _family([b])
        if any(self._register_links.get(x, set()) & family_b for x in _family([a])):
            return True
        if self._graph is None:
            self._graph = self.knowledge.graph()
        return bool(self._graph.path(a, b))

    def _review_candidates(self) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        for item in self.history.review_items(limit=30):
            code = item["codigo"]
            times = int(item.get("vezes") or 1)
            asked = f"Perguntaram {times}x" if times > 1 else "Perguntaram 1 vez"
            suggestions = self.knowledge.suggestions(code, limit=1, asked_with=item.get("comparado_com", []))
            if suggestions:
                other = suggestions[0]
                stock = f" Temos {other['estoque_total']} da {display_code(other['codigo'])}." if other.get("estoque_total") else ""
                out.append({
                    "chave": _pair_key(code, other["codigo"]),
                    "tipo": KIND_REVIEW_PAIR,
                    "codigo_a": code,
                    "codigo_b": other["codigo"],
                    "produto_id": other.get("produto_id"),
                    "pergunta": f"*{_shown(code)}* e *{_shown(other['codigo'])}* são a mesma peça?",
                    "motivo": (
                        f"Perguntaram se a {display_code(code)} é igual à {display_code(other['codigo'])} e eu não tinha certeza."
                        if other["motivo"] == "perguntaram se é igual"
                        else f"{asked} a {display_code(code)} e não soube responder; {other['motivo']}."
                    ) + stock,
                    "peso": 100000 + times * 100,
                })
            else:
                out.append({
                    "chave": f"revisar|{canonical_code(code)}",
                    "tipo": KIND_REVIEW_OPEN,
                    "codigo_a": code,
                    "pergunta": f"Qual peça nossa serve no lugar da *{_shown(code)}*?",
                    "motivo": f"{asked} e não achei no estoque nem no que você me ensinou.",
                    "peso": 90000 + times * 100,
                })
        return out

    def _ficha_candidates(self) -> List[Dict[str, Any]]:
        """Dois produtos nossos ligados a mesma ficha Master Power, sem nada ensinado entre eles."""
        priority = {int(p["id"]): p for p in self._priority_products()}
        if not priority:
            return []
        links = self._query(
            """
            SELECT v.produto_id, cp.codigo AS ficha, cp.modelo, p.nome
            FROM produto_catalogo_vinculo v
            JOIN catalogo_produtos cp ON cp.id = v.catalogo_produto_id
            JOIN catalogo_fontes f ON f.id = cp.fonte_id
            JOIN produtos p ON p.id = v.produto_id
            WHERE v.status <> 'REJEITADO' AND p.ativo = 1 AND f.codigo = 'MASTER_POWER'
            """
        )
        by_ficha: Dict[str, List[Dict[str, Any]]] = {}
        for link in links:
            by_ficha.setdefault(str(link["ficha"]), []).append(link)
        out: List[Dict[str, Any]] = []
        for ficha, members in by_ficha.items():
            ranked = sorted(
                (m for m in members if int(m["produto_id"]) in priority),
                key=lambda m: -priority[int(m["produto_id"])]["peso"],
            )
            if not ranked:
                continue
            top = ranked[0]
            top_code = _main_code(top["nome"])
            if not top_code:
                continue
            for other in [m for m in members if m["produto_id"] != top["produto_id"]][:3]:
                other_code = _main_code(other["nome"])
                if (not other_code or self._known(top_code[0], other_code[0])
                        or self._company_relates(top_code[0], other_code[0])):
                    continue
                stock = int(priority[int(top["produto_id"])]["estoque"] or 0)
                model = f" · {top['modelo']}" if top.get("modelo") else ""
                out.append({
                    "chave": _pair_key(top_code[0], other_code[0]),
                    "tipo": KIND_FICHA,
                    "codigo_a": top_code[1],
                    "codigo_b": other_code[1],
                    "produto_id": int(top["produto_id"]),
                    "dados": {"ficha": ficha},
                    "pergunta": f"*{_shown(top_code[1])}* e *{_shown(other_code[1])}* são a mesma peça?",
                    "motivo": (
                        f"As duas estão na mesma ficha Master Power ({ficha}{model}), mas a mesma ficha "
                        f"não quer dizer que são iguais."
                        + (f" Temos {stock} da {display_code(top_code[1])}." if stock else "")
                    ),
                    "peso": 50000 + priority[int(top["produto_id"])]["peso"],
                })
        return out

    def _registry_candidates(self) -> List[Dict[str, Any]]:
        """O nome do produto junta dois codigos ("53279907101/7210"): o cadastro acha que sao iguais."""
        out: List[Dict[str, Any]] = []
        for product in self._priority_products():
            name = str(product["nome"] or "")
            codes: List[str] = []
            for code in sorted(codes_cited_in_name(name, expand_family=False)):
                if _is_part_number(code) and not any(_family([code]) & _family([c]) for c in codes):
                    codes.append(code)
            main = _main_code(name)
            if not main or len(codes) < 2:
                continue
            for other in [c for c in codes if not (_family([c]) & _family([main[0]]))][:2]:
                if self._known(main[0], other):
                    continue
                out.append({
                    "chave": _pair_key(main[0], other),
                    "tipo": KIND_REGISTRY,
                    "codigo_a": main[1],
                    "codigo_b": _as_written(name, other),
                    "produto_id": int(product["id"]),
                    "pergunta": f"*{_shown(main[1])}* e *{_shown(other)}* são a mesma peça?",
                    "motivo": f"O cadastro junta as duas no produto \"{name}\". Hoje eu digo \"provavelmente iguais\".",
                    "peso": 30000 + product["peso"],
                })
        return out

    def _application_candidates(self) -> List[Dict[str, Any]]:
        """Uma aplicacao do catalogo por peca nossa: o catalogo Master Power tem aplicacoes erradas."""
        from core.catalog.hidden_applications import application_key

        products = self._priority_products()[:60]
        if not products:
            return []
        ids = [int(p["id"]) for p in products]
        placeholders = ",".join("?" for _ in ids)
        rows = self._query(
            f"""
            SELECT v.produto_id, cp.codigo AS ficha, a.montadora, a.veiculo, a.motor, a.complemento
            FROM produto_catalogo_vinculo v
            JOIN catalogo_produtos cp ON cp.id = v.catalogo_produto_id
            JOIN catalogo_aplicacoes a ON a.catalogo_produto_id = cp.id
            WHERE v.status <> 'REJEITADO' AND v.produto_id IN ({placeholders})
            ORDER BY CASE v.status WHEN 'CONFIRMADO' THEN 0 ELSE 1 END, a.id
            """,
            tuple(ids),
        )
        try:
            hidden = {r["chave"] for r in self._query("SELECT chave FROM aplicacoes_ocultas")}
        except Exception:
            hidden = set()
        by_product: Dict[int, List[Dict[str, Any]]] = {}
        for row in rows:
            if application_key(row["ficha"], row) not in hidden:
                by_product.setdefault(int(row["produto_id"]), []).append(row)
        out: List[Dict[str, Any]] = []
        for product in products:
            main = _main_code(str(product["nome"] or ""))
            if not main:
                continue
            for app in by_product.get(int(product["id"]), [])[:6]:
                vehicle = str(app.get("veiculo") or "").strip()
                maker = str(app.get("montadora") or "").strip()
                if maker and not search_words(vehicle)[:1] == search_words(maker)[:1]:
                    vehicle = f"{maker} {vehicle}"  # "Caminhão" sozinho nao diz nada
                engine = " — ".join(filter(None, [app.get("motor"), app.get("complemento")]))
                data = {"ficha": app["ficha"], **{f: app.get(f) for f in ("montadora", "veiculo", "motor", "complemento")},
                        "rotulo": vehicle}
                out.append({
                    "chave": f"aplicacao|{application_key(app['ficha'], app)}",
                    "tipo": KIND_APPLICATION,
                    "codigo_a": main[1],
                    "produto_id": int(product["id"]),
                    "dados": data,
                    "pergunta": f"A *{_shown(main[1])}* vai no *{vehicle}*" + (f" ({engine})" if engine else "") + "?",
                    "motivo": f"Está na ficha Master Power {app['ficha']}, e o catálogo tem aplicações erradas.",
                    "peso": 10000 + product["peso"],
                })
        return out

    # ------------------------------------------------------------------
    # Respostas
    # ------------------------------------------------------------------

    def get(self, question_id: int) -> Optional[Dict[str, Any]]:
        conn = self._connect()
        try:
            row = conn.execute("SELECT * FROM entrevista WHERE id = ?", (question_id,)).fetchone()
        finally:
            conn.close()
        return self._public(row) if row else None

    def answer(
        self,
        question_id: int,
        resposta: str,
        observacao: Optional[str] = None,
        codigo: Optional[str] = None,
        direto: bool = True,
    ) -> Dict[str, Any]:
        """
        `direto`: o admin respondeu (app logado ou /confirmar com o PIN) e vale na hora.
        Senao (resposta pelo WhatsApp sem PIN) fica "aguardando" o /confirmar.
        """
        question = self.get(question_id)
        if not question:
            raise ValidationException("Pergunta não encontrada.")
        if question["estado"] == STATE_ANSWERED:
            raise ValidationException("Essa pergunta já foi respondida.")
        resposta = str(resposta or "").strip().lower()
        valid = {value for value, _ in OPTIONS[self._options_key(question["tipo"])]}
        if resposta not in valid:
            raise ValidationException("Resposta inválida para esta pergunta.")
        note = " ".join(str(observacao or "").split())[:300] or None
        code = " ".join(str(codigo or "").split()) or None
        if question["tipo"] == KIND_REVIEW_OPEN and resposta in (ANSWER_SAME, ANSWER_SIMILAR):
            if not code or not _is_part_number(canonical_code(code)):
                raise ValidationException("Diga qual código serve (o número da peça).")
        if resposta == ANSWER_UNSURE:
            return self._save(question_id, STATE_UNSURE, resposta, code, note, "Tudo bem, pergunto de novo daqui a um mês.")
        if not direto:
            return self._save(question_id, STATE_WAITING, resposta, code, note, None)
        result = self._apply(question, resposta, code, note)
        return self._save(question_id, STATE_ANSWERED, resposta, code, note, result)

    def confirm_waiting(self) -> List[Dict[str, Any]]:
        """/confirmar <PIN>: aplica todas as respostas dadas pelo WhatsApp."""
        conn = self._connect()
        try:
            rows = conn.execute("SELECT * FROM entrevista WHERE estado = ? ORDER BY id", (STATE_WAITING,)).fetchall()
        finally:
            conn.close()
        done = []
        for row in rows:
            item = self._public(row)
            try:
                done.append(self.answer(item["id"], item["resposta"], item["observacao"], item["codigo_resposta"]))
            except Exception as exc:
                LOG.warning("entrevista: nao consegui aplicar a pergunta %s: %s", item["id"], exc)
                done.append({**item, "resultado": f"Não consegui guardar: {exc}", "erro": True})
        return done

    def _apply(self, question: Dict[str, Any], resposta: str, code: Optional[str], note: Optional[str]) -> str:
        kind = question["tipo"]
        if kind in PAIR_KINDS:
            return self.teacher.teach(question["codigo_a"], question["codigo_b"], resposta, note, True, "entrevista")
        if kind == KIND_REVIEW_OPEN:
            if resposta == ANSWER_NOT_STOCKED:
                self.history.mark_reviewed([canonical_code(question["codigo_a"])])
                return f"✅ Anotado: não temos peça que sirva no lugar da *{display_code(question['codigo_a'])}*."
            return self.teacher.teach(question["codigo_a"], code or "", resposta, note, True, "entrevista")
        if kind == KIND_APPLICATION:
            data = question.get("dados") or {}
            if resposta == ANSWER_NO:
                self._hide_application(data)
                return f"✅ Aplicação marcada como \"Não se aplica\": não uso mais {data.get('rotulo') or data.get('veiculo')} para a ficha {data.get('ficha')}."
            return f"✅ Confirmado: a *{display_code(question['codigo_a'])}* vai no {data.get('rotulo') or data.get('veiculo')}."
        raise ValidationException("Tipo de pergunta desconhecido.")

    def _hide_in_catalog(self, data: Dict[str, Any]) -> None:
        """"Não vai": o mesmo que "Não se aplica" na aba Catalogo do produto (e publica)."""
        from app.services.own_ficha_service import OwnFichaService
        from core.catalog import hidden_applications

        service = OwnFichaService(db_connection=self.db)
        if not service.can_edit()["pode_editar"]:
            raise ValidationException("Só a máquina que publica a base marca aplicação errada.")
        conn = self.db.get_connection()
        try:
            hidden_applications.hide(conn, data)
            conn.commit()
        finally:
            conn.close()
        service.after_change()

    def _save(
        self, question_id: int, state: str, resposta: str, code: Optional[str], note: Optional[str], result: Optional[str]
    ) -> Dict[str, Any]:
        conn = self._connect()
        try:
            conn.execute(
                """
                UPDATE entrevista SET estado = ?, resposta = ?, codigo_resposta = ?, observacao = ?, resultado = ?,
                    respondido_em = ?
                WHERE id = ?
                """,
                (state, resposta, code, note, result, self.clock().isoformat(timespec="seconds"), question_id),
            )
            conn.commit()
        finally:
            conn.close()
        return self.get(question_id) or {}

    # ------------------------------------------------------------------
    # WhatsApp ("Mensagem para mim")
    # ------------------------------------------------------------------

    def build_text(self, questions: Optional[List[Dict[str, Any]]] = None) -> str:
        questions = self.today() if questions is None else questions
        pending = [q for q in questions if q["estado"] in (STATE_PENDING, STATE_WAITING)]
        now = self.clock()
        if not pending:
            return f"*Perguntas do dia — {now:%d/%m}*\nNenhuma pergunta pendente hoje. Obrigado! 🙌"
        lines = [f"*Perguntas do dia — {now:%d/%m}*", "Me ajude a aprender o que eu ainda não sei:", ""]
        for question in pending:
            mark = " ✍️" if question["estado"] == STATE_WAITING else ""
            lines.append(f"*{question['numero']}.* {question['pergunta']}{mark}")
            if question.get("motivo"):
                lines.append(f"_{question['motivo']}_")
            lines.append("")
        def first(kinds: Iterable[str]) -> Optional[int]:
            return next((q["numero"] for q in pending if q["tipo"] in kinds), None)

        lines.append("Responda assim:")
        pair = first(PAIR_KINDS)
        if pair:
            lines.append(f"/r {pair} igual · /r {pair} similar muda o atuador · /r {pair} diferente")
        open_number = first([KIND_REVIEW_OPEN])
        if open_number:
            lines.append(f"Peça que serve: /r {open_number} 4031196 (ou /r {open_number} nao temos)")
        app_number = first([KIND_APPLICATION])
        if app_number:
            lines.append(f"Aplicação: /r {app_number} sim ou /r {app_number} nao")
        lines.append(f"Não sabe? /r {pending[0]['numero']} nao sei")
        lines.append("Quando terminar: /confirmar <PIN> e eu aprendo tudo de uma vez.")
        return "\n".join(lines)

    def answer_by_number(self, number: int, text: str) -> str:
        """/r 2 similar muda o atuador -> resposta da pergunta 2 de hoje (espera o /confirmar)."""
        questions = self.today()
        question = next((q for q in questions if q["numero"] == number), None)
        if not question:
            return f"Hoje não tem a pergunta {number}. Mande /perguntas para ver as de hoje."
        parsed = parse_answer(question["tipo"], text)
        if not parsed:
            hint = {
                KIND_APPLICATION: "sim, nao ou nao sei",
                KIND_REVIEW_OPEN: "o código que serve, nao temos ou nao sei",
            }.get(question["tipo"], "igual, similar, diferente ou nao sei")
            return f"Não entendi a resposta da {number}. Use {hint}. Ex.: /r {number} {hint.split(',')[0]}"
        try:
            saved = self.answer(question["id"], parsed["resposta"], parsed.get("observacao"), parsed.get("codigo"), direto=False)
        except ValidationException as exc:
            return f"{number}: {exc}"
        if saved["estado"] == STATE_UNSURE:
            return f"👍 {number}: tudo bem, pergunto de novo daqui a um mês."
        left = sum(1 for q in self.today() if q["estado"] == STATE_PENDING)
        tail = f"Faltam {left}." if left else "Todas respondidas!"
        return f"✍️ {number}: anotei *{self._answer_label(saved)}*. {tail} Mande /confirmar <PIN> para eu aprender."

    @staticmethod
    def _answer_label(question: Dict[str, Any]) -> str:
        label = {ANSWER_NOT_STOCKED: "não temos", ANSWER_YES: "vai", ANSWER_NO: "não vai"}.get(
            question["resposta"], question["resposta"]
        )
        if question.get("codigo_resposta"):
            label += f" {display_code(question['codigo_resposta'])}"
        if question.get("observacao"):
            label += f" ({question['observacao']})"
        return label

    # ------------------------------------------------------------------
    # Configuracao e horario
    # ------------------------------------------------------------------

    def settings(self) -> Dict[str, Any]:
        saved = self.config_store.load_section(SECTION)
        try:
            count = int(saved.get("quantidade") or DEFAULT_COUNT)
        except (TypeError, ValueError):
            count = DEFAULT_COUNT
        return {
            "ativo": bool(saved.get("ativo", True)),
            "hora": str(saved.get("hora") or DEFAULT_HOUR),
            "quantidade": max(1, min(MAX_COUNT, count)),
            "ultimo_envio": saved.get("ultimo_envio"),
        }

    def update_settings(
        self, ativo: Optional[bool] = None, hora: Optional[str] = None, quantidade: Optional[int] = None
    ) -> Dict[str, Any]:
        current = self.settings()
        if hora is not None:
            hora = hora.strip()
            if not _HOUR.match(hora):
                raise ValidationException("Hora inválida. Use HH:MM, ex.: 09:00.")
            current["hora"] = hora
        if quantidade is not None:
            if not 1 <= int(quantidade) <= MAX_COUNT:
                raise ValidationException(f"De 1 a {MAX_COUNT} perguntas por dia.")
            current["quantidade"] = int(quantidade)
        if ativo is not None:
            current["ativo"] = bool(ativo)
        self.config_store.save_section(SECTION, current)
        return current

    def due(self, now: Optional[datetime] = None) -> bool:
        """WhatsApp ligado para as perguntas, ja passou da hora e ainda nao mandou hoje?"""
        now = now or self.clock()
        current = self.settings()
        return (
            current["ativo"]
            and now.strftime("%H:%M") >= current["hora"]
            and current["ultimo_envio"] != now.date().isoformat()
        )

    def mark_sent(self, now: Optional[datetime] = None) -> None:
        now = now or self.clock()
        current = self.settings()
        current["ultimo_envio"] = now.date().isoformat()
        self.config_store.save_section(SECTION, current)

    # ------------------------------------------------------------------

    @staticmethod
    def _options_key(kind: str) -> str:
        return "par" if kind in PAIR_KINDS else kind

    def _public(self, row: sqlite3.Row) -> Dict[str, Any]:
        item = dict(row)
        try:
            item["dados"] = json.loads(item.pop("dados_json") or "{}")
        except ValueError:
            item["dados"] = {}
        item["opcoes"] = [{"valor": v, "rotulo": r} for v, r in OPTIONS[self._options_key(item["tipo"])]]
        # Numero da pergunta no dia (1, 2, 3...), o que se usa no /r do WhatsApp.
        conn = self._connect()
        try:
            item["numero"] = int(conn.execute(
                # Conta tambem as descartadas: o numero ja foi para o WhatsApp e o /r 3 de quem
                # respondeu depois nao pode cair na pergunta seguinte.
                "SELECT COUNT(*) FROM entrevista WHERE dia = ? AND id <= ?", (item["dia"], item["id"]),
            ).fetchone()[0])
        finally:
            conn.close()
        return item
