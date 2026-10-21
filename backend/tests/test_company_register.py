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
    "1;TURBO BORG K29 53299887201;53299887201;23.040.000.000;NULL;CAMINHAO VOLKS 19320 CONSTELLATION - MOTOR: CUMMINS ISC 8.3;;;;\r\n"
    " SIMILAR HOLSET: 4047413 / 4044509 / SIMILAR GARRETT: 806589-5001S;;;;;;;;;\r\n"
    ";;;;;;;;;\r\n"
    "4;TURBO BORG S2EL 766595;766595;26.630.000.000;NULL; CASE TRATOR CS120 / 130 / 150;;;;\r\n"
    "MOTOR: 620DS;;;;;;;;;\r\n"
    "OE 162000110700;;;;;;;;;\r\n"
    "MASSEY FERGUSON MF7350 / 7370 /;;;;;;;;;\r\n"
    "7415 MOTOR: 620DS / 620DSA;;;;;;;;;\r\n"
    "EIXO: 42/49,95 / ROTOR: 39,4/56;;;;;;;;;\r\n"
    "5;TURBO HOLSET HX55W 4031196 MONTADA;4031196;1.000.000.000;NULL;VOLVO FH 440;;;;\r\n"
    "6;EMBREAGEM VISCOSA S710 - 15.07ED00034.A;15.07ED00034.A;.0000000;NULL;FORD CARGO 2631;;;;\r\n"
    "7;CONJUNTO CENTRAL VW VOLARE W8;NULL;.0000000;NULL;VOLARE W8 W9 ELETRÔNICO;;;;\r\n"
    "8;TURBO GARRETT GT42 723117-5001S;723117-5001S;.0000000;NULL;SCANIA 113 - MOTOR: DSC11;;;;\r\n"
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
    assert [i["cd_material"] for i in items] == [1, 4, 5, 6, 7, 8]
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
    # O GT42 ja existe (com outro nome, mesmo codigo); 4031196 MONTADA e novo (o normal e outra versao).
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
    assert novo["total_stock"] == 0 and "material 4" in (novo.get("observacao") or "")

    # O assistente acha pelo veiculo e pelo codigo similar.
    by_vehicle = tools.search_by_application("massey 620ds")
    assert by_vehicle["fichas_catalogo"][0]["nossos_produtos"][0]["nome"] == "TURBO BORG S2EL 766595"
    assert "turbo S2EL" in by_vehicle["texto_pronto"]  # zerado: "não temos (cadastrado, sem estoque)"
    assert "TURBO GT42 - 723117-5001" in tools.search_by_application("scania 113 dsc11")["texto_pronto"]
    assert gt42
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
