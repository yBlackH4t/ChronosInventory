from __future__ import annotations

from typing import List, Optional, Tuple

from core.exceptions import InvalidTransferException, ValidationException

LOCATION_MAP = {
    "CANOAS": "Canoas",
    "PF": "Passo Fundo",
}

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
    def normalize_location(self, loc: Optional[str]) -> Optional[str]:
        if loc is None:
            return None
        loc = loc.upper()
        if loc not in LOCATION_MAP:
            raise ValidationException("Local invalido. Use CANOAS ou PF.")
        return loc

    def compute_deltas(
        self,
        tipo: str,
        quantidade: int,
        origem: Optional[str],
        destino: Optional[str],
    ) -> Tuple[int, int]:
        delta_canoas = 0
        delta_pf = 0

        if tipo == "ENTRADA":
            if destino == "CANOAS":
                delta_canoas = quantidade
            elif destino == "PF":
                delta_pf = quantidade
        elif tipo == "SAIDA":
            if origem == "CANOAS":
                delta_canoas = -quantidade
            elif origem == "PF":
                delta_pf = -quantidade
        elif tipo == "TRANSFERENCIA":
            if origem == "CANOAS" and destino == "PF":
                delta_canoas = -quantidade
                delta_pf = quantidade
            elif origem == "PF" and destino == "CANOAS":
                delta_pf = -quantidade
                delta_canoas = quantidade

        return delta_canoas, delta_pf

    def build_history_observation(
        self,
        *,
        tipo: str,
        origem: Optional[str],
        destino: Optional[str],
        observacao: Optional[str],
        natureza: str,
        motivo_ajuste: Optional[str],
        local_externo: Optional[str],
        documento: Optional[str],
        movimento_ref_id: Optional[int],
    ) -> str:
        if tipo == "TRANSFERENCIA":
            base = f"{self.to_human(origem)} -> {self.to_human(destino)}"
        elif tipo == "ENTRADA":
            base = f"Entrada em {self.to_human(destino)}"
        else:
            base = f"Saida em {self.to_human(origem)}"

        details: List[str] = []
        if natureza != NATUREZA_OPERACAO_NORMAL:
            details.append(f"Natureza: {NATUREZA_LABEL_MAP.get(natureza, natureza)}")
        if motivo_ajuste:
            details.append(f"Motivo ajuste: {MOTIVO_AJUSTE_LABEL_MAP.get(motivo_ajuste, motivo_ajuste)}")
        if local_externo:
            details.append(f"Local externo: {local_externo}")
        if documento:
            details.append(f"Documento: {documento}")
        if movimento_ref_id:
            details.append(f"Movimento ref: {movimento_ref_id}")
        if observacao:
            details.append(observacao)

        if details:
            return f"{base} | {' | '.join(details)}"
        return base

    def to_human(self, loc: Optional[str]) -> str:
        if not loc:
            return ""
        return LOCATION_MAP[loc]

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

    def validate_transfer(self, origem: Optional[str], destino: Optional[str]) -> None:
        if not origem or not destino:
            raise ValidationException("Origem e destino sao obrigatorios para TRANSFERENCIA.")
        if origem == destino:
            raise InvalidTransferException("Origem e destino devem ser diferentes.")
