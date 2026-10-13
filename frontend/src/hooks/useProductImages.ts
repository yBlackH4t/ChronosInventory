import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../lib/apiClient";
import type {
  ProductImageItem,
  ProductImagesUploadOut,
  SuccessResponse,
} from "../lib/api";
import { notifyError, notifySuccess } from "../lib/notify";

export const MAX_PRODUCT_IMAGES = 5;

// Galeria do produto aberto no drawer: lista, envio, imagem principal e exclusao.
export function useProductImages(
  selectedId: number | null,
  profileScopeKey: string,
) {
  const queryClient = useQueryClient();

  const imagesQuery = useQuery<
    SuccessResponse<{
      items: ProductImageItem[];
      total: number;
      max_images: number;
    }>
  >({
    queryKey: ["produto-imagens", profileScopeKey, selectedId],
    queryFn: ({ signal }) => api.listProductImages(selectedId!, { signal }),
    enabled: !!selectedId,
    retry: false,
  });

  const uploadImagesMutation = useMutation<
    SuccessResponse<ProductImagesUploadOut>,
    Error,
    File[]
  >({
    mutationFn: (files: File[]) => api.uploadProductImages(selectedId!, files),
    onSuccess: () => {
      notifySuccess("Imagem(ns) adicionada(s)");
      queryClient.invalidateQueries({
        queryKey: ["produto-imagens", profileScopeKey, selectedId],
      });
      queryClient.invalidateQueries({
        queryKey: ["produtos", profileScopeKey],
      });
    },
    onError: (error) => notifyError(error),
  });

  const setPrimaryImageMutation = useMutation<
    SuccessResponse<{ id: number; message: string }>,
    Error,
    number
  >({
    mutationFn: (imageId: number) =>
      api.setPrimaryProductImage(selectedId!, imageId),
    onSuccess: () => {
      notifySuccess("Imagem principal definida");
      queryClient.invalidateQueries({
        queryKey: ["produto-imagens", profileScopeKey, selectedId],
      });
    },
    onError: (error) => notifyError(error),
  });

  const deleteImageMutation = useMutation<
    SuccessResponse<{ id: number; message: string }>,
    Error,
    number
  >({
    mutationFn: (imageId: number) =>
      api.deleteProductImage(selectedId!, imageId),
    onSuccess: () => {
      notifySuccess("Imagem removida");
      queryClient.invalidateQueries({
        queryKey: ["produto-imagens", profileScopeKey, selectedId],
      });
      queryClient.invalidateQueries({
        queryKey: ["produtos", profileScopeKey],
      });
    },
    onError: (error) => notifyError(error),
  });

  const handleAddImages = (files: File[] | null) => {
    if (!files || files.length === 0) return;
    const currentTotal = imagesQuery.data?.data?.total ?? 0;
    if (currentTotal + files.length > MAX_PRODUCT_IMAGES) {
      notifyError(new Error(`Limite de ${MAX_PRODUCT_IMAGES} imagens por produto.`));
      return;
    }
    uploadImagesMutation.mutate(files);
  };

  return {
    imagesQuery,
    uploadImagesMutation,
    setPrimaryImageMutation,
    deleteImageMutation,
    handleAddImages,
  };
}
