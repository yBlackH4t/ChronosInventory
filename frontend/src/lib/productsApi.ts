import type {
  Product,
  ProductCreate,
  ProductPut,
  ProductPatch,
  ProductImage,
  ProductImageListOut,
  ProductImageUploadOut,
  ProductImagesUploadOut,
  ProductImageSetPrimaryOut,
  ProductStatusBulkIn,
  ProductStatusBulkOut,
  ListProductsParams,
  ListProductsStatusParams,
  SuccessResponse,
} from "../types/api";

type QueryValue = string | number | boolean | null | undefined;

type RequestFn = <T>(
  input: string,
  init: RequestInit | undefined,
  baseUrl: string,
) => Promise<SuccessResponse<T>>;

type BuildQueryFn = (params: Record<string, QueryValue>) => string;

export type ApiContext = {
  baseUrl: string;
  request: RequestFn;
  buildQuery: BuildQueryFn;
};

export function createProductsApi({
  baseUrl,
  request,
  buildQuery,
}: ApiContext) {
  return {
    async listProducts(
      params: ListProductsParams = {},
      options: RequestInit = {},
    ) {
      const query = buildQuery(params);
      return request<Product[]>(
        `/produtos${query}`,
        { method: "GET", ...options },
        baseUrl,
      );
    },

    async listProductsStatus(
      params: ListProductsStatusParams = {},
      options: RequestInit = {},
    ) {
      const query = buildQuery(params);
      return request<Product[]>(
        `/produtos/gestao-status${query}`,
        { method: "GET", ...options },
        baseUrl,
      );
    },

    async getLinkedProducts(id: number, options: RequestInit = {}) {
      return request<Product[]>(
        `/produtos/${id}/vinculados`,
        { method: "GET", ...options },
        baseUrl,
      );
    },

    async getProduct(id: number, options: RequestInit = {}) {
      return request<Product>(
        `/produtos/${id}`,
        { method: "GET", ...options },
        baseUrl,
      );
    },

    async createProduct(payload: ProductCreate, options: RequestInit = {}) {
      return request<Product>(
        `/produtos`,
        {
          method: "POST",
          body: JSON.stringify(payload),
          ...options,
        },
        baseUrl,
      );
    },

    async updateProduct(
      id: number,
      payload: ProductPut,
      options: RequestInit = {},
    ) {
      return request<Product>(
        `/produtos/${id}`,
        {
          method: "PUT",
          body: JSON.stringify(payload),
          ...options,
        },
        baseUrl,
      );
    },

    async patchProduct(
      id: number,
      payload: ProductPatch,
      options: RequestInit = {},
    ) {
      return request<Product>(
        `/produtos/${id}`,
        {
          method: "PATCH",
          body: JSON.stringify(payload),
          ...options,
        },
        baseUrl,
      );
    },

    async deleteProduct(id: number, options: RequestInit = {}) {
      return request<{ id: number; nome: string; message: string }>(
        `/produtos/${id}`,
        {
          method: "DELETE",
          ...options,
        },
        baseUrl,
      );
    },

    async getProductImage(id: number, options: RequestInit = {}) {
      return request<ProductImage>(
        `/produtos/${id}/imagem`,
        { method: "GET", ...options },
        baseUrl,
      );
    },

    async listProductImages(id: number, options: RequestInit = {}) {
      return request<ProductImageListOut>(
        `/produtos/${id}/imagens`,
        { method: "GET", ...options },
        baseUrl,
      );
    },

    async uploadProductImage(
      id: number,
      file: File,
      options: RequestInit = {},
    ) {
      const form = new FormData();
      form.append("file", file);
      return request<ProductImageUploadOut>(
        `/produtos/${id}/imagem`,
        {
          method: "POST",
          body: form,
          ...options,
        },
        baseUrl,
      );
    },

    async uploadProductImages(
      id: number,
      files: File[],
      options: RequestInit = {},
    ) {
      const form = new FormData();
      files.forEach((file) => form.append("files", file));
      return request<ProductImagesUploadOut>(
        `/produtos/${id}/imagens`,
        {
          method: "POST",
          body: form,
          ...options,
        },
        baseUrl,
      );
    },

    async setPrimaryProductImage(
      id: number,
      imageId: number,
      options: RequestInit = {},
    ) {
      return request<ProductImageSetPrimaryOut>(
        `/produtos/${id}/imagens/${imageId}/principal`,
        {
          method: "PATCH",
          ...options,
        },
        baseUrl,
      );
    },

    async deleteProductImage(
      id: number,
      imageId: number,
      options: RequestInit = {},
    ) {
      return request<{ id: number; message: string }>(
        `/produtos/${id}/imagens/${imageId}`,
        {
          method: "DELETE",
          ...options,
        },
        baseUrl,
      );
    },

    async bulkUpdateProductStatus(
      payload: ProductStatusBulkIn,
      options: RequestInit = {},
    ) {
      return request<ProductStatusBulkOut>(
        `/produtos/status-lote`,
        {
          method: "PUT",
          body: JSON.stringify(payload),
          ...options,
        },
        baseUrl,
      );
    },
  };
}
