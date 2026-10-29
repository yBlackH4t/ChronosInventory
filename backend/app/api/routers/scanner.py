from fastapi import APIRouter, Header, HTTPException, Request, WebSocket, WebSocketDisconnect, Depends
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from app.services.stock_service import StockService
from backend.app.api.deps import get_stock_service
from core.database.connection import DatabaseConnection
from core.utils.file_utils import FileUtils
import ipaddress
import logging
import os
import secrets
import socket
import threading

router = APIRouter(prefix="/api/scanner", tags=["Scanner"])

# Lista de conexoes WebSocket ativas do Desktop
connected_desktops: list[WebSocket] = []

# Nao ha tunel publico (localtunnel): ele expunha a API inteira, sem autenticacao,
# na internet. O celular usa o IP da maquina na mesma rede Wi-Fi.


def _is_loopback(host: str | None) -> bool:
    if not host:
        return False
    if host in {"localhost", "testclient"}:
        return True
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return False
    mapped = getattr(address, "ipv4_mapped", None)
    return bool(address.is_loopback or (mapped is not None and mapped.is_loopback))


class BarcodePayload(BaseModel):
    code: str


# Pareamento: o QR da tela leva um codigo desta maquina; so o celular que leu o QR consegue mandar
# codigos para a tela aberta (antes, qualquer aparelho do Wi-Fi conseguia). O codigo fica num
# arquivo da pasta do app para continuar valendo quando o Chronos reabre.
PAIRING_FILE = "scanner_pareamento.txt"
PAIRING_HEADER = "X-Chronos-Pareamento"
_pairing_lock = threading.Lock()
LOG = logging.getLogger(__name__)
MAX_PRODUCTS_SHOWN = 3


def pairing_code() -> str:
    path = os.path.join(FileUtils.get_app_directory(), PAIRING_FILE)
    with _pairing_lock:
        try:
            with open(path, encoding="utf-8") as handle:
                code = handle.read().strip()
            if len(code) >= 8:
                return code
        except OSError:
            pass
        code = secrets.token_urlsafe(9)
        try:
            with open(path, "w", encoding="utf-8") as handle:
                handle.write(code)
        except OSError:
            LOG.warning("scanner: nao consegui gravar o codigo de pareamento")
        return code


def _location_names() -> dict[int, str]:
    conn = DatabaseConnection().get_connection()
    try:
        rows = conn.execute("SELECT id, COALESCE(NULLIF(label, ''), nome) FROM locais WHERE ativo = 1").fetchall()
    finally:
        conn.close()
    return {int(row[0]): str(row[1]) for row in rows}


def _stock_lookup(stock_service: StockService, code: str) -> list[dict]:
    """Saldo por filial do que foi lido, para mostrar no proprio celular."""
    term = code.strip()
    if term.upper().startswith("CI-") and term[3:].isdigit():
        term = f"#{int(term[3:])}"
    products = stock_service.get_all_products(term)
    if not products:
        return []
    names = _location_names()
    found = []
    for product in products[:MAX_PRODUCTS_SHOWN]:
        locais = [
            {"local": names.get(location_id, f"Local {location_id}"), "quantidade": int(quantity)}
            for location_id, quantity in sorted(product.inventories.items())
            if location_id in names
        ]
        found.append(
            {
                "id": product.id,
                "nome": product.nome,
                "total": sum(item["quantidade"] for item in locais),
                "locais": locais,
            }
        )
    return found

HTML_CONTENT = """
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <meta name="theme-color" content="#0a141b">
    <title>Scanner Chronos</title>
    <script src="https://unpkg.com/html5-qrcode"></script>
    <script src="https://unpkg.com/@zxing/library@0.21.3/umd/index.min.js"></script>
    <style>
        /* Visual "Vidro suave" (escuro): contraste de texto >= 4,5:1 sobre o fundo e os cartoes. */
        :root {
            --bg: #0a141b;
            --card: rgba(19, 34, 45, 0.86);
            --card-strong: #13222d;
            --border: rgba(155, 176, 190, 0.18);
            --text: #e6eef3;
            --muted: #9bb0be;
            --accent: #38bdf8;
            --on-accent: #0a141b;
            --success: #34d399;
            --danger: #f87171;
            --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
        }
        * { box-sizing: border-box; }
        html, body { height: 100%; }
        body {
            margin: 0; padding: 0;
            background:
                radial-gradient(60% 40% at 15% 0%, rgba(14, 116, 144, 0.35), transparent 70%),
                radial-gradient(50% 40% at 100% 100%, rgba(30, 58, 138, 0.3), transparent 70%),
                var(--bg);
            color: var(--text);
            font-family: "Sora", "Segoe UI", system-ui, -apple-system, sans-serif;
            display: flex; flex-direction: column; align-items: center;
            min-height: 100vh; overflow-x: hidden;
        }
        button { font: inherit; }
        .header {
            width: 100%; max-width: 640px;
            display: flex; align-items: center; justify-content: space-between; gap: 12px;
            padding: 14px 16px;
        }
        .brand { font-weight: 700; font-size: 1.1rem; letter-spacing: 0.01em; }
        .brand small { display: block; font-weight: 400; font-size: 0.75rem; color: var(--muted); }
        .beep-toggle {
            display: inline-flex; align-items: center; gap: 8px;
            padding: 8px 12px; min-height: 40px;
            border-radius: 999px; border: 1px solid var(--border);
            background: var(--card); color: var(--muted);
            font-size: 0.85rem; font-weight: 600; cursor: pointer; white-space: nowrap; flex-shrink: 0;
        }
        .beep-toggle .knob {
            width: 30px; height: 18px; border-radius: 999px; background: rgba(155, 176, 190, 0.3);
            position: relative; transition: background-color 0.18s;
        }
        .beep-toggle .knob::after {
            content: ""; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px;
            border-radius: 50%; background: var(--text); transition: transform 0.18s var(--ease-out);
        }
        .beep-toggle[aria-pressed="true"] { color: var(--text); border-color: rgba(56, 189, 248, 0.5); }
        .beep-toggle[aria-pressed="true"] .knob { background: var(--accent); }
        .beep-toggle[aria-pressed="true"] .knob::after { transform: translateX(12px); background: var(--on-accent); }
        .beep-toggle:focus-visible, .primary-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        .card {
            width: calc(100% - 32px); max-width: 608px;
            background: var(--card); border: 1px solid var(--border); border-radius: 16px;
            box-shadow: 0 8px 28px rgba(0, 0, 0, 0.28);
            -webkit-backdrop-filter: blur(18px) saturate(1.4); backdrop-filter: blur(18px) saturate(1.4);
        }
        #reader { width: 100%; max-width: 608px; border-radius: 16px; overflow: hidden; border: 0 !important; }
        #reader button, #reader select { font: inherit; padding: 8px 14px; border-radius: 10px; border: 1px solid var(--border); background: var(--card-strong); color: var(--text); }
        #reader a { color: var(--accent); }
        .primary-btn {
            display: block; width: 100%; padding: 20px 12px;
            font-size: 1.1rem; font-weight: 700; text-align: center;
            background: var(--accent); color: var(--on-accent);
            border: none; border-radius: 14px; cursor: pointer;
            box-shadow: 0 6px 20px rgba(56, 189, 248, 0.25);
        }
        .status {
            margin: 16px 16px 0; min-height: 28px; font-size: 1rem; font-weight: 600; text-align: center;
            color: var(--muted);
        }
        .status.ok { color: var(--success); }
        .status.error { color: var(--danger); }
        .history-container { margin: 12px 0 24px; padding: 12px 14px; }
        .history-title { font-size: 0.8rem; font-weight: 600; color: var(--muted); margin-bottom: 8px; }
        .history-list { list-style: none; margin: 0; padding: 0; max-height: 40vh; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
        .history-list li {
            padding: 9px 12px; border-radius: 10px; font-size: 0.9rem;
            display: flex; justify-content: space-between; gap: 12px;
            background: rgba(255, 255, 255, 0.04); border: 1px solid var(--border);
            outline: 2px solid transparent; outline-offset: -2px;
        }
        .history-list li span.time { color: var(--muted); font-size: 0.78rem; font-variant-numeric: tabular-nums; flex-shrink: 0; }
        /* Item lido: moldura verde que pulsa duas vezes (so esmaece com "Diminuir animacoes"). */
        .history-list li.hit {
            outline-color: var(--success);
            background: rgba(52, 211, 153, 0.1);
            animation: hit-pulse 0.65s var(--ease-out) 2;
        }
        @keyframes hit-pulse {
            0% { outline-color: transparent; outline-offset: 2px; }
            45% { outline-color: var(--success); outline-offset: -2px; }
            100% { outline-color: rgba(52, 211, 153, 0.7); outline-offset: -2px; }
        }
        @keyframes hit-fade {
            0% { outline-color: transparent; }
            25% { outline-color: var(--success); }
            100% { outline-color: var(--success); }
        }
        #start-overlay {
            position: fixed; inset: 0; z-index: 1000; padding: 24px;
            background: var(--bg);
            display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px;
        }
        #start-overlay .title { font-size: 1.5rem; font-weight: 700; }
        #start-overlay .hint { color: var(--muted); font-size: 0.9rem; text-align: center; max-width: 320px; }
        #start-overlay .primary-btn { max-width: 320px; }
        /* Saldo do que acabou de ser lido. */
        .stock-card { margin-top: 12px; padding: 14px 16px; display: none; }
        .stock-card.show { display: block; animation: stock-in 0.35s var(--ease-out); }
        .stock-item + .stock-item { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border); }
        .stock-name { font-weight: 600; font-size: 0.95rem; line-height: 1.35; }
        .stock-total { margin-top: 4px; color: var(--muted); font-size: 0.85rem; }
        .stock-total b { color: var(--text); font-size: 1.15rem; font-variant-numeric: tabular-nums; }
        .stock-total.zero b { color: var(--danger); }
        .stock-places { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
        .stock-place {
            padding: 4px 10px; border-radius: 999px; font-size: 0.82rem;
            border: 1px solid var(--border); background: rgba(255, 255, 255, 0.04);
            font-variant-numeric: tabular-nums;
        }
        .stock-place b { color: var(--accent); }
        .pair-warning {
            display: none; margin-top: 12px; padding: 14px 16px; color: var(--danger);
            font-weight: 600; text-align: center;
        }
        .pair-warning.show { display: block; }
        @keyframes stock-in { from { opacity: 0; transform: translateY(6px); } }
        @media (prefers-reduced-motion: reduce) {
            .stock-card.show { animation: none; }
            .history-list li.hit { animation: hit-fade 0.4s ease-out 1 forwards; }
            .beep-toggle .knob, .beep-toggle .knob::after { transition: none; }
        }
    </style>
</head>
<body>
    <div id="start-overlay">
        <div class="title">Leitor Chronos</div>
        <button id="start-btn" class="primary-btn" type="button">INICIAR CÂMERA</button>
        <div class="hint">O bipe vem desligado. Para ligar, toque em "Bipe" no alto da tela.</div>
    </div>

    <div class="header">
        <div class="brand">Chronos Scanner<small>Leitura vai direto para o computador</small></div>
        <button id="beep-toggle" class="beep-toggle" type="button" aria-pressed="false">
            <span class="knob" aria-hidden="true"></span><span id="beep-label">Bipe desligado</span>
        </button>
    </div>
    <div id="reader" class="card"></div>
    <!-- Sem https (pagina aberta pelo IP da maquina) o navegador nao libera a camera ao vivo,
         mas deixa tirar foto: o codigo e lido da foto. -->
    <div id="photo-mode" class="card" style="display: none; padding: 16px; text-align: center;">
        <label for="photo-input" class="primary-btn">TIRAR FOTO DO CÓDIGO</label>
        <input id="photo-input" type="file" accept="image/*" capture="environment" style="display: none;">
        <div style="margin-top: 12px; color: var(--muted); font-size: 0.85rem;">Fotografe o código de barras com o celular parado e com luz. Na nota, é o código acima da chave de acesso.</div>
    </div>

    <div class="status" id="status-text" role="status" aria-live="polite">Apontando câmera...</div>
    <div id="stock-card" class="stock-card card" aria-live="polite"></div>
    <div id="pair-warning" class="pair-warning card">Este celular não está pareado. Leia de novo o QR code na tela do computador (botão do celular no alto do Chronos).</div>

    <div class="history-container card">
        <div class="history-title">Últimos lidos</div>
        <ul class="history-list" id="history-list"></ul>
    </div>

    <script>
        const statusText = document.getElementById('status-text');
        const historyList = document.getElementById('history-list');
        const startOverlay = document.getElementById('start-overlay');
        const startBtn = document.getElementById('start-btn');
        const beepToggle = document.getElementById('beep-toggle');
        const beepLabel = document.getElementById('beep-label');

        if (!window.isSecureContext) {
            startBtn.innerText = 'COMEÇAR';
        }

        let isProcessing = false;
        let html5QrcodeScanner = null;
        let audioCtx = null;

        // Bipe: desligado por padrao, lembrado neste celular.
        const BEEP_KEY = 'chronos.scanner.bipe';
        let beepOn = false;
        try { beepOn = localStorage.getItem(BEEP_KEY) === '1'; } catch (e) { beepOn = false; }

        function setStatus(text, kind) {
            statusText.innerText = text;
            statusText.className = 'status' + (kind ? ' ' + kind : '');
        }

        function ensureAudio() {
            if (audioCtx) return;
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) audioCtx = new AudioContext();
        }

        function renderBeep() {
            beepToggle.setAttribute('aria-pressed', beepOn ? 'true' : 'false');
            beepLabel.innerText = beepOn ? 'Bipe ligado' : 'Bipe desligado';
        }

        function playBeep() {
            if (!beepOn || !audioCtx) return;
            if (audioCtx.state === 'suspended') {
                audioCtx.resume();
            }
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();

            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(1000, audioCtx.currentTime); // 1000Hz, curto

            gainNode.gain.setValueAtTime(0.4, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.12);

            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            oscillator.start();
            oscillator.stop(audioCtx.currentTime + 0.12);
        }

        beepToggle.addEventListener('click', () => {
            beepOn = !beepOn;
            try { localStorage.setItem(BEEP_KEY, beepOn ? '1' : '0'); } catch (e) { /* modo privado */ }
            renderBeep();
            if (beepOn) {
                // O toque destrava o som (iOS) e serve de amostra do bipe.
                ensureAudio();
                playBeep();
            }
        });
        renderBeep();

        // Desbloquear áudio e iniciar scanner
        startBtn.addEventListener('click', () => {
            // Com o bipe ligado, o toque no botao destrava o som (iOS).
            if (beepOn) ensureAudio();
            
            startOverlay.style.display = 'none';

            if (!window.isSecureContext) {
                document.getElementById('photo-mode').style.display = 'block';
                setStatus('Toque no botão e fotografe o código', '');
                return;
            }

            // Area larga: o codigo do DANFE (chave da NF-e, 44 digitos) e comprido.
            html5QrcodeScanner = new Html5QrcodeScanner("reader", {
                fps: 10,
                qrbox: (w, h) => ({ width: Math.floor(w * 0.9), height: Math.max(80, Math.floor(Math.min(h * 0.4, 180))) }),
                aspectRatio: 1.0,
                experimentalFeatures: { useBarCodeDetectorIfSupported: true }
            });
            html5QrcodeScanner.render(onScanSuccess);
        });

        document.getElementById('photo-input').addEventListener('change', async (event) => {
            const input = event.target;
            const file = input.files && input.files[0];
            if (!file) return;
            setStatus('Lendo a foto...', '');
            if (typeof ZXing === 'undefined') {
                setStatus('O leitor não carregou: o celular precisa de internet. Recarregue a página.', 'error');
                input.value = '';
                return;
            }
            const url = URL.createObjectURL(file);
            try {
                const img = new Image();
                img.src = url;
                await img.decode();
                await new Promise((r) => setTimeout(r, 30)); // deixa a mensagem aparecer
                const code = decodePhoto(img);
                if (code) {
                    sendBarcode(code);
                } else {
                    setStatus('Não achei código na foto. Tente de novo, com o celular parado e com luz.', 'error');
                }
            } catch (err) {
                setStatus('Não consegui abrir a foto. Tente de novo.', 'error');
            } finally {
                URL.revokeObjectURL(url);
                input.value = '';
            }
        });

        // Le codigo de barras de uma foto. Primeiro a foto inteira; se falhar, acha as faixas com
        // cara de codigo de barras (muitas barras alinhadas por varias linhas) e le cada uma
        // recortada, com margem branca: na DANFE as linhas do quadro ficam coladas no codigo.
        function decodePhoto(img) {
          const Z = window.ZXing;
          const hints = new Map();
          hints.set(Z.DecodeHintType.TRY_HARDER, true);
          const reader = new Z.MultiFormatReader();
          reader.setHints(hints);
          const decodeCanvas = (c) => {
            try {
              return reader.decode(new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(c)))).getText();
            } catch (e) {
              return null;
            }
          };
          for (const maxW of [1600, 800]) {
            const scale = Math.min(1, maxW / img.naturalWidth);
            const W = Math.round(img.naturalWidth * scale), H = Math.round(img.naturalHeight * scale);
            const c = document.createElement("canvas");
            c.width = W; c.height = H;
            const ctx = c.getContext("2d", { willReadFrequently: true });
            ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
            ctx.drawImage(img, 0, 0, W, H);
            const whole = decodeCanvas(c);
            if (whole) return whole;
            const bands = findBarcodeBands(ctx.getImageData(0, 0, W, H), W, H);
            for (const box of bands) for (const extra of [0.06, 0.02, 0.12]) {
              // Recorta da foto original (barras finas se perdem na reducao), com margem branca.
              const mx = (box.x1 - box.x0) * extra, my = (box.y1 - box.y0) * 0.1;
              const x0 = Math.max(0, box.x0 - mx), x1 = Math.min(W, box.x1 + mx);
              const y0 = Math.max(0, box.y0 - my), y1 = Math.min(H, box.y1 + my);
              const sx = x0 / scale, sy = y0 / scale;
              const sw = (x1 - x0) / scale, sh = (y1 - y0) / scale;
              const k = Math.min(1, 2400 / sw);
              const pad = 40;
              const out = document.createElement("canvas");
              out.width = Math.round(sw * k) + 2 * pad; out.height = Math.round(sh * k) + 2 * pad;
              const octx = out.getContext("2d");
              octx.fillStyle = "#fff"; octx.fillRect(0, 0, out.width, out.height);
              octx.drawImage(img, sx, sy, sw, sh, pad, pad, Math.round(sw * k), Math.round(sh * k));
              const text = decodeCanvas(out);
              if (text) return text;
            }
          }
          return null;
        }
        
        function findBarcodeBands(data, W, H) {
          const px = data.data;
          const gray = new Uint8Array(W * H);
          let sum = 0;
          for (let i = 0; i < W * H; i++) {
            const g = (px[4 * i] * 3 + px[4 * i + 1] * 6 + px[4 * i + 2]) / 10;
            gray[i] = g; sum += g;
          }
          const GAP = 14, MIN_LEN = 120, MIN_TRANS = 40;
          // Por linha: o trecho mais comprido com transicoes preto/branco proximas umas das outras.
          const rows = [];
          for (let y = 0; y < H; y += 2) {
            let lo = 255, hi = 0;
            for (let x = 0; x < W; x++) { const g = gray[y * W + x]; if (g < lo) lo = g; if (g > hi) hi = g; }
            if (hi - lo < 60) { rows.push(null); continue; }
            const thr = (lo + hi) / 2;
            let prev = gray[y * W] < thr, segStart = -1, last = -1, count = 0, best = null;
            for (let x = 1; x < W; x++) {
              const cur = gray[y * W + x] < thr;
              if (cur === prev) continue;
              prev = cur;
              if (last >= 0 && x - last <= GAP) { count++; }
              else {
                if (segStart >= 0 && last - segStart >= MIN_LEN && count >= MIN_TRANS && (!best || last - segStart > best.x1 - best.x0)) best = { x0: segStart, x1: last, n: count };
                segStart = x; count = 1;
              }
              last = x;
            }
            if (segStart >= 0 && last - segStart >= MIN_LEN && count >= MIN_TRANS && (!best || last - segStart > best.x1 - best.x0)) best = { x0: segStart, x1: last, n: count };
            rows.push(best);
          }
          // Faixas: linhas seguidas com o trecho no mesmo lugar (barras sao verticais).
          const bands = [];
          let cur = null;
          rows.forEach((seg, i) => {
            const y = i * 2;
            if (seg && cur && Math.abs(seg.x0 - cur.lx0) <= 8 && Math.abs(seg.x1 - cur.lx1) <= 8) {
              // Compara com a linha anterior: aceita o codigo um pouco torto na foto.
              cur.y1 = y; cur.rows++; cur.lx0 = seg.x0; cur.lx1 = seg.x1;
              cur.x0 = Math.min(cur.x0, seg.x0); cur.x1 = Math.max(cur.x1, seg.x1);
            } else {
              if (cur && cur.rows >= 6) bands.push(cur);
              cur = seg ? { x0: seg.x0, x1: seg.x1, lx0: seg.x0, lx1: seg.x1, y0: y, y1: y, rows: 1 } : null;
            }
          });
          if (cur && cur.rows >= 6) bands.push(cur);
          bands.sort((a, b) => b.rows * (b.x1 - b.x0) - a.rows * (a.x1 - a.x0));
          return bands.slice(0, 6).map((b) => ({
            x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1,
          }));
        }

        // Codigo de pareamento: vem no QR (?p=...) e fica guardado para as proximas vezes.
        const pairWarning = document.getElementById('pair-warning');
        const stockCard = document.getElementById('stock-card');
        const pairingCode = (() => {
            const fromUrl = new URLSearchParams(window.location.search).get('p') || '';
            try {
                if (fromUrl) localStorage.setItem('chronos.pareamento', fromUrl);
                return fromUrl || localStorage.getItem('chronos.pareamento') || '';
            } catch (e) {
                return fromUrl;
            }
        })();

        function el(tag, className, text) {
            const node = document.createElement(tag);
            if (className) node.className = className;
            if (text !== undefined) node.textContent = String(text);
            return node;
        }

        // Saldo por filial do que foi lido (textContent: nada do banco vira HTML).
        function renderStock(produtos) {
            stockCard.replaceChildren();
            if (!produtos.length) {
                stockCard.appendChild(el('div', 'stock-total', 'Nenhum produto com esse código no estoque.'));
                stockCard.classList.add('show');
                return;
            }
            produtos.forEach((item) => {
                const box = el('div', 'stock-item');
                box.appendChild(el('div', 'stock-name', `#${item.id} ${item.nome}`));
                const total = el('div', 'stock-total' + (item.total > 0 ? '' : ' zero'), 'Total: ');
                total.appendChild(el('b', '', item.total));
                box.appendChild(total);
                const places = el('div', 'stock-places');
                (item.locais || []).forEach((place) => {
                    const chip = el('span', 'stock-place', `${place.local}: `);
                    chip.appendChild(el('b', '', place.quantidade));
                    places.appendChild(chip);
                });
                box.appendChild(places);
                stockCard.appendChild(box);
            });
            stockCard.classList.remove('show');
            void stockCard.offsetWidth;
            stockCard.classList.add('show');
        }

        function sendBarcode(code) {
            if (isProcessing) return;
            isProcessing = true;
            setStatus(`Lido: ${code}`, 'ok');

            // Bipe (se ligado)
            playBeep();

            if (navigator.vibrate) {
                navigator.vibrate([100, 50, 100]); // Haptic feedback dupla
            }

            fetch('/api/scanner/barcode', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Chronos-Pareamento': pairingCode },
                body: JSON.stringify({ code: code })
            })
            .then(response => {
                if (response.status === 403) {
                    pairWarning.classList.add('show');
                    throw new Error('nao pareado');
                }
                return response.json();
            })
            .then(data => {
                pairWarning.classList.remove('show');
                setStatus(`Lido: ${data.display_name}`, 'ok');
                renderStock(data.produtos || []);
                
                // Adicionar ao histórico
                const li = document.createElement('li');
                const now = new Date();
                const timeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0') + ':' + now.getSeconds().toString().padStart(2, '0');
                // textContent: o nome vem do banco/codigo lido e nao pode virar HTML.
                const nameSpan = document.createElement('span');
                nameSpan.textContent = String(data.display_name ?? '');
                const timeSpan = document.createElement('span');
                timeSpan.className = 'time';
                timeSpan.textContent = timeStr;
                li.appendChild(nameSpan);
                li.appendChild(timeSpan);
                // Moldura verde so no item que acabou de ser lido.
                historyList.querySelectorAll('li.hit').forEach((el) => el.classList.remove('hit'));
                li.classList.add('hit');
                historyList.prepend(li);
                if (historyList.children.length > 15) {
                    historyList.removeChild(historyList.lastChild);
                }

                setTimeout(() => { isProcessing = false; setStatus('Pronto para o próximo...', ''); }, 1000);
            })
            .catch(err => {
                setStatus(String(err && err.message) === 'nao pareado' ? 'Celular não pareado' : 'Erro de conexão!', 'error');
                setTimeout(() => { isProcessing = false; setStatus('Tente novamente...', ''); }, 2000);
            });
        }

        function onScanSuccess(decodedText, decodedResult) {
            sendBarcode(decodedText);
        }
    </script>
</body>
</html>
"""

@router.get("/app", response_class=HTMLResponse)
def get_scanner_app():
    """Retorna o aplicativo web HTML/JS para o celular"""
    return HTML_CONTENT

@router.post("/barcode")
async def receive_barcode(
    payload: BarcodePayload,
    request: Request,
    pareamento: str | None = Header(default=None, alias=PAIRING_HEADER),
    stock_service: StockService = Depends(get_stock_service),
):
    """Recebe o código de barras do celular e dispara via WebSocket para o Desktop"""
    client_host = request.client.host if request.client else None
    if not _is_loopback(client_host) and not secrets.compare_digest(pareamento or "", pairing_code()):
        raise HTTPException(
            status_code=403,
            detail="Celular não pareado. Leia de novo o QR code na tela do computador.",
        )

    # Buscar nome do produto para o histórico do celular
    display_name = payload.code
    code_upper = payload.code.upper()
    
    from core.nfe_xml import chave_from_code, chave_numero

    chave = chave_from_code(payload.code)
    try:
        if chave:
            serie, numero = chave_numero(chave)
            display_name = f"NF-e {numero} (serie {serie})"
        elif code_upper.startswith("CI-"):
            pid = int(code_upper.replace("CI-", ""))
            prod = stock_service.get_product_by_id(pid)
            if prod:
                display_name = prod.nome
        else:
            # Tentar buscar pelo nome
            prod = stock_service.get_product_by_name(payload.code)
            if prod:
                display_name = prod.nome
    except Exception:
        # Ignora erros de not found e exibe o codigo raw
        pass

    disconnected = []
    for ws in connected_desktops:
        try:
            await ws.send_json({"code": payload.code})
        except Exception:
            disconnected.append(ws)
    
    for ws in disconnected:
        if ws in connected_desktops:
            connected_desktops.remove(ws)
            
    produtos: list[dict] = []
    if not chave:
        try:
            produtos = _stock_lookup(stock_service, payload.code)
        except Exception:
            LOG.exception("scanner: falha ao buscar o saldo de %s", payload.code)
    if len(produtos) == 1:
        display_name = produtos[0]["nome"]

    return {"status": "ok", "code": payload.code, "display_name": display_name, "produtos": produtos}

@router.websocket("/ws")
async def scanner_websocket(websocket: WebSocket):
    """Conexão persistente com o aplicativo Desktop (somente deste computador)."""
    if not _is_loopback(websocket.client.host if websocket.client else None):
        await websocket.close(code=1008)
        return
    await websocket.accept()
    connected_desktops.append(websocket)
    try:
        while True:
            # Keep-alive
            _ = await websocket.receive_text()
    except WebSocketDisconnect:
        if websocket in connected_desktops:
            connected_desktops.remove(websocket)

@router.get("/ip")
def get_local_ip(request: Request):
    """Descobre o IP local da máquina na rede Wi-Fi (para o QR code do celular)."""
    port = os.getenv("PORT", "8000")
    ip = _default_route_ipv4() or _first_private_ipv4()
    result = {"ip": f"http://{ip or '127.0.0.1'}:{port}"}
    # O codigo de pareamento so vai para a tela deste computador, nunca para a rede.
    if _is_loopback(request.client.host if request.client else None):
        result["pareamento"] = pairing_code()
    return result


def _default_route_ipv4() -> str | None:
    # UDP connect only picks the outgoing interface; no packet is sent.
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("8.8.8.8", 80))
        ip = sock.getsockname()[0]
        return None if ip.startswith("127.") else ip
    except OSError:
        return None
    finally:
        sock.close()


def _first_private_ipv4() -> str | None:
    # Offline network (no default route): any private address of this machine.
    try:
        infos = socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET)
    except OSError:
        return None
    for info in infos:
        ip = info[4][0]
        try:
            if ipaddress.ip_address(ip).is_private and not ip.startswith("127."):
                return ip
        except ValueError:
            continue
    return None
