import { notifications } from "@mantine/notifications";
import { ApiError } from "./api";

export function notifySuccess(message: string) {
  notifications.show({
    title: "Sucesso",
    message,
    color: "green",
  });
}

export function notifyError(error: unknown, fallbackMessage = "Erro inesperado") {
  if (error instanceof ApiError) {
    notifications.show({
      title: error.code,
      message: error.message || fallbackMessage,
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
