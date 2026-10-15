"""
Ensinar respondendo: a IA nao soube dizer se dois codigos sao a mesma peca e terminou com
"Responda igual, similar ou diferente". A resposta seguinte da pessoa ("igual", "similar, muda o
atuador", "diferente") vira o que ela sabe:

- admin logado na maquina publicadora (ou o dono no WhatsApp com /aprovar): regra na hora,
  publicada para as outras maquinas;
- qualquer outra pessoa: proposta em "Para revisar", que so vale depois que o admin aprova.

Nunca no WhatsApp com o cliente: so no app e na conversa "Mensagem para mim".
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

from core.catalog.normalization import canonical_code, search_words

TEACH_HINT = "Sabe a resposta? Responda *igual*, *similar* ou *diferente* e eu aprendo."
UNSURE_FOOTER = "Deixei para o especialista confirmar."
SEARCH_HINT = "Ou *pesquisar* para eu procurar na internet."
SEARCH_WORDS = {"PESQUISAR", "PESQUISA", "PESQUISE", "INTERNET", "GOOGLE"}

_KINDS = {
    "IGUAL": "igual", "IGUAIS": "igual", "MESMA": "igual", "MESMO": "igual",
    "SIMILAR": "similar", "SIMILARES": "similar", "PARECIDA": "similar", "PARECIDO": "similar",
    "DIFERENTE": "diferente", "DIFERENTES": "diferente",
}
_FILLER = {"E", "SAO", "SÃO", "A", "O", "SIM", "ELAS", "ELES"}
_PAIR = re.compile(r"^\*([^*]+)\* e \*([^*]+)\*:")


def parse_teach_reply(mensagem: str) -> Optional[Tuple[str, Optional[str]]]:
    """'igual' / 'são iguais' / 'similar, muda o atuador' -> ('similar', 'muda o atuador'). Senao None."""
    words = (mensagem or "").strip().split()
    if not words or len(words) > 30:
        return None
    upper = search_words(mensagem)
    lead = [w for w in upper[:4] if w not in _FILLER]
    if not lead or lead[0] not in _KINDS:
        return None
    kind = _KINDS[lead[0]]
    # Observacao = o que vem depois da palavra ("similar, muda o atuador").
    match = re.search(r"(?i)\b(iguais|igual|mesm[ao]|similares|similar|parecid[ao]|diferentes|diferente)\b[\s,.;:-]*", mensagem)
    note = mensagem[match.end():].strip() if match else ""
    return kind, (note[:300] or None)


def wants_search(mensagem: str) -> bool:
    """'pesquisar' / 'pesquisa na internet' depois de um 'nao sei'."""
    words = search_words(mensagem)
    return bool(words) and len(words) <= 5 and words[0] in SEARCH_WORDS


def pending_pair(historico: List[Dict[str, str]]) -> Optional[Tuple[str, str]]:
    """Os dois codigos da ultima resposta da IA, se ela terminou pedindo para ensinar."""
    last = next((h for h in reversed(historico or []) if h.get("papel") == "assistente"), None)
    if not last:
        return None
    text = str(last.get("texto") or "")
    if TEACH_HINT not in text and UNSURE_FOOTER not in text:
        return None
    match = _PAIR.match(text.strip())
    if not match:
        return None
    return match.group(1).strip(), match.group(2).strip()


def pair_in_answer(text: str) -> Optional[Dict[str, Any]]:
    """Resposta que pede confirmacao: {'codigo_a', 'codigo_b', 'pesquisar'} para os botoes do app."""
    if UNSURE_FOOTER not in (text or "") and TEACH_HINT not in (text or ""):
        return None
    match = _PAIR.match((text or "").strip())
    if not match:
        return None
    return {"codigo_a": match.group(1).strip(), "codigo_b": match.group(2).strip(), "pesquisar": SEARCH_HINT in text}


def with_teach_hint(text: str, can_search: bool = False) -> str:
    """No app e no chat particular, a IA convida a ensinar no lugar de so 'deixar para o especialista'."""
    if not pair_in_answer(text) or UNSURE_FOOTER not in text:
        return text
    return text.replace(UNSURE_FOOTER, TEACH_HINT + (f"\n{SEARCH_HINT}" if can_search else ""))


class AssistantTeachService:
    def __init__(self, knowledge: Any = None, proposals: Any = None, history: Any = None, sync: Any = None) -> None:
        self._knowledge, self._proposals, self._history, self._sync = knowledge, proposals, history, sync

    def teach(
        self, codigo_a: str, codigo_b: str, tipo: str, observacao: Optional[str], direto: bool, autor: Optional[str]
    ) -> str:
        pair = f"*{codigo_a}* {tipo} *{codigo_b}*" + (f" ({observacao})" if observacao else "")
        if direto:
            self.knowledge.add_rule(codigo_a, codigo_b, tipo, observacao)
            if tipo != "diferente":
                self.history.mark_reviewed([canonical_code(codigo_a), canonical_code(codigo_b)])
            try:
                self.sync.publish_in_background()
            except Exception:  # publicar e melhor esforco; a regra ja vale aqui
                pass
            return f"✅ Aprendido: {pair}. Vale para todos a partir de agora."
        result = self.proposals.submit(
            {"codigo_a": codigo_a, "codigo_b": codigo_b, "tipo": tipo, "observacao": observacao, "autor": autor}
        )
        number = f" #{result['id']}" if result.get("id") else ""
        return f"📨 Mandei para o admin aprovar{number}: {pair}. Vale depois que ele aprovar."

    def approve(self, proposal_id: int) -> str:
        """/aprovar pelo WhatsApp: o mesmo que "Aprovar" em Para revisar."""
        proposal = self.history.get_proposal(proposal_id)
        if not proposal or proposal["status"] != "pendente":
            return f"Proposta #{proposal_id} não está pendente. Mande /pendentes para ver as que estão."
        rule = self.knowledge.add_rule(proposal["codigo_a"], proposal["codigo_b"], proposal["tipo"], proposal["observacao"])
        self.history.decide_proposal(proposal_id, "aprovada")
        if rule["tipo"] != "diferente":
            self.history.mark_reviewed([canonical_code(proposal["codigo_a"]), canonical_code(proposal["codigo_b"])])
        try:
            self.sync.publish_in_background()
        except Exception:
            pass
        return f"✅ Proposta #{proposal_id} aprovada: *{proposal['codigo_a']}* {proposal['tipo']} *{proposal['codigo_b']}*."

    def reject(self, proposal_id: int) -> str:
        if not self.history.decide_proposal(proposal_id, "recusada"):
            return f"Proposta #{proposal_id} não está pendente. Mande /pendentes para ver as que estão."
        return f"🗑️ Proposta #{proposal_id} recusada."

    @property
    def knowledge(self) -> Any:
        if self._knowledge is None:
            from app.services.assistant_knowledge_service import AssistantKnowledgeService

            self._knowledge = AssistantKnowledgeService()
        return self._knowledge

    @property
    def proposals(self) -> Any:
        if self._proposals is None:
            from app.services.assistant_proposal_service import AssistantProposalService

            self._proposals = AssistantProposalService()
        return self._proposals

    @property
    def history(self) -> Any:
        if self._history is None:
            from app.services.assistant_history_service import AssistantHistoryService

            self._history = AssistantHistoryService()
        return self._history

    @property
    def sync(self) -> Any:
        if self._sync is None:
            from app.services.assistant_knowledge_sync_service import AssistantKnowledgeSyncService

            self._sync = AssistantKnowledgeSyncService()
        return self._sync
