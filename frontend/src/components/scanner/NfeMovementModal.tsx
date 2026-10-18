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
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { IconAlertTriangle, IconFileInvoice, IconSearch, IconSettings } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";

import { api } from "../../lib/apiClient";
import type { NfeItemPreview, NfeNatureza, NfePreview, NfeProduto } from "../../lib/api";
import { formatNfeKey, parseNfeKey } from "../../lib/nfe";
import { notifyError, notifySuccess } from "../../lib/notify";
import { PRODUCT_ADJUSTMENT_REASON_OPTIONS } from "../../lib/productMovement";
import { useLocations } from "../../hooks/useLocations";
import NfeSettingsPanel from "./NfeSettingsPanel";

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

function productOption(p: NfeProduto) {
  return { value: String(p.id), label: p.nome };
}

export default function NfeMovementModal({ opened, chave, onClose }: NfeMovementModalProps) {
  const queryClient = useQueryClient();
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
      onClose();
    } catch (e) {
      notifyError(e, "Não foi possível lançar a nota.");
    } finally {
      setSaving(false);
    }
  };

  const locationOptions = activeLocations.map((loc) => ({ value: String(loc.id), label: loc.label || loc.name }));

  return (
    <Modal opened={opened} onClose={onClose} title="Lançar nota fiscal (NF-e)" size="xl">
      <Stack gap="md">
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
            data-autofocus
          />
          <Button leftSection={<IconSearch size={16} />} onClick={() => void load(input)} loading={loading}>
            Buscar
          </Button>
          <Button variant="subtle" leftSection={<IconSettings size={16} />} onClick={() => setShowFolders((v) => !v)}>
            Configurar
          </Button>
        </Group>

        <Collapse in={showFolders}>
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
          <>
            <Group gap="lg" align="flex-start">
              <IconFileInvoice size={28} stroke={1.5} />
              <Stack gap={2} style={{ flex: 1 }}>
                <Text fw={600}>
                  NF {nota.numero} · série {nota.serie} · {formatEmissao(nota.emissao)}
                </Text>
                <Text size="sm" c="dimmed">
                  {nota.natureza_operacao} · {nota.tipo_sugerido === "SAIDA" ? "para" : "de"}{" "}
                  {nota.tipo_sugerido === "SAIDA" ? nota.destinatario : nota.emitente}
                </Text>
              </Stack>
            </Group>

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

            <Group grow align="flex-start">
              <Select
                label="Natureza"
                description="Nota da matriz ou de outra filial é transferência externa."
                data={[
                  { value: "OPERACAO_NORMAL", label: tipo === "SAIDA" ? "Operação normal (venda)" : "Operação normal (fábrica / fornecedor)" },
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

            <Table verticalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Item da nota</Table.Th>
                  <Table.Th style={{ width: "40%" }}>Produto no Chronos</Table.Th>
                  <Table.Th style={{ width: 100 }}>Qtd.</Table.Th>
                  <Table.Th style={{ width: 70 }}>Hoje</Table.Th>
                  <Table.Th style={{ width: 70 }}>Fica</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {nota.itens.map((item) => {
                  const row = rows[item.item];
                  const badge = CONFIANCA_LABEL[item.confianca];
                  const stock = stockOf(row);
                  const short = tipo === "SAIDA" && stock !== null && stock < (row?.quantidade ?? 0);
                  const after =
                    stock === null ? null : stock + (tipo === "SAIDA" ? -1 : 1) * (row?.quantidade ?? 0);
                  return (
                    <Table.Tr key={item.item} style={row?.ignorar ? { opacity: 0.55 } : undefined}>
                      <Table.Td>
                        <Text size="sm">{item.descricao}</Text>
                        <Text size="xs" c="dimmed">
                          Cód. {item.codigo} · {item.quantidade_nota} {item.unidade}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Select
                          size="xs"
                          searchable
                          placeholder="Procure por nome ou código"
                          nothingFoundMessage="Nada encontrado"
                          data={(row?.options ?? []).map(productOption)}
                          value={row?.produtoId ?? null}
                          onChange={(v) => updateRow(item.item, { produtoId: v })}
                          onSearchChange={(q) => searchProducts(item.item, q)}
                          error={!row?.produtoId && !row?.ignorar}
                          disabled={row?.ignorar}
                        />
                        <Checkbox
                          size="xs"
                          mt={6}
                          label="Ignorar (não é estoque, ex.: casco)"
                          checked={row?.ignorar ?? false}
                          onChange={(e) => updateRow(item.item, { ignorar: e.currentTarget.checked })}
                        />
                        {badge && !row?.ignorar && row?.produtoId === (item.produto_sugerido ? String(item.produto_sugerido.id) : null) && (
                          <Badge size="xs" variant="light" color={badge.color} mt={4}>
                            {badge.label}
                          </Badge>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <NumberInput
                          size="xs"
                          min={1}
                          value={row?.quantidade ?? 1}
                          disabled={row?.ignorar}
                          onChange={(v) => updateRow(item.item, { quantidade: Math.max(1, Number(v) || 1) })}
                        />
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" c={short ? "danger" : undefined} fw={short ? 600 : undefined}>
                          {stock ?? "—"}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" fw={600} c={short ? "danger" : tipo === "SAIDA" ? "orange" : "success"}>
                          {after ?? "—"}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>

            {problems.length > 0 && (
              <Alert color="warning" icon={<IconAlertTriangle size={16} />}>
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
              <Button variant="default" onClick={onClose}>
                Cancelar
              </Button>
              <Button
                color={tipo === "SAIDA" ? "danger" : "success"}
                disabled={problems.length > 0}
                loading={saving}
                onClick={() => void confirm()}
              >
                {tipo === "SAIDA" ? "Dar saída" : "Dar entrada"} da NF {nota.numero}
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  );
}
