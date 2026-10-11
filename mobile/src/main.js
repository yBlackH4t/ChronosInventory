// Prova de conceito do app "Chronos Casa": bipa um codigo e pergunta ao Chronos do computador
// pela rota do scanner que ja existe (POST /api/scanner/barcode, liberada na rede local).
// O pedido sai pelo plugin http (Rust), entao nao esbarra em CORS nem no bloqueio de HTTP do
// Android.
import { Format, scan } from "@tauri-apps/plugin-barcode-scanner";
import { fetch } from "@tauri-apps/plugin-http";

const PC_KEY = "chronos.pc";
const pcInput = document.querySelector("#pc");
const status = document.querySelector("#status");
const result = document.querySelector("#result");

try {
  pcInput.value = localStorage.getItem(PC_KEY) || "";
} catch {
  // sem armazenamento: o usuario digita o endereco de novo
}
pcInput.addEventListener("change", () => {
  try {
    localStorage.setItem(PC_KEY, pcInput.value.trim());
  } catch {
    // ignora
  }
});

function show(message, kind) {
  status.textContent = message;
  status.className = kind || "";
}

async function sendCode(code) {
  const pc = pcInput.value.trim().replace(/\/+$/, "");
  if (!pc) {
    show("Informe o endereço do Chronos (aparece no QR do scanner no computador).", "error");
    return;
  }
  show("Consultando o computador...");
  try {
    const response = await fetch(`${pc}/api/scanner/barcode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
      connectTimeout: 5000,
    });
    if (!response.ok) {
      show(`O computador respondeu ${response.status}.`, "error");
      return;
    }
    const data = await response.json();
    result.hidden = false;
    result.querySelector(".code").textContent = data.code;
    result.querySelector(".name").textContent =
      data.display_name && data.display_name !== data.code
        ? data.display_name
        : "Produto ainda não cadastrado no Chronos";
    show("Recebido pelo computador.", "ok");
  } catch (error) {
    show(`Sem conexão com o computador: ${error}`, "error");
  }
}

document.querySelector("#scan").addEventListener("click", async () => {
  try {
    const scanned = await scan({
      windowed: false,
      formats: [Format.EAN13, Format.EAN8, Format.UPC_A, Format.UPC_E, Format.Code128, Format.QRCode],
    });
    if (scanned?.content) await sendCode(scanned.content);
  } catch (error) {
    show(`Não foi possível usar a câmera: ${error}`, "error");
  }
});

document.querySelector("#manual-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = document.querySelector("#manual");
  const code = input.value.trim();
  if (!code) return;
  input.value = "";
  await sendCode(code);
});
