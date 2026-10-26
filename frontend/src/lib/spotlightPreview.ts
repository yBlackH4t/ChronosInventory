/** Atributo que liga a ação da busca rápida (Ctrl+K) ao produto da prévia. */
export const PREVIEW_ACTION_ATTR = "data-preview-product";

export const previewActionProps = (id: number) => ({ [PREVIEW_ACTION_ATTR]: String(id) });
