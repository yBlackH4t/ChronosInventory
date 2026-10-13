"""
Historico das conversas do assistente (docs/PLANO_IA.md).

Fica num SQLite separado (assistente_historico.db, na pasta do app) para nao ir
para a base oficial, os backups e a comparacao de estoque. Serve para:
- a lista "Para revisar" do admin: codigos que o assistente nao achou em estoque;
- a correcao do admin (resposta certa) em cada conversa;
- exportar tudo em JSONL (um JSON por linha), o formato usado para avaliar e,
  no futuro, ajustar um modelo de IA;
- as propostas de regra mandadas pelo WhatsApp (/ensinar), que so valem depois que o
  admin aprova no app.
"""

from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime
from typing import Any, Dict, Iterable, Iterator, List, Optional

from core.utils.file_utils import FileUtils

HISTORY_DB_NAME = "assistente_historico.db"
# Comparacao ("A e igual a B?") ja respondida com certeza: mesma familia ou regra do especialista.
CONFIRMED_SOURCES = ("familia", "especialista")

_SCHEMA = (
    """
    CREATE TABLE IF NOT EXISTS conversas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        criado_em TEXT NOT NULL,
        canal TEXT NOT NULL,
        autor TEXT,
        pergunta TEXT NOT NULL,
        historico_json TEXT,
        resposta TEXT NOT NULL,
        modo TEXT NOT NULL,
        aviso TEXT,
        consultas_json TEXT,
        codigos_sem_estoque TEXT NOT NULL DEFAULT '',
        resposta_correta TEXT,
        observacao_admin TEXT,
        corrigido_em TEXT
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_conversas_criado ON conversas(criado_em)",
    """
    CREATE TABLE IF NOT EXISTS propostas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        criado_em TEXT NOT NULL,
        autor TEXT,
        codigo_a TEXT NOT NULL,
        codigo_b TEXT NOT NULL,
        tipo TEXT NOT NULL,
        observacao TEXT,
        status TEXT NOT NULL DEFAULT 'pendente',
        decidido_em TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS revisao_codigos (
        codigo_norm TEXT PRIMARY KEY,
        concluido_em TEXT NOT NULL,
        ate_conversa_id INTEGER NOT NULL
    )
    """,
)


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _loads(value: Optional[str], default: Any) -> Any:
    try:
        return json.loads(value) if value else default
    except ValueError:
        return default


class AssistantHistoryService:
    def __init__(self, db_path: Optional[str] = None) -> None:
        self.db_path = db_path or os.path.join(FileUtils.get_app_directory(), HISTORY_DB_NAME)

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=10)
        conn.row_factory = sqlite3.Row
        for statement in _SCHEMA:
            conn.execute(statement)
        return conn

    # ------------------------------------------------------------------
    # Gravacao
    # ------------------------------------------------------------------

    def record(
        self,
        *,
        canal: str,
        autor: Optional[str],
        pergunta: str,
        historico: List[Dict[str, str]],
        result: Dict[str, Any],
        consultas: List[Dict[str, Any]],
    ) -> int:
        missing = [
            c["codigo"]
            for c in consultas
            if c.get("codigo")
            and (
                (c.get("ferramenta") == "buscar_por_codigo" and c.get("temos_em_estoque") is False)
                # "A e igual a B?" sem resposta do especialista: ele confirma pela lista "Para revisar".
                or (c.get("ferramenta") == "comparar_codigos" and c.get("fonte") not in CONFIRMED_SOURCES)
            )
        ]
        conn = self._connect()
        try:
            cursor = conn.execute(
                """
                INSERT INTO conversas
                    (criado_em, canal, autor, pergunta, historico_json, resposta, modo, aviso,
                     consultas_json, codigos_sem_estoque)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    _now(),
                    canal,
                    autor,
                    pergunta,
                    json.dumps(historico, ensure_ascii=False),
                    result.get("resposta") or "",
                    result.get("modo") or "",
                    result.get("aviso"),
                    json.dumps(consultas, ensure_ascii=False),
                    "," + ",".join(dict.fromkeys(missing)) + "," if missing else "",
                ),
            )
            conn.commit()
            return int(cursor.lastrowid)
        finally:
            conn.close()

    # ------------------------------------------------------------------
    # Admin
    # ------------------------------------------------------------------

    def list_conversations(self, limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
        conn = self._connect()
        try:
            rows = conn.execute(
                "SELECT * FROM conversas ORDER BY id DESC LIMIT ? OFFSET ?", (limit, offset)
            ).fetchall()
        finally:
            conn.close()
        return [self._public(row) for row in rows]

    def set_correction(self, conversa_id: int, resposta_correta: str, observacao: Optional[str] = None) -> bool:
        conn = self._connect()
        try:
            cursor = conn.execute(
                "UPDATE conversas SET resposta_correta = ?, observacao_admin = ?, corrigido_em = ? WHERE id = ?",
                ((resposta_correta or "").strip() or None, (observacao or "").strip() or None, _now(), conversa_id),
            )
            conn.commit()
            return cursor.rowcount > 0
        finally:
            conn.close()

    def review_items(self, limit: int = 50) -> List[Dict[str, Any]]:
        """
        Codigos pesquisados sem estoque que o admin ainda nao revisou (ou que voltaram
        a ser perguntados depois da revisao), do mais perguntado para o menos.
        """
        conn = self._connect()
        try:
            done = {r["codigo_norm"]: r["ate_conversa_id"] for r in conn.execute("SELECT * FROM revisao_codigos")}
            rows = conn.execute(
                "SELECT id, criado_em, pergunta, codigos_sem_estoque, consultas_json FROM conversas "
                "WHERE codigos_sem_estoque <> '' ORDER BY id"
            ).fetchall()
        finally:
            conn.close()

        items: Dict[str, Dict[str, Any]] = {}
        for row in rows:
            compared = _loads(row["consultas_json"], [])
            for code in filter(None, row["codigos_sem_estoque"].split(",")):
                if code in done and row["id"] <= done[code]:
                    continue  # ja revisado; volta se for perguntado de novo depois
                item = items.setdefault(code, {"codigo": code, "vezes": 0, "conversas": [], "comparado_com": []})
                item["vezes"] += 1
                item["ultima_vez"] = row["criado_em"]
                item["exemplo"] = row["pergunta"]
                item["conversas"].append(int(row["id"]))
                # "A e igual a B?": o B e a primeira sugestao para o admin.
                for call in compared if isinstance(compared, list) else []:
                    if not isinstance(call, dict) or call.get("ferramenta") != "comparar_codigos":
                        continue
                    other = call.get("outro_codigo")
                    if call.get("codigo") == code and other and other not in item["comparado_com"]:
                        item["comparado_com"].append(other)
        ordered = sorted(items.values(), key=lambda i: i["ultima_vez"], reverse=True)
        ordered.sort(key=lambda i: -i["vezes"])  # mais perguntados primeiro; empate: mais recente
        return ordered[:limit]

    def missing_codes_since(self, since: str, limit: int = 5) -> List[Dict[str, Any]]:
        """Codigos perguntados que nao tinhamos desde `since` (ISO), mais pedidos primeiro (resumo diario)."""
        conn = self._connect()
        try:
            rows = conn.execute(
                "SELECT codigos_sem_estoque FROM conversas WHERE codigos_sem_estoque <> '' AND criado_em >= ?",
                (since,),
            ).fetchall()
        finally:
            conn.close()
        counts: Dict[str, int] = {}
        for row in rows:
            for code in filter(None, row["codigos_sem_estoque"].split(",")):
                counts[code] = counts.get(code, 0) + 1
        ordered = sorted(counts.items(), key=lambda item: (-item[1], item[0]))
        return [{"codigo": code, "vezes": times} for code, times in ordered[:limit]]

    def mark_reviewed(self, codes: Iterable[str]) -> None:
        conn = self._connect()
        try:
            now = _now()
            last_id = int(conn.execute("SELECT COALESCE(MAX(id), 0) FROM conversas").fetchone()[0])
            conn.executemany(
                "INSERT INTO revisao_codigos (codigo_norm, concluido_em, ate_conversa_id) VALUES (?, ?, ?) "
                "ON CONFLICT(codigo_norm) DO UPDATE SET "
                "concluido_em = excluded.concluido_em, ate_conversa_id = excluded.ate_conversa_id",
                [(code, now, last_id) for code in codes if code],
            )
            conn.commit()
        finally:
            conn.close()

    # ------------------------------------------------------------------
    # Propostas de regra (/ensinar pelo WhatsApp)
    # ------------------------------------------------------------------

    def add_proposal(
        self, codigo_a: str, codigo_b: str, tipo: str, observacao: Optional[str], autor: Optional[str]
    ) -> int:
        conn = self._connect()
        try:
            cursor = conn.execute(
                "INSERT INTO propostas (criado_em, autor, codigo_a, codigo_b, tipo, observacao) VALUES (?, ?, ?, ?, ?, ?)",
                (_now(), autor, codigo_a.strip().upper(), codigo_b.strip().upper(), tipo.lower(), observacao or None),
            )
            conn.commit()
            return int(cursor.lastrowid)
        finally:
            conn.close()

    def list_proposals(self, status: Optional[str] = "pendente") -> List[Dict[str, Any]]:
        conn = self._connect()
        try:
            if status:
                rows = conn.execute("SELECT * FROM propostas WHERE status = ? ORDER BY id", (status,)).fetchall()
            else:
                rows = conn.execute("SELECT * FROM propostas ORDER BY id DESC").fetchall()
        finally:
            conn.close()
        return [dict(row) for row in rows]

    def get_proposal(self, proposal_id: int) -> Optional[Dict[str, Any]]:
        conn = self._connect()
        try:
            row = conn.execute("SELECT * FROM propostas WHERE id = ?", (proposal_id,)).fetchone()
        finally:
            conn.close()
        return dict(row) if row else None

    def decide_proposal(self, proposal_id: int, status: str) -> bool:
        conn = self._connect()
        try:
            cursor = conn.execute(
                "UPDATE propostas SET status = ?, decidido_em = ? WHERE id = ? AND status = 'pendente'",
                (status, _now(), proposal_id),
            )
            conn.commit()
            return cursor.rowcount > 0
        finally:
            conn.close()

    def export_jsonl(self) -> Iterator[str]:
        """Uma conversa por linha. Sem o autor (telefone): nao e preciso para avaliar/treinar."""
        conn = self._connect()
        try:
            rows = conn.execute("SELECT * FROM conversas ORDER BY id").fetchall()
        finally:
            conn.close()
        for row in rows:
            record = self._public(row)
            record.pop("autor", None)
            yield json.dumps(record, ensure_ascii=False) + "\n"

    @staticmethod
    def _public(row: sqlite3.Row) -> Dict[str, Any]:
        return {
            "id": row["id"],
            "data": row["criado_em"],
            "canal": row["canal"],
            "autor": row["autor"],
            "historico": _loads(row["historico_json"], []),
            "pergunta": row["pergunta"],
            "resposta": row["resposta"],
            "modo": row["modo"],
            "aviso": row["aviso"],
            "consultas": _loads(row["consultas_json"], []),
            "codigos_sem_estoque": [c for c in (row["codigos_sem_estoque"] or "").split(",") if c],
            "resposta_correta": row["resposta_correta"],
            "observacao_admin": row["observacao_admin"],
        }
