"""
Ferramentas de desenvolvimento do assistente de IA (docs/PLANO_IA.md).

Cria um banco de teste a partir do catalogo embutido e roda as buscas do
assistente pelo terminal, sem precisar do banco real da empresa.

    python scripts/assistente_dev.py gerar-banco
    python scripts/assistente_dev.py codigo 4031196
    python scripts/assistente_dev.py aplicacao "scania 440"
    python scripts/assistente_dev.py produto 1
    python scripts/assistente_dev.py cobertura
    python scripts/assistente_dev.py perguntar "temos turbina do scania 440?"
    python scripts/assistente_dev.py perguntar --sem-ia "temos turbina 4031196?"
    python scripts/assistente_dev.py whatsapp

`perguntar` usa o provedor de IA configurado (padrao: Groq, gratuito; chave em
GROQ_API_KEY ou salva pela tela de Configuracoes). Sem chave ou sem internet, a
resposta sai pela busca direta. `--sem-ia` usa so a busca direta.

Por padrao usa a pasta %TEMP%/chronos_assistente. Use --pasta para outra.
Para abrir o app com esse banco: defina CHRONOS_APP_DIR com a mesma pasta.
Para testar com o banco real, use uma COPIA do estoque.db numa pasta separada:
abrir o banco pelo app aplica migracoes.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import random
import re
import sys
import tempfile
from pathlib import Path
from typing import Dict, List, Optional, Tuple

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

DEFAULT_DIR = os.path.join(tempfile.gettempdir(), "chronos_assistente")
SERVED_BRANDS = ("GARRETT", "HOLSET", "BORGWARNER")

# Nomes reais da empresa (padrao de cadastro) com estoque ficticio.
REAL_PRODUCTS: List[Tuple[str, Dict[str, int]]] = [
    ("TURBINA HOLSET HX55W 4031196", {"CANOAS": 2}),
    ("TURBO HE200WG - 3799431 / 3785294", {"CANOAS": 1, "PF": 1}),
    ("TURBO HOLSET HX55 4031195", {}),
    ("TURBO K27 - 53279887116", {"PF": 3}),
    ("TURBO GARRETT 466646-5041S", {"CANOAS": 1}),
]

# Fichas do Scania 440 (motores diferentes): uma com estoque, uma sem, uma sem produto.
FIXED_ITEMS: List[Tuple[str, Dict[str, int]]] = [
    ("805310", {"CANOAS": 2}),  # GTA42 / HE500WG - DC13 Euro 5
    ("803998", {}),             # conjunto central HX52 - DT12 Turbo Compound
]

PRODUCTS_WITHOUT_CATALOG = [
    ("TURBO REMANUFATURADO SEM REFERENCIA", {"CANOAS": 1}),
    ("KIT REPARO TURBO GT20", {"PF": 4}),
    ("TURBO HOLSET HX35 9999991", {"PF": 1}),
]


def _use_dir(folder: str) -> None:
    os.environ["CHRONOS_APP_DIR"] = os.path.abspath(folder)


def _model_name(modelo: Optional[str]) -> str:
    if not modelo:
        return ""
    match = re.search(r"\(([^)]*)\)", modelo)
    text = match.group(1) if match else modelo
    first = re.split(r"[/\s]+", text.strip())[0]
    return first.upper()


def _product_name(rng: random.Random, item: Dict, refs: List[Tuple[str, str]]) -> str:
    brand, first = refs[0]
    second = next((num for b, num in refs[1:] if b == brand), None)
    model = _model_name(item["modelo"])
    if "CONJUNTO" in str(item["grupo"] or "").upper():
        return f"CONJUNTO CENTRAL {model} {first}".replace("  ", " ")
    patterns = [f"TURBINA {brand} {model} {first}", f"TURBO {brand} {model} {first}", f"TURBO {model} - {first}"]
    if second:
        patterns.append(f"TURBO {model} - {first} / {second}")
    return rng.choice(patterns).replace("  ", " ")


def _random_stock(rng: random.Random) -> Dict[str, int]:
    if rng.random() < 0.35:
        return {}
    places = rng.sample(["CANOAS", "PF"], k=rng.choice([1, 1, 2]))
    return {place: rng.randint(1, 4) for place in places}


def generate_database(folder: str, products: int, seed: int, replace: bool) -> None:
    db_path = os.path.join(folder, "estoque.db")
    if os.path.exists(db_path):
        if not replace:
            raise SystemExit(f"Ja existe {db_path}. Use --substituir para recriar.")
        for suffix in ("", "-wal", "-shm"):
            if os.path.exists(db_path + suffix):
                os.remove(db_path + suffix)
    os.makedirs(folder, exist_ok=True)
    _use_dir(folder)

    from core.catalog.bundle import apply_catalog_bundle, relink_catalog
    from core.database.connection import DatabaseConnection
    from core.database.migration_manager import MigrationManager
    from core.database.repositories.product_repository import ProductRepository

    db = DatabaseConnection()
    MigrationManager(db).check_and_run_migrations()
    bundle = apply_catalog_bundle(db)
    if bundle.get("status") not in {"aplicado", "atualizado"}:
        raise SystemExit(f"Nao foi possivel carregar o catalogo embutido: {bundle}")

    conn = db.get_connection()
    try:
        # Banco novo nao tem locais (o app cria na tela de configuracao inicial).
        conn.execute(
            "INSERT OR IGNORE INTO locais (nome, label, color, ordem, ativo) VALUES ('CANOAS', 'Canoas', '#1f538d', 1, 1)"
        )
        conn.execute(
            "INSERT OR IGNORE INTO locais (nome, label, color, ordem, ativo) VALUES ('PF', 'Passo Fundo', '#e74c3c', 2, 1)"
        )
        conn.commit()
        locations = {row["nome"].upper(): int(row["id"]) for row in conn.execute("SELECT id, nome FROM locais")}
        catalog = [
            dict(row)
            for row in conn.execute(
                "SELECT id, codigo, grupo, modelo FROM catalogo_produtos "
                "WHERE ativo = 1 AND (grupo LIKE 'TURBO%' OR grupo LIKE 'CONJUNTO%') ORDER BY id"
            )
        ]
        refs: Dict[int, List[Tuple[str, str]]] = {}
        placeholders = ",".join("?" for _ in SERVED_BRANDS)
        for row in conn.execute(
            f"SELECT catalogo_produto_id, fabricante, numero FROM catalogo_referencias "
            f"WHERE fabricante IN ({placeholders}) ORDER BY id",
            SERVED_BRANDS,
        ):
            refs.setdefault(int(row[0]), []).append((row[1], row[2]))
    finally:
        conn.close()

    rng = random.Random(seed)
    by_code = {item["codigo"]: item for item in catalog}
    planned: List[Tuple[str, Dict[str, int]]] = list(REAL_PRODUCTS)
    used_ids = set()
    for code, stock in FIXED_ITEMS:
        item = by_code[code]
        used_ids.add(item["id"])
        planned.append((_product_name(rng, item, refs[item["id"]]), stock))

    candidates = [i for i in catalog if i["id"] in refs and i["id"] not in used_ids]
    for item in rng.sample(candidates, k=min(products, len(candidates))):
        planned.append((_product_name(rng, item, refs[item["id"]]), _random_stock(rng)))
    planned.extend(PRODUCTS_WITHOUT_CATALOG)

    repo = ProductRepository()
    seen_names = set()
    for name, stock in planned:
        if name in seen_names:
            continue
        seen_names.add(name)
        repo.add(name, {locations[place]: qty for place, qty in stock.items()})

    links = relink_catalog(db, force=True)

    from app.services.assistant_knowledge_service import AssistantKnowledgeService

    # Exemplo da base de conhecimento do especialista (o mesmo que a avaliacao usa).
    AssistantKnowledgeService().add_rule("5327-988-7101", "5327-988-7116", "similar", "exemplo de teste: muda o atuador")
    print(f"Banco de teste criado: {db_path}")
    print(f"  produtos: {len(seen_names)}  catalogo: {bundle}")
    print(f"  vinculos: {links}")


def run_tool(folder: str, name: str, arguments: Dict) -> None:
    if not os.path.exists(os.path.join(folder, "estoque.db")):
        raise SystemExit(f"Banco nao encontrado em {folder}. Rode primeiro: gerar-banco")
    _use_dir(folder)
    from app.services.assistant_tools_service import AssistantToolsService

    result = AssistantToolsService().run_tool(name, arguments)
    print(json.dumps(result, ensure_ascii=False, indent=2))


def ask(folder: str, question: str, direct: bool) -> None:
    """Pergunta para o assistente: IA do provedor configurado ou, com --sem-ia, so a busca direta."""
    if not os.path.exists(os.path.join(folder, "estoque.db")):
        raise SystemExit(f"Banco nao encontrado em {folder}. Rode primeiro: gerar-banco")
    _use_dir(folder)
    from app.services.assistant_chat_service import AssistantChatService
    from app.services.assistant_direct_service import AssistantDirectService

    result = AssistantDirectService().answer(question) if direct else AssistantChatService().chat(question, canal="teste")
    print(result["resposta"])
    print()
    print(f"[modo: {result['modo']} | ferramentas: {', '.join(result['ferramentas_usadas']) or '-'}]")
    if result.get("aviso"):
        print(f"[aviso: {result['aviso']}]")
    for product in result["produtos"]:
        print(f"[produto #{product['id']}: {product['nome']} - {product['estoque_por_local'] or 'sem estoque'}]")


def _write_qr_page(path: str, body: str, refresh: bool) -> None:
    """Pagina local com o QR (o terminal deforma o QR e o celular nao le)."""
    meta = '<meta http-equiv="refresh" content="2">' if refresh else ""
    html = (
        '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'
        f"<title>Conectar WhatsApp - Chronos</title>{meta}"
        "<style>body{font-family:Segoe UI,sans-serif;text-align:center;padding:24px;"
        "background:#fff;color:#111}img{width:360px;height:360px}</style></head>"
        f"<body>{body}</body></html>"
    )
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(html)
    os.replace(tmp, path)


def whatsapp(folder: str) -> None:
    """Liga a ponte WhatsApp (modo copiloto) no banco de teste, com o QR code numa janela do navegador."""
    if not os.path.exists(os.path.join(folder, "estoque.db")):
        raise SystemExit(f"Banco nao encontrado em {folder}. Rode primeiro: gerar-banco")
    _use_dir(folder)
    import webbrowser
    from pathlib import Path

    import segno

    from app.services.whatsapp_bridge_service import WhatsAppBridge
    from app.services.whatsapp_neonize_transport import NeonizeTransport

    holder: Dict = {"aberto": False, "conectado": False}
    page = os.path.join(folder, "whatsapp_qr.html")

    def on_qr(code: str) -> None:
        image = segno.make_qr(code).svg_data_uri(scale=8, border=4)
        _write_qr_page(
            page,
            "<h2>Conectar o WhatsApp ao Chronos</h2>"
            "<p>No celular: WhatsApp &gt; Configurações &gt; Aparelhos conectados &gt; Conectar um aparelho</p>"
            f'<img src="{image}" alt="QR code">'
            "<p>O código muda a cada ~20 segundos; esta página se atualiza sozinha.</p>",
            refresh=True,
        )
        if not holder["aberto"]:
            holder["aberto"] = True
            webbrowser.open(Path(page).as_uri())
            print("[whatsapp] QR code aberto no navegador. Escaneie por la (atualiza sozinho).")

    def on_state(state: str) -> None:
        print(f"[whatsapp] {state}")
        if state == "conectado":
            holder["conectado"] = True
            _write_qr_page(page, "<h2>Conectado ✅</h2><p>Pode fechar esta janela.</p>", refresh=False)
            print(
                "\nPronto. Teste na conversa 'Mensagem para mim':\n"
                "  1. mande um codigo (ex.: 805314) e depois um audio 'temos essa dai?'\n"
                "  2. reaja com 🤖 no audio: a resposta chega na mesma conversa\n"
                "  3. mande /ajuda para ver os comandos\n"
                "Ctrl+C para sair."
            )

    transport = NeonizeTransport(
        os.path.join(folder, "whatsapp_sessao.db"),
        on_message=lambda message: holder["bridge"].handle(message),
        on_qr=on_qr,
        on_state=on_state,
    )
    holder["bridge"] = WhatsAppBridge(transport)
    print("Conectando ao WhatsApp... (o assistente usa a chave do Groq de GROQ_API_KEY ou das Configuracoes)")
    try:
        transport.client.connect()  # fica aqui ate Ctrl+C
    except KeyboardInterrupt:
        transport.stop()
        return
    if not holder["conectado"]:
        _write_qr_page(page, "<h2>O QR code expirou</h2><p>Rode o comando de novo.</p>", refresh=False)
        print("\n[whatsapp] O QR code expirou sem ser escaneado. Rode o comando de novo.")


def coverage(folder: str) -> None:
    """Quantos produtos ativos (e com estoque) estao ligados a uma ficha do catalogo."""
    if not os.path.exists(os.path.join(folder, "estoque.db")):
        raise SystemExit(f"Banco nao encontrado em {folder}.")
    _use_dir(folder)
    from core.catalog.bundle import apply_catalog_bundle, relink_catalog
    from core.database.connection import DatabaseConnection
    from core.database.migration_manager import MigrationManager

    # Mesmo preparo da abertura do app (por isso usar uma copia do banco real).
    db = DatabaseConnection()
    MigrationManager(db).check_and_run_migrations()
    print(f"Catalogo: {apply_catalog_bundle(db).get('status')}  vinculos: {relink_catalog(db).get('status')}\n")

    conn = db.get_connection()
    try:
        row = conn.execute(
            """
            WITH stock AS (
                SELECT produto_id, SUM(quantidade) AS qtd FROM produto_estoque GROUP BY produto_id
            ), linked AS (
                SELECT DISTINCT produto_id FROM produto_catalogo_vinculo WHERE status <> 'REJEITADO'
            )
            SELECT
                COUNT(*) AS ativos,
                SUM(CASE WHEN l.produto_id IS NOT NULL THEN 1 ELSE 0 END) AS ativos_com_ficha,
                SUM(CASE WHEN COALESCE(s.qtd, 0) > 0 THEN 1 ELSE 0 END) AS com_estoque,
                SUM(CASE WHEN COALESCE(s.qtd, 0) > 0 AND l.produto_id IS NOT NULL THEN 1 ELSE 0 END)
                    AS com_estoque_e_ficha
            FROM produtos p
            LEFT JOIN stock s ON s.produto_id = p.id
            LEFT JOIN linked l ON l.produto_id = p.id
            WHERE p.ativo = 1
            """
        ).fetchone()
        missing = conn.execute(
            """
            SELECT p.nome FROM produtos p
            WHERE p.ativo = 1
              AND (SELECT COALESCE(SUM(quantidade), 0) FROM produto_estoque e WHERE e.produto_id = p.id) > 0
              AND NOT EXISTS (
                  SELECT 1 FROM produto_catalogo_vinculo v WHERE v.produto_id = p.id AND v.status <> 'REJEITADO'
              )
            ORDER BY p.nome LIMIT 30
            """
        ).fetchall()
    finally:
        conn.close()

    def pct(part: int, total: int) -> str:
        return f"{(100 * part / total):.0f}%" if total else "-"

    ativos, com_ficha, com_estoque, com_estoque_ficha = (int(v or 0) for v in row)
    print(f"Produtos ativos:            {ativos}")
    print(f"  com ficha no catalogo:    {com_ficha} ({pct(com_ficha, ativos)})")
    print(f"Produtos com estoque:       {com_estoque}")
    print(f"  com ficha no catalogo:    {com_estoque_ficha} ({pct(com_estoque_ficha, com_estoque)})")
    if missing:
        print("\nCom estoque e sem ficha (ate 30) - a busca por veiculo nao acha estes:")
        for (nome,) in missing:
            print(f"  - {nome}")


def main() -> None:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
    logging.basicConfig(level=logging.WARNING)

    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--pasta", default=DEFAULT_DIR, help=f"Pasta do banco de teste (padrao: {DEFAULT_DIR})")
    sub = parser.add_subparsers(dest="comando", required=True)

    gen = sub.add_parser("gerar-banco", help="Cria o banco de teste a partir do catalogo embutido")
    gen.add_argument("--produtos", type=int, default=250, help="Produtos sorteados do catalogo (padrao: 250)")
    gen.add_argument("--seed", type=int, default=7)
    gen.add_argument("--substituir", action="store_true", help="Apaga o banco existente na pasta")

    sub.add_parser("codigo", help="Ferramenta buscar_por_codigo").add_argument("codigo")
    sub.add_parser("aplicacao", help="Ferramenta buscar_por_aplicacao").add_argument("texto")
    sub.add_parser("produto", help="Ferramenta detalhe_produto").add_argument("produto_id", type=int)
    sub.add_parser("cobertura", help="Quantos produtos com estoque tem ficha no catalogo")
    ask_parser = sub.add_parser("perguntar", help="Pergunta para o assistente (IA configurada ou busca direta)")
    ask_parser.add_argument("pergunta")
    ask_parser.add_argument("--sem-ia", action="store_true", help="So a busca direta, sem chamar a IA")
    sub.add_parser("whatsapp", help="Liga a ponte WhatsApp (modo copiloto) no banco de teste, QR no terminal")

    args = parser.parse_args()
    if args.comando == "gerar-banco":
        generate_database(args.pasta, args.produtos, args.seed, args.substituir)
    elif args.comando == "perguntar":
        ask(args.pasta, args.pergunta, args.sem_ia)
    elif args.comando == "whatsapp":
        whatsapp(args.pasta)
    elif args.comando == "cobertura":
        coverage(args.pasta)
    elif args.comando == "codigo":
        run_tool(args.pasta, "buscar_por_codigo", {"codigo": args.codigo})
    elif args.comando == "aplicacao":
        run_tool(args.pasta, "buscar_por_aplicacao", {"texto": args.texto})
    elif args.comando == "produto":
        run_tool(args.pasta, "detalhe_produto", {"produto_id": args.produto_id})


if __name__ == "__main__":
    main()
