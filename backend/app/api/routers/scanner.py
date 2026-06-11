from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from app.services.stock_service import StockService
from backend.app.api.deps import get_stock_service
import socket
import subprocess
import threading

router = APIRouter(prefix="/api/scanner", tags=["Scanner"])

# Lista de conexoes WebSocket ativas do Desktop
connected_desktops: list[WebSocket] = []

# URL global do túnel
tunnel_url = None

def start_localtunnel():
    global tunnel_url
    try:
        process = subprocess.Popen(
            "npx localtunnel --port 8000",
            shell=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True
        )
        for line in iter(process.stdout.readline, ''):
            if "your url is:" in line:
                tunnel_url = line.split("your url is:")[1].strip()
                break
    except Exception as e:
        print("Localtunnel error:", e)

# Inicia o túnel em segundo plano
threading.Thread(target=start_localtunnel, daemon=True).start()


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

            html5QrcodeScanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: {width: 250, height: 150}, aspectRatio: 1.0 });
            html5QrcodeScanner.render(onScanSuccess);
        });

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
                li.innerHTML = `<span>${data.display_name}</span><span class="time">${timeStr}</span>`;
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
    
    try:
        if code_upper.startswith("CI-"):
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
    """Conexão persistente com o aplicativo Desktop"""
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
    """Descobre o IP local da máquina na rede Wi-Fi ou retorna o link do Localtunnel"""
    global tunnel_url
    if tunnel_url:
        return {"ip": tunnel_url}
        
    try:
        import psutil
        # Tentar achar IP 192.168 primeiro
        for interface, addrs in psutil.net_if_addrs().items():
            for addr in addrs:
                if addr.family == socket.AF_INET:
                    ip = addr.address
                    if ip.startswith("192.168."):
                        return {"ip": f"http://{ip}:8000"}
        
        # Fallback padrão
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return {"ip": f"http://{ip}:8000"}
    except Exception:
        return {"ip": "http://127.0.0.1:8000"}
