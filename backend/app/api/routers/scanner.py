from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from app.services.stock_service import StockService
from backend.app.api.deps import get_stock_service
import ipaddress
import os
import socket

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

HTML_CONTENT = """
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Scanner Chronos</title>
    <script src="https://unpkg.com/html5-qrcode"></script>
    <script src="https://unpkg.com/@zxing/library@0.21.3/umd/index.min.js"></script>
    <style>
        body { margin: 0; padding: 0; background-color: #121212; color: white; font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; overflow: hidden; }
        #reader { width: 100%; max-width: 600px; }
        .header { text-align: center; padding: 15px; width: 100%; background-color: #1f1f1f; font-weight: bold; font-size: 1.2rem; }
        .status { margin-top: 20px; font-size: 1rem; color: #4ade80; height: 30px; font-weight: bold; }
        .error { color: #f87171; }
        .history-container { margin-top: 15px; width: 100%; max-width: 600px; text-align: left; padding: 0 15px; box-sizing: border-box; }
        .history-title { font-size: 0.9rem; color: #aaa; margin-bottom: 5px; border-bottom: 1px solid #333; padding-bottom: 5px; }
        .history-list { list-style: none; margin: 0; padding: 0; max-height: 150px; overflow-y: auto; }
        .history-list li { padding: 5px 0; border-bottom: 1px solid #222; font-size: 0.85rem; display: flex; justify-content: space-between; }
        .history-list li span.time { color: #888; font-size: 0.75rem; }
    </style>
</head>
<body>
    <div id="start-overlay" style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: #121212; z-index: 1000; display: flex; flex-direction: column; align-items: center; justify-content: center;">
        <div style="font-size: 1.5rem; margin-bottom: 20px; font-weight: bold;">Leitor Chronos</div>
        <button id="start-btn" style="padding: 15px 40px; font-size: 1.2rem; background: #4ade80; color: #111; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 6px rgba(0,0,0,0.3);">INICIAR CÂMERA</button>
        <div style="margin-top: 20px; color: #888; font-size: 0.9rem;">Toque para habilitar o som do bipe</div>
    </div>


    <div class="header">Chronos Scanner</div>
    <div id="reader"></div>
    <!-- Sem https (pagina aberta pelo IP da maquina) o navegador nao libera a camera ao vivo,
         mas deixa tirar foto: o codigo e lido da foto. -->
    <div id="photo-mode" style="display: none; width: 100%; max-width: 600px; padding: 20px 15px; box-sizing: border-box; text-align: center;">
        <label for="photo-input" style="display: block; padding: 22px 10px; font-size: 1.2rem; background: #4ade80; color: #111; border-radius: 10px; font-weight: bold; cursor: pointer;">TIRAR FOTO DO CÓDIGO</label>
        <input id="photo-input" type="file" accept="image/*" capture="environment" style="display: none;">
        <div style="margin-top: 12px; color: #aaa; font-size: 0.85rem;">Fotografe o código de barras com o celular parado e com luz. Na nota, é o código acima da chave de acesso.</div>
    </div>

    <div class="status" id="status-text">Apontando câmera...</div>
    
    <div class="history-container">
        <div class="history-title">Últimos lidos:</div>
        <ul class="history-list" id="history-list"></ul>
    </div>

    <script>
        const statusText = document.getElementById('status-text');
        const historyList = document.getElementById('history-list');
        const startOverlay = document.getElementById('start-overlay');
        const startBtn = document.getElementById('start-btn');
        
        if (!window.isSecureContext) {
            startBtn.innerText = 'COMEÇAR';
        }

        let isProcessing = false;
        let html5QrcodeScanner = null;
        let audioCtx = null;

        function playBeep() {
            if (!audioCtx) return;
            if (audioCtx.state === 'suspended') {
                audioCtx.resume();
            }
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(1000, audioCtx.currentTime); // 1000Hz beep
            
            gainNode.gain.setValueAtTime(1, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
            
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            
            oscillator.start();
            oscillator.stop(audioCtx.currentTime + 0.15);
        }

        // Desbloquear áudio e iniciar scanner
        startBtn.addEventListener('click', () => {
            // Inicializar o contexto de áudio
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                audioCtx = new AudioContext();
                // Toca um bip inaudível/rápido só para destravar o som no iOS
                playBeep();
            }
            
            startOverlay.style.display = 'none';

            if (!window.isSecureContext) {
                document.getElementById('photo-mode').style.display = 'block';
                statusText.innerText = 'Toque no botão e fotografe o código';
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
            statusText.style.color = '#4ade80';
            statusText.innerText = 'Lendo a foto...';
            if (typeof ZXing === 'undefined') {
                statusText.style.color = '#f87171';
                statusText.innerText = 'O leitor não carregou: o celular precisa de internet. Recarregue a página.';
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
                    statusText.style.color = '#f87171';
                    statusText.innerText = 'Não achei código na foto. Tente de novo, com o celular parado e com luz.';
                }
            } catch (err) {
                statusText.style.color = '#f87171';
                statusText.innerText = 'Não consegui abrir a foto. Tente de novo.';
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

        function sendBarcode(code) {
            if (isProcessing) return;
            isProcessing = true;
            statusText.innerText = `Lido: ${code}`;
            statusText.style.color = '#4ade80';

            // Tocar o som
            playBeep();

            if (navigator.vibrate) {
                navigator.vibrate([100, 50, 100]); // Haptic feedback dupla
            }

            fetch('/api/scanner/barcode', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: code })
            })
            .then(response => response.json())
            .then(data => {
                statusText.innerText = `Lido: ${data.display_name}`;
                
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
                historyList.prepend(li);
                if (historyList.children.length > 15) {
                    historyList.removeChild(historyList.lastChild);
                }

                setTimeout(() => { isProcessing = false; statusText.innerText = 'Pronto para o próximo...'; }, 1000);
            })
            .catch(err => {
                statusText.innerText = 'Erro de conexão!';
                statusText.style.color = '#f87171';
                setTimeout(() => { isProcessing = false; statusText.style.color = '#4ade80'; statusText.innerText = 'Tente novamente...'; }, 2000);
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
async def receive_barcode(payload: BarcodePayload, stock_service: StockService = Depends(get_stock_service)):
    """Recebe o código de barras do celular e dispara via WebSocket para o Desktop"""
    
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
            
    return {"status": "ok", "code": payload.code, "display_name": display_name}

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
def get_local_ip():
    """Descobre o IP local da máquina na rede Wi-Fi (para o QR code do celular)."""
    port = os.getenv("PORT", "8000")
    ip = _default_route_ipv4() or _first_private_ipv4()
    return {"ip": f"http://{ip or '127.0.0.1'}:{port}"}


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
