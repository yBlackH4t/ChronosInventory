"""Baixa de estoque bipando o codigo de barras do DANFE (chave da NF-e) e lendo o XML."""

from core.nfe_xml import chave_from_code

CANOAS = 11
CHAVE = "43261003897158000285550020000145601821211022"
EMIT_CNPJ = "03897158000285"


def _xml(chave=CHAVE, itens=(("0004389", "TURBO GARRET GT4594BNS 876272-5017S", "2.0000"),), c_stat="100",
         emit=(EMIT_CNPJ, "MONTREAL COMERCIO DE PECAS - CANOAS"), dest=("53870235000109", "B2PECAS LTDA")):
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
<emit><CNPJ>{emit[0]}</CNPJ><xNome>{emit[1]}</xNome></emit>
<dest><CNPJ>{dest[0]}</CNPJ><xNome>{dest[1]}</xNome></dest>
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
    assert again.status_code == 400 and "já foi baixada" in again.json()["error"]["message"]
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
    assert response.status_code == 404 and "não encontrado" in response.json()["error"]["message"]

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


# ---------------------------------------------------------------------------
# Nota de fornecedor: o XML vem da SEFAZ com o certificado A1 da empresa
# ---------------------------------------------------------------------------

ENTRADA = "42261003897158000102550020000748831471059984"


def _pfx(tmp_path, senha="segredo1"):
    import datetime

    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.hazmat.primitives.serialization import pkcs12
    from cryptography.x509.oid import NameOID

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "MONTREAL COMERCIO DE PECAS LTDA:03897158000102")])
    now = datetime.datetime.now(datetime.timezone.utc)
    cert = (
        x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key())
        .serial_number(1).not_valid_before(now - datetime.timedelta(days=1))
        .not_valid_after(now + datetime.timedelta(days=300)).sign(key, hashes.SHA256())
    )
    path = tmp_path / "certificado.pfx"
    path.write_bytes(pkcs12.serialize_key_and_certificates(
        b"t", key, cert, None, serialization.BestAvailableEncryption(senha.encode())
    ))
    return str(path)


def test_supplier_note_is_downloaded_with_the_certificate_and_enters_stock(client, tmp_path, monkeypatch):
    from core import nfe_sefaz

    _setup(client, tmp_path)
    k27 = _product(client, "TURBO K27 - 53279887220", 1)
    calls = []

    def fake_download(chave, *, pfx, senha, cnpj, uf):
        calls.append((chave, senha, cnpj, uf))
        xml = _xml(
            chave=ENTRADA, itens=(("805", "TURBO K27 - 53279887220/7214", "2.0000"),),
            emit=("03897158000102", "MONTREAL COMERCIO DE PECAS LTDA"),
            dest=("03897158000285", "MONTREAL COMERCIO DE PECAS - CANOAS"),
        )
        return nfe_sefaz.SefazResult(c_stat="138", motivo="Documento localizado", xml=xml)

    monkeypatch.setattr(nfe_sefaz, "download_nfe", fake_download)

    # Sem certificado: explica o que fazer.
    missing = client.get(f"/nfe/{ENTRADA}")
    assert missing.status_code == 404 and "certificado" in missing.json()["error"]["message"]

    wrong = client.put("/nfe/certificado", json={"arquivo": _pfx(tmp_path), "senha": "errada"})
    assert wrong.status_code == 400 and "Senha errada" in wrong.json()["error"]["message"]
    saved = client.put("/nfe/certificado", json={"arquivo": _pfx(tmp_path), "senha": "segredo1"})
    assert saved.status_code == 200, saved.text
    config = saved.json()["data"]
    assert config["certificado"]["cnpj"] == "03897158000102" and "senha" not in config["certificado"]
    assert "segredo1" not in saved.text
    client.put("/nfe/config", json={"pastas_xml": config["pastas_xml"], "cnpj_loja": "03.897.158/0002-85"})

    preview = client.get(f"/nfe/{ENTRADA}")
    assert preview.status_code == 200, preview.text
    data = preview.json()["data"]
    assert data["tipo_sugerido"] == "ENTRADA" and data["numero"] == 14560
    assert data["itens"][0]["produto_sugerido"]["id"] == k27
    assert calls == [(ENTRADA, "segredo1", "03897158000285", "43")]

    # A segunda leitura usa o XML guardado: nao consulta a SEFAZ de novo.
    assert client.get(f"/nfe/{ENTRADA}").status_code == 200 and len(calls) == 1

    body = {"tipo": "ENTRADA", "location_id": CANOAS, "itens": [{"item": 1, "produto_id": k27, "quantidade": 2}]}
    assert client.post(f"/nfe/{ENTRADA}/baixa", json=body).status_code == 201
    assert _stock(client, k27) == 3
    mov = client.get("/movimentacoes", params={"documento": "14560", "tipo": "ENTRADA"}).json()["data"][0]
    assert "MONTREAL COMERCIO DE PECAS LTDA" in mov["observacao"]


def test_sefaz_answers_are_explained(client, tmp_path, monkeypatch):
    from core import nfe_sefaz

    _setup(client, tmp_path)
    client.put("/nfe/certificado", json={"arquivo": _pfx(tmp_path), "senha": "segredo1"})
    client.put("/nfe/config", json={"pastas_xml": [str(tmp_path / "Geradas")], "cnpj_loja": EMIT_CNPJ})
    answers = iter([
        nfe_sefaz.SefazResult(c_stat="138", motivo="ok", so_resumo=True),
        nfe_sefaz.SefazResult(c_stat="656", motivo="Consumo Indevido"),
    ])
    monkeypatch.setattr(nfe_sefaz, "download_nfe", lambda *a, **k: next(answers))

    resumo = client.get(f"/nfe/{ENTRADA}")
    assert resumo.status_code == 400 and "ciência da operação" in resumo.json()["error"]["message"]
    blocked = client.get(f"/nfe/{ENTRADA}")
    assert blocked.status_code == 404 and "Espere 1 hora" in blocked.json()["error"]["message"]

    removed = client.delete("/nfe/certificado").json()["data"]
    assert removed["certificado"] is None


def test_sefaz_response_parsing():
    import base64
    import gzip

    from core.nfe_sefaz import parse_response

    xml = _xml(chave=ENTRADA)
    doc = base64.b64encode(gzip.compress(xml)).decode()
    body = (
        '<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body>'
        '<retDistDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01"><cStat>138</cStat>'
        f'<xMotivo>Documento localizado</xMotivo><loteDistDFeInt><docZip NSU="1" schema="procNFe_v4.00.xsd">{doc}'
        "</docZip></loteDistDFeInt></retDistDFeInt></soap:Body></soap:Envelope>"
    ).encode()
    result = parse_response(body)
    assert result.c_stat == "138" and result.xml == xml and not result.so_resumo


def test_note_from_another_branch_enters_as_external_transfer_and_can_be_redone(client, tmp_path):
    matriz = ("03897158000102", "MONTREAL COMERCIO DE PECAS LTDA")
    canoas = ("03897158000285", "MONTREAL COMERCIO DE PECAS - CANOAS")
    _setup(client, tmp_path, xml=_xml(itens=(("805", "TURBO K27 - 53279887220/7214", "2"),), emit=matriz, dest=canoas))
    client.put("/nfe/config", json={"pastas_xml": [str(tmp_path / "Geradas")], "cnpj_loja": "03.897.158/0002-85"})
    k27 = _product(client, "TURBO K27 - 53279887220", 1)

    data = client.get(f"/nfe/{CHAVE}").json()["data"]
    assert data["tipo_sugerido"] == "ENTRADA"
    sugerido = data["movimento_sugerido"]["ENTRADA"]
    assert sugerido["natureza"] == "TRANSFERENCIA_EXTERNA"
    assert sugerido["local_externo"] == "MONTREAL COMERCIO DE PECAS LTDA"
    assert sugerido["observacao"].startswith("NF-e 14560 serie 2")

    # Primeiro lancada como entrada normal (como antes)...
    itens = [{"item": 1, "produto_id": k27, "quantidade": 2}]
    first = client.post(f"/nfe/{CHAVE}/baixa", json={"tipo": "ENTRADA", "location_id": CANOAS, "itens": itens})
    assert first.status_code == 201, first.text
    [mov_id] = first.json()["data"]["movimentacoes"]
    assert _stock(client, k27) == 3

    # ...estornada, a nota fica livre para lancar de novo, agora como transferencia externa.
    estorno = client.post("/movimentacoes", json={
        "tipo": "SAIDA", "produto_id": k27, "quantidade": 2, "origem_location_id": CANOAS,
        "natureza": "ESTORNO", "movimento_ref_id": mov_id, "observacao": "Estorno",
    })
    assert estorno.status_code == 201, estorno.text
    assert client.get(f"/nfe/{CHAVE}").json()["data"]["ja_baixada"] is None

    body = {
        "tipo": "ENTRADA", "location_id": CANOAS, "itens": itens,
        "natureza": "TRANSFERENCIA_EXTERNA", "local_externo": "Matriz Biguacu",
        "observacao": "Transferencia da matriz",
    }
    again = client.post(f"/nfe/{CHAVE}/baixa", json=body)
    assert again.status_code == 201, again.text
    assert _stock(client, k27) == 3
    mov = client.get("/movimentacoes", params={"documento": "14560", "tipo": "ENTRADA"}).json()["data"][0]
    assert (mov["natureza"], mov["local_externo"], mov["observacao"]) == (
        "TRANSFERENCIA_EXTERNA", "Matriz Biguacu", "Transferencia da matriz"
    )

    # Transferencia externa sem o local e recusada, sem lancar nada.
    client.post("/movimentacoes", json={
        "tipo": "SAIDA", "produto_id": k27, "quantidade": 2, "origem_location_id": CANOAS,
        "natureza": "ESTORNO", "movimento_ref_id": again.json()["data"]["movimentacoes"][0],
    })
    no_place = client.post(f"/nfe/{CHAVE}/baixa", json={**body, "local_externo": ""})
    assert no_place.status_code == 400 and "local externo" in no_place.json()["error"]["message"]
    assert _stock(client, k27) == 1


def test_item_that_is_not_stock_can_be_ignored_and_is_remembered(client, tmp_path):
    vendas = _setup(client, tmp_path, xml=_xml(itens=(
        ("294", "CASCO", "3"),
        ("0004389", "TURBO GARRET GT4594BNS 876272-5017S", "1"),
    )))
    turbo = _product(client, "TURBO GARRETT GT4594BNS 876272-5017S", 2)
    casco, item = client.get(f"/nfe/{CHAVE}").json()["data"]["itens"]
    assert casco["ignorar"] is False and casco["produto_sugerido"] is None

    # Sem produto e sem "ignorar": recusa.
    base = {"tipo": "SAIDA", "location_id": CANOAS}
    missing = client.post(f"/nfe/{CHAVE}/baixa", json={**base, "itens": [
        {"item": 1, "quantidade": 3}, {"item": 2, "produto_id": turbo, "quantidade": 1},
    ]})
    assert missing.status_code == 400 and "Ignorar" in missing.json()["error"]["message"]
    only_ignored = client.post(f"/nfe/{CHAVE}/baixa", json={**base, "itens": [
        {"item": 1, "ignorar": True}, {"item": 2, "ignorar": True},
    ]})
    assert only_ignored.status_code == 400

    done = client.post(f"/nfe/{CHAVE}/baixa", json={**base, "itens": [
        {"item": 1, "ignorar": True}, {"item": 2, "produto_id": turbo, "quantidade": 1},
    ]})
    assert done.status_code == 201, done.text
    assert len(done.json()["data"]["movimentacoes"]) == 1
    assert _stock(client, turbo) == 1

    # Na proxima nota do mesmo emissor, o CASCO ja vem marcado para ignorar.
    other = _fix_dv("43261003897158000285550020000145611821211025")
    (vendas / f"{other}-nfe.xml").write_bytes(_xml(chave=other, itens=(("294", "CASCO", "1"),)))
    assert client.get(f"/nfe/{other}").json()["data"]["itens"][0]["ignorar"] is True


def test_authorized_xml_wins_over_the_unsigned_copy_of_the_same_note(client, tmp_path):
    vendas = _setup(client, tmp_path, xml=_xml(c_stat=""), filename=f"{CHAVE}-nfe.xml")
    # Sem o protocolo, a nota nao pode ser baixada.
    assert client.get(f"/nfe/{CHAVE}").json()["data"]["autorizada"] is False

    # Quando o emissor grava o XML com o protocolo (outro arquivo), vale esse.
    (vendas / f"{CHAVE}-procNFe.xml").write_bytes(_xml())
    data = client.get(f"/nfe/{CHAVE}").json()["data"]
    assert data["autorizada"] is True and data["arquivo"].endswith("-procNFe.xml")
    # Mesmo com o arquivo autorizado em outra pasta, sem a chave no nome.
    (vendas / f"{CHAVE}-procNFe.xml").rename(tmp_path / "Geradas" / "nota.xml")
    assert client.get(f"/nfe/{CHAVE}").json()["data"]["autorizada"] is True


def test_sefaz_response_rejects_doctype_and_huge_gzip(monkeypatch):
    import base64
    import gzip

    import pytest

    from core import nfe_sefaz

    bomb = '<!DOCTYPE x [<!ENTITY a "aaaa">]><x>&a;</x>'.encode()
    with pytest.raises(nfe_sefaz.SefazError, match="DOCTYPE"):
        nfe_sefaz.parse_response(bomb)

    def body(doc_bytes):
        doc = base64.b64encode(gzip.compress(doc_bytes)).decode()
        return (
            '<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body>'
            '<retDistDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01"><cStat>138</cStat>'
            f'<xMotivo>ok</xMotivo><loteDistDFeInt><docZip NSU="1" schema="procNFe_v4.00.xsd">{doc}'
            "</docZip></loteDistDFeInt></retDistDFeInt></soap:Body></soap:Envelope>"
        ).encode()

    with pytest.raises(nfe_sefaz.SefazError, match="DOCTYPE"):
        nfe_sefaz.parse_response(body(b'<!DOCTYPE x [<!ENTITY a "a">]><x/>'))
    monkeypatch.setattr(nfe_sefaz, "MAX_DOC_BYTES", 1000)
    with pytest.raises(nfe_sefaz.SefazError, match="grande demais"):
        nfe_sefaz.parse_response(body(b"<x>" + b"a" * 5000 + b"</x>"))
    assert nfe_sefaz.parse_response(body(b"<x>pequeno</x>")).xml == b"<x>pequeno</x>"


def test_certificate_key_is_never_written_in_clear_and_temp_files_are_removed(tmp_path, monkeypatch):
    import os
    import ssl

    import pytest
    import requests

    from core import nfe_sefaz

    with open(_pfx(tmp_path), "rb") as fh:
        pfx = fh.read()
    key, cert, extras = nfe_sefaz.load_certificate(pfx, "segredo1")
    folder = tmp_path / "temp_nfe"
    folder.mkdir()
    cert_file, key_file, password = nfe_sefaz.write_temp_credentials(key, cert, extras, str(folder))
    pem = open(key_file, "rb").read()
    assert b"ENCRYPTED PRIVATE KEY" in pem and b"BEGIN PRIVATE KEY" not in pem
    context = ssl.create_default_context()
    context.load_cert_chain(cert_file, key_file, password=password)  # abre so com a senha da memoria
    with pytest.raises(ssl.SSLError):
        ssl.create_default_context().load_cert_chain(cert_file, key_file, password=b"errada")

    # download_nfe: a pasta temporaria some mesmo quando a SEFAZ nao responde.
    created = []
    real_mkdtemp = nfe_sefaz.tempfile.mkdtemp

    def tracking_mkdtemp(*args, **kwargs):
        path = real_mkdtemp(*args, **kwargs)
        created.append(path)
        return path

    def offline(self, *args, **kwargs):
        assert kwargs.get("cert") is None  # o certificado vai no contexto TLS, nao em arquivo aberto
        raise requests.exceptions.ConnectionError("sem internet")

    monkeypatch.setattr(nfe_sefaz, "_use_system_trust", lambda: None)  # nao mexe no ssl do processo
    monkeypatch.setattr(nfe_sefaz.tempfile, "mkdtemp", tracking_mkdtemp)
    monkeypatch.setattr(requests.Session, "post", offline)
    with pytest.raises(nfe_sefaz.SefazError, match="SEFAZ"):
        nfe_sefaz.download_nfe(CHAVE, pfx=pfx, senha="segredo1", cnpj="03897158000102")
    assert created and not os.path.exists(created[0])


def test_xml_of_the_note_is_returned_for_the_shipping_label(client, tmp_path):
    _setup(client, tmp_path)
    response = client.get(f"/nfe/{CHAVE}/xml")
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["numero"] == 14560 and data["arquivo"] == f"{CHAVE}-nfe.xml"
    assert "<xNome>B2PECAS LTDA</xNome>" in data["xml"]

    outra = "43261003897158000285550020000145611821211029"
    assert client.get(f"/nfe/{outra}/xml").status_code in (400, 404)


def test_deactivated_product_is_found_and_can_be_reactivated_to_post_the_note(client, tmp_path):
    _setup(client, tmp_path)
    turbo = _product(client, "TURBO GARRETT GT4594BNS 876272-5017S", 3)
    assert client.put("/produtos/status-lote", json={"ids": [turbo], "ativo": False}).status_code == 200

    # O desativado continua sendo achado pelo codigo, marcado como desativado.
    item = client.get(f"/nfe/{CHAVE}").json()["data"]["itens"][0]
    assert item["produto_sugerido"]["id"] == turbo and item["produto_sugerido"]["ativo"] is False

    body = {"tipo": "SAIDA", "location_id": CANOAS, "itens": [{"item": 1, "produto_id": turbo, "quantidade": 2}]}
    blocked = client.post(f"/nfe/{CHAVE}/baixa", json=body)
    assert blocked.status_code == 400 and "inativo" in blocked.json()["error"]["message"].lower()
    assert client.get(f"/nfe/{CHAVE}").json()["data"]["ja_baixada"] is None

    # Reativado (o botao da tela da nota), a baixa segue.
    assert client.put("/produtos/status-lote", json={"ids": [turbo], "ativo": True}).status_code == 200
    assert client.post(f"/nfe/{CHAVE}/baixa", json=body).status_code == 201
    assert _stock(client, turbo) == 1


def test_company_code_on_the_note_points_to_the_product_with_that_id(client, tmp_path):
    """Notas da empresa trazem o CD_MATERIAL, que e o id no Chronos; o desativado nao perde para outro."""
    _product(client, "TURBO 876272-5017S USADO", 4)  # ativo e cita o mesmo codigo
    certo = _product(client, "TURBO GARRET GT4594BNS - 876272-5017S", 0)
    assert client.put("/produtos/status-lote", json={"ids": [certo], "ativo": False}).status_code == 200
    _setup(client, tmp_path, xml=_xml(itens=((f"{certo:07d}", "TURBO GARRET GT4594BNS 876272-5017S", "1"),)))

    item = client.get(f"/nfe/{CHAVE}").json()["data"]["itens"][0]
    assert item["produto_sugerido"]["id"] == certo and item["produto_sugerido"]["ativo"] is False
    assert item["confianca"] == "codigo"


def test_saved_cnpjs_are_tried_until_the_one_that_received_the_note(client, tmp_path, monkeypatch):
    from core import nfe_sefaz

    matriz, canoas = "03897158000102", EMIT_CNPJ
    fornecedor = _fix_dv("42261053870235000109550020000748901471059981")
    consultas = []

    def fake_download(chave, *, cnpj, **kwargs):
        consultas.append(cnpj)
        if cnpj != matriz:
            return nfe_sefaz.SefazResult(c_stat="641", motivo="nao e destinatario")
        xml = _xml(chave=chave, emit=("53870235000109", "B2PECAS LTDA"), dest=(matriz, "MONTREAL MATRIZ"))
        return nfe_sefaz.SefazResult(c_stat="138", motivo="Documento localizado", xml=xml)

    monkeypatch.setattr(nfe_sefaz, "download_nfe", fake_download)
    _setup(client, tmp_path)
    client.put("/nfe/certificado", json={"arquivo": _pfx(tmp_path), "senha": "segredo1"})
    saved = client.put("/nfe/config", json={
        "pastas_xml": [str(tmp_path / "Geradas")],
        "cnpjs": [{"cnpj": "03.897.158/0002-85", "nome": "Canoas"}, {"cnpj": matriz, "nome": "Matriz"}],
    }).json()["data"]
    assert saved["cnpj_loja"] == canoas
    assert saved["cnpjs"] == [{"cnpj": canoas, "nome": "Canoas"}, {"cnpj": matriz, "nome": "Matriz"}]
    assert client.get("/nfe/config").json()["data"]["cnpjs"] == saved["cnpjs"]

    data = client.get(f"/nfe/{fornecedor}").json()["data"]
    assert consultas == [canoas, matriz]
    assert data["loja"] == {"cnpj": matriz, "nome": "Matriz"} and data["tipo_sugerido"] == "ENTRADA"

    bad = client.put("/nfe/config", json={"pastas_xml": [], "cnpjs": [{"cnpj": "123", "nome": "x"}]})
    assert bad.status_code == 400


def test_note_between_saved_cnpjs_keeps_this_store_point_of_view(client, tmp_path):
    """Canoas (esta loja) mandando para a Matriz (tambem salva) continua sendo saida."""
    matriz = ("03897158000102", "MONTREAL COMERCIO DE PECAS LTDA")
    canoas = (EMIT_CNPJ, "MONTREAL COMERCIO DE PECAS - CANOAS")
    _setup(client, tmp_path, xml=_xml(emit=canoas, dest=matriz))
    client.put("/nfe/config", json={
        "pastas_xml": [str(tmp_path / "Geradas")],
        "cnpjs": [{"cnpj": canoas[0], "nome": "Canoas"}, {"cnpj": matriz[0], "nome": "Matriz"}],
    })
    data = client.get(f"/nfe/{CHAVE}").json()["data"]
    assert data["tipo_sugerido"] == "SAIDA" and data["loja"]["nome"] == "Canoas"
    assert data["movimento_sugerido"]["SAIDA"]["natureza"] == "TRANSFERENCIA_EXTERNA"


def _remessa_xml(itens, natop="SIMPLES REMESSA", cfop="6152"):
    matriz = ("03897158000102", "MONTREAL COMERCIO DE PECAS LTDA")
    canoas = ("03897158000285", "MONTREAL COMERCIO DE PECAS - CANOAS")
    xml = _xml(itens=itens, emit=matriz, dest=canoas).decode("utf-8")
    xml = xml.replace("VENDA DE MERCADORIAS", natop).replace("<CFOP>5102</CFOP>", f"<CFOP>{cfop}</CFOP>")
    xml = xml.replace(f"<xNome>{matriz[1]}</xNome></emit>", f"<xNome>{matriz[1]}</xNome><enderEmit><UF>SC</UF></enderEmit></emit>")
    xml = xml.replace(f"<xNome>{canoas[1]}</xNome></dest>", f"<xNome>{canoas[1]}</xNome><enderDest><UF>RS</UF></enderDest></dest>")
    return xml.encode("utf-8")


def test_shipment_between_branches_asks_each_part_type_and_casco_or_warranty_do_not_enter_stock(client, tmp_path):
    vendas = _setup(client, tmp_path, xml=_remessa_xml((
        ("805", "TURBO HOLSET 4032382", "1"),
        ("806", "CONJUNTO BC.0373", "1"),
        ("294", "CASCO", "2"),
        ("807", "TURBO HOLSET 4031195", "1"),
    )))
    client.put("/nfe/config", json={"pastas_xml": [str(tmp_path / "Geradas")], "cnpj_loja": "03.897.158/0002-85"})
    turbo = _product(client, "TURBO HOLSET 4032382", 0)
    conjunto = _product(client, "CONJUNTO BC.0373", 0)
    garantia = _product(client, "TURBO HOLSET 4031195", 0)

    data = client.get(f"/nfe/{CHAVE}").json()["data"]
    assert data["remessa_interna"] is True
    assert (data["uf_origem"], data["uf_destino"], data["cfops"]) == ("SC", "RS", ["6152"])
    assert [i["tipo_aviso"] for i in data["itens"]] == ["ESTOQUE", "ESTOQUE", "CASCO", "ESTOQUE"]

    itens = [
        {"item": 1, "produto_id": turbo, "quantidade": 1, "tipo_aviso": "ESTOQUE"},
        {"item": 2, "produto_id": conjunto, "quantidade": 1, "tipo_aviso": "SERVICO"},
        {"item": 3, "quantidade": 2, "tipo_aviso": "CASCO"},
        {"item": 4, "produto_id": garantia, "quantidade": 1, "tipo_aviso": "GARANTIA"},
    ]
    done = client.post(f"/nfe/{CHAVE}/baixa", json={"tipo": "ENTRADA", "location_id": CANOAS, "itens": itens,
                                                      "natureza": "TRANSFERENCIA_EXTERNA", "local_externo": "Matriz"})
    assert done.status_code == 201, done.text
    assert len(done.json()["data"]["movimentacoes"]) == 2
    assert (_stock(client, turbo), _stock(client, conjunto), _stock(client, garantia)) == (1, 1, 0)
    salvo = client.get(f"/nfe/{CHAVE}").json()["data"]["aviso_salvo"]
    assert [(i["tipo_aviso"], i["quantidade"], i["produto_nome"]) for i in salvo] == [
        ("ESTOQUE", 1, "TURBO HOLSET 4032382"), ("SERVICO", 1, "CONJUNTO BC.0373"),
        ("CASCO", 2, None), ("GARANTIA", 1, "TURBO HOLSET 4031195"),
    ]

    # Na proxima remessa, cada codigo ja vem com o tipo escolhido.
    other = _fix_dv("43261003897158000285550020000145611821211025")
    (vendas / f"{other}-nfe.xml").write_bytes(
        _remessa_xml((("806", "CONJUNTO BC.0373", "1"), ("807", "TURBO HOLSET 4031195", "1"))).replace(
            CHAVE.encode(), other.encode()))
    again = client.get(f"/nfe/{other}").json()["data"]
    assert [i["tipo_aviso"] for i in again["itens"]] == ["SERVICO", "GARANTIA"]

    # So garantia: passa sem mexer no estoque e a nota fica livre.
    only = client.post(f"/nfe/{other}/baixa", json={"tipo": "ENTRADA", "location_id": CANOAS, "itens": [
        {"item": 1, "quantidade": 1, "tipo_aviso": "GARANTIA"}, {"item": 2, "quantidade": 1, "tipo_aviso": "CASCO"},
    ]})
    assert only.status_code == 201, only.text
    assert only.json()["data"]["movimentacoes"] == []
    assert client.get(f"/nfe/{other}").json()["data"]["ja_baixada"] is None
    # A NF anterior continua anunciando o que foi confirmado nela (garantia), nao o tipo novo.
    first = client.get(f"/nfe/{CHAVE}").json()["data"]["aviso_salvo"]
    assert first[3]["tipo_aviso"] == "GARANTIA" and first[1]["tipo_aviso"] == "SERVICO"


def test_sale_between_branches_is_not_a_shipment_notice(client, tmp_path):
    _setup(client, tmp_path, xml=_remessa_xml((("805", "TURBO HOLSET 4032382", "1"),),
                                              natop="VENDA DE MERCADORIAS", cfop="6102"))
    data = client.get(f"/nfe/{CHAVE}").json()["data"]
    assert data["remessa_interna"] is False
    turbo = _product(client, "TURBO HOLSET 4032382", 0)
    refused = client.post(f"/nfe/{CHAVE}/baixa", json={"tipo": "ENTRADA", "location_id": CANOAS, "itens": [
        {"item": 1, "produto_id": turbo, "quantidade": 1, "tipo_aviso": "CASCO"}]})
    assert refused.status_code == 400


def test_notice_contacts_are_saved_with_country_code_and_sending_needs_the_robot(client, tmp_path):
    saved = client.put("/nfe/config", json={"pastas_xml": [], "contatos_aviso": [
        {"nome": "Chefe", "numero": "(51) 99999-8888"}, {"nome": "Colega", "numero": "5548988887777"},
    ]})
    assert saved.status_code == 200, saved.text
    assert saved.json()["data"]["contatos_aviso"] == [
        {"nome": "Chefe", "numero": "5551999998888"}, {"nome": "Colega", "numero": "5548988887777"},
    ]
    # Salvar so as pastas mantem os contatos.
    assert client.put("/nfe/config", json={"pastas_xml": []}).json()["data"]["contatos_aviso"][0]["nome"] == "Chefe"
    bad = client.put("/nfe/config", json={"pastas_xml": [], "contatos_aviso": [{"nome": "X", "numero": "123"}]})
    assert bad.status_code == 400

    off = client.post("/nfe/aviso/enviar", json={"numero": "5551999998888", "texto": "Bom dia"})
    assert off.status_code == 400 and "Copiar" in off.json()["error"]["message"]
