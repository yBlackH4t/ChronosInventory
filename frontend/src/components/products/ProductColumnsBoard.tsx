import { Component, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Badge, Button, Group, Skeleton, Text, Tooltip } from "@mantine/core";
import {
  IconArrowLeft,
  IconArrowsExchange,
  IconId,
  IconLink,
  IconList,
  IconPencil,
  IconTag,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";

import { api } from "../../lib/apiClient";
import type { InventoryLocation, Product, ProductColumn, ProductColumnItem, ProductColumnKey } from "../../lib/api";
import { detectBrand, detectCondition } from "../../lib/brands";
import { clickableRowProps } from "../../lib/clickableRow";
import {
  COLUMN_COLORS,
  LINK_LABEL,
  LINKABLE_COLUMNS,
  columnStock,
  itemKey,
  itemTitle,
  stockPlace,
  totalSaidas,
} from "../../lib/productColumns";
import { brandTitle, productMonogram, splitProductCode, versionTitle } from "../../lib/productView";
import { useProductsVisual } from "../../hooks/useProductsVisual";
import { useProfileScope } from "../../state/profileScope";
import EmptyState from "../ui/EmptyState";
import ProductThumb from "./ProductThumb";
import SalesMiniBars from "./SalesMiniBars";
import StockNumber from "./StockNumber";
import "../../styles/product-columns.css";

type Handlers = {
  onQuickMove: (product: Product) => void;
  onOpenSingleLabel: (productId: number) => void;
  onOpenEdit: (product: Product) => void;
  /** Vincular: liga a peça pesquisada a outro produto (conjunto, montada, similar). */
  onOpenLinks: (product: Product) => void;
  onOpenDetails: (product: Product) => void;
  onHoverProduct?: (product: Product | null) => void;
};

type Props = Handlers & {
  codigo: string;
  locations: InventoryLocation[];
  onShowList: () => void;
};

type Opened = { column: ProductColumnKey; key: string };

const colorVar = (key: ProductColumnKey) => `var(--mantine-color-${COLUMN_COLORS[key]}-filled)`;

// Busca por código em colunas (2.7.11): nova, reman, montada, conjunto central e similares.
// Clicar num cartão abre a ficha dentro da própria coluna; as outras viram faixas na lateral.
export default function ProductColumnsBoard(props: Props) {
  return (
    <ColumnsErrorBoundary codigo={props.codigo} onShowList={props.onShowList}>
      <ColumnsBoard {...props} />
    </ColumnsErrorBoundary>
  );
}

// Um erro nas colunas não pode derrubar o programa inteiro: mostra o aviso e o caminho para a lista.
class ColumnsErrorBoundary extends Component<
  { codigo: string; onShowList: () => void; children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: unknown): void {
    console.error("Erro nas colunas da aba Produtos:", error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <EmptyState
        message={`Não deu para mostrar ${this.props.codigo.toUpperCase()} em colunas`}
        description={`Veja o resultado na lista. Detalhe para o suporte: ${this.state.error.message}`}
        actionLabel="Ver em lista"
        onAction={this.props.onShowList}
      />
    );
  }
}

function ColumnsBoard({ codigo, locations, onShowList, ...handlers }: Props) {
  const { profileScopeKey } = useProfileScope();
  const query = useQuery({
    queryKey: ["produtos", profileScopeKey, "colunas", codigo],
    queryFn: ({ signal }) => api.getProductColumns(codigo, { signal }),
    staleTime: 15_000,
  });
  const data = query.data?.data;
  const columns = useMemo(() => data?.colunas ?? [], [data]);
  const aplicacoes = data?.aplicacoes ?? [];
  const ids = useMemo(() => columns.flatMap((col) => col.itens.map((item) => item.produto.id)), [columns]);
  const visual = useProductsVisual(ids);
  const [opened, setOpened] = useState<Opened | null>(null);

  useEffect(() => {
    if (!opened) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpened(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [opened]);

  if (query.isLoading) {
    return (
      <div className="pc-board" aria-busy>
        {[0, 1, 2].map((i) => (
          <div key={i} className="pc-col pc-col-skeleton">
            <Skeleton height={14} width="45%" mb="md" />
            <Skeleton height={96} radius="md" mb="sm" />
            <Skeleton height={96} radius="md" />
          </div>
        ))}
      </div>
    );
  }

  if (query.isError || !data) {
    return (
      <EmptyState
        message="Não deu para buscar esse código"
        description="Tente de novo ou veja o resultado na lista."
        primaryLabel="Tentar de novo"
        onPrimary={() => void query.refetch()}
        actionLabel="Ver em lista"
        onAction={onShowList}
      />
    );
  }

  if (columns.length === 0) {
    return (
      <EmptyState
        illustrated
        message={`Nada com o código ${codigo.toUpperCase()}`}
        description={
          (data.codigos_possiveis?.length ?? 0) > 0
            ? `Será um destes? ${data.codigos_possiveis?.join(", ")}`
            : "Não achei essa peça nem equivalentes no cadastro e no catálogo."
        }
        actionLabel="Ver em lista"
        onAction={onShowList}
      />
    );
  }

  const primary = columns[0].itens[0].produto;
  const solo = columns.length === 1 && columns[0].itens.length === 1;
  const openItem = opened
    ? columns.find((col) => col.chave === opened.column)?.itens.find((item) => itemKey(opened.column, item) === opened.key)
    : null;
  const total = columns.reduce((acc, col) => acc + columnStock(col), 0);

  return (
    <div className="pc-wrap">
      <Group justify="space-between" gap="sm" wrap="wrap" className="pc-summary">
        <Group gap="md" wrap="wrap">
          <span className="pc-searched num">{data.codigo_digitado ?? data.codigo ?? codigo}</span>
          {data.codigo_digitado && data.codigo && (
            <Text size="sm" c="dimmed">
              entendi como {data.codigo}
            </Text>
          )}
          <span className="pc-summary-total">
            <strong className="num">{total.toLocaleString("pt-BR")}</strong> em estoque
          </span>
          {columns.map((col) => (
            <span key={col.chave} className="pc-summary-item">
              <span className="pc-dot" style={{ background: colorVar(col.chave) }} aria-hidden />
              {col.titulo} <strong className="num">{columnStock(col).toLocaleString("pt-BR")}</strong>
            </span>
          ))}
        </Group>
        <Group gap="xs" wrap="nowrap">
          {data.produtos_omitidos ? (
            <Text size="sm" c="orange" fw={600}>
              +{data.produtos_omitidos} produtos não couberam aqui
            </Text>
          ) : null}
          <Button variant="subtle" size="compact-sm" leftSection={<IconList size={15} />} onClick={onShowList}>
            Ver em lista
          </Button>
        </Group>
      </Group>

      <div className="pc-board" data-solo={solo || undefined} data-open={openItem ? true : undefined} key={codigo}>
        {columns.map((col, index) => {
          const state = !openItem ? "normal" : col.chave === opened?.column ? "open" : "rail";
          return (
            <section
              key={col.chave}
              className="pc-col"
              data-state={state}
              style={{ "--pc-color": colorVar(col.chave), "--pc-i": index } as CSSProperties}
              aria-label={col.titulo}
            >
              {state === "rail" ? (
                <button type="button" className="pc-rail" onClick={() => setOpened(null)} title="Voltar às colunas">
                  <span className="pc-rail-count num">{columnStock(col)}</span>
                  <span className="pc-rail-title">{col.titulo}</span>
                </button>
              ) : (
                <>
                  <header className="pc-col-head">
                    <span className="pc-dot" aria-hidden />
                    <span className="pc-col-title">{col.titulo}</span>
                    <Badge size="sm" variant="light" color="gray" radius="xl">
                      {col.itens.length}
                    </Badge>
                    <span className="pc-col-total">
                      <strong className="num">{columnStock(col).toLocaleString("pt-BR")}</strong>
                      <span className="pc-col-total-word"> em estoque</span>
                    </span>
                  </header>
                  {state === "open" && openItem ? (
                    <ProductColumnFicha
                      item={openItem}
                      column={col}
                      others={columns.filter((other) => other.chave !== col.chave)}
                      aplicacoes={aplicacoes}
                      weeks={visual.get(openItem.produto.id)?.saidas_semanas}
                      locations={locations}
                      onBack={() => setOpened(null)}
                      {...handlers}
                    />
                  ) : (
                    <>
                      <div className="pc-cards">
                        {col.itens.map((item, i) => (
                          <ColumnCard
                            key={itemKey(col.chave, item)}
                            item={item}
                            index={i}
                            big={solo}
                            thumb={visual.get(item.produto.id)?.thumb_base64}
                            weeks={visual.get(item.produto.id)?.saidas_semanas}
                            aplicacoes={solo ? aplicacoes : []}
                            locations={locations}
                            onOpen={solo ? undefined : () => setOpened({ column: col.chave, key: itemKey(col.chave, item) })}
                            {...handlers}
                          />
                        ))}
                      </div>
                      {solo ? (
                        <div className="pc-link-row">
                          {LINKABLE_COLUMNS.map((link) => (
                            <LinkButton
                              key={link.key}
                              label={link.label}
                              color={colorVar(link.key)}
                              onClick={() => handlers.onOpenLinks(primary)}
                            />
                          ))}
                        </div>
                      ) : LINK_LABEL[col.chave] ? (
                        <LinkButton
                          label={LINK_LABEL[col.chave]}
                          color={colorVar(col.chave)}
                          onClick={() => handlers.onOpenLinks(primary)}
                        />
                      ) : null}
                    </>
                  )}
                </>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function LinkButton({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  return (
    <Tooltip label="Liga a peça pesquisada a outro produto do cadastro" openDelay={400}>
      <button type="button" className="pc-link" style={{ "--pc-link": color } as CSSProperties} onClick={onClick}>
        <IconLink size={15} stroke={1.75} aria-hidden />+ {label}
      </button>
    </Tooltip>
  );
}

function ItemMeta({ item }: { item: ProductColumnItem }) {
  const nome = itemTitle(item);
  const brand = detectBrand(nome);
  const meta = [brandTitle(brand), versionTitle(detectCondition(nome))].filter(Boolean).join(" · ");
  return (
    <div className="pc-meta">
      <span>{meta}</span>
      {item.rotulo && (
        <span className="pc-tag" title={item.obs ?? undefined}>
          {item.rotulo}
          {item.codigo_relacionado ? ` de ${item.codigo_relacionado}` : ""}
        </span>
      )}
      {item.relacao === "montada_no_conjunto" && (
        <span className="pc-via">
          faturada pelo conjunto #{item.produto.id}
        </span>
      )}
    </div>
  );
}

function ItemActions({ product, ...handlers }: Handlers & { product: Product }) {
  return (
    <Group gap={6} wrap="nowrap" className="pc-actions" onClick={(event) => event.stopPropagation()}>
      <Tooltip label="Movimentar estoque (tecla N)" openDelay={400}>
        <Button
          size="compact-sm"
          variant="light"
          leftSection={<IconArrowsExchange size={15} stroke={1.75} />}
          onClick={() => handlers.onQuickMove(product)}
          aria-label="Movimentar"
        >
          <span className="pc-act-label">Movimentar</span>
        </Button>
      </Tooltip>
      <Button
        size="compact-sm"
        variant="default"
        leftSection={<IconTag size={14} stroke={1.75} />}
        onClick={() => handlers.onOpenSingleLabel(product.id)}
        aria-label="Etiqueta"
        title="Gerar etiqueta"
      >
        <span className="pc-act-label">Etiqueta</span>
      </Button>
      <Button
        size="compact-sm"
        variant="default"
        leftSection={<IconPencil size={14} stroke={1.75} />}
        onClick={() => handlers.onOpenEdit(product)}
        aria-label="Editar"
        title="Editar cadastro"
      >
        <span className="pc-act-label">Editar</span>
      </Button>
    </Group>
  );
}

function ColumnCard({
  item,
  index,
  big,
  thumb,
  weeks,
  aplicacoes,
  locations,
  onOpen,
  ...handlers
}: Handlers & {
  item: ProductColumnItem;
  index: number;
  big: boolean;
  thumb?: string | null;
  weeks?: number[];
  aplicacoes: string[];
  locations: InventoryLocation[];
  onOpen?: () => void;
}) {
  const product = item.produto;
  const nome = itemTitle(item);
  const brand = detectBrand(nome);
  const { code, rest } = splitProductCode(nome, brand);
  const saidas = totalSaidas(weeks);
  return (
    <div
      {...(onOpen ? clickableRowProps(() => onOpen()) : {})}
      className={onOpen ? "pc-card clickable-row" : "pc-card"}
      data-big={big || undefined}
      style={{ "--pc-card-i": index } as CSSProperties}
      onMouseEnter={() => handlers.onHoverProduct?.(product)}
      onMouseLeave={() => handlers.onHoverProduct?.(null)}
    >
      <ProductThumb
        base64={thumb}
        alt={nome}
        size={big ? 168 : 52}
        monogram={productMonogram(nome, brand) ?? undefined}
        color={brand?.color}
      />
      <div className="pc-info">
        <div className="pc-code num">
          #{product.id}
          {code ? <span className="pc-code-part"> · {code}</span> : null}
        </div>
        <div className="pc-name" title={nome}>
          {rest || nome}
        </div>
        <ItemMeta item={item} />
        {big && aplicacoes.length > 0 && (
          <Text size="sm" c="dimmed" mt={8} className="pc-apps">
            <strong>Aplicação:</strong> {aplicacoes.join(" · ")}
          </Text>
        )}
      </div>
      <div className="pc-qty">
        <StockNumber value={product.total_stock} />
        <span className="pc-qty-label">{stockPlace(item, locations)}</span>
        <span className="pc-qty-out num">
          {saidas > 0 ? `${saidas} ${saidas === 1 ? "saída" : "saídas"} 90d` : "sem saída 90d"}
        </span>
      </div>
      <ItemActions product={product} {...handlers} />
    </div>
  );
}

function ProductColumnFicha({
  item,
  column,
  others,
  aplicacoes,
  weeks,
  locations,
  onBack,
  ...handlers
}: Handlers & {
  item: ProductColumnItem;
  column: ProductColumn;
  others: ProductColumn[];
  aplicacoes: string[];
  weeks?: number[];
  locations: InventoryLocation[];
  onBack: () => void;
}) {
  const product = item.produto;
  const nome = itemTitle(item);
  const brand = detectBrand(nome);
  const { code, rest } = splitProductCode(nome, brand);
  const { profileScopeKey } = useProfileScope();
  const image = useQuery({
    queryKey: ["produtos", profileScopeKey, "imagem", product.id],
    queryFn: ({ signal }) => api.getProductImage(product.id, { signal }),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const photo = image.data?.data?.image_base64;
  const saidas = totalSaidas(weeks);
  const byLocation = locations.filter((loc) => (product.inventories?.[loc.id] ?? 0) > 0);

  return (
    <div className="pc-ficha">
      <div className="pc-ficha-side">
        <button type="button" className="pc-back" onClick={onBack}>
          <IconArrowLeft size={15} /> Voltar às colunas <span className="pc-back-key">Esc</span>
        </button>
        <div className="pc-photo">
          <ProductThumb
            base64={photo}
            alt={nome}
            size={220}
            monogram={productMonogram(nome, brand) ?? undefined}
            color={brand?.color}
          />
        </div>
      </div>
      <div className="pc-ficha-main">
        <div className="pc-code num">
          #{product.id} · {column.titulo}
        </div>
        <h2 className="pc-ficha-title">
          {code && <span className="num">{code} </span>}
          {rest || nome}
        </h2>
        <ItemMeta item={item} />

        <div className="pc-kpis">
          <div className="pc-kpi pc-kpi-main" data-zero={product.total_stock === 0 || undefined}>
            <StockNumber value={product.total_stock} />
            <span>{stockPlace(item, locations)}</span>
          </div>
          <div className="pc-kpi">
            <strong className="num">{saidas}</strong>
            <span>saídas em 90 dias</span>
          </div>
          {byLocation.length > 1 &&
            byLocation.map((loc) => (
              <div key={loc.id} className="pc-kpi">
                <strong className="num">{product.inventories[loc.id]}</strong>
                <span>{loc.label || loc.name}</span>
              </div>
            ))}
        </div>

        <div className="pc-section">
          <h3>Saídas por semana</h3>
          <div className="pc-weeks">
            <SalesMiniBars weeks={weeks} />
          </div>
        </div>

        {aplicacoes.length > 0 && (
          <div className="pc-section">
            <h3>Aplicação</h3>
            <Text size="sm">{aplicacoes.join(" · ")}</Text>
          </div>
        )}

        {others.length > 0 && (
          <div className="pc-section">
            <h3>Na mesma busca</h3>
            <div className="pc-chips">
              {others.flatMap((other) =>
                other.itens.map((o) => (
                  <span key={itemKey(other.chave, o)} className="pc-chip" style={{ "--pc-color": colorVar(other.chave) } as CSSProperties}>
                    <span className="pc-dot" aria-hidden />
                    {other.titulo.toLowerCase()} · #{o.produto.id}
                    <strong className="num">{o.produto.total_stock}</strong>
                  </span>
                )),
              )}
            </div>
          </div>
        )}

        <Group gap="xs" mt="lg" wrap="wrap">
          <Button leftSection={<IconArrowsExchange size={16} />} onClick={() => handlers.onQuickMove(product)}>
            Movimentar
          </Button>
          <Button variant="default" leftSection={<IconTag size={16} />} onClick={() => handlers.onOpenSingleLabel(product.id)}>
            Gerar etiqueta
          </Button>
          <Button variant="default" leftSection={<IconPencil size={16} />} onClick={() => handlers.onOpenEdit(product)}>
            Editar cadastro
          </Button>
          <Button variant="default" leftSection={<IconLink size={16} />} onClick={() => handlers.onOpenLinks(product)}>
            Vincular
          </Button>
          <Button variant="subtle" leftSection={<IconId size={16} />} onClick={() => handlers.onOpenDetails(product)}>
            Ficha completa
          </Button>
        </Group>
      </div>
    </div>
  );
}
