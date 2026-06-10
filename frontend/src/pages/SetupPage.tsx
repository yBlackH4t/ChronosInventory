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
    <Center h="100vh" bg="gray.0">
      <Paper p="xl" shadow="sm" radius="md" w={400} withBorder>
        <Stack align="center" gap="md">
          <IconBuildingStore
            size={48}
            stroke={1.5}
            color="var(--mantine-color-blue-6)"
          />
          <Title order={2} ta="center">
            Bem-vindo ao Chronos!
          </Title>
          <Text c="dimmed" ta="center" size="sm">
            Para comecar a usar o aplicativo, voce precisa criar o seu primeiro
            local de estoque.
          </Text>

          <TextInput
            w="100%"
            label="Nome do local"
            placeholder="Ex: Matriz, Loja 1, Deposito..."
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
            Comecar
          </Button>
        </Stack>
      </Paper>
    </Center>
  );
}
