import { Component, type ReactNode } from "react";
import { Button, Center, Stack, Text, Title } from "@mantine/core";

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  hasError: boolean;
};

export default class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  constructor(props: AppErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown): void {
    console.error("Erro global de renderizacao:", error);
  }

  private reload = () => {
    if (typeof window !== "undefined") window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <Center h="100vh">
          <Stack gap="sm" align="center" maw={560}>
            <Title order={2}>Ocorreu um erro inesperado</Title>
            <Text ta="center" c="dimmed">
              A tela apresentou uma falha de renderizacao. Recarregue o aplicativo para continuar.
            </Text>
            <Button onClick={this.reload}>Recarregar aplicativo</Button>
          </Stack>
        </Center>
      );
    }
    return this.props.children;
  }
}
