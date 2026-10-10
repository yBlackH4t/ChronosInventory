"""
Avaliacao do assistente de IA (docs/PLANO_IA.md): roda as perguntas de
scripts/assistente_casos.json e confere cada resposta.

    python scripts/assistente_avaliacao.py              # IA do provedor configurado
    python scripts/assistente_avaliacao.py --sem-ia     # so a busca direta
    python scripts/assistente_avaliacao.py --casos codigo-com-estoque,veiculo-com-varias-turbinas

Usa o banco de teste de `python scripts/assistente_dev.py gerar-banco` (pasta padrao
%TEMP%/chronos_assistente). Com IA, espera entre as perguntas (--pausa) para nao
estourar o limite por minuto do plano gratuito do Groq; cada rodada completa gasta
uma parte do limite diario (uns 15 x 5 mil tokens).
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import sys
import tempfile
import time
import unicodedata
from pathlib import Path
from typing import Any, Dict, List

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

DEFAULT_DIR = os.path.join(tempfile.gettempdir(), "chronos_assistente")
CASES_FILE = Path(__file__).resolve().parent / "assistente_casos.json"
REQUIRED_PRODUCT = "TURBINA HOLSET HX55W 4031196"

# Verificacoes que valem para toda resposta (formato WhatsApp).
GLOBAL_FORBIDDEN = ["**", "se precisar", "qualquer duvida", "fico a disposicao"]


def _norm(text: str) -> str:
    text = unicodedata.normalize("NFKD", text or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch)).lower()
    return re.sub(r"\s+", " ", text).strip()


def check(case: Dict[str, Any], answer: str) -> List[str]:
    """Lista de falhas (vazia = passou)."""
    text = _norm(answer)
    plain = text.lstrip("*• ").strip()
    failures = []
    for expected in case.get("deve_conter", []):
        if _norm(expected) not in text:
            failures.append(f"faltou: {expected!r}")
    options = case.get("deve_conter_algum", [])
    if options and not any(_norm(o) in text for o in options):
        failures.append(f"faltou algum de: {options}")
    for forbidden in case.get("nao_deve_conter", []) + GLOBAL_FORBIDDEN:
        if _norm(forbidden) in text:
            failures.append(f"nao devia ter: {forbidden!r}")
    for start in case.get("nao_deve_comecar_com", []):
        if plain.startswith(_norm(start)):
            failures.append(f"nao devia comecar com: {start!r}")
    if case.get("deve_perguntar") and "?" not in answer:
        failures.append("devia perguntar algo (sem '?')")
    return failures


def main() -> None:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
    logging.basicConfig(level=logging.WARNING)

    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--pasta", default=DEFAULT_DIR, help=f"Pasta do banco de teste (padrao: {DEFAULT_DIR})")
    parser.add_argument("--sem-ia", action="store_true", help="Avalia so a busca direta (sem IA, sem limite)")
    parser.add_argument("--casos", default="", help="Ids separados por virgula (padrao: todos)")
    parser.add_argument("--pausa", type=float, default=None, help="Segundos entre perguntas (padrao: 40 com IA, 0 sem)")
    args = parser.parse_args()

    if not os.path.exists(os.path.join(args.pasta, "estoque.db")):
        raise SystemExit(f"Banco nao encontrado em {args.pasta}. Rode: python scripts/assistente_dev.py gerar-banco")
    os.environ["CHRONOS_APP_DIR"] = os.path.abspath(args.pasta)

    from app.services.assistant_chat_service import AssistantChatService
    from app.services.assistant_direct_service import AssistantDirectService
    from core.database.repositories.product_repository import ProductRepository

    if not ProductRepository().get_all(search_term=REQUIRED_PRODUCT):
        raise SystemExit("Banco de teste diferente do esperado. Recrie com: gerar-banco --substituir")

    cases = json.loads(CASES_FILE.read_text(encoding="utf-8"))["casos"]
    if args.casos:
        wanted = {c.strip() for c in args.casos.split(",") if c.strip()}
        cases = [c for c in cases if c["id"] in wanted]
    pause = args.pausa if args.pausa is not None else (0.0 if args.sem_ia else 40.0)

    chat = AssistantChatService()
    direct = AssistantDirectService()
    passed = failed = skipped = 0
    for index, case in enumerate(cases):
        if index and pause:
            print(f"\n(aguardando {pause:.0f}s por causa do limite por minuto do plano gratuito...)", flush=True)
            time.sleep(pause)
        history = case.get("historico", [])
        started = time.perf_counter()
        result = direct.answer(case["pergunta"], history) if args.sem_ia else chat.chat(case["pergunta"], history)
        elapsed = time.perf_counter() - started

        print(f"\n=== {case['id']}: {case['pergunta']}  ({result['modo']}, {elapsed:.1f}s)")
        print(result["resposta"])
        if not args.sem_ia and result["modo"] != "ia":
            skipped += 1
            print(f"-> PULADO (IA nao respondeu): {result.get('aviso')}")
            continue
        failures = check(case, result["resposta"])
        if failures:
            failed += 1
            print("-> FALHOU: " + "; ".join(failures))
        else:
            passed += 1
            print("-> ok")

    print(f"\nResultado: {passed} ok, {failed} falharam, {skipped} pulados (de {len(cases)}).")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
