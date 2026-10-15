"""
A IA entende, o sistema responde (2.4.5).

Antes da busca direta, a IA le a mensagem (com as anteriores) e devolve so o que ela pede:
intencao, codigos, versoes (nova/reman/montada), veiculo, motor e ano. Isso troca as regras
de frase ("montada a reman", "da Garte", "aquela do 540") por compreensao de verdade. A
resposta continua vindo do banco: o que a IA entendeu vira uma pergunta curta e padrao
("temos 4031195 reman montada") que a busca direta responde.

As regras conferem o que a IA devolveu: codigo que nao aparece no texto (nem nas mensagens
anteriores) e descartado, porque o modelo gratuito as vezes inventa ou "corrige" codigos.
Sem IA configurada, sem internet ou no limite gratuito, nada muda: a busca direta segue com
a mensagem original.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Callable, Dict, List, Optional

from app.services.assistant_common import AssistantUnavailableError
from app.services.assistant_config_store import PROVIDERS, AssistantConfigStore
from core.catalog.normalization import canonical_code

LOG = logging.getLogger(__name__)

INTENTS = ("estoque", "comparar", "movimentacao", "codigo_master_power", "aplicacao", "outro")
VERSIONS = ("nova", "reman", "montada")
MAX_CODES = 3
MAX_FIELD = 60
HISTORY_FOR_CONTEXT = 6

PROMPT = """Você lê mensagens de vendedores e do chefe de uma distribuidora de turbinas (Garrett, Holset, BorgWarner), muitas vezes transcritas de áudio, e devolve SÓ um objeto JSON com o que a mensagem pede. Não responda a pergunta.

Campos:
- "intencao": "estoque" (tem? quantas tem? qual o preço/estoque da peça), "comparar" (duas peças são iguais/a mesma/servem uma no lugar da outra), "movimentacao" (quando saiu/vendeu/chegou/foi transferida, quantas saíram), "codigo_master_power" (qual o código Master Power/da ficha), "aplicacao" (turbina para um veículo/motor/máquina, sem código de peça) ou "outro" (saudação, assunto fora do estoque).
- "codigos": lista dos códigos de peça citados, copiados do texto como estão (pode tirar espaços, pontos e hífens de um código falado em pedaços, ex.: "403-1195" -> "4031195"). NUNCA invente nem corrija um código: se o número parece errado, copie como está. Se a mensagem diz "essa", "aquela", "dela" sem código, use o código da mensagem anterior.
- "versoes": as versões pedidas entre "nova", "reman" (remanufaturada, recondicionada, RX) e "montada" (montado). Lista vazia se não pediu versão.
- "veiculo", "motor", "ano": para "aplicacao" (ex.: veiculo "volvo fh", motor "d13", ano "2015"). Use a conversa anterior quando a mensagem só responde o motor ou o ano. null se não houver.

Exemplos:
"Bom dia, olha aí 403-1195, montada a reman" -> {"intencao":"estoque","codigos":["4031195"],"versoes":["montada","reman"],"veiculo":null,"motor":null,"ano":null}
"a 53279887101 é a mesma da 53279887210?" -> {"intencao":"comparar","codigos":["53279887101","53279887210"],"versoes":[],"veiculo":null,"motor":null,"ano":null}
"tem turbina do fh 2015 d13?" -> {"intencao":"aplicacao","codigos":[],"versoes":[],"veiculo":"fh","motor":"d13","ano":"2015"}"""


def _clean(value: Any) -> Optional[str]:
    text = " ".join(str(value or "").split())[:MAX_FIELD]
    return text or None


def supported_codes(codes: List[str], texts: List[str]) -> List[str]:
    """So os codigos que estao no texto (ou nas mensagens anteriores): a IA nao inventa codigo."""
    haystack = canonical_code(" ".join(texts))
    digits = re.sub(r"\D", "", " ".join(texts))
    out: List[str] = []
    for raw in codes:
        code = canonical_code(raw)
        if len(code) < 4 or not any(ch.isdigit() for ch in code):
            continue
        found = code in haystack or (code.isdigit() and code in digits)
        if found and code not in out:
            out.append(code)
    return out[:MAX_CODES]


def question_from(understood: Dict[str, Any], texts: List[str]) -> Optional[str]:
    """
    A pergunta curta e padrao que a busca direta entende, a partir do que a IA leu.
    None quando a IA nao trouxe nada util (a busca segue com a mensagem original).
    """
    intent = str(understood.get("intencao") or "").strip().lower()
    if intent not in INTENTS or intent == "outro":
        return None
    raw_codes = understood.get("codigos") or []
    codes = supported_codes([str(c) for c in raw_codes if c] if isinstance(raw_codes, list) else [], texts)
    raw_versions = understood.get("versoes") or []
    versions = [v for v in VERSIONS if isinstance(raw_versions, list) and v in [str(x).lower() for x in raw_versions]]

    if intent == "comparar" and len(codes) >= 2:
        return f"{codes[0]} é igual a {codes[1]}?"
    if intent == "movimentacao" and codes:
        return f"quando saiu {' '.join(codes)}?"
    if intent == "codigo_master_power" and codes:
        return f"qual o codigo master power {' '.join(codes)}?"
    if codes:
        return " ".join(["temos", *codes, *versions])
    if intent == "aplicacao":
        parts = [_clean(understood.get(k)) for k in ("veiculo", "motor", "ano")]
        parts = [p for p in parts if p]
        return " ".join(["turbina", *parts]) if parts else None
    return None


class AssistantInterpreter:
    def __init__(
        self,
        config_store: Optional[AssistantConfigStore] = None,
        http_post: Optional[Callable[..., Any]] = None,
        sleep: Optional[Callable[[float], None]] = None,
    ) -> None:
        self.config_store = config_store or AssistantConfigStore()
        self.http_post = http_post
        self.sleep = sleep

    def available(self, config: Optional[Dict[str, Any]] = None) -> bool:
        config = config or self.config_store.load()
        preset = PROVIDERS[config["provedor"]]
        if preset["tipo"] != "openai":
            return False  # Claude e "nenhum": sem esta etapa
        key, _ = AssistantConfigStore.key_for(config, config["provedor"])
        return bool(key) or not preset["precisa_chave"]

    def interpret(self, mensagem: str, historico: List[Dict[str, str]]) -> Optional[Dict[str, Any]]:
        """
        {"pergunta": pergunta padrao, "entendido": JSON da IA} ou None (sem IA, erro ou nada util).
        Nunca levanta excecao: a busca direta segue com a mensagem original.
        """
        config = self.config_store.load()
        if not self.available(config):
            return None
        provider = config["provedor"]
        preset = PROVIDERS[provider]
        api_key, _ = AssistantConfigStore.key_for(config, provider)
        recent = [
            f"{'Assistente' if h.get('papel') == 'assistente' else 'Usuário'}: {str(h.get('texto') or '')[:500]}"
            for h in historico[-HISTORY_FOR_CONTEXT:]
        ]
        user = ("Conversa anterior:\n" + "\n".join(recent) + "\n\n" if recent else "") + f"Mensagem: {mensagem}"
        extra: Dict[str, Any] = {}
        if preset["reasoning_effort"]:
            extra.update({"reasoning_effort": "low", "include_reasoning": False})
        kwargs: Dict[str, Any] = {}
        if self.sleep is not None:
            kwargs["sleep"] = self.sleep
        try:
            from app.services.assistant_openai_compat import complete_json

            understood = complete_json(
                provider_name=preset["nome"].split(" (")[0],
                base_url=preset["base_url"],
                api_key=api_key,
                model=AssistantConfigStore.model_for(config, provider),
                system=PROMPT,
                user=user,
                extra_params=extra,
                http_post=self.http_post,
                **kwargs,
            )
        except AssistantUnavailableError as exc:
            LOG.info("assistente: nao deu para a IA entender a mensagem (%s); segue a busca direta", exc)
            return None
        except Exception:
            LOG.exception("assistente: falha ao entender a mensagem; segue a busca direta")
            return None
        texts = [mensagem] + [str(h.get("texto") or "") for h in historico[-HISTORY_FOR_CONTEXT:]]
        question = question_from(understood, texts)
        return {"pergunta": question, "entendido": understood} if question else None
