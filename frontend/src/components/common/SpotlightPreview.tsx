import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Text } from "@mantine/core";

import type { Product } from "../../lib/api";
import { brandTitle, splitProductCode, versionTitle } from "../../lib/productView";
import { detectBrand, detectCondition } from "../../lib/brands";
import { useLocations } from "../../hooks/useLocations";
import { useProductsVisual } from "../../hooks/useProductsVisual";
import { PREVIEW_ACTION_ATTR } from "../../lib/spotlightPreview";
import ProductThumb from "../products/ProductThumb";
import StockNumber from "../products/StockNumber";


/** Produto selecionado na busca rápida (teclado ou mouse), lido do atributo da ação. */
function useSelectedProductId(active: boolean): number | null {
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    if (!active) return;
    const read = () => {
      const node =
        document.querySelector<HTMLElement>(`.mantine-Spotlight-action[data-selected][${PREVIEW_ACTION_ATTR}]`) ??
        document.querySelector<HTMLElement>(`.mantine-Spotlight-action[${PREVIEW_ACTION_ATTR}]:hover`);
      const id = node ? Number(node.getAttribute(PREVIEW_ACTION_ATTR)) : null;
      if (id) setSelected(id);
    };
    const observer = new MutationObserver(read);
    observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["data-selected"], childList: true });
    document.addEventListener("pointerover", read);
    const first = requestAnimationFrame(read);
    return () => {
      cancelAnimationFrame(first);
      observer.disconnect();
      document.removeEventListener("pointerover", read);
    };
  }, [active]);

  return active ? selected : null;
}

// Painel à direita da busca rápida (Ctrl+K): foto, código, marca e o saldo por filial do
// produto selecionado. Entra deslizando (fora do nível "Nenhum").
export default function SpotlightPreview({ products }: { products: Product[] }) {
  const selectedId = useSelectedProductId(products.length > 0);
  const { locations } = useLocations();
  const product = products.find((p) => p.id === selectedId) ?? products[0] ?? null;
  const visual = useProductsVisual(product ? [product.id] : []);
  const [host, setHost] = useState<HTMLElement | null>(null);

  const hasProducts = products.length > 0;
  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      setHost(hasProducts ? document.querySelector<HTMLElement>(".mantine-Spotlight-content") : null),
    );
    return () => cancelAnimationFrame(frame);
  }, [hasProducts]);

  useEffect(() => {
    if (!host) return;
    host.classList.add("mi-spot-has-preview");
    return () => host.classList.remove("mi-spot-has-preview");
  }, [host]);

  if (!host || !product) return null;
  const brand = detectBrand(product.nome);
  const condition = detectCondition(product.nome);
  const { code, rest } = splitProductCode(product.nome, brand);
  const max = Math.max(1, ...locations.map((loc) => product.inventories?.[loc.id] ?? 0));

  return createPortal(
    <aside className="mi-spot-preview" key={product.id} aria-live="polite" aria-label="Prévia do produto">
      <div className="mi-spot-photo">
        <ProductThumb base64={visual.get(product.id)?.thumb_base64} alt={product.nome} />
      </div>
      {code && <span className="pm-code-cell">{code}</span>}
      <Text fw={650} size="sm" lh={1.3} lineClamp={3}>
        {(code ? rest : "") || product.nome}
      </Text>
      <Text size="xs" c="dimmed">
        {[brandTitle(brand), versionTitle(condition), `#${product.id}`].filter(Boolean).join(" · ")}
      </Text>
      <div className="mi-spot-stock">
        {locations.map((loc) => {
          const qty = product.inventories?.[loc.id] ?? 0;
          return (
            <div key={loc.id} className="mi-spot-loc">
              <span>{loc.label || loc.name}</span>
              <span className="mi-spot-loc-bar">
                <span style={{ width: `${(qty / max) * 100}%` }} />
              </span>
              <span className="num" data-zero={qty === 0 || undefined}>
                {qty}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mi-spot-total">
        <Text size="xs" c="dimmed">
          Total
        </Text>
        <StockNumber value={product.total_stock} />
      </div>
      <Text size="xs" c="dimmed">
        Enter abre a ficha
      </Text>
    </aside>,
    host,
  );
}
