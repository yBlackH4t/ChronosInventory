import { useEffect, useState } from "react";
import { Tooltip } from "@mantine/core";
import NumberFlow from "@number-flow/react";

import { useMotionLevel } from "../../lib/motionContext";
import type { FlashKind } from "../../lib/productView";
import { stockLevel } from "../../lib/semantic";

export type StockFlash = {
  productId: number;
  kind: FlashKind;
  /** Saldo antes da movimentação: o número rola dele até o novo. */
  from: number;
  /** Muda a cada movimentação, para a piscada recomeçar. */
  nonce: number;
};

const LEVEL_HINT: Record<string, string | null> = {
  ZERADO: "Sem estoque",
  BAIXO: "Estoque baixo (1 ou 2)",
  OK: null,
};

function RollingNumber({ from, value, animated }: { from: number; value: number; animated: boolean }) {
  // Monta com o saldo antigo e troca no efeito seguinte: assim o NumberFlow rola.
  const [shown, setShown] = useState(from);
  useEffect(() => {
    setShown(value);
  }, [value]);
  return <NumberFlow value={shown} locales="pt-BR" animated={animated} willChange />;
}

// Saldo grande da linha de Produtos: verde com estoque, âmbar baixo, vermelho zerado.
// Depois de movimentar, pisca na cor do movimento e rola até o valor novo (nível Completo;
// no Suave só pisca esmaecendo; no Nenhum, nada).
export default function StockNumber({ value, flash }: { value: number; flash?: StockFlash | null }) {
  const level = useMotionLevel();
  const stock = stockLevel(value);
  const active = flash && level !== "nenhum" ? flash : null;
  const hint = LEVEL_HINT[stock];

  const body = (
    <span
      key={active ? `flash-${active.nonce}` : "plain"}
      className="pm-stock"
      data-level={stock}
      data-flash={active?.kind}
      aria-label={hint ? `${value} em estoque, ${hint.toLowerCase()}` : undefined}
    >
      {active ? (
        <RollingNumber from={active.from} value={value} animated={level === "completo"} />
      ) : (
        value.toLocaleString("pt-BR")
      )}
    </span>
  );

  if (stock !== "BAIXO") return body;
  return (
    <Tooltip label={hint} openDelay={200}>
      {body}
    </Tooltip>
  );
}
