import { useEffect, useState, useCallback } from "react";
import { baseUrl } from "./apiClient";
import { parseNfeKey } from "./nfe";

type ScannerListener = (code: string) => void;
const listeners = new Set<ScannerListener>();
// Chave do DANFE (NF-e) vai so para quem baixa a nota, nao para as buscas de produto.
const nfeListeners = new Set<ScannerListener>();
let ws: WebSocket | null = null;
// O celular contou uma peça direto na sessão de inventário: a tela aberta se atualiza.
export const PHONE_INVENTORY_EVENT = "chronos:inventario-celular";
export type PhoneInventoryDetail = { sessionId: number; productId: number };
let reconnectTimer: number | null = null;

export function useScanner() {
  const [isConnected, setIsConnected] = useState(ws?.readyState === WebSocket.OPEN);

  useEffect(() => {
    let mounted = true;

    function connect() {
      if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) {
        return;
      }

      // WS URL is usually ws://localhost:8000/api/scanner/ws
      const url = new URL(baseUrl || "http://localhost:8000");
      url.protocol = url.protocol.replace("http", "ws");
      url.pathname = "/api/scanner/ws";

      try {
        ws = new WebSocket(url.toString());

        ws.onopen = () => {
          if (mounted) setIsConnected(true);
          if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
          }
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (typeof data.inventario === "number") {
              window.dispatchEvent(
                new CustomEvent<PhoneInventoryDetail>(PHONE_INVENTORY_EVENT, {
                  detail: { sessionId: data.inventario, productId: Number(data.produto_id) },
                }),
              );
            } else if (data.code) {
              const chave = parseNfeKey(String(data.code));
              if (chave && nfeListeners.size > 0) {
                nfeListeners.forEach((listener) => listener(chave));
              } else {
                listeners.forEach((listener) => listener(data.code));
              }
            }
          } catch (e) {
            console.error("Failed to parse scanner message", e);
          }
        };

        ws.onclose = () => {
          if (mounted) setIsConnected(false);
          ws = null;
          // Reconnect after 3s
          if (!reconnectTimer) {
            reconnectTimer = window.setTimeout(connect, 3000);
          }
        };

        ws.onerror = (err) => {
          console.error("Scanner WS error", err);
          ws?.close();
        };
      } catch (err) {
        console.error("Failed to connect Scanner WS", err);
      }
    }

    connect();

    return () => {
      mounted = false;
    };
  }, []);

  const listen = useCallback((callback: ScannerListener) => {
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
    };
  }, []);

  const listenNfe = useCallback((callback: ScannerListener) => {
    nfeListeners.add(callback);
    return () => {
      nfeListeners.delete(callback);
    };
  }, []);

  return { isConnected, listen, listenNfe };
}
