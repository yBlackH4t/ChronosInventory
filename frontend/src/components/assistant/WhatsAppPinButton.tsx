import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Group, Modal, PasswordInput, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconBrandWhatsapp } from "@tabler/icons-react";

import { setWhatsAppPin } from "../../lib/assistantAdminApi";

const PIN_PATTERN = /^\d{4,8}$/;

/** Botão e janela do PIN pedido em /aprovar e /recusar pelo WhatsApp. */
export default function WhatsAppPinButton({ pinDefinido }: { pinDefinido: boolean }) {
  const queryClient = useQueryClient();
  const [opened, setOpened] = useState(false);
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");

  const close = () => {
    setOpened(false);
    setPin("");
    setConfirm("");
  };

  const mutation = useMutation({
    mutationFn: (novo: string | null) => setWhatsAppPin(novo),
    onSuccess: (_status, novo) => {
      notifications.show({
        title: novo ? "PIN salvo" : "PIN removido",
        message: novo
          ? "Para aprovar pelo WhatsApp, mande /aprovar seguido do número e do PIN, por exemplo /aprovar 3 1234."
          : "Sem PIN, /aprovar e /recusar pelo WhatsApp ficam desligados.",
        color: "success",
      });
      close();
      queryClient.invalidateQueries({ queryKey: ["assistant-admin-status"] });
    },
    onError: (err: Error) => {
      notifications.show({
        title: "Não foi possível salvar o PIN",
        message: err.message || "Tente de novo.",
        color: "danger",
      });
    },
  });

  const pinValido = PIN_PATTERN.test(pin);
  const pinErro = pin && !pinValido ? "Use de 4 a 8 números." : null;
  const confirmErro = confirm && confirm !== pin ? "Os dois PINs não são iguais." : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinValido || confirm !== pin) return;
    mutation.mutate(pin);
  };

  return (
    <>
      <Button size="xs" variant="default" leftSection={<IconBrandWhatsapp size={14} />} onClick={() => setOpened(true)}>
        {pinDefinido ? "Trocar PIN do WhatsApp" : "Criar PIN do WhatsApp"}
      </Button>
      <Modal opened={opened} onClose={close} title="PIN para aprovar pelo WhatsApp" centered>
        <form onSubmit={handleSubmit}>
          <Stack gap="sm">
            <Text size="sm" c="dimmed">
              Quem aprova ou recusa uma sugestão pelo WhatsApp precisa mandar este PIN junto, por exemplo
              /aprovar 3 1234. Assim, ninguém aprova só por ter acesso ao seu WhatsApp.
            </Text>
            <PasswordInput
              label="Novo PIN"
              description="De 4 a 8 números"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.currentTarget.value.trim())}
              error={pinErro}
              required
              autoFocus
            />
            <PasswordInput
              label="Repita o PIN"
              inputMode="numeric"
              value={confirm}
              onChange={(e) => setConfirm(e.currentTarget.value.trim())}
              error={confirmErro}
              required
            />
            <Group justify="space-between" mt="md">
              {pinDefinido ? (
                <Button variant="subtle" color="danger" onClick={() => mutation.mutate(null)} loading={mutation.isPending && mutation.variables === null}>
                  Remover PIN
                </Button>
              ) : (
                <span />
              )}
              <Group gap="xs">
                <Button variant="default" onClick={close}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={!pinValido || confirm !== pin} loading={mutation.isPending && mutation.variables !== null}>
                  Salvar PIN
                </Button>
              </Group>
            </Group>
          </Stack>
        </form>
      </Modal>
    </>
  );
}
