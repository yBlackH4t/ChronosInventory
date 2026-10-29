"""Cadastro da empresa: arquivo de produtos da loja (.csv) -> produtos que faltam + aplicacoes."""

import pytest

from app.services.company_register_service import CompanyRegisterService
from app.services.own_ficha_service import OwnFichaReadOnlyError
from core.catalog import company_register as register
from core.catalog.bundle import catalog_status, run_catalog_startup
from core.database.connection import DatabaseConnection
from core.exceptions import ValidationException
from test_assistant_tools import CANOAS, _create_product, tools  # noqa: F401  (fixture: catalogo + produtos)

# Igual ao arquivo do sistema da loja: cp1252, ";", aplicacao quebrada em varias linhas.
CSV = (
    "CD_MATERIAL;DS_MATERIAL;CD_IDENTIFICACAO;VL_VENDA;DS_OBS;DS_PRODUCAO;;;;\r\n"
    "-----------;-----------;----------------;--------;------;-----------;;;;\r\n"
    "101;TURBO BORG K29 53299887201;53299887201;23.040.000.000;NULL;CAMINHAO VOLKS 19320 CONSTELLATION - MOTOR: CUMMINS ISC 8.3;;;;\r\n"
    " SIMILAR HOLSET: 4047413 / 4044509 / SIMILAR GARRETT: 806589-5001S;;;;;;;;;\r\n"
    ";;;;;;;;;\r\n"
    "104;TURBO BORG S2EL 766595;766595;26.630.000.000;NULL; CASE TRATOR CS120 / 130 / 150;;;;\r\n"
    "MOTOR: 620DS;;;;;;;;;\r\n"
    "OE 162000110700;;;;;;;;;\r\n"
    "MASSEY FERGUSON MF7350 / 7370 /;;;;;;;;;\r\n"
    "7415 MOTOR: 620DS / 620DSA;;;;;;;;;\r\n"
    "EIXO: 42/49,95 / ROTOR: 39,4/56;;;;;;;;;\r\n"
    "105;TURBO HOLSET HX55W 4031196 MONTADA;4031196;1.000.000.000;NULL;VOLVO FH 440;;;;\r\n"
    "106;EMBREAGEM VISCOSA S710 - 15.07ED00034.A;15.07ED00034.A;.0000000;NULL;FORD CARGO 2631;;;;\r\n"
    "107;CONJUNTO CENTRAL VW VOLARE W8;NULL;.0000000;NULL;VOLARE W8 W9 ELETRÔNICO;;;;\r\n"
    "108;TURBO GARRETT GT42 723117-5001S;723117-5001S;.0000000;NULL;SCANIA 113 - MOTOR: DSC11;;;;\r\n"
).encode("cp1252")


def _service(can_edit=True):
    backups = []
    service = CompanyRegisterService(
        can_edit=lambda: {"pode_editar": can_edit},
        make_backup=lambda: backups.append(1) or "backup_pre_cadastro_teste.db",
    )
    return service, backups


def test_reads_the_free_text_applications():
    items = register.read_items(CSV)
    assert [i["cd_material"] for i in items] == [101, 104, 105, 106, 107, 108]
    assert items[4]["codigo"] == ""  # NULL

    details = register.parse_details(items[1]["linhas"])
    assert [(a["veiculo"], a["motor"]) for a in details["aplicacoes"]] == [
        ("CASE TRATOR CS120 / 130 / 150", "620DS"),
        ("MASSEY FERGUSON MF7350 / 7370 / 7415", "620DS / 620DSA"),
    ]
    assert [(c["fabricante"], c["numero"]) for c in details["codigos"]] == [("OEM", "162000110700")]
    assert details["notas"] == ["EIXO: 42/49,95 / ROTOR: 39,4/56"]

    details = register.parse_details(items[0]["linhas"])
    assert [(c["fabricante"], c["numero"]) for c in details["codigos"]] == [
        ("HOLSET", "4047413"), ("HOLSET", "4044509"), ("GARRETT", "806589-5001S"),
    ]
    # "MOTOR: OM" continua na linha de baixo; "210CV" sozinho e sobra do motor.
    details = register.parse_details(["MERCEDES O 371UP MBB / MOTOR: OM", "366LA 230CV", "MERCEDES OH 1721 / MOTOR: OM 366A", "210CV"])
    assert [(a["veiculo"], a["motor"]) for a in details["aplicacoes"]] == [
        ("MERCEDES O 371UP MBB", "OM 366LA 230CV"), ("MERCEDES OH 1721", "OM 366A 210CV"),
    ]
    assert register.fix_text("caminh?o / ?nibus") == "CAMINHÃO / ÔNIBUS"

    with pytest.raises(ValidationException, match="cadastro de produtos"):
        register.read_items(b"nome;codigo\r\nTURBO;123\r\n")


def test_import_adds_missing_products_and_teaches_applications(client, tools):  # noqa: F811
    gt42 = _create_product(client, "TURBO GT42 - 723117-5001", {CANOAS: 1})
    service, backups = _service()
    preview = service.preview(CSV)
    # O GT42 ja existe (com outro nome, mesmo codigo): muda de numero; 4031196 MONTADA e novo (o normal e outra versao).
    assert preview["itens_no_arquivo"] == 6
    assert preview["produtos_novos"] == 5
    assert "TURBO GARRETT GT42 723117-5001S" not in preview["exemplos_produtos_novos"]
    # Fichas: K29, S2EL e GT42 (o 4031196 ja tem ficha Master Power; embreagem nao e turbo; Volare sem codigo).
    assert preview["fichas"] == 3
    assert preview["ignorados"] == {"outras_pecas": 1, "sem_codigo": 1, "no_catalogo_master_power": 1, "sem_aplicacao": 0}
    assert backups == []  # previa nao grava nada

    result = service.apply(CSV)
    assert result["produtos_criados"] == 5 and backups == [1]
    assert catalog_status(DatabaseConnection())["fichas_cadastro"] == 3

    products = {p["nome"]: p for p in client.get("/produtos", params={"page_size": 100}).json()["data"]}
    novo = products["TURBO BORG S2EL 766595"]
    assert novo["total_stock"] == 0 and "material 104" in (novo.get("observacao") or "")

    # O assistente acha pelo veiculo e pelo codigo similar.
    by_vehicle = tools.search_by_application("massey 620ds")
    assert by_vehicle["fichas_catalogo"][0]["nossos_produtos"][0]["nome"] == "TURBO BORG S2EL 766595"
    assert "turbo S2EL" in by_vehicle["texto_pronto"]  # zerado: "não temos (cadastrado, sem estoque)"
    # O GT42 do Chronos (mesmo codigo, numero fora do arquivo) foi para o numero da loja, com o nome dela.
    assert "TURBO GARRETT GT42 723117-5001S* — 1 em Canoas" in tools.search_by_application("scania 113 dsc11")["texto_pronto"]
    assert client.get(f"/produtos/{gt42}").status_code == 404
    by_similar = tools.search_by_code("4047413")["texto_pronto"].splitlines()
    assert by_similar[1] == "É código Holset; no cadastro da empresa é a *53299887201* (turbo K29)."
    assert "não achei" in tools.catalog_code("766595")["texto_pronto"]  # nao e ficha Master Power
    # O codigo da ficha do cadastro nao e "codigo Master Power".
    assert "Master Power" not in tools.search_by_code("766595")["texto_pronto"]
    assert "Master Power" not in tools.search_by_code("53299887201")["texto_pronto"]

    # Importar de novo nao duplica produtos.
    assert service.apply(CSV)["produtos_criados"] == 0

    # O pacote do catalogo apaga as tabelas catalogo_*: a abertura do app recopia.
    conn = DatabaseConnection().get_connection()
    try:
        conn.execute("DELETE FROM catalogo_produtos WHERE fonte_id = (SELECT id FROM catalogo_fontes WHERE codigo='CADASTRO')")
        conn.commit()
    finally:
        conn.close()
    run_catalog_startup(DatabaseConnection())
    assert catalog_status(DatabaseConnection())["fichas_cadastro"] == 3

    assert service.remove() == {"fichas_removidas": 3}
    assert catalog_status(DatabaseConnection())["fichas_cadastro"] == 0
    assert tools.search_by_application("massey 620ds")["fichas_catalogo"] == []


def test_only_the_publisher_imports(client, tools):  # noqa: F811
    service, backups = _service(can_edit=False)
    assert service.status()["pode_editar"] is False
    with pytest.raises(OwnFichaReadOnlyError):
        service.apply(CSV)
    assert backups == []


def test_api_preview_and_import(client, tools, monkeypatch):  # noqa: F811
    from backend.app.api.routers import catalog as catalog_router

    service, _ = _service()
    client.app.dependency_overrides[catalog_router.get_company_register_service] = lambda: service
    try:
        files = {"file": ("produtos_completos.csv", CSV, "text/csv")}
        preview = client.post("/catalogo/cadastro/previa", files=files)
        assert preview.status_code == 200, preview.text
        assert preview.json()["data"]["produtos_novos"] == 6

        done = client.post("/catalogo/cadastro/importar", files=files, params={"criar_produtos": "false"})
        assert done.status_code == 200, done.text
        assert done.json()["data"]["produtos_criados"] == 0
        assert done.json()["data"]["status"]["fichas_cadastro"] == 3
        assert client.get("/catalogo/cadastro").json()["data"]["fichas"] == 3
        # Sem produto cadastrado: o codigo da ficha do cadastro nao vira "codigo Master Power".
        answer = tools.search_by_code("766595")["texto_pronto"]
        assert "Master Power" not in answer and "no cadastro da empresa" in answer

        empty = client.post("/catalogo/cadastro/previa", files={"file": ("x.csv", b"", "text/csv")})
        assert empty.status_code == 400
    finally:
        client.app.dependency_overrides.clear()
    _create_product(client, "TURBO TESTE 1234567", {CANOAS: 1})  # o app segue normal depois


# Ids iguais aos do sistema da loja: o cadastro do Chronos veio dele (#866 = material 866).
ID_CSV = (
    "CD_MATERIAL;DS_MATERIAL;CD_IDENTIFICACAO;VL_VENDA;DS_OBS;DS_PRODUCAO;;;;\r\n"
    "-----------;-----------;----------------;--------;------;-----------;;;;\r\n"
    "1;TURBO HOLSET HX55W - 3797851/4031196/5452349;3797851;.0000000;NULL;VOLVO FH 440;;;;\r\n"
    "2;TURBO HX40 - 4036420;4036420;.0000000;NULL; ;;;;\r\n"
    "3;GASOLINA C ADITIVADA;NULL;.0000000;NULL; ;;;;\r\n"
    "4;JUNTA COLETOR ESCAPE VOLVO VM330;NULL;.0000000;NULL; ;;;;\r\n"
    "50;TURBO HX35W - 4047313;4047313;.0000000;NULL; ;;;;\r\n"
    "60;TURBO HE200WG 5455135;5455135;.0000000;NULL; ;;;;\r\n"
    "7;TURBO GTA2056V - BC.0053T;NULL;.0000000;NULL; ;;;;\r\n"
    "70;TURBO HX27W 3779951;3779951;.0000000;NULL; ;;;;\r\n"
    "80;TURBO HOLSET HX40W - 3597761;3597761;.0000000;NULL; ;;;;\r\n"
    "9;TURBO HX82 -4033487/2840258;4033487;.0000000;NULL; ;;;;\r\n"
    "90;TURBO HX52 -4042228/4031125;4042228;.0000000;NULL; ;;;;\r\n"
    "100;IMP CONJUNTO CENTRAL - 7100-001-3038 T04E66;7100-001-3038;.0000000;NULL; ;;;;\r\n"
).encode("cp1252")


def test_ids_and_names_follow_the_store_system(client):
    from test_assistant_tools import _create_product as create

    hx55 = create(client, "TURBO HX55W - 4031196/3797851", {CANOAS: 2})
    hx40 = create(client, "TURBO HX40 - 4036420/3596989", {})
    b3 = create(client, "TURBO B3 - 13919880060", {CANOAS: 1})
    junta = create(client, "JUNTA COLETOR ESCAPE CUMMINS", {})
    hx35 = create(client, "TURBO HX35W - 4047313", {CANOAS: 1})
    antigo = create(client, "TURBO ANTIGO 1234567", {})
    # O Chronos criou o HX27W no 7, que na loja e outra peca; o HX40W no 8, que a loja nao usa.
    hx27 = create(client, "TURBO HX27W 3779951", {CANOAS: 1})
    hx40w = create(client, "TURBO HX40W - 3597761", {CANOAS: 1})
    # O 9 e a mesma peca do arquivo (4033487) e fica la; o 10 so tem o modelo (T04E66) em comum com o 100.
    hx82 = create(client, "TURBO HX55 - 4042228D / 4031125/4033487", {})
    t04 = create(client, "CONJUNTO CENTRAL T04E66 - 7100-001-0148", {})
    assert [hx55, hx40, b3, junta, hx35, antigo, hx27, hx40w, hx82, t04] == list(range(1, 11))
    conn = DatabaseConnection().get_connection()
    try:
        conn.execute("INSERT INTO product_images (product_id, image_data, is_primary) VALUES (5, x'00', 1)")
        conn.commit()
    finally:
        conn.close()

    service, _ = _service()
    preview = service.preview(ID_CSV)
    assert preview["iguais"] == 0
    assert preview["nomes_trocados"] == 4  # HX55, HX40 e HX82 (mesmo codigo) e a junta (zerada, sem movimentacao)
    assert [(m["de"], m["para"]) for m in preview["exemplos_ids"]] == [(5, 50), (7, 70), (8, 80)]
    # O HE200WG, a GTA2056V no 7 (que ficou livre), o HX52 e o conjunto 100.
    assert preview["produtos_novos"] == 4
    # Mesmo id, outra peca com saldo: nao vira gasolina sozinho.
    assert [(c["cd_material"], c["nome_chronos"]) for c in preview["para_conferir"]] == [(3, "TURBO B3 - 13919880060")]
    assert preview["fora_do_arquivo"] == 2

    result = service.apply(ID_CSV)
    assert (result["nomes_trocados"], result["ids_trocados"], result["produtos_criados"]) == (4, 3, 4)

    def product(pid):
        response = client.get(f"/produtos/{pid}")
        return response.json()["data"] if response.status_code == 200 else None

    assert product(1)["nome"] == "TURBO HOLSET HX55W - 3797851/4031196/5452349" and product(1)["total_stock"] == 2
    assert "TURBO HX55W - 4031196/3797851" in product(1)["observacao"]  # o nome antigo fica anotado
    assert product(3)["nome"] == "TURBO B3 - 13919880060"
    assert product(4)["nome"] == "JUNTA COLETOR ESCAPE VOLVO VM330"
    # O HX35W foi para o id 50 com saldo, movimentacao e foto.
    assert product(5) is None and product(50)["total_stock"] == 1
    assert product(60)["nome"] == "TURBO HE200WG 5455135" and product(60)["total_stock"] == 0
    assert product(70)["nome"] == "TURBO HX27W 3779951" and product(70)["total_stock"] == 1
    assert product(7)["nome"] == "TURBO GTA2056V - BC.0053T" and product(7)["total_stock"] == 0
    # Mesmo codigo, outro nome e outro numero: vai para o numero da loja com o nome dela.
    assert product(80)["nome"] == "TURBO HOLSET HX40W - 3597761" and product(80)["total_stock"] == 1
    assert product(8) is None
    conn = DatabaseConnection().get_connection()
    try:
        assert conn.execute("SELECT COUNT(*) FROM movimentacoes WHERE produto_id = 50").fetchone()[0] >= 1
        assert conn.execute("SELECT COUNT(*) FROM movimentacoes WHERE produto_id = 5").fetchone()[0] == 0
        assert conn.execute("SELECT product_id FROM product_images").fetchone()[0] == 50
        assert conn.execute("PRAGMA foreign_key_check").fetchall() == []
    finally:
        conn.close()
    # O codigo que so estava no nome antigo continua achando o produto.
    found = client.get("/produtos", params={"query": "3596989"}).json()["data"]
    assert [p["id"] for p in found] == [2]
    # O proximo produto do Chronos vem depois dos ids do arquivo.
    assert create(client, "TURBO TESTE 7654321", {}) == 101

    # Rodar de novo nao muda nada.
    again = service.apply(ID_CSV)
    assert (again["nomes_trocados"], again["ids_trocados"], again["produtos_criados"]) == (0, 0, 0)
    assert again["iguais"] == 11


# Observacoes reais do arquivo da loja (2.7.18): faz par, conjunto, substitui, codigo antigo.
CSV_RELATIONS = (
    "CD_MATERIAL;DS_MATERIAL;CD_IDENTIFICACAO;VL_VENDA;DS_OBS;DS_PRODUCAO;;;;\r\n"
    "-----------;-----------;----------------;--------;------;-----------;;;;\r\n"
    "4249;TURBO GARRETT 883860-5003S;883860-5003S;.0000000;NULL;FRONTIER BITURBO 190 CV / MASTER 2.3L BI-TURBO DIESEL 2017 - GT2260S;;;;\r\n"
    "*FAZ PAR COM 846016-5002*;;;;;;;;;\r\n"
    "3657;TURBO GARRETT GT1238MZ - 846016-5002S;846016-5002S;.0000000;NULL;BI-TURBO - RENAULT, MASTER ENERGY DCI 145 / 165;;;;\r\n"
    "*FAZ PAR COM 883860-5013*;;;;;;;;;\r\n"
    "512;TURBO HE300FG - 3770052/4309099;3770052;.0000000;NULL;CAMINHAO MAN 8150E - MOTOR: CUMMINS ISF 3.8;;;;\r\n"
    "TURBINA GRANDE, FAZ PAR COM O TURBO PEQUENO HX27W 2843674;;;;;;;;;\r\n"
    "CONJUNTOS: SL.2444 / BC.0237;;;;;;;;;\r\n"
    "513;TURBO HX27W - 4309098 / 2843674;2843674;.0000000;NULL;CAMINHAO MAN 8150E - MOTOR: CUMMINS ISF 3.8;;;;\r\n"
    "TURBO PEQUENO, FAZ PAR COM O TURBO;;;;;;;;;\r\n"
    "GRANDE HE300FG 3770052;;;;;;;;;\r\n"
    "1741;CONJUNTO CENTRAL HE300FG MAIOR - BC.0237;BC.0237;.0000000;NULL;VW 8160 DELIVERY ISF 3.8L BI-TURBO CONJUNTO MAIOR;;;;\r\n"
    "46;TURBO S2A-204 - 798644;798644;.0000000;NULL;GM D20 INTERC - MOTOR: Q20B 4.236V;;;;\r\n"
    "SUBSTITUIR PELO TURBO GARRETT;;;;;;;;;\r\n"
    "704944-5001 OU O TURBO BORG 797332;;;;;;;;;\r\n"
    "4442;TURBO GARRETT - 821785-5005S;821785-5005S;.0000000;NULL;FIAT TORO 2.0 16V MULTIJET / ANTIGO: 821785-5002S;;;;\r\n"
    "7;TURBO BORG S400 14009900000;14009900000;.0000000;NULL;SCANIA KT 112 - MOTOR: DSC11;;;;\r\n"
    "SIMILAR GARRETT 716639-5001S (SOMENTE PARA SCANIA);;;;;;;;;\r\n"
    "NAO TEMOS CONJUNTO!;;;;;;;;;\r\n"
).encode("cp1252")


def test_reads_pair_core_replacement_and_old_code():
    items = {i["cd_material"]: i for i in register.read_items(CSV_RELATIONS)}

    # "FAZ PAR" nao e mais aplicacao: vira relacao, e a anotacao fica na ficha.
    details = register.parse_details(items[4249]["linhas"])
    assert [a["veiculo"] for a in details["aplicacoes"]] == ["FRONTIER BITURBO 190 CV / MASTER 2.3L BI-TURBO DIESEL 2017 - GT2260S"]
    assert [(r["tipo"], r["numero"]) for r in details["relacoes"]] == [("PAR", "846016-5002")]
    assert details["codigos"] == []  # o par nao e a mesma peca: fica fora dos codigos da ficha
    assert details["notas"] == ["FAZ PAR COM 846016-5002"]

    # O codigo do par na linha de baixo; o conjunto do turbo nao entra nos codigos da ficha.
    details = register.parse_details(items[513]["linhas"])
    assert [(r["tipo"], r["numero"], r["observacao"]) for r in details["relacoes"]] == [("PAR", "3770052", "GRANDE HE300FG")]
    assert [a["veiculo"] for a in details["aplicacoes"]] == ["CAMINHAO MAN 8150E"]
    details = register.parse_details(items[512]["linhas"])
    assert [(r["tipo"], r["numero"]) for r in details["relacoes"]] == [
        ("PAR", "2843674"), ("CONJUNTO", "SL.2444"), ("CONJUNTO", "BC.0237"),
    ]
    assert details["codigos"] == []

    # "Substituir pelo turbo Garrett" com os codigos na linha de baixo; "antigo" e a mesma peca.
    details = register.parse_details(items[46]["linhas"])
    assert [(r["tipo"], r["numero"]) for r in details["relacoes"]] == [("TROCAR_POR", "704944-5001"), ("TROCAR_POR", "797332")]
    details = register.parse_details(items[4442]["linhas"])
    assert [(c["fabricante"], c["numero"]) for c in details["codigos"]] == [("CODIGO ANTIGO", "821785-5002S")]
    assert [a["veiculo"] for a in details["aplicacoes"]] == ["FIAT TORO 2.0 16V MULTIJET"]

    # Ressalva do similar vai junto; "nao temos conjunto" e anotacao, nao aplicacao.
    details = register.parse_details(items[7]["linhas"])
    assert [(r["tipo"], r["numero"], r["observacao"]) for r in details["relacoes"]] == [
        ("SIMILAR", "716639-5001S", "SOMENTE PARA SCANIA"),
    ]
    assert details["notas"] == ["NAO TEMOS CONJUNTO!"]
    assert [a["veiculo"] for a in details["aplicacoes"]] == ["SCANIA KT 112"]

    rows = register.build_relations(list(items.values()))
    assert ("3770052", "PAR", "2843674") in {(r["origem_norm"], r["tipo"], r["numero_norm"]) for r in rows}


def test_search_shows_the_biturbo_pair_and_the_core(client, tools):  # noqa: F811
    # A importacao poe os produtos no numero da loja (CD_MATERIAL).
    _create_product(client, "TURBO GARRETT GT1238MZ - 846016-5002S", {CANOAS: 1})
    _create_product(client, "TURBO GARRETT 883860-5003S", {CANOAS: 1})
    _create_product(client, "TURBO HE300FG - 3770052/4309099", {CANOAS: 2})
    _create_product(client, "CONJUNTO CENTRAL HE300FG MAIOR - BC.0237", {CANOAS: 3})
    scania = _create_product(client, "TURBO GARRETT 716639-5001S", {CANOAS: 1})
    small, big, core = 3657, 512, 1741
    service, _ = _service()
    result = service.apply(CSV_RELATIONS, criar_produtos=False)
    assert result["relacoes_por_tipo"]["PAR"] == 6

    # O 846016 diz "883860-5013", que nao existe: fica o 883860-5003, que diz 846016-5002.
    text = tools.search_by_code("883860-5003")["texto_pronto"]
    assert "FAZ PAR" not in text
    assert "• Faz par (biturbo) com *846016-5002* (pelo cadastro): *TURBO GARRETT GT1238MZ - 846016-5002S* — 1 em Canoas" in text
    pair = tools.search_by_code("846016-5002")
    assert [r["codigo"] for r in pair["relacoes_cadastro"]] == ["883860-5003S"]

    # O turbo pequeno acha o grande e o conjunto do grande; o conjunto acha o turbo dele.
    text = tools.search_by_code("2843674")["texto_pronto"]
    assert "• Faz par (biturbo) com *3770052* (GRANDE HE300FG) (pelo cadastro): *TURBO HE300FG - 3770052/4309099* — 2 em Canoas" in text
    assert "Vai no turbo *3770052*" in tools.search_by_code("BC.0237")["texto_pronto"]
    assert "Conjunto central *BC.0237* (pelo cadastro)" in tools.search_by_code("3770052")["texto_pronto"]
    # O outro codigo da mesma peca tambem acha o par e o conjunto, e o par aparece uma vez so.
    other_code = tools.search_by_code("4309099")["texto_pronto"]
    assert "Conjunto central *BC.0237* (pelo cadastro)" in other_code and "Faz par (biturbo) com *2843674*" in other_code
    assert tools.search_by_code("2843674")["texto_pronto"].count("Faz par") == 1

    columns = client.get("/produtos/colunas", params={"codigo": "2843674"}).json()["data"]
    by_key = {col["chave"]: col for col in columns["colunas"]}
    assert [i["produto"]["id"] for i in by_key["par"]["itens"]] == [big]
    assert by_key["par"]["itens"][0]["rotulo"] == "Faz par"
    columns = client.get("/produtos/colunas", params={"codigo": "3770052"}).json()["data"]
    by_key = {col["chave"]: col for col in columns["colunas"]}
    assert [i["produto"]["id"] for i in by_key["conjunto"]["itens"]] == [core]
    assert small not in [i["produto"]["id"] for col in columns["colunas"] for i in col["itens"]]

    # Similar ja achado pela ficha do catalogo: a ressalva do cadastro continua junto.
    s400 = tools.search_by_code("14009900000")
    (similar,) = [p for p in s400["produtos"] if p["id"] == scania]
    assert similar["obs_cadastro"] == "similar: SOMENTE PARA SCANIA"
    assert "similar: SOMENTE PARA SCANIA, pelo cadastro da empresa; conferir" in s400["texto_pronto"]

    assert service.remove()["fichas_removidas"] >= 1
    assert "relacoes_cadastro" not in tools.search_by_code("883860-5003")
