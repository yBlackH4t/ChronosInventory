import { useEffect, useState } from "react";

import { useScanner } from "../../lib/useScanner";
import { NFE_OPEN_EVENT } from "../../lib/nfe";
import NfeMovementModal from "./NfeMovementModal";

/**
 * Fica no layout: bipar o codigo de barras de um DANFE em qualquer tela abre a
 * conferencia da nota para dar a baixa.
 */
export default function NfeScanHost() {
  const { listenNfe } = useScanner();
  const [opened, setOpened] = useState(false);
  const [chave, setChave] = useState<string | null>(null);

  useEffect(
    () =>
      listenNfe((key) => {
        setChave(key);
        setOpened(true);
      }),
    [listenNfe],
  );

  useEffect(() => {
    const handler = (event: Event) => {
      setChave((event as CustomEvent<string | undefined>).detail ?? null);
      setOpened(true);
    };
    window.addEventListener(NFE_OPEN_EVENT, handler);
    return () => window.removeEventListener(NFE_OPEN_EVENT, handler);
  }, []);

  return <NfeMovementModal opened={opened} chave={chave} onClose={() => setOpened(false)} />;
}
