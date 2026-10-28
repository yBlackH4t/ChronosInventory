import { useEffect, useState } from "react";
import dayjs from "dayjs";

// Relógio do topo. Fica num componente só dele para o resto do Painel não redesenhar a
// cada segundo.
export default function LiveClock() {
  const [now, setNow] = useState(() => dayjs());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(dayjs()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return <span className="cc-mono">{now.format("DD/MM/YYYY  HH:mm:ss")}</span>;
}
