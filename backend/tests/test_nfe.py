"""Baixa de estoque bipando o codigo de barras do DANFE (chave da NF-e) e lendo o XML."""

from core.nfe_xml import chave_from_code

CANOAS = 11
CHAVE = "43261003897158000285550020000145601821211022"
EMIT_CNPJ = "03897158000285"


def _xml(chave=CHAVE, itens=(("0004389", "TURBO GARRET GT4594BNS 876272-5017S", "2.0000"),), c_stat="100"):
    dets = "".join(
        f"""<det nItem="{n}"><prod><cProd>{codigo}</cProd><cEAN>SEM GTIN</cEAN><xProd>{desc}</xProd>
        <NCM>84148021</NCM><CFOP>5102</CFOP><uCom>PC</uCom><qCom>{qtd}</qCom></prod></det>"""
        for n, (codigo, desc, qtd) in enumerate(itens, start=1)
    )
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
<NFe><infNFe Id="NFe{chave}" versao="4.00">
<ide><natOp>VENDA DE MERCADORIAS</natOp><serie>2</serie><nNF>14560</nNF>
<dhEmi>2026-10-13T15:29:00-03:00</dhEmi><tpNF>1</tpNF></ide>
<emit><CNPJ>{EMIT_CNPJ}</CNPJ><xNome>MONTREAL COMERCIO DE PECAS - CANOAS</xNome></emit>
<dest><CNPJ>53870235000109</CNPJ><xNome>B2PECAS LTDA</xNome></dest>
{dets}
</infNFe></NFe>
<protNFe versao="4.00"><infProt><chNFe>{chave}</chNFe><cStat>{c_stat}</cStat></infProt></protNFe>
</nfeProc>""".encode("utf-8")


def _setup(client, tmp_path, xml=None, filename=f"{CHAVE}-nfe.xml"):
    vendas = tmp_path / "Geradas" / "2026" / "10"
    vendas.mkdir(parents=True)
    (vendas / filename).write_bytes(xml or _xml())
    response = client.put("/nfe/config", json={"pastas_xml": [str(tmp_path / "Geradas"), str(tmp_path / "Distribuicao")]})
    assert response.status_code == 200, response.text
    return vendas


def _product(client, nome, qtd):
    response = client.post("/produtos", json={"nome": nome, "inventories": {str(CANOAS): qtd}})
    assert response.status_code == 201, response.text
    return response.json()["data"]["id"]


def _stock(client, product_id):
    return client.get(f"/produtos/{product_id}").json()["data"]["inventories"][str(CANOAS)]


def test_chave_is_recognized_with_spaces_and_checks_the_digit():
    assert chave_from_code("4326 1003 8971 5800 0285 5500 2000 0145 6018 2121 1022") == CHAVE
    assert chave_from_code(CHAVE[:-1] + "3") is None  # digito verificador errado
    assert chave_from_code("CI-12") is None
    assert chave_from_code("876272-5017S") is None


def test_scanning_the_danfe_previews_and_writes_off_the_items(client, tmp_path):
    _setup(client, tmp_path)
    turbo = _product(client, "TURBO GARRETT GT4594BNS 876272-5017S", 3)
    _product(client, "TURBO HOLSET HX55W 4031196", 1)

    preview = client.get(f"/nfe/{CHAVE}")
    assert preview.status_code == 200, preview.text
    data = preview.json()["data"]
    assert (data["numero"], data["serie"], data["tipo_sugerido"]) == (14560, 2, "SAIDA")
    assert data["destinatario"] == "B2PECAS LTDA" and data["autorizada"] and not data["cancelada"]
    assert data["ja_baixada"] is None
    [item] = data["itens"]
    assert item["quantidade"] == 2 and item["codigo"] == "0004389"
    assert item["produto_sugerido"]["id"] == turbo and item["confianca"] == "codigo"
    assert item["produto_sugerido"]["estoque"][str(CANOAS)] == 3

    body = {"tipo": "SAIDA", "location_id": CANOAS, "itens": [{"item": 1, "produto_id": turbo, "quantidade": 2}]}
    done = client.post(f"/nfe/{CHAVE}/baixa", json=body)
    assert done.status_code == 201, done.text
    assert done.json()["data"]["documento"] == "NF 14560"
    assert _stock(client, turbo) == 1

    movs = client.get("/movimentacoes", params={"documento": "14560"}).json()["data"]
    assert [(m["tipo"], m["quantidade"], m["produto_id"]) for m in movs] == [("SAIDA", 2, turbo)]
    assert "B2PECAS LTDA" in movs[0]["observacao"]

    # A mesma nota nao baixa duas vezes.
    again = client.post(f"/nfe/{CHAVE}/baixa", json=body)
    assert again.status_code == 400 and "ja foi baixada" in again.json()["error"]["message"]
    assert _stock(client, turbo) == 1
    assert client.get(f"/nfe/{CHAVE}").json()["data"]["ja_baixada"]["tipo"] == "SAIDA"


def test_confirmed_item_code_is_remembered_for_the_next_note(client, tmp_path):
    vendas = _setup(client, tmp_path, xml=_xml(itens=(("0009999", "TURBO ESPECIAL SEM CODIGO", "1"),)))
    product = _product(client, "TURBO ESPECIAL", 5)
    item = client.get(f"/nfe/{CHAVE}").json()["data"]["itens"][0]
    assert item["produto_sugerido"] is None and item["confianca"] == "nenhum"

    body = {"tipo": "SAIDA", "location_id": CANOAS, "itens": [{"item": 1, "produto_id": product, "quantidade": 1}]}
    assert client.post(f"/nfe/{CHAVE}/baixa", json=body).status_code == 201

    # Outra nota do mesmo emissor com o mesmo codigo ja vem ligada ao produto.
    other = "43261003897158000285550020000145611821211025"
    other = chave_from_code(other) or _fix_dv(other)
    (vendas / f"{other}-nfe.xml").write_bytes(_xml(chave=other, itens=(("0009999", "TURBO ESPECIAL SEM CODIGO", "1"),)))
    item = client.get(f"/nfe/{other}").json()["data"]["itens"][0]
    assert item["produto_sugerido"]["id"] == product and item["confianca"] == "aprendido"


def test_not_found_cancelled_and_insufficient_stock(client, tmp_path):
    vendas = _setup(client, tmp_path, xml=_xml(), filename="nota_sem_chave_no_nome.xml")
    turbo = _product(client, "TURBO GARRETT GT4594BNS 876272-5017S", 1)

    # Acha pelo conteudo mesmo sem a chave no nome do arquivo.
    assert client.get(f"/nfe/{CHAVE}").status_code == 200

    body = {"tipo": "SAIDA", "location_id": CANOAS, "itens": [{"item": 1, "produto_id": turbo, "quantidade": 2}]}
    short = client.post(f"/nfe/{CHAVE}/baixa", json=body)
    assert short.status_code == 409
    assert _stock(client, turbo) == 1
    # Nada ficou registrado: a nota continua livre para baixar.
    assert client.get(f"/nfe/{CHAVE}").json()["data"]["ja_baixada"] is None

    missing = _fix_dv("43261003897158000285550020000999991821211020")
    response = client.get(f"/nfe/{missing}")
    assert response.status_code == 404 and "nao encontrado" in response.json()["error"]["message"]

    (vendas / f"110111{CHAVE}01-procEventoNFe.xml").write_bytes(
        f"<procEventoNFe><evento><infEvento><chNFe>{CHAVE}</chNFe><tpEvento>110111</tpEvento>"
        f"</infEvento></evento></procEventoNFe>".encode()
    )
    assert client.get(f"/nfe/{CHAVE}").json()["data"]["cancelada"] is True
    body["itens"][0]["quantidade"] = 1
    cancelled = client.post(f"/nfe/{CHAVE}/baixa", json=body)
    assert cancelled.status_code == 400 and "cancelada" in cancelled.json()["error"]["message"]
    assert _stock(client, turbo) == 1


def test_invalid_code_is_rejected(client):
    response = client.get("/nfe/12345")
    assert response.status_code == 400


def _fix_dv(chave: str) -> str:
    for dv in "0123456789":
        candidate = chave[:43] + dv
        if chave_from_code(candidate):
            return candidate
    raise AssertionError
