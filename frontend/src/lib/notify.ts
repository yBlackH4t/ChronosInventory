import { notifications } from "@mantine/notifications";
import { ApiError } from "./api";

/** Quando o serviço local não conhece a rota/campo: o app ficou pela metade na atualização. */
export const OUTDATED_APP_MESSAGE =
  "Esta versão do Chronos está desatualizada. Instale a atualização e abra o app de novo.";

/** Falha de rede/serviço nas telas do assistente. */
export const ASSISTANT_UNREACHABLE_MESSAGE =
  "Não foi possível falar com o assistente. Feche e abra o Chronos; se continuar, avise o responsável.";

type ValidationDetail = {
  type?: string;
  loc?: Array<string | number>;
  msg?: string;
  ctx?: Record<string, unknown>;
};

function normalizeDetails(details: unknown): ValidationDetail[] {
  if (!Array.isArray(details)) return [];
  return details.filter(
    (item) => typeof item === "object" && item !== null,
  ) as ValidationDetail[];
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
    tipo: "Tipo",
    quantidade: "Quantidade",
    origem: "Origem",
    destino: "Destino",
    natureza: "Natureza",
    motivo_ajuste: "Motivo de ajuste",
    movimento_ref_id: "Movimentação de referência",
    observacao: "Observação",
    documento: "Documento",
    local_externo: "Local externo",
  };
  return labels[field] ?? field;
}

function detailToFriendlyMessage(detail: ValidationDetail): string | null {
  const field = friendlyFieldName(extractField(detail));
  const type = detail.type || "";
  if (type === "missing") return `Campo obrigatório: ${field}.`;
  if (type === "extra_forbidden") {
    return OUTDATED_APP_MESSAGE;
  }
  if (type === "string_too_long" || type === "too_long") {
    return `O campo ${field} excede o tamanho máximo permitido.`;
  }
  if (type === "greater_than_equal" || type === "greater_than") {
    return `Valor inválido para ${field}.`;
  }
  if (type === "literal_error") {
    return `Valor inválido para ${field}.`;
  }
  if (detail.msg) return detail.msg;
  return null;
}

export function notifySuccess(message: string) {
  notifications.show({
    title: "Sucesso",
    message,
    color: "success",
    // Barrinha que mostra quanto falta para o aviso sumir (vivo.css).
    className: "vv-timed",
  });
}

export function notifyError(
  error: unknown,
  fallbackMessage = "Erro inesperado",
) {
  if (error instanceof ApiError) {
    let message = error.message || fallbackMessage;
    let title = "Erro";

    if (error.code === "validation_error") {
      title = "Erro de validação";
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
      if (hasIncompatibleMovementField) {
        message = OUTDATED_APP_MESSAGE;
      } else {
        const mapped = details
          .map(detailToFriendlyMessage)
          .find((item) => Boolean(item));
        if (mapped) {
          message = mapped;
        }
      }
    } else if (error.code === "insufficient_stock") {
      title = "Estoque insuficiente";
    } else if (error.code === "not_found") {
      title = "Não encontrado";
    } else if (error.code === "database_error") {
      title = "Falha no banco";
    } else if (error.code === "file_error") {
      title = "Falha de arquivo";
    }

    notifications.show({
      title,
      message,
      color: "danger",
    });
    return;
  }

  const message = error instanceof Error ? error.message : fallbackMessage;
  notifications.show({
    title: "Erro",
    message,
    color: "danger",
  });
}
