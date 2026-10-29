"""
Pagina do celular (Chronos Scanner), servida em /api/scanner/app pelo IP da maquina.

Tres modos, escolhidos no alto da tela e lembrados no celular:
- Inventario: cada leitura soma 1 na sessao aberta escolhida; -1/+1 e quantidade digitada.
- Contagem: mostra o saldo por filial e soma numa lista do proprio celular; a leitura tambem
  vai para a tela aberta no computador (busca, movimentacao em lote).
- NF-e: so aceita a chave da DANFE e abre a nota no computador.

A foto pode trazer varios codigos de barras (serie, modelo, lote, EAN...). A pagina le todos e
o backend (/api/scanner/ler) escolhe o da peca; se mais de uma peca bater, o celular pergunta.
"""

SCANNER_PAGE = r"""
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
            --warning: #fbbf24;
            --danger: #f87171;
            --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
        }
        * { box-sizing: border-box; }
        html, body { height: 100%; }
        body {
            margin: 0; padding: 0 0 24px;
            background:
                radial-gradient(60% 40% at 15% 0%, rgba(14, 116, 144, 0.35), transparent 70%),
                radial-gradient(50% 40% at 100% 100%, rgba(30, 58, 138, 0.3), transparent 70%),
                var(--bg);
            color: var(--text);
            font-family: "Sora", "Segoe UI", system-ui, -apple-system, sans-serif;
            display: flex; flex-direction: column; align-items: center;
            min-height: 100vh; overflow-x: hidden;
        }
        button, input, select { font: inherit; }
        .header {
            width: 100%; max-width: 640px;
            display: flex; align-items: center; justify-content: space-between; gap: 12px;
            padding: 14px 16px 10px;
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
        button:focus-visible, input:focus-visible, select:focus-visible, label.primary-btn:focus-within {
            outline: 2px solid var(--accent); outline-offset: 2px;
        }
        .card {
            width: calc(100% - 32px); max-width: 608px;
            background: var(--card); border: 1px solid var(--border); border-radius: 16px;
            box-shadow: 0 8px 28px rgba(0, 0, 0, 0.28);
            -webkit-backdrop-filter: blur(18px) saturate(1.4); backdrop-filter: blur(18px) saturate(1.4);
        }
        /* Modos */
        .modes {
            width: calc(100% - 32px); max-width: 608px;
            display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;
            padding: 5px; border-radius: 16px; background: var(--card); border: 1px solid var(--border);
        }
        .mode-btn {
            min-height: 52px; padding: 6px 4px; border: 0; border-radius: 12px; cursor: pointer;
            background: transparent; color: var(--muted); font-weight: 700; font-size: 0.95rem;
            display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
            transition: background-color 0.18s, color 0.18s;
        }
        .mode-btn small { font-weight: 500; font-size: 0.7rem; }
        .mode-btn[aria-pressed="true"] { background: var(--accent); color: var(--on-accent); }
        .mode-btn[data-mode="contagem"][aria-pressed="true"] { background: var(--success); }
        .mode-btn[data-mode="nfe"][aria-pressed="true"] { background: var(--warning); }
        .mode-hint { width: calc(100% - 32px); max-width: 608px; margin: 8px 0 10px; color: var(--muted); font-size: 0.85rem; line-height: 1.4; }
        .session-box { padding: 12px 14px; margin-bottom: 10px; }
        .session-box label { display: block; font-size: 0.8rem; color: var(--muted); margin-bottom: 6px; }
        .session-row { display: flex; gap: 8px; }
        .session-row select {
            flex: 1; min-width: 0; min-height: 44px; padding: 8px 10px; border-radius: 10px;
            border: 1px solid var(--border); background: var(--card-strong); color: var(--text);
        }
        .session-progress { margin-top: 8px; font-size: 0.82rem; color: var(--muted); font-variant-numeric: tabular-nums; }
        .ghost-btn {
            min-height: 44px; padding: 8px 14px; border-radius: 10px; cursor: pointer;
            border: 1px solid var(--border); background: var(--card-strong); color: var(--text); font-weight: 600;
        }
        #reader { width: 100%; max-width: 608px; border-radius: 16px; overflow: hidden; border: 0 !important; margin-bottom: 10px; }
        #reader button, #reader select { font: inherit; padding: 8px 14px; border-radius: 10px; border: 1px solid var(--border); background: var(--card-strong); color: var(--text); }
        #reader a { color: var(--accent); }
        .capture { padding: 14px; }
        .primary-btn {
            display: block; width: 100%; padding: 20px 12px;
            font-size: 1.1rem; font-weight: 700; text-align: center;
            background: var(--accent); color: var(--on-accent);
            border: none; border-radius: 14px; cursor: pointer;
            box-shadow: 0 6px 20px rgba(56, 189, 248, 0.25);
        }
        body[data-mode="contagem"] .capture .primary-btn { background: var(--success); box-shadow: 0 6px 20px rgba(52, 211, 153, 0.22); }
        body[data-mode="nfe"] .capture .primary-btn { background: var(--warning); box-shadow: 0 6px 20px rgba(251, 191, 36, 0.22); }
        .manual { display: flex; gap: 8px; margin-top: 10px; }
        .manual input {
            flex: 1; min-width: 0; min-height: 44px; padding: 8px 12px; border-radius: 10px;
            border: 1px solid var(--border); background: var(--card-strong); color: var(--text);
        }
        .manual input::placeholder { color: var(--muted); }
        .status {
            margin: 12px 16px 0; min-height: 24px; font-size: 1rem; font-weight: 600; text-align: center;
            color: var(--muted);
        }
        .status.ok { color: var(--success); }
        .status.error { color: var(--danger); }
        /* Resultado da leitura */
        .result { margin-top: 10px; padding: 14px 16px; display: none; }
        .result.show { display: block; animation: rise 0.35s var(--ease-out); }
        .result-name { font-weight: 700; font-size: 1rem; line-height: 1.35; }
        .result-code { margin-top: 2px; color: var(--muted); font-size: 0.8rem; }
        .counter { display: grid; grid-template-columns: 64px 1fr 64px; gap: 10px; align-items: center; margin-top: 14px; }
        .step-btn {
            height: 64px; border-radius: 14px; cursor: pointer; font-size: 1.5rem; font-weight: 700;
            border: 1px solid var(--border); background: var(--card-strong); color: var(--text);
            touch-action: manipulation;
        }
        .step-btn.plus { background: var(--accent); color: var(--on-accent); border-color: transparent; }
        body[data-mode="contagem"] .step-btn.plus { background: var(--success); }
        .qty-input {
            width: 100%; height: 64px; border-radius: 14px; text-align: center;
            font-size: 2rem; font-weight: 700; font-variant-numeric: tabular-nums;
            border: 1px solid var(--border); background: rgba(255, 255, 255, 0.04); color: var(--text);
        }
        .qty-caption { text-align: center; color: var(--muted); font-size: 0.78rem; margin-top: 4px; }
        .compare { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
        .chip {
            padding: 4px 10px; border-radius: 999px; font-size: 0.82rem;
            border: 1px solid var(--border); background: rgba(255, 255, 255, 0.04);
            font-variant-numeric: tabular-nums;
        }
        .chip b { color: var(--accent); }
        .chip.ok { border-color: rgba(52, 211, 153, 0.5); color: var(--success); }
        .chip.diff { border-color: rgba(251, 191, 36, 0.5); color: var(--warning); }
        .chip.zero b { color: var(--danger); }
        .choices { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
        .choice {
            text-align: left; padding: 12px 14px; min-height: 48px; border-radius: 12px; cursor: pointer;
            border: 1px solid var(--border); background: var(--card-strong); color: var(--text); font-weight: 600;
        }
        .choice small { display: block; color: var(--muted); font-weight: 400; margin-top: 2px; }
        .note { color: var(--muted); font-size: 0.85rem; line-height: 1.4; margin-top: 8px; }
        .pair-warning {
            display: none; margin-top: 12px; padding: 14px 16px; color: var(--danger);
            font-weight: 600; text-align: center;
        }
        .pair-warning.show { display: block; }
        /* Lista do modo */
        .list-card { margin-top: 12px; padding: 12px 14px; }
        .list-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 8px; }
        .list-title { font-size: 0.8rem; font-weight: 600; color: var(--muted); }
        .link-btn { border: 0; background: none; color: var(--accent); font-weight: 600; font-size: 0.85rem; cursor: pointer; padding: 6px 2px; }
        .list { list-style: none; margin: 0; padding: 0; max-height: 45vh; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
        .list li {
            padding: 9px 12px; border-radius: 10px; font-size: 0.88rem; cursor: pointer;
            display: flex; justify-content: space-between; align-items: center; gap: 12px;
            background: rgba(255, 255, 255, 0.04); border: 1px solid var(--border);
            outline: 2px solid transparent; outline-offset: -2px;
        }
        .list li .qty { font-weight: 700; font-variant-numeric: tabular-nums; flex-shrink: 0; }
        .list li .side { color: var(--muted); font-size: 0.78rem; flex-shrink: 0; font-variant-numeric: tabular-nums; }
        .list li.hit { outline-color: var(--success); background: rgba(52, 211, 153, 0.1); animation: hit-pulse 0.65s var(--ease-out) 2; }
        .list .empty { cursor: default; color: var(--muted); justify-content: center; }
        @keyframes hit-pulse {
            0% { outline-color: transparent; outline-offset: 2px; }
            45% { outline-color: var(--success); outline-offset: -2px; }
            100% { outline-color: rgba(52, 211, 153, 0.7); outline-offset: -2px; }
        }
        @keyframes rise { from { opacity: 0; transform: translateY(6px); } }
        #start-overlay {
            position: fixed; inset: 0; z-index: 1000; padding: 24px;
            background: var(--bg);
            display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px;
        }
        #start-overlay .title { font-size: 1.5rem; font-weight: 700; }
        #start-overlay .hint { color: var(--muted); font-size: 0.9rem; text-align: center; max-width: 320px; }
        #start-overlay .primary-btn { max-width: 320px; }
        @media (prefers-reduced-motion: reduce) {
            .result.show { animation: none; }
            .list li.hit { animation: none; }
            .beep-toggle .knob, .beep-toggle .knob::after, .mode-btn { transition: none; }
        }
    </style>
</head>
<body data-mode="contagem">
    <div id="start-overlay">
        <div class="title">Leitor Chronos</div>
        <button id="start-btn" class="primary-btn" type="button">INICIAR CÂMERA</button>
        <div class="hint">O bipe vem desligado. Para ligar, toque em "Bipe" no alto da tela.</div>
    </div>

    <div class="header">
        <div class="brand">Chronos Scanner<small id="brand-sub">Leitura vai direto para o computador</small></div>
        <button id="beep-toggle" class="beep-toggle" type="button" aria-pressed="false">
            <span class="knob" aria-hidden="true"></span><span id="beep-label">Bipe desligado</span>
        </button>
    </div>

    <div class="modes" role="group" aria-label="Modo do leitor">
        <button class="mode-btn" type="button" data-mode="inventario" aria-pressed="false">Inventário<small>sessão</small></button>
        <button class="mode-btn" type="button" data-mode="contagem" aria-pressed="true">Contagem<small>saldo</small></button>
        <button class="mode-btn" type="button" data-mode="nfe" aria-pressed="false">NF-e<small>DANFE</small></button>
    </div>
    <div class="mode-hint" id="mode-hint"></div>

    <div id="session-box" class="session-box card" style="display: none;">
        <label for="session-select">Sessão de inventário</label>
        <div class="session-row">
            <select id="session-select"></select>
            <button id="session-refresh" class="ghost-btn" type="button" aria-label="Atualizar sessões">Atualizar</button>
        </div>
        <div class="session-progress" id="session-progress"></div>
    </div>

    <div id="reader" class="card" style="display: none;"></div>
    <!-- Sem https (pagina aberta pelo IP da maquina) o navegador nao libera a camera ao vivo,
         mas deixa tirar foto: os codigos sao lidos da foto. -->
    <div id="photo-mode" class="capture card" style="display: none;">
        <label for="photo-input" class="primary-btn" id="photo-label">FOTOGRAFAR ETIQUETA</label>
        <input id="photo-input" type="file" accept="image/*" capture="environment" style="display: none;">
        <form class="manual" id="manual-form" autocomplete="off">
            <input id="manual-input" type="text" inputmode="text" placeholder="Ou digite o código" aria-label="Digitar código">
            <button class="ghost-btn" type="submit">OK</button>
        </form>
    </div>

    <div class="status" id="status-text" role="status" aria-live="polite">Apontando câmera...</div>
    <div id="result" class="result card" aria-live="polite"></div>
    <div id="pair-warning" class="pair-warning card">Este celular não está pareado. Leia de novo o QR code na tela do computador (botão do celular no alto do Chronos).</div>

    <div class="list-card card">
        <div class="list-head">
            <div class="list-title" id="list-title">Minha contagem</div>
            <button class="link-btn" id="list-clear" type="button">Limpar lista</button>
        </div>
        <ul class="list" id="list"></ul>
    </div>

    <script>
        const $ = (id) => document.getElementById(id);
        const statusText = $('status-text');
        const resultCard = $('result');
        const listEl = $('list');
        const beepToggle = $('beep-toggle');
        const beepLabel = $('beep-label');
        const pairWarning = $('pair-warning');

        const MODES = {
            inventario: {
                hint: 'Cada leitura soma 1 na sessão escolhida. Com várias peças iguais, leia uma vez e ajuste com −1 / +1 ou digite a quantidade.',
                capture: 'FOTOGRAFAR ETIQUETA',
                sub: 'Conta direto na sessão de inventário',
                list: 'Contados neste celular',
            },
            contagem: {
                hint: 'Mostra o saldo por filial e soma na sua lista. A leitura também aparece na tela aberta no computador.',
                capture: 'FOTOGRAFAR ETIQUETA',
                sub: 'Saldo na hora e lista de contagem',
                list: 'Minha contagem',
            },
            nfe: {
                hint: 'Fotografe o código de barras da DANFE, acima da chave de acesso. A nota abre no computador para conferir e lançar.',
                capture: 'FOTOGRAFAR DANFE',
                sub: 'Abre a nota fiscal no computador',
                list: 'Notas lidas',
            },
        };

        function store(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* modo privado */ } }
        function load(key, fallback) { try { const v = localStorage.getItem(key); return v === null ? fallback : v; } catch (e) { return fallback; } }
        function loadJson(key, fallback) { try { return JSON.parse(load(key, '')) || fallback; } catch (e) { return fallback; } }

        let mode = MODES[load('chronos.scanner.modo', '')] ? load('chronos.scanner.modo', '') : 'contagem';
        let sessionId = Number(load('chronos.scanner.sessao', '0')) || null;
        let sessions = [];
        let isProcessing = false;
        let audioCtx = null;
        // Listas de cada modo (ficam no celular).
        let tally = loadJson('chronos.scanner.contagem', []);      // [{id, nome, qtd, total}]
        let invDone = loadJson('chronos.scanner.inventario', []);  // [{sessao, id, nome, qtd, sistema}]
        let notes = loadJson('chronos.scanner.notas', []);         // [{texto, hora}]

        function setStatus(text, kind) {
            statusText.textContent = text;
            statusText.className = 'status' + (kind ? ' ' + kind : '');
        }

        function el(tag, className, text) {
            const node = document.createElement(tag);
            if (className) node.className = className;
            if (text !== undefined) node.textContent = String(text);
            return node;
        }

        function nowTime() {
            const d = new Date();
            return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
        }

        // ---------- Bipe ----------
        let beepOn = load('chronos.scanner.bipe', '0') === '1';
        function ensureAudio() {
            if (audioCtx) return;
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) audioCtx = new AudioContext();
        }
        function renderBeep() {
            beepToggle.setAttribute('aria-pressed', beepOn ? 'true' : 'false');
            beepLabel.textContent = beepOn ? 'Bipe ligado' : 'Bipe desligado';
        }
        function playBeep(ok) {
            if (navigator.vibrate) navigator.vibrate(ok === false ? [60, 60, 60, 60, 60] : [100, 50, 100]);
            if (!beepOn || !audioCtx) return;
            if (audioCtx.state === 'suspended') audioCtx.resume();
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(ok === false ? 320 : 1000, audioCtx.currentTime);
            gainNode.gain.setValueAtTime(0.4, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.14);
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            oscillator.start();
            oscillator.stop(audioCtx.currentTime + 0.14);
        }
        beepToggle.addEventListener('click', () => {
            beepOn = !beepOn;
            store('chronos.scanner.bipe', beepOn ? '1' : '0');
            renderBeep();
            if (beepOn) { ensureAudio(); playBeep(true); }
        });
        renderBeep();

        // ---------- Pareamento e chamadas ----------
        // Codigo de pareamento: vem no QR (?p=...) e fica guardado para as proximas vezes.
        const pairingCode = (() => {
            const fromUrl = new URLSearchParams(window.location.search).get('p') || '';
            if (fromUrl) store('chronos.pareamento', fromUrl);
            return fromUrl || load('chronos.pareamento', '');
        })();

        async function api(path, body) {
            const response = await fetch('/api/scanner' + path, {
                method: body === undefined ? 'GET' : 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Chronos-Pareamento': pairingCode },
                body: body === undefined ? undefined : JSON.stringify(body),
            });
            if (response.status === 403) {
                pairWarning.classList.add('show');
                throw new Error('Celular não pareado');
            }
            pairWarning.classList.remove('show');
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error((data.error && data.error.message) || 'Erro no computador');
            return data;
        }

        // ---------- Modos ----------
        function setMode(next) {
            mode = next;
            store('chronos.scanner.modo', mode);
            document.body.dataset.mode = mode;
            document.querySelectorAll('.mode-btn').forEach((btn) => btn.setAttribute('aria-pressed', btn.dataset.mode === mode ? 'true' : 'false'));
            $('mode-hint').textContent = MODES[mode].hint;
            $('photo-label').textContent = MODES[mode].capture;
            $('brand-sub').textContent = MODES[mode].sub;
            $('list-title').textContent = MODES[mode].list;
            $('session-box').style.display = mode === 'inventario' ? 'block' : 'none';
            $('manual-input').placeholder = mode === 'nfe' ? 'Ou digite a chave (44 números)' : 'Ou digite o código';
            $('manual-input').inputMode = mode === 'nfe' ? 'numeric' : 'text';
            resultCard.classList.remove('show');
            resultCard.replaceChildren();
            if (mode === 'inventario') loadSessions();
            renderList();
            setStatus(mode === 'nfe' ? 'Fotografe a DANFE' : 'Fotografe a etiqueta da caixa', '');
        }
        document.querySelectorAll('.mode-btn').forEach((btn) => btn.addEventListener('click', () => setMode(btn.dataset.mode)));

        async function loadSessions() {
            const select = $('session-select');
            try {
                sessions = await api('/inventario/sessoes');
            } catch (err) {
                sessions = [];
                setStatus(err.message, 'error');
            }
            select.replaceChildren();
            if (!sessions.length) {
                select.appendChild(el('option', '', 'Nenhuma sessão aberta'));
                select.disabled = true;
                $('session-progress').textContent = 'Abra uma sessão no computador, na aba Inventário, e toque em Atualizar.';
                sessionId = null;
                return;
            }
            select.disabled = false;
            if (!sessions.some((s) => s.id === sessionId)) sessionId = sessions[0].id;
            sessions.forEach((s) => {
                const option = el('option', '', `#${s.id} ${s.nome} · ${s.local}`);
                option.value = String(s.id);
                option.selected = s.id === sessionId;
                select.appendChild(option);
            });
            store('chronos.scanner.sessao', String(sessionId));
            renderSessionProgress();
            renderList();
        }
        function renderSessionProgress(contados, total, sid) {
            const s = sessions.find((item) => item.id === (sid || sessionId));
            if (!s) return;
            if (contados !== undefined) { s.counted_items = contados; s.total_items = total; }
            if (s.id !== sessionId) return;
            $('session-progress').textContent = `${s.counted_items.toLocaleString('pt-BR')} de ${s.total_items.toLocaleString('pt-BR')} itens contados`;
        }
        $('session-select').addEventListener('change', (event) => {
            sessionId = Number(event.target.value) || null;
            store('chronos.scanner.sessao', String(sessionId || ''));
            renderSessionProgress();
            resultCard.classList.remove('show');
            renderList();
        });
        $('session-refresh').addEventListener('click', loadSessions);

        // ---------- Listas ----------
        function saveLists() {
            store('chronos.scanner.contagem', JSON.stringify(tally.slice(0, 200)));
            store('chronos.scanner.inventario', JSON.stringify(invDone.slice(0, 300)));
            store('chronos.scanner.notas', JSON.stringify(notes.slice(0, 30)));
        }
        function renderList(hitKey) {
            listEl.replaceChildren();
            let rows = [];
            if (mode === 'contagem') {
                rows = tally.map((item) => ({ key: 'p' + item.id, name: `#${item.id} ${item.nome}`, qty: item.qtd, side: `saldo ${item.total}`, open: () => showCounter(item, 'contagem') }));
            } else if (mode === 'inventario') {
                rows = invDone.filter((item) => item.sessao === sessionId).map((item) => ({
                    key: 'p' + item.id, name: `#${item.id} ${item.nome}`, qty: item.qtd, side: `sistema ${item.sistema}`,
                    open: () => showCounter(item, 'inventario'),
                }));
            } else {
                rows = notes.map((item, index) => ({ key: 'n' + index, name: item.texto, side: item.hora }));
            }
            $('list-clear').style.display = mode === 'nfe' || !rows.length ? 'none' : 'inline-block';
            if (!rows.length) {
                listEl.appendChild(el('li', 'empty', mode === 'nfe' ? 'Nenhuma nota lida ainda.' : 'Nada lido ainda.'));
                return;
            }
            rows.forEach((row) => {
                const li = el('li');
                li.appendChild(el('span', '', row.name));
                const right = el('span', 'side');
                if (row.qty !== undefined) { right.appendChild(el('span', 'qty', row.qty)); right.appendChild(document.createTextNode(' · ' + row.side)); }
                else right.textContent = row.side;
                li.appendChild(right);
                if (row.key === hitKey) li.classList.add('hit');
                if (row.open) li.addEventListener('click', row.open);
                listEl.appendChild(li);
            });
        }
        $('list-clear').addEventListener('click', () => {
            if (!window.confirm('Limpar a lista deste celular? A sessão no computador não muda.')) return;
            if (mode === 'contagem') tally = [];
            if (mode === 'inventario') invDone = invDone.filter((item) => item.sessao !== sessionId);
            saveLists();
            resultCard.classList.remove('show');
            renderList();
        });

        // ---------- Resultado ----------
        function stockChips(box, produto) {
            const chips = el('div', 'compare');
            const total = el('span', 'chip' + (produto.total > 0 ? '' : ' zero'), 'Saldo total: ');
            total.appendChild(el('b', '', produto.total));
            chips.appendChild(total);
            (produto.locais || []).forEach((place) => {
                const chip = el('span', 'chip', `${place.local}: `);
                chip.appendChild(el('b', '', place.quantidade));
                chips.appendChild(chip);
            });
            box.appendChild(chips);
        }

        function showResult(nodes) {
            resultCard.replaceChildren(...nodes);
            resultCard.classList.remove('show');
            void resultCard.offsetWidth;
            resultCard.classList.add('show');
        }

        // Peca lida: quantidade grande com -1 / +1 e campo para digitar.
        function showCounter(item, kind, produto) {
            const nodes = [el('div', 'result-name', `#${item.id} ${item.nome}`)];
            if (item.codigo) nodes.push(el('div', 'result-code', `Código lido: ${item.codigo}`));
            const counter = el('div', 'counter');
            const minus = el('button', 'step-btn', '−1');
            minus.type = 'button';
            minus.setAttribute('aria-label', 'Tirar 1');
            const qty = el('input', 'qty-input');
            qty.type = 'number'; qty.min = '0'; qty.inputMode = 'numeric'; qty.value = String(item.qtd);
            qty.setAttribute('aria-label', 'Quantidade contada');
            const plus = el('button', 'step-btn plus', '+1');
            plus.type = 'button';
            plus.setAttribute('aria-label', 'Somar 1');
            counter.append(minus, qty, plus);
            nodes.push(counter);
            nodes.push(el('div', 'qty-caption', kind === 'inventario' ? 'contado nesta sessão' : 'contado na sua lista'));
            const compare = el('div', 'compare');
            if (kind === 'inventario') {
                const diff = item.qtd - item.sistema;
                compare.appendChild(el('span', 'chip', `Sistema: ${item.sistema}`));
                compare.appendChild(el('span', 'chip ' + (diff === 0 ? 'ok' : 'diff'), diff === 0 ? 'Bate com o sistema' : `Diferença: ${diff > 0 ? '+' : ''}${diff}`));
                nodes.push(compare);
            }
            const box = el('div');
            if (produto) stockChips(box, produto);
            else if (kind === 'contagem') stockChips(box, { total: item.total, locais: item.locais || [] });
            nodes.push(box);
            showResult(nodes);

            const apply = (delta, absolute) => kind === 'inventario' ? countInventory(item, delta, absolute) : countTally(item, delta, absolute);
            minus.addEventListener('click', () => apply(-1));
            plus.addEventListener('click', () => apply(1));
            qty.addEventListener('change', () => {
                const value = Math.max(0, Math.round(Number(qty.value) || 0));
                apply(undefined, value);
            });
            qty.addEventListener('keydown', (event) => { if (event.key === 'Enter') qty.blur(); });
        }

        function countTally(item, delta, absolute) {
            let row = tally.find((t) => t.id === item.id);
            if (!row) { row = { id: item.id, nome: item.nome, qtd: 0, total: item.total, locais: item.locais || [] }; tally.unshift(row); }
            row.qtd = absolute !== undefined ? absolute : Math.max(0, row.qtd + delta);
            row.codigo = item.codigo;
            if (item.total !== undefined) row.total = item.total;
            if (item.locais) row.locais = item.locais;
            tally = [row, ...tally.filter((t) => t !== row)];
            saveLists();
            renderList('p' + row.id);
            showCounter(row, 'contagem');
        }

        async function countInventory(item, delta, absolute) {
            // A sessao e fixada antes da chamada: trocar a sessao no meio nao mistura as contagens.
            const sid = item.sessao || sessionId;
            if (!sid) { setStatus('Escolha a sessão de inventário primeiro.', 'error'); playBeep(false); return; }
            try {
                const body = { produto_id: item.id };
                if (absolute !== undefined) body.quantidade = absolute; else body.delta = delta;
                const data = await api(`/inventario/${sid}/contar`, body);
                let row = invDone.find((t) => t.sessao === sid && t.id === item.id);
                if (!row) { row = { sessao: sid, id: item.id }; }
                Object.assign(row, { nome: data.nome, qtd: data.qtd_fisico, sistema: data.qtd_sistema, codigo: item.codigo });
                invDone = [row, ...invDone.filter((t) => t !== row)];
                saveLists();
                renderSessionProgress(data.contados, data.total_itens, sid);
                if (sid !== sessionId || mode !== 'inventario') return;
                renderList('p' + row.id);
                showCounter(row, 'inventario');
                setStatus(`Contado: ${data.qtd_fisico}`, 'ok');
            } catch (err) {
                playBeep(false);
                setStatus(err.message, 'error');
            }
        }

        function showChoices(produtos, onPick) {
            const nodes = [el('div', 'result-name', 'Achei mais de uma peça com esse código. Qual é?')];
            const list = el('div', 'choices');
            produtos.forEach((produto) => {
                const btn = el('button', 'choice', `#${produto.id} ${produto.nome}`);
                btn.type = 'button';
                btn.appendChild(el('small', '', `Saldo ${produto.total}${produto.codigo_lido ? ' · lido ' + produto.codigo_lido : ''}`));
                btn.addEventListener('click', () => onPick(produto));
                list.appendChild(btn);
            });
            nodes.push(list);
            showResult(nodes);
        }

        function showNothing(data) {
            const nodes = [el('div', 'result-name', data.sugestao ? `Não temos peça cadastrada com ${data.sugestao}` : 'Não achei o código da peça nessa foto')];
            const others = (data.lidos || []).filter((c) => c !== data.sugestao);
            if (others.length) nodes.push(el('div', 'note', `Também li: ${others.join(', ')}`));
            nodes.push(el('div', 'note', 'Chegue mais perto da etiqueta, com luz, ou digite o código no campo acima.'));
            showResult(nodes);
        }

        // ---------- Leitura ----------
        async function handleCodes(codes, fromManual) {
            if (isProcessing) return;
            isProcessing = true;
            try {
                if (mode === 'nfe') {
                    await handleNfe(codes);
                    return;
                }
                const data = await api('/ler', { codigos: codes });
                if (data.situacao === 'nf') {
                    playBeep(false);
                    setStatus('Isso é uma nota fiscal. Toque em NF-e no alto para lançar.', 'error');
                    return;
                }
                if (data.situacao === 'nenhum') {
                    playBeep(false);
                    setStatus(fromManual ? 'Código não encontrado' : 'Peça não encontrada', 'error');
                    showNothing(data);
                    return;
                }
                if (data.situacao === 'escolher') {
                    playBeep(true);
                    setStatus('Escolha a peça', '');
                    showChoices(data.produtos, (produto) => usePart(produto));
                    return;
                }
                playBeep(true);
                await usePart(data.produtos[0]);
            } catch (err) {
                playBeep(false);
                setStatus(err.message === 'Failed to fetch' ? 'Erro de conexão com o computador' : err.message, 'error');
            } finally {
                isProcessing = false;
            }
        }

        async function usePart(produto) {
            const item = { id: produto.id, nome: produto.nome, codigo: produto.codigo_lido, total: produto.total, locais: produto.locais };
            setStatus(`Lido: ${produto.codigo_lido || '#' + produto.id}`, 'ok');
            if (mode === 'inventario') {
                await countInventory(item, 1);
                return;
            }
            countTally(item, 1);
            // A leitura tambem vai para a tela aberta no computador (busca, lote).
            api('/barcode', { code: `CI-${produto.id}` }).catch(() => setStatus('Contado aqui, mas o computador não recebeu', 'error'));
        }

        async function handleNfe(codes) {
            const data = await api('/ler', { codigos: codes });
            if (!data.chave) {
                playBeep(false);
                setStatus('Não achei a chave da NF-e nessa foto', 'error');
                showResult([
                    el('div', 'result-name', 'Fotografe o código de barras grande da DANFE'),
                    el('div', 'note', 'É o que fica logo acima da chave de acesso (44 números). Se não ler, digite a chave no campo acima.'),
                ]);
                return;
            }
            const sent = await api('/barcode', { code: data.chave });
            playBeep(true);
            setStatus('Nota aberta no computador', 'ok');
            notes.unshift({ texto: sent.display_name || data.chave, hora: nowTime() });
            saveLists();
            renderList('n0');
            showResult([
                el('div', 'result-name', sent.display_name || 'NF-e'),
                el('div', 'note', 'A nota abriu no computador. Confira os itens lá e confirme a entrada ou a saída.'),
            ]);
        }

        $('manual-form').addEventListener('submit', (event) => {
            event.preventDefault();
            const value = $('manual-input').value.trim();
            if (!value) return;
            $('manual-input').value = '';
            $('manual-input').blur();
            handleCodes([value], true);
        });

        // ---------- Foto: le TODOS os codigos de barras ----------
        $('photo-input').addEventListener('change', async (event) => {
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
                const codes = decodeAllInPhoto(img);
                if (codes.length) {
                    await handleCodes(codes, false);
                } else {
                    playBeep(false);
                    setStatus('Não achei código de barras na foto. Tente de novo, com o celular parado e com luz.', 'error');
                }
            } catch (err) {
                setStatus('Não consegui abrir a foto. Tente de novo.', 'error');
            } finally {
                URL.revokeObjectURL(url);
                input.value = '';
            }
        });

        // A foto inteira da so um codigo; por isso a gente acha cada faixa com cara de codigo de
        // barras (varias linhas seguidas com barras no mesmo lugar) e le cada uma recortada, com
        // margem branca. Na DANFE as linhas do quadro ficam coladas no codigo.
        function decodeAllInPhoto(img) {
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
            const found = [];
            const add = (text) => {
                const value = String(text || '').trim();
                if (value && !found.includes(value)) found.push(value);
            };
            const scale = Math.min(1, 1400 / img.naturalWidth);
            const W = Math.round(img.naturalWidth * scale), H = Math.round(img.naturalHeight * scale);
            const c = document.createElement('canvas');
            c.width = W; c.height = H;
            const ctx = c.getContext('2d', { willReadFrequently: true });
            ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
            ctx.drawImage(img, 0, 0, W, H);
            add(decodeCanvas(c));
            // Foto inteira menor: as vezes so assim o leitor acha o codigo.
            const small = document.createElement('canvas');
            const ks = Math.min(1, 800 / img.naturalWidth);
            small.width = Math.round(img.naturalWidth * ks); small.height = Math.round(img.naturalHeight * ks);
            const sctx = small.getContext('2d');
            sctx.fillStyle = '#fff'; sctx.fillRect(0, 0, small.width, small.height);
            sctx.drawImage(img, 0, 0, small.width, small.height);
            add(decodeCanvas(small));
            const bands = findBarcodeBands(ctx.getImageData(0, 0, W, H), W, H);
            for (const box of bands) {
                for (const extra of [0.08, 0.02, 0.16]) {
                    // Recorta da foto original (barras finas se perdem na reducao), com margem branca.
                    const mx = Math.max(6, (box.x1 - box.x0) * extra), my = Math.max(3, (box.y1 - box.y0) * 0.15);
                    const x0 = Math.max(0, box.x0 - mx), x1 = Math.min(W, box.x1 + mx);
                    const y0 = Math.max(0, box.y0 - my), y1 = Math.min(H, box.y1 + my);
                    const sx = x0 / scale, sy = y0 / scale;
                    const sw = (x1 - x0) / scale, sh = (y1 - y0) / scale;
                    const k = Math.min(1, 2400 / sw);
                    const pad = 40;
                    const out = document.createElement('canvas');
                    out.width = Math.round(sw * k) + 2 * pad; out.height = Math.max(60, Math.round(sh * k)) + 2 * pad;
                    const octx = out.getContext('2d');
                                        octx.fillStyle = '#fff'; octx.fillRect(0, 0, out.width, out.height);
                    octx.drawImage(img, sx, sy, sw, sh, pad, pad, Math.round(sw * k), out.height - 2 * pad);
                    const text = decodeCanvas(out);
                    if (text) { add(text); break; }
                }
            }
            return found;
        }

        function findBarcodeBands(data, W, H) {
            const px = data.data;
            const gray = new Uint8Array(W * H);
            for (let i = 0; i < W * H; i++) {
                gray[i] = (px[4 * i] * 3 + px[4 * i + 1] * 6 + px[4 * i + 2]) / 10;
            }
            const GAP = Math.max(14, Math.round(W / 60)), MIN_LEN = Math.round(W / 14), MIN_TRANS = 18;
            // Por linha: todos os trechos com transicoes preto/branco proximas umas das outras
            // (na etiqueta Garrett, serie e modelo ficam lado a lado).
            const segmentsOf = (y) => {
                const segs = [];
                const row = y * W;
                let lo = 255, hi = 0;
                for (let x = 0; x < W; x++) { const g = gray[row + x]; if (g < lo) lo = g; if (g > hi) hi = g; }
                if (hi - lo < 60) return segs;
                const thr = (lo + hi) / 2;
                let prev = gray[row] < thr, segStart = -1, last = -1, count = 0;
                const close = () => {
                    if (segStart >= 0 && last - segStart >= MIN_LEN && count >= MIN_TRANS) segs.push({ x0: segStart, x1: last });
                };
                for (let x = 1; x < W; x++) {
                    const cur = gray[row + x] < thr;
                    if (cur === prev) continue;
                    prev = cur;
                    if (last >= 0 && x - last <= GAP) { count++; }
                    else { close(); segStart = x; count = 1; }
                    last = x;
                }
                close();
                return segs;
            };
            // Faixas: linhas seguidas com um trecho no mesmo lugar (barras sao verticais).
            const STEP = 2, TOL = Math.max(6, Math.round(W / 120));
            const open = [], bands = [];
            for (let y = 0; y < H; y += STEP) {
                for (const seg of segmentsOf(y)) {
                    const band = open.find((b) => y - b.y1 <= STEP * 2 && Math.abs(seg.x0 - b.lx0) <= TOL && Math.abs(seg.x1 - b.lx1) <= TOL);
                    if (band) {
                        band.y1 = y; band.rows++; band.lx0 = seg.x0; band.lx1 = seg.x1;
                        band.x0 = Math.min(band.x0, seg.x0); band.x1 = Math.max(band.x1, seg.x1);
                    } else {
                        open.push({ x0: seg.x0, x1: seg.x1, lx0: seg.x0, lx1: seg.x1, y0: y, y1: y, rows: 1 });
                    }
                }
                for (let i = open.length - 1; i >= 0; i--) {
                    if (y - open[i].y1 > STEP * 2) {
                        if (open[i].rows >= 5) bands.push(open[i]);
                        open.splice(i, 1);
                    }
                }
            }
            open.forEach((b) => { if (b.rows >= 5) bands.push(b); });
            // De cima para baixo, como se le uma etiqueta.
            bands.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
            return bands.slice(0, 14).map((b) => ({ x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1 }));
        }

        // ---------- Inicio ----------
        const startBtn = $('start-btn');
        if (!window.isSecureContext) startBtn.textContent = 'COMEÇAR';
        startBtn.addEventListener('click', () => {
            // Com o bipe ligado, o toque no botao destrava o som (iOS).
            if (beepOn) ensureAudio();
            $('start-overlay').style.display = 'none';
            $('photo-mode').style.display = 'block';
            setMode(mode);
            if (!window.isSecureContext) return;
            // Com https a camera ao vivo tambem funciona (le um codigo por vez).
            $('reader').style.display = 'block';
            const scanner = new Html5QrcodeScanner('reader', {
                fps: 10,
                qrbox: (w, h) => ({ width: Math.floor(w * 0.9), height: Math.max(80, Math.floor(Math.min(h * 0.4, 180))) }),
                aspectRatio: 1.0,
                experimentalFeatures: { useBarCodeDetectorIfSupported: true },
            });
            let lastLive = '';
            scanner.render((text) => {
                if (text === lastLive) return;
                lastLive = text;
                setTimeout(() => { lastLive = ''; }, 2500);
                handleCodes([text], false);
            });
        });
        setMode(mode);
    </script>
</body>
</html>
"""
