import pytest

from app.services.assistant_requests import RequestItem, execute_plan, literal_plan, supported_codes, validated_plan


class Tools:
    def __init__(self, failing=None):
        self.calls = []
        self.failing = failing

    def run_tool(self, name, arguments):
        self.calls.append((name, arguments))
        code = arguments["codigo"]
        if code == self.failing:
            raise RuntimeError("indisponível")
        return {"produtos": [{"id": int(code), "nome": f"TURBO {code}", "estoque_total": 1,
                              "estoque_por_local": {"Canoas": 1}, "correspondencia": "exato"}],
                "texto_pronto": f"{code}: temos 1", "texto_compacto": f"Canoas: 01 - {code}"}


def test_all_four_codes_are_separate_requests():
    items = literal_plan("tem a 5644540 5644541 4031196 770472?")
    tools = Tools()
    result = execute_plan(items, tools)
    assert [item.codigos for item in items] == [["5644540"], ["5644541"], ["4031196"], ["770472"]]
    assert len(tools.calls) == len(result["pedidos"]) == 4


@pytest.mark.parametrize("text", ["796155 5005 ou 5006", "796155-5005 ou 796155-5006", "7961555005/5006"])
def test_alternatives_keep_their_identity_and_never_sum_stock(text):
    items = literal_plan(text)
    assert len(items) == 1 and items[0].alternativas
    assert items[0].codigos == ["7961555005", "7961555006"]
    result = execute_plan(items, Tools(), compact=True)
    assert result["resposta"].count("Canoas: 01") == 2
    assert "02" not in result["resposta"]


@pytest.mark.parametrize("text", ["4031196 reman e 5452349 nova", "reman 4031196 e nova 5452349"])
def test_versions_belong_to_each_item(text):
    items = literal_plan(text)
    assert [item.versoes for item in items] == [["reman"], ["nova"]]


def test_supported_codes_never_join_independent_parts_or_messages():
    assert supported_codes(["1196545", "4031196"], ["4031196 e 5452349"]) == ["4031196"]
    assert supported_codes(["7961555005"], ["796155", "5005"]) == []
    assert supported_codes(["7961555006"], ["796155 5005 ou 5006"]) == ["7961555006"]


def test_vehicle_model_and_year_are_not_joined_as_part_code():
    assert literal_plan("Scania 440 2015") == []
    assert supported_codes(["4402015"], ["Scania 440 2015"]) == []


def test_unresolved_short_alternative_requires_confirmation_instead_of_being_dropped():
    items = literal_plan("tem 4031196 ou 5006?")
    assert items[0].pendencias == ["codigo"]
    tools = Tools()
    assert "confirmar" in execute_plan(items, tools)["resposta"]
    assert tools.calls == []


def test_mixed_code_and_vehicle_are_two_requests_even_without_ai():
    items = literal_plan("tem 4031196 e a turbina Volvo FH 520 DC13?")
    assert len(items) == 2
    assert items[0].codigos == ["4031196"]
    assert items[1].intencao == "aplicacao"


def test_model_cannot_silently_omit_fourth_item_or_invent_codes():
    message = "5644540 5644541 4031196 770472"
    raw = [{"codigos": [code]} for code in message.split()[:3]]
    assert len(validated_plan(raw, message)) == 4
    assert validated_plan([{"codigos": ["99999999"]}], message) == []


def test_model_cannot_inherit_vehicle_from_unrelated_history():
    raw = [{"intencao": "aplicacao", "veiculo": "Volvo", "motor": "DC13", "ano": "2015"}]
    assert validated_plan(raw, "Volvo", [{"texto": "Scania DC13 2015"}]) == []


def test_approved_term_is_grounding_but_unrelated_example_is_not():
    raw = [{"intencao": "aplicacao", "trecho": "baleia 2015", "veiculo": "Scania 440", "motor": "DC13", "ano": "2015"}]
    examples = [{"pergunta": "baleia", "consulta": "Scania 440 DC13"}]
    assert validated_plan(raw, "tem baleia 2015?", examples=examples)
    assert validated_plan(raw, "tem baleia 2015?", examples=[{"pergunta": "outro", "consulta": "Scania 440 DC13"}]) == []


def test_error_is_not_zero_stock_and_does_not_skip_other_requests():
    result = execute_plan(literal_plan("4031196 5452349"), Tools(failing="4031196"))
    assert result["pedidos"][0]["resultados"][0]["status"] == "erro"
    assert result["pedidos"][1]["resultados"][0]["status"] == "encontrado"
    assert "saldo não foi confirmado" in result["resposta"]


def test_limits_are_explicit_and_no_queries_run():
    tools = Tools()
    result = execute_plan([RequestItem(codigos=[str(5000000 + index)]) for index in range(31)], tools)
    assert result["aviso"] == "limite_de_pedidos" and tools.calls == []


def test_requested_location_is_forwarded_without_inventing_quantities():
    items = literal_plan("4031196 em Canoas e 5452349")
    tools = Tools()
    execute_plan(items, tools)
    assert tools.calls[0][1]["local"] == "Canoas"
    assert "local" not in tools.calls[1][1]
