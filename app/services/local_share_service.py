from __future__ import annotations

import json
import socket
import threading
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlparse

import requests

from core.constants import APP_VERSION
from core.exceptions import FileOperationException, ValidationException
from core.utils.file_utils import FileUtils


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
    _default_port = 8765

    _server_lock = threading.Lock()
    _server: ThreadingHTTPServer | None = None
    _server_thread: threading.Thread | None = None
    _server_context: dict[str, Any] = {
        "machine_label": "maquina-local",
        "publisher_name": "",
        "port": _default_port,
    }

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

    def start_server(self, machine_label: str, publisher_name: str, port: int) -> dict[str, Any]:
        normalized_port = self.normalize_port(port)
        context = {
            "machine_label": str(machine_label or "").strip() or "maquina-local",
            "publisher_name": str(publisher_name or "").strip(),
            "port": normalized_port,
        }

        with self._server_lock:
            if self._server is not None:
                current_port = int(self._server_context.get("port") or self._default_port)
                if current_port != normalized_port:
                    self._stop_locked()
                else:
                    self._server_context = context
                    return self.get_server_status(
                        machine_label=context["machine_label"],
                        publisher_name=context["publisher_name"],
                        port=normalized_port,
                        enabled=True,
                    )

            handler = self._build_handler(context)
            try:
                httpd = ThreadingHTTPServer(("0.0.0.0", normalized_port), handler)
            except OSError as exc:
                raise FileOperationException(
                    f"Nao foi possivel iniciar o servidor local na porta {normalized_port}: {exc}"
                ) from exc

            self._server = httpd
            self._server_context = context
            self._server_thread = threading.Thread(
                target=httpd.serve_forever,
                name="chronos-local-share-server",
                daemon=True,
            )
            self._server_thread.start()

        return self.get_server_status(
            machine_label=context["machine_label"],
            publisher_name=context["publisher_name"],
            port=normalized_port,
            enabled=True,
        )

    def stop_server(self) -> None:
        with self._server_lock:
            self._stop_locked()

    def _stop_locked(self) -> None:
        if self._server is not None:
            try:
                self._server.shutdown()
            finally:
                self._server.server_close()
        self._server = None
        self._server_thread = None

    def ensure_started_if_enabled(self, *, enabled: bool, machine_label: str, publisher_name: str, port: int) -> None:
        if not enabled:
            self.stop_server()
            return
        self.start_server(machine_label=machine_label, publisher_name=publisher_name, port=port)

    def is_running(self) -> bool:
        with self._server_lock:
            return self._server is not None

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
            raise ValidationException("Porta do servidor local invalida.") from exc

        if value < 1024 or value > 65535:
            raise ValidationException("Use uma porta entre 1024 e 65535 para o servidor local.")
        return value

    def normalize_server_url(self, raw_url: Optional[str]) -> str:
        value = str(raw_url or "").strip()
        if not value:
            raise ValidationException("Informe o endereco do servidor remoto.")
        if "://" not in value:
            value = f"http://{value}"

        parsed = urlparse(value)
        if parsed.scheme not in {"http", "https"}:
            raise ValidationException("Use um endereco HTTP ou HTTPS valido para o servidor remoto.")
        if not parsed.netloc:
            raise ValidationException("Endereco do servidor remoto invalido.")
        return value.rstrip("/")

    def fetch_remote_status(self, server_url: str) -> dict[str, Any]:
        url = f"{self.normalize_server_url(server_url)}/health"
        try:
            response = requests.get(url, timeout=5)
        except requests.RequestException as exc:
            raise ValidationException(f"Nao foi possivel conectar ao servidor remoto: {exc}") from exc

        if response.status_code != HTTPStatus.OK:
            raise ValidationException(
                f"Servidor remoto respondeu {response.status_code} ao consultar status."
            )

        try:
            payload = response.json()
        except Exception as exc:
            raise ValidationException(f"Resposta invalida do servidor remoto: {exc}") from exc

        if not isinstance(payload, dict):
            raise ValidationException("Resposta invalida do servidor remoto.")
        payload["server_url"] = self.normalize_server_url(server_url)
        return payload

    def fetch_remote_manifest(self, server_url: str, kind: str) -> dict[str, Any]:
        normalized_kind = self._normalize_kind(kind)
        url = f"{self.normalize_server_url(server_url)}/{normalized_kind}/manifest"
        try:
            response = requests.get(url, timeout=10)
        except requests.RequestException as exc:
            raise ValidationException(f"Nao foi possivel consultar o manifesto remoto: {exc}") from exc

        if response.status_code == HTTPStatus.NOT_FOUND:
            raise ValidationException("O servidor remoto ainda nao publicou essa base.")
        if response.status_code != HTTPStatus.OK:
            raise ValidationException(
                f"Servidor remoto respondeu {response.status_code} ao consultar o manifesto."
            )

        try:
            payload = response.json()
        except Exception as exc:
            raise ValidationException(f"Manifesto remoto invalido: {exc}") from exc

        if not isinstance(payload, dict):
            raise ValidationException("Manifesto remoto invalido.")
        return payload

    def download_remote_snapshot(self, server_url: str, kind: str, target_path: str) -> str:
        normalized_kind = self._normalize_kind(kind)
        url = f"{self.normalize_server_url(server_url)}/{normalized_kind}/download"
        try:
            response = requests.get(url, timeout=60, stream=True)
        except requests.RequestException as exc:
            raise ValidationException(f"Nao foi possivel baixar a base remota: {exc}") from exc

        if response.status_code == HTTPStatus.NOT_FOUND:
            raise ValidationException("O servidor remoto ainda nao publicou essa base.")
        if response.status_code != HTTPStatus.OK:
            raise ValidationException(
                f"Servidor remoto respondeu {response.status_code} ao baixar a base."
            )

        Path(target_path).parent.mkdir(parents=True, exist_ok=True)
        try:
            with open(target_path, "wb") as file_obj:
                for chunk in response.iter_content(chunk_size=1024 * 1024):
                    if chunk:
                        file_obj.write(chunk)
        except Exception as exc:
            raise FileOperationException(f"Nao foi possivel salvar a base remota: {exc}") from exc

        return target_path

    def _normalize_kind(self, kind: str) -> str:
        value = str(kind or "").strip().lower()
        if value not in {"official", "compare"}:
            raise ValidationException("Tipo de snapshot invalido.")
        return value

    def _build_handler(self, context: dict[str, Any]) -> type[BaseHTTPRequestHandler]:
        service = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self) -> None:  # noqa: N802
                parsed = urlparse(self.path)
                path = parsed.path.rstrip("/") or "/"

                if path == "/health":
                    service._send_json(
                        self,
                        {
                            "status": "ok",
                            "app_version": APP_VERSION,
                            "machine_label": context["machine_label"],
                            "publisher_name": context["publisher_name"],
                            "server_port": context["port"],
                            "official_available": Path(service.get_official_paths()["latest_manifest"]).is_file(),
                            "compare_available": Path(service.get_compare_paths()["latest_manifest"]).is_file(),
                        },
                    )
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

    def _send_json(self, handler: BaseHTTPRequestHandler, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        handler.send_response(HTTPStatus.OK)
        handler.send_header("Content-Type", "application/json; charset=utf-8")
        handler.send_header("Content-Length", str(len(body)))
        handler.end_headers()
        handler.wfile.write(body)

    def _send_file(self, handler: BaseHTTPRequestHandler, path: str, content_type: str) -> None:
        file_path = Path(path)
        if not file_path.is_file():
            handler.send_error(HTTPStatus.NOT_FOUND, "Arquivo nao encontrado")
            return

        data = file_path.read_bytes()
        handler.send_response(HTTPStatus.OK)
        handler.send_header("Content-Type", content_type)
        handler.send_header("Content-Length", str(len(data)))
        handler.send_header("Content-Disposition", f'attachment; filename="{file_path.name}"')
        handler.end_headers()
        handler.wfile.write(data)
