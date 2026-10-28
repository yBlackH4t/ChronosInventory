import type {
  Product,
  ProductCreate,
  ProductPut,
  ProductPatch,
  ProductImage,
  ProductImageListOut,
  ProductColumnsOut,
  ProductVisualItem,
  ProductImageUploadOut,
  ProductImagesUploadOut,
  ProductImageSetPrimaryOut,
  ProductStatusBulkIn,
  ProductStatusBulkOut,
  ListProductsParams,
  ListProductsStatusParams,
  SuccessResponse,
  ProductCatalogResponse,
  OwnFicha,
  OwnFichaIn,
  OwnFichaList,
  CatalogStatus,
  CatalogImportOut,
  CompanyRegisterImportOut,
  CompanyRegisterPreview,
  CompanyRegisterStatus,
  HiddenApplicationIn,
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

    async getProductCatalog(id: number, options: RequestInit = {}) {
      return request<ProductCatalogResponse>(
        `/produtos/${id}/catalogo`,
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

    async getProductColumns(codigo: string, options: RequestInit = {}) {
      return request<ProductColumnsOut>(
        `/produtos/colunas?codigo=${encodeURIComponent(codigo)}`,
        { method: "GET", ...options },
        baseUrl,
      );
    },

    async getProductsVisual(ids: number[], options: RequestInit = {}) {
      return request<ProductVisualItem[]>(
        `/produtos/resumo-visual?ids=${ids.join(",")}`,
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

    // Ficha própria e "Atualizar catálogo"
    async listOwnFichas(codigo?: string, options: RequestInit = {}) {
      return request<OwnFichaList>(
        `/catalogo/fichas-proprias${buildQuery({ codigo })}`,
        { method: "GET", ...options },
        baseUrl,
      );
    },

    async saveOwnFicha(payload: OwnFichaIn, id?: number, options: RequestInit = {}) {
      return request<OwnFicha>(
        id ? `/catalogo/fichas-proprias/${id}` : `/catalogo/fichas-proprias`,
        { method: id ? "PUT" : "POST", body: JSON.stringify(payload), ...options },
        baseUrl,
      );
    },

    async deleteOwnFicha(id: number, options: RequestInit = {}) {
      return request<{ removido: boolean }>(
        `/catalogo/fichas-proprias/${id}`,
        { method: "DELETE", ...options },
        baseUrl,
      );
    },

    /** "Não se aplica" (hide = true) ou "Desfazer" numa aplicação do catálogo. */
    async setApplicationHidden(payload: HiddenApplicationIn, hide: boolean, options: RequestInit = {}) {
      return request<{ oculta: boolean }>(
        hide ? `/catalogo/aplicacoes-ocultas` : `/catalogo/aplicacoes-ocultas/desfazer`,
        { method: "POST", body: JSON.stringify(payload), ...options },
        baseUrl,
      );
    },

    async getCatalogStatus(options: RequestInit = {}) {
      return request<CatalogStatus>(`/catalogo/status`, { method: "GET", ...options }, baseUrl);
    },

    async importCatalog(file: File, options: RequestInit = {}) {
      const form = new FormData();
      form.append("file", file);
      return request<CatalogImportOut>(
        `/catalogo/importar`,
        { method: "POST", body: form, ...options },
        baseUrl,
      );
    },

    // Cadastro da empresa (arquivo de produtos da loja)
    async getCompanyRegister(options: RequestInit = {}) {
      return request<CompanyRegisterStatus>(`/catalogo/cadastro`, { method: "GET", ...options }, baseUrl);
    },

    async previewCompanyRegister(file: File, options: RequestInit = {}) {
      const form = new FormData();
      form.append("file", file);
      return request<CompanyRegisterPreview>(
        `/catalogo/cadastro/previa`,
        { method: "POST", body: form, ...options },
        baseUrl,
      );
    },

    async importCompanyRegister(file: File, createProducts: boolean, options: RequestInit = {}) {
      const form = new FormData();
      form.append("file", file);
      return request<CompanyRegisterImportOut>(
        `/catalogo/cadastro/importar${buildQuery({ criar_produtos: createProducts })}`,
        { method: "POST", body: form, ...options },
        baseUrl,
      );
    },

    async removeCompanyRegister(options: RequestInit = {}) {
      return request<{ fichas_removidas: number }>(`/catalogo/cadastro`, { method: "DELETE", ...options }, baseUrl);
    },
  };
}
