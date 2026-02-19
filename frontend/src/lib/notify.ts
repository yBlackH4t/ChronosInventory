import { notifications } from "@mantine/notifications";
import { ApiError } from "./api";

type ValidationDetail = {
  type?: string;
  loc?: Array<string | number>;
  msg?: string;
  ctx?: Record<string, unknown>;
};

function normalizeDetails(details: unknown): ValidationDetail[] {
  if (!Array.isArray(details)) return [];
  return details.filter((item) => typeof item === "object" && item !== null) as ValidationDetail[];
}

function extractField(detail: ValidationDetail): string | null {
  if (!Array.isArray(detail.loc) || detail.loc.length === 0) return null;
  const last = detail.loc[detail.loc.length - 1];
  return typeof last === "string" ? last : null;
}

function friendlyFieldName(field: string | null): string {
  if (!field) return "campo";
  const labels: Record<string, string> = {
    nome: "Nome",
    qtd_canoas: "Quantidade Canoas",
    qtd_pf: "Quantidade PF",
    tipo: "Tipo",
    quantidade: "Quantidade",
    origem: "Origem",
    destino: "Destino",
    natureza: "Natureza",
    motivo_ajuste: "Motivo de ajuste",
    movimento_ref_id: "Movimento de referencia",
    observacao: "Observacao",
    documento: "Documento",
    local_externo: "Local externo",
  };
  return labels[field] ?? field;
}

function detailToFriendlyMessage(detail: ValidationDetail): string | null {
  const field = friendlyFieldName(extractField(detail));
  const type = detail.type || "";
  if (type === "missing") return `Campo obrigatorio: ${field}.`;
  if (type === "extra_forbidden") {
    return `Campo '${field}' nao e aceito nesta versao do backend. Atualize o aplicativo.`;
  }
  if (type === "string_too_long" || type === "too_long") {
    return `O campo ${field} excede o tamanho maximo permitido.`;
  }
  if (type === "greater_than_equal" || type === "greater_than") {
    return `Valor invalido para ${field}.`;
  }
  if (type === "literal_error") {
    return `Valor invalido para ${field}.`;
  }
  if (detail.msg) return detail.msg;
  return null;
}

export function notifySuccess(message: string) {
  notifications.show({
    title: "Sucesso",
    message,
    color: "green",
  });
}

export function notifyError(error: unknown, fallbackMessage = "Erro inesperado") {
  if (error instanceof ApiError) {
    let message = error.message || fallbackMessage;
    let title = "Erro";

    if (error.code === "validation_error") {
      title = "Erro de validacao";
      const details = normalizeDetails(error.details);
      const incompatibleMovementFields = new Set([
        "natureza",
        "motivo_ajuste",
        "movimento_ref_id",
        "documento",
        "local_externo",
      ]);
      const hasIncompatibleMovementField = details.some((detail) => {
        if (detail.type !== "extra_forbidden") return false;
        const field = extractField(detail);
        return field ? incompatibleMovementFields.has(field) : false;
      });
      const requires120 = details.some((detail) => extractField(detail) === "motivo_ajuste");

      if (hasIncompatibleMovementField) {
        message =
          `Backend desatualizado para esta operacao. Atualize o app para versao ${requires120 ? "1.2.0" : "1.1.0"} ou superior.`;
      } else {
        const mapped = details.map(detailToFriendlyMessage).find((item) => Boolean(item));
        if (mapped) {
          message = mapped;
        }
      }
    } else if (error.code === "insufficient_stock") {
      title = "Estoque insuficiente";
    } else if (error.code === "not_found") {
      title = "Nao encontrado";
    } else if (error.code === "database_error") {
      title = "Falha no banco";
    } else if (error.code === "file_error") {
      title = "Falha de arquivo";
    }

    notifications.show({
      title,
      message,
      color: "red",
    });
    return;
  }

  const message = error instanceof Error ? error.message : fallbackMessage;
  notifications.show({
    title: "Erro",
    message,
    color: "red",
  });
}
