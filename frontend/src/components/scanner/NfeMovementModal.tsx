import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Collapse,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconCheck,
  IconCircleCheck,
  IconFileInvoice,
  IconPrinter,
  IconSearch,
  IconSettings,
} from "@tabler/icons-react";
import { m } from "motion/react";
import { useQueryClient } from "@tanstack/react-query";

import { api } from "../../lib/apiClient";
import type { NfeItemPreview, NfeNatureza, NfePreview, NfeProduto } from "../../lib/api";
import { formatNfeKey, parseNfeKey } from "../../lib/nfe";
import { parseNfeShippingData, type NfeShippingData } from "../../lib/nfeShippingLabel";
import { notifyError, notifySuccess } from "../../lib/notify";
import { PRODUCT_ADJUSTMENT_REASON_OPTIONS } from "../../lib/productMovement";
import { useLocations } from "../../hooks/useLocations";
import { useMotionLevel } from "../../lib/motionContext";
import { NFE_STEPS, nfeStepIndex, stockAfter } from "../../lib/nfeSteps";
import { revealFor } from "../../lib/reveal";
import AnimatedNumber from "../ui/AnimatedNumber";
import Reveal from "../ui/Reveal";
import { printNfeShippingLabels } from "../labels/nfeDesignerUtils";
import NfeProductPicker from "./NfeProductPicker";
import NfeSettingsPanel from "./NfeSettingsPanel";
import NfeStepper from "./NfeStepper";
import "./scanner.css";

type RowState = {
  produtoId: string | null;
  quantidade: number;
  options: NfeProduto[];
  ignorar: boolean;
};

type NfeMovementModalProps = {
  opened: boolean;
  chave: string | null;
  onClose: () => void;
};

const CONFIANCA_LABEL: Record<NfeItemPreview["confianca"], { label: string; color: string } | null> = {
  aprendido: { label: "já usado antes", color: "success" },
  codigo: { label: "pelo código", color: "info" },
  duvida: { label: "confira", color: "warning" },
  nenhum: null,
};

function formatEmissao(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("pt-BR");
}

export default function NfeMovementModal({ opened, chave, onClose }: NfeMovementModalProps) {
  const queryClient = useQueryClient();
  const motionLevel = useMotionLevel();
  const { activeLocations } = useLocations();
  const [input, setInput] = useState("");
  const [nota, setNota] = useState<NfePreview | null>(null);
  const [rows, setRows] = useState<Record<number, RowState>>({});
  const [tipo, setTipo] = useState<"SAIDA" | "ENTRADA">("SAIDA");
  const [locationId, setLocationId] = useState<string | null>(null);
  const [natureza, setNatureza] = useState<NfeNatureza>("OPERACAO_NORMAL");
  const [localExterno, setLocalExterno] = useState("");
  const [motivoAjuste, setMotivoAjuste] = useState<string | null>(null);
  const [observacao, setObservacao] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showFolders, setShowFolders] = useState(false);
  const searchTimers = useRef<Record<number, number>>({});
  // Saida lancada: o modal fica aberto oferecendo a etiqueta de expedicao da nota.
  const [lancada, setLancada] = useState<{ chave: string; numero: number } | null>(null);
  const [envio, setEnvio] = useState<NfeShippingData | null>(null);
  const [printingLabel, setPrintingLabel] = useState(false);

  const fetchEnvio = async (chaveNota: string): Promise<NfeShippingData> => {
    const res = await api.getNfeXml(chaveNota);
    return parseNfeShippingData(res.data.xml);
  };

  const printLabel = async (chaveNota: string) => {
    setPrintingLabel(true);
    try {
      const data = envio ?? (await fetchEnvio(chaveNota));
      printNfeShippingLabels(data, (message) => notifyError(new Error(message)));
    } catch (e) {
      notifyError(e, "Não foi possível gerar a etiqueta.");
    } finally {
      setPrintingLabel(false);
    }
  };

  // Natureza, local externo e observacao vem sugeridos pela nota (matriz/filial = transferencia externa).
  const applyTipo = (data: NfePreview, next: "SAIDA" | "ENTRADA") => {
    setTipo(next);
    const sugerido = data.movimento_sugerido?.[next];
    setNatureza(sugerido?.natureza ?? "OPERACAO_NORMAL");
    setLocalExterno(sugerido?.local_externo ?? "");
    setObservacao(sugerido?.observacao ?? "");
    setMotivoAjuste(null);
  };

  const load = async (raw: string) => {
    const key = parseNfeKey(raw);
    if (!key) {
      setLoadError("Isso não é uma chave de NF-e (44 números do código de barras do DANFE).");
      return;
    }
    setInput(formatNfeKey(key));
    setLoading(true);
    setLoadError(null);
    setNota(null);
    setLancada(null);
    setEnvio(null);
    try {
      const res = await api.getNfe(key);
      const data = res.data;
      setNota(data);
      applyTipo(data, data.tipo_sugerido);
      const next: Record<number, RowState> = {};
      for (const item of data.itens) {
        next[item.item] = {
          produtoId: item.produto_sugerido ? String(item.produto_sugerido.id) : null,
          quantidade: item.quantidade ?? 1,
          options: item.candidatos,
          ignorar: item.ignorar ?? false,
        };
      }
      setRows(next);
      // Local padrao: onde os produtos sugeridos tem mais saldo.
      const totals = new Map<string, number>();
      for (const item of data.itens) {
        for (const [loc, qty] of Object.entries(item.produto_sugerido?.estoque ?? {})) {
          totals.set(loc, (totals.get(loc) ?? 0) + qty);
        }
      }
      const best = [...totals.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      setLocationId((current) => best ?? current ?? (activeLocations[0] ? String(activeLocations[0].id) : null));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Não foi possível ler a nota.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (opened && chave) void load(chave);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, chave]);

  useEffect(() => {
    if (!opened) {
      setNota(null);
      setRows({});
      setInput("");
      setLoadError(null);
      setShowFolders(false);
      setLancada(null);
      setEnvio(null);
    }
  }, [opened]);

  useEffect(() => {
    if (!locationId && activeLocations.length > 0) setLocationId(String(activeLocations[0].id));
  }, [activeLocations, locationId]);

  const updateRow = (item: number, patch: Partial<RowState>) => {
    setRows((current) => ({ ...current, [item]: { ...current[item], ...patch } }));
  };

  const searchProducts = (item: number, query: string) => {
    window.clearTimeout(searchTimers.current[item]);
    if (query.trim().length < 2) return;
    searchTimers.current[item] = window.setTimeout(async () => {
      try {
        const res = await api.listProducts({ query, page_size: 10 });
        const found: NfeProduto[] = (res.data ?? []).map((p) => ({
          id: p.id,
          nome: p.nome,
          estoque: Object.fromEntries(
            Object.entries(p.inventories ?? {}).map(([k, v]) => [String(k), Number(v)]),
          ),
        }));
        setRows((current) => {
          const row = current[item];
          if (!row) return current;
          const known = new Set(row.options.map((o) => o.id));
          return {
            ...current,
            [item]: { ...row, options: [...row.options, ...found.filter((p) => !known.has(p.id))] },
          };
        });
      } catch {
        // busca falhou: o usuario tenta de novo
      }
    }, 300);
  };

  const stockOf = (row: RowState | undefined): number | null => {
    if (!row?.produtoId || row.ignorar || !locationId) return null;
    const product = row.options.find((o) => String(o.id) === row.produtoId);
    return product ? product.estoque[locationId] ?? 0 : null;
  };

  const problems = useMemo(() => {
    if (!nota) return [];
    const list: string[] = [];
    if (nota.cancelada) list.push("Esta nota foi cancelada.");
    if (!nota.autorizada) {
      const arquivo = nota.arquivo.split(/[\\/]/).pop();
      list.push(
        `O XML desta nota ainda não tem a autorização da SEFAZ (${arquivo}). Confira se ela foi autorizada no emissor e clique em Buscar de novo.`,
      );
    }
    if (nota.ja_baixada) list.push(`Esta nota já foi baixada em ${formatEmissao(nota.ja_baixada.data)}.`);
    const semProduto = nota.itens.filter((i) => !rows[i.item]?.produtoId && !rows[i.item]?.ignorar).length;
    if (nota.itens.every((i) => rows[i.item]?.ignorar)) list.push("Todos os itens estão marcados para ignorar.");
    if (semProduto) list.push(`Escolha o produto de ${semProduto === 1 ? "1 item" : `${semProduto} itens`}.`);
    if (tipo === "SAIDA") {
      const semSaldo = nota.itens.filter((i) => {
        const stock = stockOf(rows[i.item]);
        return stock !== null && stock < (rows[i.item]?.quantidade ?? 0);
      }).length;
      if (semSaldo) list.push(`Saldo insuficiente neste local em ${semSaldo === 1 ? "1 item" : `${semSaldo} itens`}.`);
    }
    if (!locationId) list.push("Escolha o local.");
    if (natureza === "TRANSFERENCIA_EXTERNA" && !localExterno.trim()) list.push("Informe o local externo.");
    if (natureza === "AJUSTE" && !motivoAjuste) list.push("Escolha o motivo do ajuste.");
    if (natureza === "AJUSTE" && !observacao.trim()) list.push("Escreva a observação do ajuste.");
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nota, rows, tipo, locationId, natureza, localExterno, motivoAjuste, observacao]);

  const confirm = async () => {
    if (!nota || !locationId || problems.length) return;
    setSaving(true);
    try {
      const res = await api.baixarNfe(nota.chave, {
        tipo,
        location_id: Number(locationId),
        itens: nota.itens.map((i) =>
          rows[i.item].ignorar
            ? { item: i.item, quantidade: 1, ignorar: true }
            : { item: i.item, produto_id: Number(rows[i.item].produtoId), quantidade: rows[i.item].quantidade },
        ),
        natureza,
        local_externo: natureza === "TRANSFERENCIA_EXTERNA" ? localExterno.trim() : undefined,
        motivo_ajuste: natureza === "AJUSTE" && motivoAjuste ? motivoAjuste : undefined,
        observacao: observacao.trim() || undefined,
      });
      notifySuccess(
        `${tipo === "SAIDA" ? "Saída" : "Entrada"} da ${res.data.documento} lançada (${res.data.movimentacoes.length} ${
          res.data.movimentacoes.length === 1 ? "item" : "itens"
        }).`,
      );
      void queryClient.invalidateQueries();
      if (tipo === "SAIDA") {
        setLancada({ chave: nota.chave, numero: nota.numero });
        fetchEnvio(nota.chave)
          .then(setEnvio)
          .catch(() => setEnvio(null)); // sem o XML agora: o botao tenta de novo ao clicar
      } else {
        onClose();
      }
    } catch (e) {
      notifyError(e, "Não foi possível lançar a nota.");
    } finally {
      setSaving(false);
    }
  };

  const locationOptions = activeLocations.map((loc) => ({ value: String(loc.id), label: loc.label || loc.name }));

  const itemsWithoutProduct = nota
    ? nota.itens.filter((i) => !rows[i.item]?.produtoId && !rows[i.item]?.ignorar).length
    : 0;
  const itemsShort =
    nota && tipo === "SAIDA"
      ? nota.itens.filter((i) => {
          const stock = stockOf(rows[i.item]);
          return stock !== null && stock < (rows[i.item]?.quantidade ?? 0);
        }).length
      : 0;
  const step = nfeStepIndex({
    hasNota: Boolean(nota),
    itemsWithoutProduct,
    itemsShort,
    allIgnored: Boolean(nota && nota.itens.length > 0 && nota.itens.every((i) => rows[i.item]?.ignorar)),
    hasProblems: problems.length > 0,
  });
  const ignoredCount = nota ? nota.itens.filter((i) => rows[i.item]?.ignorar).length : 0;
  const stockAtLocation = (product: NfeProduto) => (locationId ? product.estoque[locationId] ?? 0 : null);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs">
          <IconFileInvoice size={20} stroke={1.6} />
          <span>Lançar nota fiscal (NF-e)</span>
        </Group>
      }
      size={1040}
      classNames={{ header: "modal-solid-header" }}
    >
      <Stack gap="lg">
        <NfeStepper current={lancada ? NFE_STEPS.length : step} />

        {lancada && (
          <section className="nfe-section" data-active aria-live="polite">
            <Stack gap="md" align="flex-start">
              <Group gap="xs">
                <IconCircleCheck size={22} stroke={1.6} color="var(--mantine-color-success-6)" />
                <Text fw={600}>Saída da NF {lancada.numero} lançada.</Text>
              </Group>
              <Text size="sm" c="dimmed">
                {envio
                  ? `${envio.cliente} · ${envio.cidade}/${envio.estado} · ${envio.transportadora} · ${
                      envio.volumes === 1 ? "1 volume" : `${envio.volumes} volumes`
                    }`
                  : "Imprima a etiqueta da caixa com os dados da nota."}
              </Text>
              <Text size="xs" c="dimmed">
                Sai com o layout salvo em Etiquetas &gt; NF-e, uma etiqueta por volume da nota.
              </Text>
              <Group>
                <Button
                  leftSection={<IconPrinter size={16} />}
                  loading={printingLabel}
                  onClick={() => void printLabel(lancada.chave)}
                  data-autofocus
                >
                  Imprimir etiqueta
                  {envio && envio.volumes > 1 ? ` (${envio.volumes} volumes)` : ""}
                </Button>
                <Button variant="default" onClick={onClose}>
                  Fechar
                </Button>
              </Group>
            </Stack>
          </section>
        )}

        {!lancada && (
          <>

            <section className="nfe-section" data-active={step === 0 || undefined} aria-labelledby="nfe-step-1">
              <h3 className="nfe-section-title" id="nfe-step-1">
                <span className="nfe-section-number" aria-hidden>
                  1
                </span>
                Ler a chave
              </h3>
              <Stack gap="sm">
                <Group align="flex-end" gap="xs" wrap="nowrap">
                  <TextInput
                    style={{ flex: 1 }}
                    label="Chave da NF-e"
                    description="Bipe o código de barras do DANFE (celular ou leitor) ou digite a chave. Nota de fornecedor é baixada da SEFAZ com o certificado."
                    placeholder="0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000"
                    value={input}
                    onChange={(e) => setInput(e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void load(input);
                    }}
                    classNames={{ input: "num" }}
                    data-autofocus
                  />
                  <Button leftSection={<IconSearch size={16} />} onClick={() => void load(input)} loading={loading}>
                    Buscar
                  </Button>
                  <Button variant="subtle" leftSection={<IconSettings size={16} />} onClick={() => setShowFolders((v) => !v)}>
                    Configurar
                  </Button>
                </Group>

                <Collapse expanded={showFolders}>
                  <NfeSettingsPanel
                    opened={showFolders}
                    onSaved={() => {
                      setShowFolders(false);
                      if (input) void load(input);
                    }}
                  />
                </Collapse>

                {loadError && (
                  <Alert color="danger" icon={<IconAlertTriangle size={16} />}>
                    {loadError}
                  </Alert>
                )}

                {nota && (
                  <Reveal index={0} className="nfe-nota-summary">
                    <Stack gap={2} miw={0} style={{ flex: 1 }}>
                      <Text fw={600}>
                        NF {nota.numero} · série {nota.serie} · {formatEmissao(nota.emissao)}
                      </Text>
                      <Text size="sm" c="dimmed">
                        {nota.natureza_operacao} · {nota.tipo_sugerido === "SAIDA" ? "para" : "de"}{" "}
                        {nota.tipo_sugerido === "SAIDA" ? nota.destinatario : nota.emitente}
                      </Text>
                    </Stack>
                    <Group gap={6}>
                      <Badge variant="light" color="gray">
                        {nota.itens.length === 1 ? "1 item" : `${nota.itens.length} itens`}
                      </Badge>
                      {nota.cancelada ? (
                        <Badge variant="light" color="danger">
                          Cancelada
                        </Badge>
                      ) : nota.autorizada ? (
                        <Badge variant="light" color="success">
                          Autorizada
                        </Badge>
                      ) : (
                        <Badge variant="light" color="warning">
                          Sem autorização
                        </Badge>
                      )}
                    </Group>
                  </Reveal>
                )}
              </Stack>
            </section>

            {nota && (
              <section className="nfe-section" data-active={step === 1 || undefined} aria-labelledby="nfe-step-2">
                <h3 className="nfe-section-title" id="nfe-step-2">
                  <span className="nfe-section-number" aria-hidden>
                    2
                  </span>
                  Conferir itens
                  <Text component="span" size="xs" c="dimmed" fw={400} ml="auto">
                    {itemsWithoutProduct > 0
                      ? `Falta escolher o produto de ${itemsWithoutProduct === 1 ? "1 item" : `${itemsWithoutProduct} itens`}`
                      : ignoredCount > 0
                        ? ignoredCount === 1
                          ? "1 item ignorado"
                          : `${ignoredCount} itens ignorados`
                        : "Todos os itens com produto"}
                  </Text>
                </h3>
                <Stack gap="sm">
                  <Group grow>
                    <Select
                      label="Movimento"
                      data={[
                        { value: "SAIDA", label: "Saída (baixa do estoque)" },
                        { value: "ENTRADA", label: "Entrada (soma ao estoque)" },
                      ]}
                      value={tipo}
                      onChange={(v) => v && applyTipo(nota, v as "SAIDA" | "ENTRADA")}
                      allowDeselect={false}
                    />
                    <Select
                      label="Local"
                      data={locationOptions}
                      value={locationId}
                      onChange={setLocationId}
                      allowDeselect={false}
                    />
                  </Group>

                  <div className="nfe-items-wrap">
                    <table className="nfe-items">
                      <colgroup>
                        <col className="nfe-col-item" />
                        <col className="nfe-col-product" />
                        <col className="nfe-col-qty" />
                        <col className="nfe-col-stock" />
                      </colgroup>
                      <thead>
                        <tr>
                          <th scope="col">Item da nota</th>
                          <th scope="col">Produto no Chronos</th>
                          <th scope="col">Qtd.</th>
                          <th scope="col" className="nfe-num">
                            Hoje → Fica
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {nota.itens.map((item, index) => {
                          const row = rows[item.item];
                          const badge = CONFIANCA_LABEL[item.confianca];
                          const stock = stockOf(row);
                          const short = tipo === "SAIDA" && stock !== null && stock < (row?.quantidade ?? 0);
                          const after = stockAfter(stock, row?.quantidade ?? 0, tipo);
                          const reveal = revealFor(motionLevel, index, { step: 0.08, maxSteps: 10 });
                          const rowProps = {
                            className: "nfe-item-row",
                            "data-ignored": row?.ignorar || undefined,
                            "data-short": short || undefined,
                          };
                          const cells = (
                            <>
                              <td>
                                <Text size="sm" style={{ wordBreak: "break-word" }}>
                                  {item.descricao}
                                </Text>
                                <Text size="xs" c="dimmed">
                                  Cód. {item.codigo} · {item.quantidade_nota} {item.unidade}
                                </Text>
                              </td>
                              <td>
                                <NfeProductPicker
                                  options={row?.options ?? []}
                                  value={row?.produtoId ?? null}
                                  onChange={(v) => updateRow(item.item, { produtoId: v })}
                                  onSearch={(q) => searchProducts(item.item, q)}
                                  stockAt={stockAtLocation}
                                  error={!row?.produtoId && !row?.ignorar}
                                  disabled={row?.ignorar}
                                  ariaLabel={`Produto do item ${item.item}: ${item.descricao}`}
                                />
                                <Group gap={8} mt={6} wrap="wrap">
                                  <Checkbox
                                    size="xs"
                                    label="Ignorar (não é estoque, ex.: casco)"
                                    checked={row?.ignorar ?? false}
                                    onChange={(e) => updateRow(item.item, { ignorar: e.currentTarget.checked })}
                                  />
                                  {badge &&
                                    !row?.ignorar &&
                                    row?.produtoId === (item.produto_sugerido ? String(item.produto_sugerido.id) : null) && (
                                      <Badge size="xs" variant="light" color={badge.color}>
                                        {badge.label}
                                      </Badge>
                                    )}
                                </Group>
                              </td>
                              <td>
                                <NumberInput
                                  size="xs"
                                  min={1}
                                  value={row?.quantidade ?? 1}
                                  disabled={row?.ignorar}
                                  aria-label={`Quantidade do item ${item.item}`}
                                  onChange={(v) => updateRow(item.item, { quantidade: Math.max(1, Number(v) || 1) })}
                                />
                              </td>
                              <td className="nfe-num">
                                {after === null ? (
                                  <Text size="sm" c="dimmed">
                                    —
                                  </Text>
                                ) : (
                                  <span
                                    className="nfe-hoje-fica"
                                    data-tone={short ? "short" : tipo === "SAIDA" ? "out" : "in"}
                                    title={`Hoje ${stock}, fica ${after}`}
                                  >
                                    <span className="nfe-hoje num">{stock}</span>
                                    <IconArrowRight size={13} aria-hidden className="nfe-arrow" />
                                    <span className="nfe-fica">
                                      <AnimatedNumber value={after} />
                                    </span>
                                  </span>
                                )}
                              </td>
                            </>
                          );
                          return reveal ? (
                            <m.tr
                              key={item.item}
                              {...rowProps}
                              initial={reveal.initial}
                              animate={reveal.animate}
                              transition={reveal.transition}
                            >
                              {cells}
                            </m.tr>
                          ) : (
                            <tr key={item.item} {...rowProps}>
                              {cells}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Stack>
              </section>
            )}

            {nota && (
              <section className="nfe-section" data-active={step === 2 || undefined} aria-labelledby="nfe-step-3">
                <h3 className="nfe-section-title" id="nfe-step-3">
                  <span className="nfe-section-number" aria-hidden>
                    3
                  </span>
                  Confirmar
                </h3>
                <Stack gap="sm">
                  <Group grow align="flex-start">
                    <Select
                      label="Natureza"
                      description="Nota da matriz ou de outra filial é transferência externa."
                      data={[
                        {
                          value: "OPERACAO_NORMAL",
                          label: tipo === "SAIDA" ? "Operação normal (venda)" : "Operação normal (fábrica / fornecedor)",
                        },
                        { value: "TRANSFERENCIA_EXTERNA", label: "Transferência externa (matriz / filial)" },
                        { value: "AJUSTE", label: "Ajuste" },
                      ]}
                      value={natureza}
                      onChange={(v) => v && setNatureza(v as NfeNatureza)}
                      allowDeselect={false}
                    />
                    {natureza === "TRANSFERENCIA_EXTERNA" && (
                      <TextInput
                        label="Local externo"
                        description={tipo === "SAIDA" ? "Para onde vai." : "De onde vem."}
                        value={localExterno}
                        onChange={(e) => setLocalExterno(e.currentTarget.value)}
                        maxLength={120}
                      />
                    )}
                    {natureza === "AJUSTE" && (
                      <Select
                        label="Motivo do ajuste"
                        description="Obrigatório para ajuste."
                        data={PRODUCT_ADJUSTMENT_REASON_OPTIONS}
                        value={motivoAjuste}
                        onChange={setMotivoAjuste}
                        allowDeselect={false}
                      />
                    )}
                  </Group>
                  <TextInput
                    label="Observação"
                    value={observacao}
                    onChange={(e) => setObservacao(e.currentTarget.value)}
                    maxLength={200}
                  />

                  {problems.length > 0 && (
                    <Alert color="warning" icon={<IconAlertTriangle size={16} />} title="Antes de lançar">
                      <Stack gap={2}>
                        {problems.map((p) => (
                          <Text size="sm" key={p}>
                            {p}
                          </Text>
                        ))}
                      </Stack>
                    </Alert>
                  )}

                  <Group justify="flex-end">
                    {nota.ja_baixada?.tipo === "SAIDA" && (
                      <Button
                        variant="default"
                        leftSection={<IconPrinter size={16} />}
                        loading={printingLabel}
                        onClick={() => void printLabel(nota.chave)}
                      >
                        Imprimir etiqueta
                      </Button>
                    )}
                    <Button variant="default" onClick={onClose}>
                      Cancelar
                    </Button>
                    <Button
                      color={tipo === "SAIDA" ? "danger" : "success"}
                      disabled={problems.length > 0}
                      loading={saving}
                      leftSection={<IconCheck size={16} />}
                      onClick={() => void confirm()}
                    >
                      {tipo === "SAIDA" ? "Dar saída" : "Dar entrada"} da NF {nota.numero}
                    </Button>
                  </Group>
                </Stack>
              </section>
            )}
          </>
        )}
      </Stack>
    </Modal>
  );
}
