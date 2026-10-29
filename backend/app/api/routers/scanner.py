from fastapi import APIRouter, Header, HTTPException, Request, WebSocket, WebSocketDisconnect, Depends
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
from app.services.inventory_service import InventoryService
from app.services.inventory_types import INVENTORY_STATUS_ABERTO
from app.services.label_reader_service import LabelReaderService
from app.services.stock_service import StockService
from backend.app.api.deps import get_inventory_service, get_stock_service
from backend.app.api.routers.scanner_page import SCANNER_PAGE
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


class ReadPayload(BaseModel):
    """Todos os codigos de barras achados numa foto."""

    codigos: list[str] = Field(default_factory=list, max_length=40)


class PhoneCountPayload(BaseModel):
    produto_id: int
    delta: int | None = Field(default=None, ge=-1000, le=1000)
    quantidade: int | None = Field(default=None, ge=0, le=100000)


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

def require_pairing(
    request: Request,
    pareamento: str | None = Header(default=None, alias=PAIRING_HEADER),
) -> None:
    client_host = request.client.host if request.client else None
    if not _is_loopback(client_host) and not secrets.compare_digest(pareamento or "", pairing_code()):
        raise HTTPException(
            status_code=403,
            detail="Celular não pareado. Leia de novo o QR code na tela do computador.",
        )


async def _broadcast(message: dict) -> None:
    disconnected = []
    for ws in connected_desktops:
        try:
            await ws.send_json(message)
        except Exception:
            disconnected.append(ws)
    for ws in disconnected:
        if ws in connected_desktops:
            connected_desktops.remove(ws)


@router.get("/app", response_class=HTMLResponse)
def get_scanner_app():
    """Retorna o aplicativo web HTML/JS para o celular"""
    return SCANNER_PAGE


@router.post("/ler", dependencies=[Depends(require_pairing)])
def read_label(payload: ReadPayload, stock_service: StockService = Depends(get_stock_service)):
    """Escolhe, entre os codigos de barras da foto, o da peca (ou a chave da NF-e)."""
    result = LabelReaderService().resolve(payload.codigos)
    for produto in result.get("produtos", []):
        saldo = _stock_lookup(stock_service, f"CI-{produto['id']}")
        produto["total"] = saldo[0]["total"] if saldo else 0
        produto["locais"] = saldo[0]["locais"] if saldo else []
    return result


@router.get("/inventario/sessoes", dependencies=[Depends(require_pairing)])
def open_inventory_sessions(inventory_service: InventoryService = Depends(get_inventory_service)):
    """Sessoes de inventario abertas, para o modo Inventario do celular."""
    sessions = inventory_service.list_sessions(limit=50, offset=0)
    return [
        {
            "id": session.id,
            "nome": session.nome,
            "local": session.local,
            "total_items": session.to_count_items,
            "counted_items": session.counted_items,
        }
        for session in sessions
        if str(session.status).upper() == INVENTORY_STATUS_ABERTO
    ]


@router.post("/inventario/{session_id}/contar", dependencies=[Depends(require_pairing)])
async def count_from_phone(
    session_id: int,
    payload: PhoneCountPayload,
    inventory_service: InventoryService = Depends(get_inventory_service),
):
    """Soma (+1/-1) ou define a contagem de uma peca na sessao, direto do celular."""
    if payload.delta is None and payload.quantidade is None:
        raise HTTPException(status_code=422, detail="Informe delta ou quantidade.")
    item = inventory_service.count_one(
        session_id, payload.produto_id, delta=payload.delta, quantidade=payload.quantidade
    )
    session = inventory_service.get_session(session_id)
    item["contados"] = session.counted_items
    item["total_itens"] = session.to_count_items
    # A tela de Inventario aberta no computador se atualiza sozinha.
    await _broadcast({"inventario": session_id, "produto_id": payload.produto_id, "qtd_fisico": item["qtd_fisico"]})
    return item


@router.post("/barcode", dependencies=[Depends(require_pairing)])
async def receive_barcode(
    payload: BarcodePayload,
    stock_service: StockService = Depends(get_stock_service),
):
    """Recebe o código de barras do celular e dispara via WebSocket para o Desktop"""

    # Buscar nome do produto para o histórico do celular
    display_name = payload.code
    code_upper = payload.code.upper()
    
    from core.nfe_xml import chave_from_code, chave_numero

    chave = chave_from_code(payload.code)
    try:
        if chave:
            serie, numero = chave_numero(chave)
            display_name = f"NF-e {numero} (série {serie})"
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

    await _broadcast({"code": payload.code})

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
