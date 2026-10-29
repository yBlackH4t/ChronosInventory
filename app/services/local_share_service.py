from __future__ import annotations

import hmac
import json
import logging
import os
import shutil
import socket
import threading
import time
from collections import deque
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlparse

import requests

from core.constants import APP_VERSION
from core.exceptions import FileOperationException, ValidationException
from core.utils.file_utils import FileUtils

LOG = logging.getLogger(__name__)

# Senha do servidor local (Backup > Base oficial), a mesma em todas as maquinas da empresa.
# O servidor so liga com senha (sem ela, qualquer aparelho do Wi-Fi baixaria o banco inteiro).
TOKEN_HEADER = "X-Chronos-Senha"
MAX_PROPOSAL_BYTES = 4096  # "Sugerir ao admin" (POST /proposals): uma regra curta
MISSING_TOKEN_MESSAGE = "Defina uma senha para publicar a base."
BLOCKED_MESSAGE = (
    "A maquina publicadora recusou esta maquina por alguns minutos depois de varias senhas erradas. "
    "Confira a senha do servidor (Backup > Base oficial) e tente de novo em 5 minutos."
)
# Bloqueio por IP: 5 senhas erradas em 5 minutos -> 5 minutos recusado.
MAX_AUTH_FAILURES = 5
AUTH_FAILURE_WINDOW_SECONDS = 300
AUTH_BLOCK_SECONDS = 300
# Sugestoes de outras maquinas: no maximo 20 por IP por hora.
MAX_PROPOSALS_PER_HOUR = 20
PROPOSAL_WINDOW_SECONDS = 3600
# Limites do download da base remota e do servidor.
MAX_SNAPSHOT_BYTES = 500 * 1024 * 1024
SNAPSHOT_TIMEOUT = (10, 60)  # conectar, esperar cada pedaco
SNAPSHOT_TOTAL_SECONDS = 30 * 60
SERVER_SOCKET_TIMEOUT_SECONDS = 30
WRONG_TOKEN_MESSAGE = (
    "O servidor da outra maquina pede senha, e a desta maquina nao confere. Use a mesma senha do "
    "servidor em todas as maquinas (Backup > Base oficial)."
)


def _whatsapp_robot_active() -> bool:
    try:
        from app.services.whatsapp_service import WhatsAppService

        return WhatsAppService.instance().robot_active()
    except Exception:
        return False


class LocalShareService:
    _share_root_name = "local_share"
    _official_dirname = "official"
    _compare_dirname = "compare"
    _latest_dirname = "latest"
    _history_dirname = "historico"
    _official_zip_filename = "base_oficial.zip"
    _official_manifest_filename = "base_oficial.json"
    _compare_zip_filename = "compare_base.zip"
    _compare_manifest_filename = "compare_base.json"
    # Conhecimento do especialista (assistente de IA): um JSON pequeno, publicado a parte da base.
    _knowledge_dirname = "knowledge"
    _knowledge_filename = "conhecimento_assistente.json"
    _default_port = 8765

    _server_lock = threading.Lock()
    _server: ThreadingHTTPServer | None = None
    _server_thread: threading.Thread | None = None
    _server_context: dict[str, Any] = {
        "machine_label": "maquina-local",
        "publisher_name": "",
        "port": _default_port,
    }
    # Senhas erradas e sugestoes por IP (memoria do processo; zera ao reiniciar o app).
    _guard_lock = threading.Lock()
    _auth_failures: dict[str, deque] = {}
    _blocked_until: dict[str, float] = {}
    _proposals_by_ip: dict[str, deque] = {}

    def configured_token(self) -> str:
        """
        Senha do servidor desta maquina, lida do arquivo a cada uso: trocar a senha vale na hora,
        para o servidor e para as buscas em outras maquinas. Fica protegida no arquivo (DPAPI).
        """
        from app.services.official_base_config_store import read_server_token

        return read_server_token(FileUtils.get_official_base_config_path())

    def _auth_headers(self) -> dict[str, str]:
        token = self.configured_token()
        return {TOKEN_HEADER: token} if token else {}

    @staticmethod
    def _token_matches(expected: str, received: Optional[str]) -> bool:
        # Sem senha configurada, nada passa: o servidor nao fica aberto para a rede.
        if not expected:
            return False
        return hmac.compare_digest(expected.encode("utf-8"), str(received or "").encode("utf-8"))

    @classmethod
    def reset_guards(cls) -> None:
        with cls._guard_lock:
            cls._auth_failures.clear()
            cls._blocked_until.clear()
            cls._proposals_by_ip.clear()

    @classmethod
    def _is_blocked(cls, ip: str, now: Optional[float] = None) -> bool:
        now = time.monotonic() if now is None else now
        with cls._guard_lock:
            until = cls._blocked_until.get(ip)
            if until is None:
                return False
            if now >= until:
                cls._blocked_until.pop(ip, None)
                return False
            return True

    @classmethod
    def _register_auth_failure(cls, ip: str, now: Optional[float] = None) -> None:
        now = time.monotonic() if now is None else now
        with cls._guard_lock:
            failures = cls._auth_failures.setdefault(ip, deque())
            failures.append(now)
            while failures and now - failures[0] > AUTH_FAILURE_WINDOW_SECONDS:
                failures.popleft()
            if len(failures) >= MAX_AUTH_FAILURES:
                cls._blocked_until[ip] = now + AUTH_BLOCK_SECONDS
                failures.clear()
                LOG.warning("servidor local: IP %s bloqueado por senhas erradas", ip)

    @classmethod
    def _allow_proposal(cls, ip: str, now: Optional[float] = None) -> bool:
        now = time.monotonic() if now is None else now
        with cls._guard_lock:
            sent = cls._proposals_by_ip.setdefault(ip, deque())
            while sent and now - sent[0] > PROPOSAL_WINDOW_SECONDS:
                sent.popleft()
            if len(sent) >= MAX_PROPOSALS_PER_HOUR:
                return False
            sent.append(now)
            return True

    def get_storage_root(self) -> str:
        root = Path(FileUtils.get_app_root_directory()) / self._share_root_name
        root.mkdir(parents=True, exist_ok=True)
        return str(root)

    def get_official_paths(self) -> dict[str, str]:
        root = Path(self.get_storage_root()) / self._official_dirname
        latest_dir = root / self._latest_dirname
        history_dir = root / self._history_dirname
        return {
            "root": str(root),
            "latest_dir": str(latest_dir),
            "history_dir": str(history_dir),
            "latest_zip": str(latest_dir / self._official_zip_filename),
            "latest_manifest": str(latest_dir / self._official_manifest_filename),
        }

    def get_compare_paths(self) -> dict[str, str]:
        root = Path(self.get_storage_root()) / self._compare_dirname
        latest_dir = root / self._latest_dirname
        history_dir = root / self._history_dirname
        return {
            "root": str(root),
            "latest_dir": str(latest_dir),
            "history_dir": str(history_dir),
            "latest_zip": str(latest_dir / self._compare_zip_filename),
            "latest_manifest": str(latest_dir / self._compare_manifest_filename),
        }

    def get_knowledge_path(self) -> str:
        return str(Path(self.get_storage_root()) / self._knowledge_dirname / self._latest_dirname / self._knowledge_filename)

    def fetch_remote_knowledge(self, server_url: str) -> dict[str, Any]:
        """Conhecimento do assistente publicado pela maquina publicadora (rota /knowledge)."""
        url = f"{self.normalize_server_url(server_url)}/knowledge"
        try:
            response = requests.get(url, timeout=10, headers=self._auth_headers())
        except requests.RequestException as exc:
            raise ValidationException(f"Não foi possível conectar a máquina publicadora: {exc}") from exc
        self._raise_for_auth(response)
        if response.status_code == HTTPStatus.NOT_FOUND:
            raise ValidationException("A máquina publicadora ainda não publicou o conhecimento do assistente.")
        if response.status_code != HTTPStatus.OK:
            raise ValidationException(f"A máquina publicadora respondeu {response.status_code} ao enviar o conhecimento.")
        try:
            payload = response.json()
        except Exception as exc:
            raise ValidationException(f"Conhecimento recebido inválido: {exc}") from exc
        if not isinstance(payload, dict):
            raise ValidationException("Conhecimento recebido inválido.")
        return payload

    def send_remote_proposal(self, server_url: str, proposal: dict[str, Any]) -> dict[str, Any]:
        """"Sugerir ao admin": entrega a proposta a maquina publicadora (rota /proposals)."""
        url = f"{self.normalize_server_url(server_url)}/proposals"
        try:
            response = requests.post(url, json=proposal, timeout=10, headers=self._auth_headers())
        except requests.RequestException as exc:
            raise ValidationException(f"Não foi possível conectar a máquina publicadora: {exc}") from exc
        if response.status_code == HTTPStatus.UNAUTHORIZED:
            raise ValidationException(WRONG_TOKEN_MESSAGE)
        if response.status_code == HTTPStatus.NOT_FOUND:
            raise ValidationException(
                "A máquina publicadora ainda não recebe sugestoes: atualize o Chronos dela para a versão 2.4.2 ou mais nova."
            )
        try:
            payload = response.json()
        except Exception:
            payload = {}
        if response.status_code != HTTPStatus.OK:
            message = payload.get("erro") if isinstance(payload, dict) else None
            raise ValidationException(message or f"A máquina publicadora respondeu {response.status_code}.")
        return payload if isinstance(payload, dict) else {}

    def start_server(self, machine_label: str, publisher_name: str, port: int) -> dict[str, Any]:
        cls = type(self)
        normalized_port = self.normalize_port(port)
        if not self.configured_token():
            raise ValidationException(MISSING_TOKEN_MESSAGE)
        context = {
            "machine_label": str(machine_label or "").strip() or "maquina-local",
            "publisher_name": str(publisher_name or "").strip(),
            "port": normalized_port,
        }

        with cls._server_lock:
            if cls._server is not None:
                current_port = int(cls._server_context.get("port") or self._default_port)
                if current_port != normalized_port:
                    self._stop_locked()
                else:
                    cls._server_context = context
                    return self.get_server_status(
                        machine_label=context["machine_label"],
                        publisher_name=context["publisher_name"],
                        port=normalized_port,
                        enabled=True,
                    )

            handler = self._build_handler(context)
            try:
                httpd = _GuardedHTTPServer(("0.0.0.0", normalized_port), handler)
            except OSError as exc:
                raise FileOperationException(
                    f"Não foi possível iniciar o servidor local na porta {normalized_port}: {exc}"
                ) from exc

            cls._server = httpd
            cls._server_context = context
            cls._server_thread = threading.Thread(
                target=httpd.serve_forever,
                name="chronos-local-share-server",
                daemon=True,
            )
            cls._server_thread.start()

        return self.get_server_status(
            machine_label=context["machine_label"],
            publisher_name=context["publisher_name"],
            port=normalized_port,
            enabled=True,
        )

    def stop_server(self) -> None:
        with type(self)._server_lock:
            self._stop_locked()

    def _stop_locked(self) -> None:
        cls = type(self)
        if cls._server is not None:
            try:
                cls._server.shutdown()
            finally:
                cls._server.server_close()
        cls._server = None
        cls._server_thread = None

    def ensure_started_if_enabled(self, *, enabled: bool, machine_label: str, publisher_name: str, port: int) -> None:
        if not enabled:
            self.stop_server()
            return
        try:
            self.start_server(machine_label=machine_label, publisher_name=publisher_name, port=port)
        except ValidationException as exc:
            # Ex.: servidor ligado numa versao antiga, sem senha. O app abre; o servidor fica desligado.
            LOG.warning("servidor local nao iniciado: %s", exc)

    def is_running(self) -> bool:
        cls = type(self)
        with cls._server_lock:
            return cls._server is not None

    def get_server_status(
        self,
        *,
        machine_label: str,
        publisher_name: str,
        port: int,
        enabled: bool,
    ) -> dict[str, Any]:
        normalized_port = self.normalize_port(port)
        return {
            "enabled": bool(enabled),
            "running": self.is_running(),
            "port": normalized_port,
            "urls": self.get_candidate_urls(normalized_port),
            "machine_label": machine_label,
            "publisher_name": publisher_name or None,
        }

    def get_candidate_urls(self, port: int) -> list[str]:
        urls: list[str] = []
        seen: set[str] = set()

        def add(host: str) -> None:
            candidate = f"http://{host}:{port}"
            if candidate not in seen:
                seen.add(candidate)
                urls.append(candidate)

        add("127.0.0.1")
        hostname = socket.gethostname().strip()
        if hostname:
            add(hostname)

        try:
            for item in socket.gethostbyname_ex(hostname)[2]:
                if item and not item.startswith("127."):
                    add(item)
        except Exception:
            pass

        try:
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
                sock.connect(("8.8.8.8", 80))
                ip = sock.getsockname()[0]
                if ip and not ip.startswith("127."):
                    add(ip)
        except Exception:
            pass

        return urls

    def normalize_port(self, port: int | str | None) -> int:
        try:
            value = int(port or self._default_port)
        except (TypeError, ValueError) as exc:
            raise ValidationException("Porta do servidor local inválida.") from exc

        if value < 1024 or value > 65535:
            raise ValidationException("Use uma porta entre 1024 e 65535 para o servidor local.")
        return value

    def normalize_server_url(self, raw_url: Optional[str]) -> str:
        value = str(raw_url or "").strip()
        if not value:
            raise ValidationException("Informe o endereço do servidor remoto.")
        if "://" not in value:
            value = f"http://{value}"

        parsed = urlparse(value)
        if parsed.scheme not in {"http", "https"}:
            raise ValidationException("Use um endereço HTTP ou HTTPS válido para o servidor remoto.")
        if not parsed.netloc:
            raise ValidationException("Endereço do servidor remoto inválido.")
        return value.rstrip("/")

    def fetch_remote_status(self, server_url: str) -> dict[str, Any]:
        url = f"{self.normalize_server_url(server_url)}/health"
        try:
            response = requests.get(url, timeout=5, headers=self._auth_headers())
        except requests.RequestException as exc:
            raise ValidationException(f"Não foi possível conectar ao servidor remoto: {exc}") from exc

        self._raise_for_auth(response)
        if response.status_code != HTTPStatus.OK:
            raise ValidationException(
                f"Servidor remoto respondeu {response.status_code} ao consultar status."
            )

        try:
            payload = response.json()
        except Exception as exc:
            raise ValidationException(f"Resposta inválida do servidor remoto: {exc}") from exc

        if not isinstance(payload, dict):
            raise ValidationException("Resposta inválida do servidor remoto.")
        # senha_ok False: publicadora de versao antiga. Senha exigida e nenhuma aqui: tambem nao entra.
        if payload.get("senha_ok") is False or (payload.get("senha_exigida") and not self.configured_token()):
            raise ValidationException(WRONG_TOKEN_MESSAGE)
        payload["server_url"] = self.normalize_server_url(server_url)
        return payload

    def fetch_remote_manifest(self, server_url: str, kind: str) -> dict[str, Any]:
        normalized_kind = self._normalize_kind(kind)
        url = f"{self.normalize_server_url(server_url)}/{normalized_kind}/manifest"
        try:
            response = requests.get(url, timeout=10, headers=self._auth_headers())
        except requests.RequestException as exc:
            raise ValidationException(f"Não foi possível consultar o manifesto remoto: {exc}") from exc

        self._raise_for_auth(response)
        if response.status_code == HTTPStatus.NOT_FOUND:
            raise ValidationException("O servidor remoto ainda não publicou essa base.")
        if response.status_code != HTTPStatus.OK:
            raise ValidationException(
                f"Servidor remoto respondeu {response.status_code} ao consultar o manifesto."
            )

        try:
            payload = response.json()
        except Exception as exc:
            raise ValidationException(f"Manifesto remoto inválido: {exc}") from exc

        if not isinstance(payload, dict):
            raise ValidationException("Manifesto remoto inválido.")
        return payload

    def download_remote_snapshot(self, server_url: str, kind: str, target_path: str) -> str:
        normalized_kind = self._normalize_kind(kind)
        url = f"{self.normalize_server_url(server_url)}/{normalized_kind}/download"
        try:
            response = requests.get(url, timeout=SNAPSHOT_TIMEOUT, stream=True, headers=self._auth_headers())
        except requests.RequestException as exc:
            raise ValidationException(f"Não foi possível baixar a base remota: {exc}") from exc

        with response:
            self._raise_for_auth(response)
            if response.status_code == HTTPStatus.NOT_FOUND:
                raise ValidationException("O servidor remoto ainda não publicou essa base.")
            if response.status_code != HTTPStatus.OK:
                raise ValidationException(
                    f"Servidor remoto respondeu {response.status_code} ao baixar a base."
                )
            too_big = ValidationException(
                f"A base remota passa de {MAX_SNAPSHOT_BYTES // (1024 * 1024)} MB; o download foi cancelado."
            )
            try:
                declared = int(response.headers.get("Content-Length") or 0)
            except ValueError:
                declared = 0
            if declared > MAX_SNAPSHOT_BYTES:
                raise too_big

            Path(target_path).parent.mkdir(parents=True, exist_ok=True)
            deadline = time.monotonic() + SNAPSHOT_TOTAL_SECONDS
            written = 0
            try:
                with open(target_path, "wb") as file_obj:
                    for chunk in response.iter_content(chunk_size=1024 * 1024):
                        if not chunk:
                            continue
                        written += len(chunk)
                        if written > MAX_SNAPSHOT_BYTES:
                            raise too_big
                        if time.monotonic() > deadline:
                            raise ValidationException("O download da base remota demorou demais e foi cancelado.")
                        file_obj.write(chunk)
            except ValidationException:
                self._remove_partial(target_path)
                raise
            except Exception as exc:
                self._remove_partial(target_path)
                raise FileOperationException(f"Não foi possível salvar a base remota: {exc}") from exc

        return target_path

    @staticmethod
    def _remove_partial(path: str) -> None:
        try:
            os.remove(path)
        except OSError:
            pass

    @staticmethod
    def _raise_for_auth(response: Any) -> None:
        if response.status_code == HTTPStatus.UNAUTHORIZED:
            raise ValidationException(WRONG_TOKEN_MESSAGE)
        if response.status_code == HTTPStatus.TOO_MANY_REQUESTS:
            raise ValidationException(BLOCKED_MESSAGE)

    def _normalize_kind(self, kind: str) -> str:
        value = str(kind or "").strip().lower()
        if value not in {"official", "compare"}:
            raise ValidationException("Tipo de cópia inválido.")
        return value

    def _build_handler(self, context: dict[str, Any]) -> type[BaseHTTPRequestHandler]:
        service = self

        class Handler(BaseHTTPRequestHandler):
            # Conexao parada (cliente lento ou mal-intencionado) nao prende uma thread para sempre.
            timeout = SERVER_SOCKET_TIMEOUT_SECONDS

            def _check_auth(self, *, optional: bool = False) -> Optional[bool]:
                """
                True: senha certa. None: sem senha e `optional` (so no /health). False: ja respondeu
                401 (senha errada ou ausente) ou 429 (IP bloqueado por senhas erradas).
                """
                ip = str(self.client_address[0])
                if service._is_blocked(ip):
                    service._send_json(self, {"erro": "bloqueado"}, HTTPStatus.TOO_MANY_REQUESTS)
                    return False
                received = self.headers.get(TOKEN_HEADER)
                if received is None and optional:
                    return None
                if service._token_matches(service.configured_token(), received):
                    return True
                if received is not None:
                    service._register_auth_failure(ip)
                service._send_json(self, {"erro": "senha_invalida"}, HTTPStatus.UNAUTHORIZED)
                return False

            def do_GET(self) -> None:  # noqa: N802
                parsed = urlparse(self.path)
                path = parsed.path.rstrip("/") or "/"

                if path == "/health":
                    # Aberto (serve para testar a conexao), mas sem nada do estoque. Quem nao mandou
                    # senha nao fica sabendo se acertaria; senha errada recebe 401 (e conta no bloqueio).
                    auth = self._check_auth(optional=True)
                    if auth is False:
                        return
                    payload = {
                        "status": "ok",
                        "app_version": APP_VERSION,
                        "machine_label": context["machine_label"],
                        "publisher_name": context["publisher_name"],
                        "server_port": context["port"],
                        "senha_exigida": True,
                        "official_available": Path(service.get_official_paths()["latest_manifest"]).is_file(),
                        "compare_available": Path(service.get_compare_paths()["latest_manifest"]).is_file(),
                        "knowledge_available": Path(service.get_knowledge_path()).is_file(),
                        # O PC reserva do robo do WhatsApp so responde quando este diz False.
                        "whatsapp_robo": _whatsapp_robot_active(),
                    }
                    if auth is True:
                        payload["senha_ok"] = True
                    service._send_json(self, payload)
                    return

                if not self._check_auth():
                    return

                if path == "/knowledge":
                    service._send_json_file(self, service.get_knowledge_path())
                    return

                if path == "/official/manifest":
                    service._send_json_file(self, service.get_official_paths()["latest_manifest"])
                    return

                if path == "/official/download":
                    service._send_file(
                        self,
                        service.get_official_paths()["latest_zip"],
                        "application/zip",
                    )
                    return

                if path == "/compare/manifest":
                    service._send_json_file(self, service.get_compare_paths()["latest_manifest"])
                    return

                if path == "/compare/download":
                    service._send_file(
                        self,
                        service.get_compare_paths()["latest_zip"],
                        "application/zip",
                    )
                    return

                self.send_error(HTTPStatus.NOT_FOUND, "Rota nao encontrada")

            def do_POST(self) -> None:  # noqa: N802
                path = urlparse(self.path).path.rstrip("/") or "/"
                if path != "/proposals":
                    self.send_error(HTTPStatus.NOT_FOUND, "Rota nao encontrada")
                    return
                if not self._check_auth():
                    return
                try:
                    length = int(self.headers.get("Content-Length") or 0)
                except ValueError:
                    length = 0
                if length <= 0 or length > MAX_PROPOSAL_BYTES:
                    service._send_json(self, {"erro": "Sugestão vazia ou grande demais."}, HTTPStatus.BAD_REQUEST)
                    return
                ip = str(self.client_address[0])
                if not service._allow_proposal(ip):
                    service._send_json(
                        self,
                        {"erro": "Sugestões demais desta máquina na última hora. Tente mais tarde."},
                        HTTPStatus.TOO_MANY_REQUESTS,
                    )
                    return
                try:
                    data = json.loads(self.rfile.read(length).decode("utf-8"))
                    if not isinstance(data, dict):
                        raise ValueError("Sugestão inválida.")
                    from app.services.assistant_proposal_service import AssistantProposalService

                    # O autor enviado pela rede nao e confiavel: vale o IP de quem mandou.
                    data = {**data, "autor": None}
                    proposal_id = AssistantProposalService().receive(data, default_author=f"PC {ip}")
                except (ValueError, ValidationException) as exc:
                    service._send_json(self, {"erro": str(exc)}, HTTPStatus.BAD_REQUEST)
                    return
                except Exception:
                    service._send_json(self, {"erro": "Falha ao gravar a sugestão."}, HTTPStatus.INTERNAL_SERVER_ERROR)
                    return
                service._send_json(self, {"id": proposal_id})

            def log_message(self, format: str, *args: Any) -> None:  # noqa: A003
                return

        return Handler

    def _send_json_file(self, handler: BaseHTTPRequestHandler, path: str) -> None:
        file_path = Path(path)
        if not file_path.is_file():
            handler.send_error(HTTPStatus.NOT_FOUND, "Manifesto nao encontrado")
            return

        try:
            content = json.loads(file_path.read_text(encoding="utf-8"))
        except Exception:
            handler.send_error(HTTPStatus.INTERNAL_SERVER_ERROR, "Manifesto invalido")
            return

        self._send_json(handler, content)

    def _send_json(
        self, handler: BaseHTTPRequestHandler, payload: dict[str, Any], status: HTTPStatus = HTTPStatus.OK
    ) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        handler.send_response(status)
        handler.send_header("Content-Type", "application/json; charset=utf-8")
        handler.send_header("Content-Length", str(len(body)))
        handler.end_headers()
        handler.wfile.write(body)

    def _send_file(self, handler: BaseHTTPRequestHandler, path: str, content_type: str) -> None:
        file_path = Path(path)
        if not file_path.is_file():
            handler.send_error(HTTPStatus.NOT_FOUND, "Arquivo nao encontrado")
            return

        with open(file_path, "rb") as source:
            size = os.fstat(source.fileno()).st_size
            handler.send_response(HTTPStatus.OK)
            handler.send_header("Content-Type", content_type)
            handler.send_header("Content-Length", str(size))
            handler.send_header("Content-Disposition", f'attachment; filename="{file_path.name}"')
            handler.end_headers()
            shutil.copyfileobj(source, handler.wfile, length=1024 * 1024)


class _GuardedHTTPServer(ThreadingHTTPServer):
    """Servidor da base oficial: threads daemon e sem esperar conexoes presas ao desligar."""

    daemon_threads = True
    block_on_close = False
