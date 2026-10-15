import { stockLevel } from "../../lib/semantic";

// Saldo com cor de situação: vermelho zerado, âmbar com 1 ou 2, verde acima disso.
export default function StockPill({ value }: { value: number }) {
  return (
    <span className="stock-pill" data-level={stockLevel(value)}>
      {value.toLocaleString("pt-BR")}
    </span>
  );
}
