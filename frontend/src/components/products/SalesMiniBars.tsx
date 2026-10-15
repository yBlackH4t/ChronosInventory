import { Text, Tooltip } from "@mantine/core";

// Saídas por semana (13 semanas = ~90 dias), da mais antiga para a mais recente.
export default function SalesMiniBars({ weeks }: { weeks?: number[] }) {
  if (!weeks) return <div className="mini-bars" aria-hidden />;
  const total = weeks.reduce((acc, value) => acc + value, 0);
  const max = Math.max(1, ...weeks);
  return (
    <Tooltip label={`${total} ${total === 1 ? "saída" : "saídas"} em 90 dias (barra = semana)`} openDelay={250}>
      <div>
        <div className="mini-bars" role="img" aria-label={`${total} saídas em 90 dias`}>
          {weeks.map((value, index) => (
            <span
              key={index}
              data-on={value > 0 || undefined}
              style={{ height: `${Math.max(2, (value / max) * 20)}px` }}
            />
          ))}
        </div>
        <Text size="xs" c="dimmed" className="num" lh={1.3}>
          {total ? `${total} ${total === 1 ? "saída" : "saídas"}` : "sem saída"}
        </Text>
      </div>
    </Tooltip>
  );
}
