import { useState } from "react";
import { Combobox, Group, InputBase, Text, useCombobox } from "@mantine/core";

import type { NfeProduto } from "../../lib/api";

type NfeProductPickerProps = {
  options: NfeProduto[];
  value: string | null;
  onChange: (value: string) => void;
  /** Busca no estoque enquanto a pessoa digita (os achados entram em `options`). */
  onSearch: (query: string) => void;
  /** Saldo do produto no local escolhido, para mostrar na lista. */
  stockAt: (product: NfeProduto) => number | null;
  error?: boolean;
  disabled?: boolean;
  ariaLabel: string;
};

function normalize(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// Escolha do produto de um item da nota. O nome escolhido quebra em até duas linhas (no
// Select de uma linha só ele era cortado: "TURBO GARRETT GT4594 452308-500:..."); a busca
// fica dentro da lista.
export default function NfeProductPicker({
  options,
  value,
  onChange,
  onSearch,
  stockAt,
  error,
  disabled,
  ariaLabel,
}: NfeProductPickerProps) {
  const [search, setSearch] = useState("");
  const combobox = useCombobox({
    onDropdownClose: () => {
      combobox.resetSelectedOption();
      combobox.focusTarget();
      setSearch("");
    },
    onDropdownOpen: () => combobox.focusSearchInput(),
  });

  const selected = options.find((o) => String(o.id) === value) ?? null;
  const query = normalize(search.trim());
  const filtered = query ? options.filter((o) => normalize(o.nome).includes(query)) : options;

  return (
    <Combobox
      store={combobox}
      withinPortal
      position="bottom-start"
      width="target"
      onOptionSubmit={(next) => {
        onChange(next);
        combobox.closeDropdown();
      }}
    >
      <Combobox.Target targetType="button">
        <InputBase
          component="button"
          type="button"
          size="xs"
          pointer
          disabled={disabled}
          error={error}
          aria-label={ariaLabel}
          rightSection={<Combobox.Chevron />}
          rightSectionPointerEvents="none"
          onClick={() => combobox.toggleDropdown()}
          classNames={{ input: "nfe-picker-input" }}
          multiline
        >
          {selected ? (
            <Text size="xs" fw={500} lineClamp={2} className="nfe-picker-name">
              {selected.nome}
            </Text>
          ) : (
            <Text size="xs" c={error ? "danger" : "dimmed"}>
              Escolha o produto
            </Text>
          )}
        </InputBase>
      </Combobox.Target>

      <Combobox.Dropdown>
        <Combobox.Search
          value={search}
          onChange={(event) => {
            const next = event.currentTarget.value;
            setSearch(next);
            onSearch(next);
          }}
          placeholder="Procure por nome ou código"
          aria-label="Procurar produto"
        />
        <Combobox.Options mah={260} style={{ overflowY: "auto" }}>
          {filtered.length === 0 ? (
            <Combobox.Empty>{search.trim().length < 2 ? "Digite ao menos 2 letras" : "Nada encontrado"}</Combobox.Empty>
          ) : (
            filtered.map((option) => {
              const stock = stockAt(option);
              return (
                <Combobox.Option
                  value={String(option.id)}
                  key={option.id}
                  active={String(option.id) === value}
                >
                  <Group gap="xs" wrap="nowrap" justify="space-between" align="flex-start">
                    <Text size="xs" style={{ whiteSpace: "normal", wordBreak: "break-word" }}>
                      {option.nome}
                    </Text>
                    {stock !== null && (
                      <Text size="xs" c="dimmed" className="num" style={{ flexShrink: 0 }}>
                        {stock} no local
                      </Text>
                    )}
                  </Group>
                </Combobox.Option>
              );
            })
          )}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
