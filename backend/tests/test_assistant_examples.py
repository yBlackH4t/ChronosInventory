import pytest

from app.services.assistant_examples_service import AssistantExamplesService, validate_examples
from core.exceptions import ValidationException


def test_approved_examples_are_data_and_survive_restart(tmp_path):
    path = str(tmp_path / "examples.json")
    examples = AssistantExamplesService(path)
    examples.replace([{"pergunta": "A baleia?", "consulta": "Scania 440 DC13"}])
    assert AssistantExamplesService(path).resolve("a baleia") == "Scania 440 DC13"
    assert AssistantExamplesService(path).relevant("baleia")
    examples.replace([])
    assert examples.resolve("a baleia") is None


def test_stock_values_and_duplicate_questions_cannot_be_saved():
    with pytest.raises(ValidationException):
        validate_examples([{"pergunta": "tem?", "consulta": "4031196", "estoque": 2}])
    with pytest.raises(ValidationException):
        validate_examples([{"pergunta": "tem?", "consulta": "4031196"}, {"pergunta": "TEM", "consulta": "5452349"}])
