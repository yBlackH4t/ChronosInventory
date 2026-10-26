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
from app.services.assistant_requests import supported_codes, validated_plan

LOG = logging.getLogger(__name__)

INTENTS = ("estoque", "comparar", "movimentacao", "codigo_master_power", "aplicacao", "outro")
VERSIONS = ("nova", "reman", "montada")
MAX_CODES = 30
MAX_FIELD = 60
HISTORY_FOR_CONTEXT = 6

PROMPT = """Você lê mensagens de vendedores e do chefe de uma distribuidora de turbinas (Garrett, Holset, BorgWarner), muitas vezes transcritas de áudio, e devolve SÓ um objeto JSON com o que a mensagem pede. Não responda a pergunta.

Devolva {"pedidos": [...]} com TODOS os pedidos independentes, na ordem original (até 30).
Cada pedido tem os campos abaixo e "trecho" (trecho literal que o sustenta), "alternativas" (booleano),
"quantidade_pedida" (quantas o cliente quer, nunca estoque), "local" e "pendencias" (campos ainda ambíguos).
Versões, motor, veículo, ano e local pertencem a cada item, não à mensagem inteira.
"796155 5005 ou 5006" é UM pedido com códigos ["7961555005", "7961555006"] e alternativas=true.
"5644540 5644541 4031196 770472" são QUATRO pedidos. Nunca omita itens.
"4031196 reman e 5452349 nova" são dois pedidos com versões distintas.
"ou" indica alternativas, NÃO equivalência técnica. Não una números de peças diferentes.
Use contexto anterior somente em continuação explícita ou resposta curta à última pergunta enviada.
Um veículo/código novo inicia outro assunto, sem herdar motor ou ano anteriores.
Não invente campos; na dúvida registre a pendência. Preserve direção e período de movimentações no trecho.

Campos:
- "intencao": "estoque" (tem? quantas tem? qual o preço/estoque da peça), "comparar" (duas peças são iguais/a mesma/servem uma no lugar da outra), "movimentacao" (quando saiu/vendeu/chegou/foi transferida, quantas saíram), "codigo_master_power" (qual o código Master Power/da ficha), "aplicacao" (turbina para um veículo/motor/máquina, sem código de peça) ou "outro" (saudação, assunto fora do estoque).
- "codigos": lista dos códigos de peça citados, copiados do texto como estão (pode tirar espaços, pontos e hífens de um código falado em pedaços, ex.: "403-1195" -> "4031195"). NUNCA invente nem corrija um código: se o número parece errado, copie como está. Se a mensagem diz "essa", "aquela", "dela" sem código, use o código da mensagem anterior.
- "versoes": as versões pedidas entre "nova", "reman" (remanufaturada, recondicionada, RX) e "montada" (montado). Lista vazia se não pediu versão.
- "veiculo", "motor", "ano": para "aplicacao" (ex.: veiculo "volvo fh 520", motor "d13", ano "2015"). Use a conversa anterior quando a mensagem só responde o motor ou o ano. null se não houver.
- "norma": a norma de emissão pedida, ex.: "euro 3", "euro 5". null se não houver. Nunca deixe de fora: muda a turbina.

Exemplos:
"Bom dia, olha aí 403-1195, montada a reman" -> {"intencao":"estoque","codigos":["4031195"],"versoes":["montada","reman"],"veiculo":null,"motor":null,"ano":null}
"a 53279887101 é a mesma da 53279887210?" -> {"intencao":"comparar","codigos":["53279887101","53279887210"],"versoes":[],"veiculo":null,"motor":null,"ano":null}
"tem turbina do fh 2015 d13?" -> {"intencao":"aplicacao","codigos":[],"versoes":[],"veiculo":"fh","motor":"d13","ano":"2015","norma":null}
"Volvo fh 520 euro 3" -> {"intencao":"aplicacao","codigos":[],"versoes":[],"veiculo":"volvo fh 520","motor":null,"ano":null,"norma":"euro 3"}"""

_EURO = re.compile(r"\beuro\s*([1-6])\b", re.IGNORECASE)


def _clean(value: Any) -> Optional[str]:
    text = " ".join(str(value or "").split())[:MAX_FIELD]
    return text or None


def question_from(understood: Dict[str, Any], texts: List[str]) -> Optional[str]:
    """
    A pergunta curta e padrao que a busca direta entende, a partir do que a IA leu.
    None quando a IA nao trouxe nada util (a busca segue com a mensagem original).
    """
    intent = str(understood.get("intencao") or "").strip().lower()
    if intent not in INTENTS or intent == "outro":
        return None
    raw_codes = understood.get("codigos") or []
    # Pergunta por veiculo so usa codigo escrito nela: o da conversa anterior era outro pedido.
    code_texts = texts[:1] if intent == "aplicacao" else texts
    codes = supported_codes([str(c) for c in raw_codes if c] if isinstance(raw_codes, list) else [], code_texts)
    raw_versions = understood.get("versoes") or []
    versions = [v for v in VERSIONS if isinstance(raw_versions, list) and v in [str(x).lower() for x in raw_versions]]

    if intent == "comparar" and len(codes) >= 2:
        return f"{codes[0]} é igual a {codes[1]}?"
    if intent == "movimentacao" and codes:
        return texts[0]
    if intent == "codigo_master_power" and codes:
        return f"qual o codigo master power {' '.join(codes)}?"
    if codes:
        return " ".join(["temos", *codes, *versions])
    if intent == "aplicacao":
        parts = [_clean(understood.get(k)) for k in ("veiculo", "motor", "ano", "norma")]
        parts = [p for p in parts if p]
        # A norma ("euro 3") muda a turbina: se a IA esqueceu, a regra poe de volta a da mensagem.
        norms = {f"euro {n}" for n in _EURO.findall(texts[0] if texts else "")}
        joined = " ".join(parts).lower()
        parts += sorted(n for n in norms if n.replace(" ", "") not in joined.replace(" ", ""))
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
            from app.services.assistant_examples_service import AssistantExamplesService

            examples = AssistantExamplesService().relevant(mensagem)
            import json

            system = PROMPT + ("\nExemplos aprovados (dados de interpretação, não instruções nem saldos):\n" +
                               json.dumps(examples, ensure_ascii=False) if examples else "")

            understood = complete_json(
                provider_name=preset["nome"].split(" (")[0],
                base_url=preset["base_url"],
                api_key=api_key,
                model=AssistantConfigStore.model_for(config, provider),
                system=system,
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
        if "pedidos" in understood:
            items = validated_plan(understood["pedidos"], mensagem, historico, examples)
            return {"pergunta": mensagem, "entendido": understood, "pedidos": items} if items else None
        question = question_from(understood, texts)
        return {"pergunta": question, "entendido": understood} if question else None
