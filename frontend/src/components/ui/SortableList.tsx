import { useState, type ReactNode } from "react";
import { ActionIcon, Group, Text } from "@mantine/core";
import { IconArrowDown, IconArrowUp, IconGripVertical } from "@tabler/icons-react";

import { moveItem } from "../../lib/reorder";

type SortableListProps<T> = {
  items: T[];
  getKey: (item: T) => string;
  renderLabel: (item: T) => ReactNode;
  onChange: (next: T[]) => void;
};

// Lista que se reordena arrastando pela alça (ou pelas setas, para quem usa o teclado).
// O item arrastado fica esmaecido e o lugar onde vai cair ganha uma linha da cor principal.
export default function SortableList<T>({ items, getKey, renderLabel, onChange }: SortableListProps<T>) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const finish = () => {
    if (dragIndex !== null && overIndex !== null && dragIndex !== overIndex) {
      onChange(moveItem(items, dragIndex, overIndex));
    }
    setDragIndex(null);
    setOverIndex(null);
  };

  return (
    <ul className="mi-sortable" aria-label="Arraste para mudar a ordem">
      {items.map((item, index) => (
        <li
          key={getKey(item)}
          className="mi-sortable-item"
          draggable
          data-dragging={dragIndex === index || undefined}
          data-over={overIndex === index && dragIndex !== index ? (dragIndex! < index ? "after" : "before") : undefined}
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "move";
            setDragIndex(index);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            if (overIndex !== index) setOverIndex(index);
          }}
          onDrop={(event) => {
            event.preventDefault();
            finish();
          }}
          onDragEnd={finish}
        >
          <Group gap="xs" wrap="nowrap">
            <IconGripVertical size={16} stroke={1.6} className="mi-sortable-grip" aria-hidden />
            <Text size="sm" style={{ flex: 1, minWidth: 0 }} truncate="end">
              {renderLabel(item)}
            </Text>
            <ActionIcon
              size="sm"
              variant="subtle"
              color="gray"
              aria-label="Subir"
              disabled={index === 0}
              onClick={() => onChange(moveItem(items, index, index - 1))}
            >
              <IconArrowUp size={14} />
            </ActionIcon>
            <ActionIcon
              size="sm"
              variant="subtle"
              color="gray"
              aria-label="Descer"
              disabled={index === items.length - 1}
              onClick={() => onChange(moveItem(items, index, index + 1))}
            >
              <IconArrowDown size={14} />
            </ActionIcon>
          </Group>
        </li>
      ))}
    </ul>
  );
}
