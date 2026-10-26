import { Tooltip } from "@mantine/core";

// Saídas por semana (13 semanas = ~90 dias), da mais antiga para a mais recente.
// Sem saída, só um traço: a coluna fica limpa e o que vendeu salta aos olhos.
export default function SalesMiniBars({ weeks }: { weeks?: number[] }) {
  if (!weeks) return <span className="pm-sales" aria-hidden />;
  const total = weeks.reduce((acc, value) => acc + value, 0);
  if (total === 0) {
    return (
      <span className="pm-sales" data-empty aria-label="Sem saída em 90 dias">
        —
      </span>
    );
  }
  const max = Math.max(1, ...weeks);
  return (
    <Tooltip label={`${total} ${total === 1 ? "saída" : "saídas"} em 90 dias (barra = semana)`} openDelay={250}>
      <span className="pm-sales" role="img" aria-label={`${total} saídas em 90 dias`}>
        <span className="pm-sales-total num">{total.toLocaleString("pt-BR")}</span>
        <span className="mini-bars">
          {weeks.map((value, index) => (
            <span
              key={index}
              data-on={value > 0 || undefined}
              style={{ height: `${Math.max(2, (value / max) * 18)}px` }}
            />
          ))}
        </span>
      </span>
    </Tooltip>
  );
}
