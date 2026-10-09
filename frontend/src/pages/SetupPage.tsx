import { useState } from "react";
import {
  Center,
  Stack,
  Title,
  Text,
  TextInput,
  Button,
  Paper,
} from "@mantine/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/apiClient";
import { notifyError, notifySuccess } from "../lib/notify";
import { IconBuildingStore } from "@tabler/icons-react";

export default function SetupPage() {
  const [name, setName] = useState("");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => api.createLocation({ name, label: name }),
    onSuccess: () => {
      notifySuccess("Local criado com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["locations"] });
    },
    onError: (err) => notifyError(err, "Falha ao criar o local"),
  });

  return (
    <Center h="100vh" bg="var(--bg)" px="md">
      <Paper p="xl" radius="lg" w={420} maw="100%" withBorder>
        <Stack align="center" gap="md">
          <span className="topbar-brand-mark" style={{ width: 44, height: 44, borderRadius: 12 }}>
            <IconBuildingStore size={22} stroke={1.75} />
          </span>
          <Title order={3} ta="center">
            Bem-vindo ao Chronos
          </Title>
          <Text c="dimmed" ta="center" size="sm">
            Para começar, crie o primeiro local de estoque (filial, loja ou
            depósito).
          </Text>

          <TextInput
            w="100%"
            label="Nome do local"
            placeholder="Ex: Canoas, Matriz, Depósito…"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            disabled={mutation.isPending}
            autoFocus
          />

          <Button
            fullWidth
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={!name.trim()}
          >
            Começar
          </Button>
        </Stack>
      </Paper>
    </Center>
  );
}
