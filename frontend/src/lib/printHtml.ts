/**
 * Imprime um HTML num iframe escondido.
 *
 * Usa `srcdoc` para o iframe carregar uma vez so, ja com o conteudo. Antes o `onload` era
 * ligado antes de `document.write`: ele disparava primeiro com a pagina vazia (about:blank)
 * e abria uma impressao em branco; a de verdade so aparecia depois do Esc.
 */
export function printHtml(html: string, onError?: (message: string) => void): void {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.style.visibility = "hidden";

  let printed = false;
  const remove = () => {
    if (frame.parentNode) frame.parentNode.removeChild(frame);
  };

  frame.onload = () => {
    if (printed) return;
    printed = true;
    const frameWindow = frame.contentWindow;
    if (!frameWindow) {
      remove();
      onError?.("Não foi possível abrir a impressão.");
      return;
    }
    frameWindow.addEventListener("afterprint", () => window.setTimeout(remove, 500));
    window.setTimeout(remove, 120_000); // garantia se o "afterprint" nao vier
    frameWindow.focus();
    frameWindow.print();
  };

  frame.onerror = () => {
    remove();
    onError?.("Falha ao preparar a impressão.");
  };

  frame.srcdoc = html;
  document.body.appendChild(frame);
}
