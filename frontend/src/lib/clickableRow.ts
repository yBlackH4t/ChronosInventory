import type { KeyboardEvent, MouseEvent } from "react";

/**
 * Props para uma linha de tabela que abre algo ao clicar: também recebe foco
 * pelo Tab e abre com Enter ou Espaço. Teclas vindas de botões dentro da
 * linha são ignoradas (o botão cuida delas). `onActivate` recebe a própria linha
 * (a ficha do produto mede a foto nela para a animação de abertura).
 */
export function clickableRowProps(onActivate: (row: HTMLElement) => void) {
  return {
    tabIndex: 0,
    className: "clickable-row",
    onClick: (event: MouseEvent<HTMLElement>) => onActivate(event.currentTarget),
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.target !== event.currentTarget) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onActivate(event.currentTarget);
      }
    },
  };
}
