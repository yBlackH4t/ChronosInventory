from __future__ import annotations

import json
import os
import re
import sqlite3
from contextlib import contextmanager
from collections.abc import Iterator
from typing import Any

from app.services.assistant_requests import code_mentions, pending_fields
from core.catalog.normalization import search_words

TERMINAL = {"concluido", "cancelado", "expirado"}


def compatible_reply(question: str, fields: list[str]) -> bool:
    words = set(search_words(question))
    return bool(
        ("motor" in fields and re.search(r"\b[a-z]{1,5}[- ]?\d{1,4}\b", question, re.IGNORECASE))
        or ("ano" in fields and re.search(r"\b(?:19|20)\d{2}\b", question))
        or ("norma" in fields and re.search(r"\beuro\s*[1-6]\b", question, re.IGNORECASE))
        or ("versao" in fields and words & {"NOVA", "NOVO", "REMAN", "MONTADA", "MONTADO", "RX"})
        or ("codigo" in fields and code_mentions(question))
    )


class AssistantAttendanceService:
    def __init__(self, path: str) -> None:
        self.path = path
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        with self.connect() as connection:
            connection.execute("CREATE TABLE IF NOT EXISTS atendimentos (id INTEGER PRIMARY KEY AUTOINCREMENT, dados TEXT NOT NULL)")
            connection.execute("CREATE TABLE IF NOT EXISTS rascunhos (id INTEGER PRIMARY KEY AUTOINCREMENT, dados TEXT NOT NULL)")

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.path, timeout=10)
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def all(self, table: str) -> list[dict[str, Any]]:
        if table not in ("atendimentos", "rascunhos"):
            raise ValueError("Tabela inválida")
        with self.connect() as connection:
            return [{**json.loads(data), "id": row_id} for row_id, data in connection.execute(f"SELECT id, dados FROM {table}")]

    def save(self, table: str, data: dict[str, Any]) -> dict[str, Any]:
        if table not in ("atendimentos", "rascunhos"):
            raise ValueError("Tabela inválida")
        value = json.dumps(data, ensure_ascii=False)
        with self.connect() as connection:
            if data.get("id"):
                connection.execute(f"UPDATE {table} SET dados=? WHERE id=?", (value, data["id"]))
            else:
                cursor = connection.execute(f"INSERT INTO {table}(dados) VALUES(?)", (value,))
                data = {**data, "id": cursor.lastrowid}
        return data

    def delete_draft(self, draft_id: int) -> None:
        with self.connect() as connection:
            connection.execute("DELETE FROM rascunhos WHERE id=?", (draft_id,))

    def expire(self, now: float, ttl: float) -> None:
        for session in self.all("atendimentos"):
            if session["estado"] not in TERMINAL and now - session["atualizado_em"] > ttl:
                self.save("atendimentos", {**session, "estado": "expirado"})

    def resolve(self, chat: str, sender: str, question: str, quoted: str | None,
                now: float, ttl: float, account: str = "") -> tuple[dict[str, Any], str | None]:
        self.expire(now, ttl)
        sessions = [item for item in self.all("atendimentos")
                    if item["chat"] == chat and item["cliente"] == sender and item.get("conta", "") == account]
        if quoted:
            matches = [item for item in sessions if quoted in item.get("mensagens_enviadas", [])]
            if matches:
                session = matches[-1]
                previous_codes = {item["codigo"] for item in code_mentions(session["origem"])}
                current_codes = {item["codigo"] for item in code_mentions(question)}
                if current_codes - previous_codes:
                    return self.create(chat, sender, question, now, account), None
                if session["estado"] in TERMINAL:
                    return self.create(chat, sender, question, now, account), (
                        f"O atendimento #{session['id']} foi encerrado ou expirou. Confirme novamente a peça e o motor para continuar?")
                if len(session.get("pendencias", [])) > 1 and not code_mentions(question):
                    return self.create(chat, sender, question, now, account), "Qual peça/pedido você está complementando? Informe o código."
                return session, None
            return self.create(chat, sender, question, now, account), "Não consegui vincular a mensagem citada ao atendimento. Confirme a peça e o motor/ano?"
        words = set(search_words(question))
        new_topic = bool(code_mentions(question)) or bool(words & {
            "VOLVO", "SCANIA", "MERCEDES", "FORD", "IVECO", "AGRALE", "CANCELAR", "ENCERRAR", "OUTRA", "OUTRO"})
        pending = [item for item in sessions if item["estado"] in ("aguardando_cliente", "em_revisao")
                   and item.get("mensagens_enviadas") and item.get("pendencias")]
        if not new_topic and len(question) <= 150 and pending:
            session = pending[-1]
            fields = session.get("pendencias", [])
            if len(pending) == 1 and len(fields) == 1:
                if compatible_reply(question, fields[0].get("campos", [])):
                    return session, None
                return self.create(chat, sender, question, now, account), "Confirme o código da peça e o motor/ano para eu continuar o atendimento?"
            return self.create(chat, sender, question, now, account), "A resposta se refere a qual peça/pedido? Informe o código para eu não misturar os atendimentos."
        return self.create(chat, sender, question, now, account), None

    def create(self, chat: str, sender: str, question: str, now: float, account: str) -> dict[str, Any]:
        return self.save("atendimentos", {"chat": chat, "cliente": sender, "conta": account,
            "estado": "em_revisao", "atualizado_em": now, "origem": question,
            "historico": [], "pendencias": [], "mensagens_enviadas": [], "revisao": 0})

    def confirm_sent(self, session_id: int, question: str, answer: str, sent_id: str,
                     pending: list[dict[str, Any]], now: float) -> None:
        session = next(item for item in self.all("atendimentos") if item["id"] == session_id)
        fields = pending_fields(answer)
        pending = [item for item in pending if set(item.get("campos", [])) & set(fields)] if fields else []
        pending = [{**item, "campos": [field for field in item["campos"] if field in fields]} for item in pending]
        if fields and not pending:
            pending = [{"pedido_id": "1", "campos": fields, "trecho": question}]
        session.update(estado="aguardando_cliente" if pending else "concluido", pendencias=pending,
                       atualizado_em=now, revisao=session["revisao"] + 1)
        session["historico"] += [{"papel": "usuario", "texto": question}, {"papel": "assistente", "texto": answer}]
        session["mensagens_enviadas"].append(sent_id)
        self.save("atendimentos", session)

    def close(self, session_id: int) -> bool:
        session = next((item for item in self.all("atendimentos") if item["id"] == session_id), None)
        if session is None:
            return False
        self.save("atendimentos", {**session, "estado": "cancelado", "revisao": session["revisao"] + 1})
        return True
