import type { KeyboardEvent } from "react";

/**
 * Props para uma linha de tabela que abre algo ao clicar: também recebe foco
 * pelo Tab e abre com Enter ou Espaço. Teclas vindas de botões dentro da
 * linha são ignoradas (o botão cuida delas).
 */
export function clickableRowProps(onActivate: () => void) {
  return {
    tabIndex: 0,
    className: "clickable-row",
    onClick: onActivate,
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.target !== event.currentTarget) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onActivate();
      }
    },
  };
}
