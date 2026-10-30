import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/apiClient";
import { notifyError } from "../lib/notify";

export function useLocations() {
  const { data, isLoading, isPending, isFetching, refetch } = useQuery({
    queryKey: ["locations"],
    queryFn: async () => {
      try {
        const res = await api.getLocations();
        return res.data;
      } catch (err) {
        console.error("Failed to load locations", err);
        notifyError(
          new Error("Não foi possível carregar os locais de estoque."),
        );
        return [];
      }
    },
  });
  const locations = data || [];
  const activeLocations = locations.filter((loc) => loc.ativo);
  // Uma coluna por filial só faz sentido com duas ou mais ativas; com uma só, a coluna
  // da filial repete o total e as telas mostram apenas "Saldo".
  const branchColumns = activeLocations.length > 1 ? activeLocations : [];

  return { locations, activeLocations, branchColumns, isLoading, isPending, isFetching, refetch };
}
