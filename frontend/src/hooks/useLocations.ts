import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/apiClient";
import { notifyError } from "../lib/notify";

export function useLocations() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["locations"],
    queryFn: async () => {
      try {
        const res = await api.getLocations();
        return res.data;
      } catch (err) {
        console.error("Failed to load locations", err);
        notifyError(
          new Error("Nao foi possivel carregar os locais de estoque."),
        );
        return [];
      }
    },
  });
  const locations = data || [];
  const activeLocations = locations.filter((loc: any) => loc.ativo);

  return { locations, activeLocations, isLoading, refetch };
}
