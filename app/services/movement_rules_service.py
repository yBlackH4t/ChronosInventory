from __future__ import annotations

from typing import Dict, List, Optional
from core.exceptions import InvalidTransferException, ValidationException

NATUREZA_OPERACAO_NORMAL = "OPERACAO_NORMAL"
NATUREZA_TRANSFERENCIA_EXTERNA = "TRANSFERENCIA_EXTERNA"
NATUREZA_DEVOLUCAO = "DEVOLUCAO"
NATUREZA_AJUSTE = "AJUSTE"
NATUREZAS_VALIDAS = {
    NATUREZA_OPERACAO_NORMAL,
    NATUREZA_TRANSFERENCIA_EXTERNA,
    NATUREZA_DEVOLUCAO,
    NATUREZA_AJUSTE,
}

NATUREZA_LABEL_MAP = {
    NATUREZA_OPERACAO_NORMAL: "Operacao normal",
    NATUREZA_TRANSFERENCIA_EXTERNA: "Transferencia externa",
    NATUREZA_DEVOLUCAO: "Devolucao",
    NATUREZA_AJUSTE: "Ajuste",
}

MOTIVO_AJUSTE_AVARIA = "AVARIA"
MOTIVO_AJUSTE_PERDA = "PERDA"
MOTIVO_AJUSTE_CORRECAO_INVENTARIO = "CORRECAO_INVENTARIO"
MOTIVO_AJUSTE_ERRO_OPERACIONAL = "ERRO_OPERACIONAL"
MOTIVO_AJUSTE_TRANSFERENCIA = "TRANSFERENCIA"
MOTIVOS_AJUSTE_VALIDOS = {
    MOTIVO_AJUSTE_AVARIA,
    MOTIVO_AJUSTE_PERDA,
    MOTIVO_AJUSTE_CORRECAO_INVENTARIO,
    MOTIVO_AJUSTE_ERRO_OPERACIONAL,
    MOTIVO_AJUSTE_TRANSFERENCIA,
}
MOTIVO_AJUSTE_LABEL_MAP = {
    MOTIVO_AJUSTE_AVARIA: "Avaria",
    MOTIVO_AJUSTE_PERDA: "Perda",
    MOTIVO_AJUSTE_CORRECAO_INVENTARIO: "Correcao inventario",
    MOTIVO_AJUSTE_ERRO_OPERACIONAL: "Erro operacional",
    MOTIVO_AJUSTE_TRANSFERENCIA: "Transferencia",
}


class MovementRulesService:
    def __init__(self, location_repo=None):
        if location_repo is None:
            from core.database.connection import DatabaseConnection
            from core.database.repositories.inventory_location_repository import InventoryLocationRepository
            
            conn = DatabaseConnection().get_connection()
            self.location_repo = InventoryLocationRepository(conn)
        else:
            self.location_repo = location_repo

    def normalize_location(self, loc: Optional[str]) -> Optional[int]:
        if loc is None or str(loc).upper() == "AMBOS":
            return None
        try:
            loc_id = int(loc)
            return loc_id
        except ValueError:
            raise ValidationException(f"Local invalido. Deve ser um ID numerico: {loc}")

    def compute_deltas(
        self,
        tipo: str,
        quantidade: int,
        origem_id: Optional[int],
        destino_id: Optional[int],
    ) -> Dict[int, int]:
        deltas: Dict[int, int] = {}
        if tipo == "ENTRADA":
            if destino_id:
                deltas[destino_id] = quantidade
        elif tipo == "SAIDA":
            if origem_id:
                deltas[origem_id] = -quantidade
        elif tipo == "TRANSFERENCIA":
            if origem_id and destino_id:
                deltas[origem_id] = -quantidade
                deltas[destino_id] = quantidade
        return deltas



    def to_human(self, loc_id: Optional[int]) -> str:
        if not loc_id:
            return ""
        try:
            loc = self.location_repo.get_by_id(loc_id)
            if loc:
                return loc.name
        except Exception:
            pass
        return f"Local {loc_id}"

    def normalize_natureza(self, natureza: Optional[str]) -> str:
        if not natureza:
            return NATUREZA_OPERACAO_NORMAL
        natureza = natureza.upper()
        if natureza not in NATUREZAS_VALIDAS:
            raise ValidationException("Natureza invalida.")
        return natureza

    def validate_business_rules(
        self,
        *,
        tipo: str,
        natureza: str,
        local_externo: Optional[str],
        motivo_ajuste: Optional[str],
        observacao: Optional[str],
    ) -> None:
        if natureza == NATUREZA_DEVOLUCAO and tipo != "ENTRADA":
            raise ValidationException("Natureza DEVOLUCAO exige movimentacao do tipo ENTRADA.")

        if natureza == NATUREZA_TRANSFERENCIA_EXTERNA:
            if tipo not in {"ENTRADA", "SAIDA"}:
                raise ValidationException("Natureza TRANSFERENCIA_EXTERNA exige movimentacao do tipo ENTRADA ou SAIDA.")
            if not local_externo:
                raise ValidationException("Informe o local externo para TRANSFERENCIA_EXTERNA.")

        if natureza == NATUREZA_AJUSTE:
            if not motivo_ajuste:
                raise ValidationException(
                    "Motivo obrigatorio para AJUSTE. Use: AVARIA, PERDA, CORRECAO_INVENTARIO, ERRO_OPERACIONAL, TRANSFERENCIA."
                )
            if not observacao:
                raise ValidationException("Observacao obrigatoria para AJUSTE de estoque.")
        elif motivo_ajuste:
            raise ValidationException("Motivo de ajuste so pode ser informado com natureza AJUSTE.")

    def normalize_motivo_ajuste(self, motivo_ajuste: Optional[str]) -> Optional[str]:
        if not motivo_ajuste:
            return None
        motivo_ajuste = motivo_ajuste.upper().strip()
        if motivo_ajuste not in MOTIVOS_AJUSTE_VALIDOS:
            raise ValidationException(
                "Motivo de ajuste invalido. Use: AVARIA, PERDA, CORRECAO_INVENTARIO, ERRO_OPERACIONAL, TRANSFERENCIA."
            )
        return motivo_ajuste

    def validate_transfer(self, origem_id: Optional[int], destino_id: Optional[int]) -> None:
        if not origem_id or not destino_id:
            raise ValidationException("Origem e destino sao obrigatorios para TRANSFERENCIA.")
        if origem_id == destino_id:
            raise InvalidTransferException("Origem e destino devem ser diferentes.")
