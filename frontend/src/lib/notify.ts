import { notifications } from "@mantine/notifications";
import { ApiError } from "./api";

type ValidationDetail = {
  type?: string;
  loc?: Array<string | number>;
  msg?: string;
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

    if (error.code === "validation_error") {
      const details = normalizeDetails(error.details);
      const incompatibleMovementFields = new Set([
        "natureza",
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
        message =
          "Backend desatualizado para esta operacao. Atualize o app para versao 1.1.0 ou superior.";
      } else if (details[0]?.msg) {
        message = details[0].msg || message;
      }
    }

    notifications.show({
      title: error.code,
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
