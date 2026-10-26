"""
Admin do assistente: quem pode ensinar a base de conhecimento e revisar o historico.

Regra combinada com o dono (docs/PLANO_IA.md): so na maquina publicadora da base
oficial (tela Backup > Base oficial > "Papel desta maquina": "Publica a base") e com senha. A senha
fica so como hash (PBKDF2) em assistente_config.json; o login devolve um token de
sessao guardado em memoria (some quando o backend reinicia).
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import re
import secrets
import threading
import time
from typing import Any, Callable, Dict, Optional

from app.services.assistant_config_store import AssistantConfigStore
from core.exceptions import ValidationException

LOG = logging.getLogger(__name__)

TOKEN_TTL_SECONDS = 8 * 3600
MIN_PASSWORD_LENGTH = 6
PBKDF2_ITERATIONS = 200_000
FAILED_LOGIN_DELAY_SECONDS = 0.5

# token -> momento em que expira (por processo do backend).
_SESSIONS: Dict[str, float] = {}

# PIN do WhatsApp (/aprovar 3 1234): 4 a 8 digitos, guardado so como hash na secao "admin".
PIN_KEY = "pin_whatsapp"
PIN_PATTERN = re.compile(r"^\d{4,8}$")
PIN_MAX_FAILURES = 5
PIN_FAILURE_WINDOW_SECONDS = 600
PIN_BLOCK_SECONDS = 600
_PIN_GUARD = {"falhas": [], "bloqueado_ate": 0.0}
_PIN_LOCK = threading.Lock()


class AdminRequiredError(Exception):
    """A acao exige o admin (maquina publicadora + login)."""


def _official_base_role() -> str:
    try:
        from app.services.official_base_service import OfficialBaseService

        return str(OfficialBaseService().config_store.load().get("role") or "")
    except Exception:  # sem configuracao de base oficial: nao e publicadora
        LOG.exception("assistente admin: nao foi possivel ler o papel da base oficial")
        return ""


def _hash_password(password: str, salt: str, iterations: int) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), iterations).hex()


class AssistantAdminService:
    def __init__(
        self,
        config_store: Optional[AssistantConfigStore] = None,
        role_reader: Optional[Callable[[], str]] = None,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self.config_store = config_store or AssistantConfigStore()
        self.role_reader = role_reader or _official_base_role
        self.sleep = sleep

    def is_publisher(self) -> bool:
        return self.role_reader() == "publisher"

    def status(self, token: Optional[str] = None) -> Dict[str, Any]:
        return {
            "maquina_publicadora": self.is_publisher(),
            "senha_definida": bool(self.config_store.load_admin().get("hash")),
            # Login vale em qualquer maquina (a senha e de cada uma); ensinar continua so na publicadora.
            "autenticado": self._valid_token(token),
            "pin_whatsapp_definido": self.has_whatsapp_pin(),
        }

    def set_password(self, nova: str, atual: Optional[str] = None) -> None:
        if len(nova or "") < MIN_PASSWORD_LENGTH:
            raise ValidationException(f"A senha precisa ter pelo menos {MIN_PASSWORD_LENGTH} caracteres.")
        admin = self.config_store.load_admin()
        if admin.get("hash") and not self._check(atual or "", admin):
            self.sleep(FAILED_LOGIN_DELAY_SECONDS)
            raise AdminRequiredError("Senha atual incorreta.")
        salt = secrets.token_hex(16)
        updated = {k: v for k, v in admin.items() if k == PIN_KEY}  # o PIN do WhatsApp continua
        updated.update({"salt": salt, "iteracoes": PBKDF2_ITERATIONS, "hash": _hash_password(nova, salt, PBKDF2_ITERATIONS)})
        self.config_store.save_admin(updated)
        _SESSIONS.clear()  # trocou a senha: todas as sessoes caem

    # ------------------------------------------------------------------
    # PIN do WhatsApp (/aprovar e /recusar)
    # ------------------------------------------------------------------

    def has_whatsapp_pin(self) -> bool:
        pin = self.config_store.load_admin().get(PIN_KEY)
        return isinstance(pin, dict) and bool(pin.get("hash"))

    def set_whatsapp_pin(self, pin: Optional[str]) -> None:
        """PIN de 4 a 8 digitos; None ou "" remove (aprovar pelo WhatsApp fica desligado)."""
        admin = self.config_store.load_admin()
        value = str(pin or "").strip()
        if not value:
            admin.pop(PIN_KEY, None)
        else:
            if not PIN_PATTERN.match(value):
                raise ValidationException("O PIN precisa ter de 4 a 8 números.")
            salt = secrets.token_hex(16)
            admin[PIN_KEY] = {
                "salt": salt,
                "iteracoes": PBKDF2_ITERATIONS,
                "hash": _hash_password(value, salt, PBKDF2_ITERATIONS),
            }
        self.config_store.save_admin(admin)
        with _PIN_LOCK:
            _PIN_GUARD["falhas"] = []
            _PIN_GUARD["bloqueado_ate"] = 0.0

    def check_whatsapp_pin(self, pin: Optional[str], now: Optional[float] = None) -> bool:
        """Confere o PIN. Depois de 5 erros em 10 min, recusa tudo por 10 min."""
        now = time.time() if now is None else now
        stored = self.config_store.load_admin().get(PIN_KEY)
        if not isinstance(stored, dict) or not stored.get("hash"):
            return False
        with _PIN_LOCK:
            if now < _PIN_GUARD["bloqueado_ate"]:
                return False
        if PIN_PATTERN.match(str(pin or "")) and self._check(str(pin), stored):
            return True
        self.sleep(FAILED_LOGIN_DELAY_SECONDS)
        with _PIN_LOCK:
            failures = [t for t in _PIN_GUARD["falhas"] if now - t <= PIN_FAILURE_WINDOW_SECONDS] + [now]
            if len(failures) >= PIN_MAX_FAILURES:
                _PIN_GUARD["bloqueado_ate"] = now + PIN_BLOCK_SECONDS
                failures = []
                LOG.warning("whatsapp: PIN errado varias vezes; aprovar pelo WhatsApp bloqueado por 10 min")
            _PIN_GUARD["falhas"] = failures
        return False

    @staticmethod
    def whatsapp_pin_blocked(now: Optional[float] = None) -> bool:
        now = time.time() if now is None else now
        with _PIN_LOCK:
            return now < _PIN_GUARD["bloqueado_ate"]

    def login(self, senha: str) -> Dict[str, Any]:
        admin = self.config_store.load_admin()
        if not admin.get("hash"):
            raise ValidationException("Defina a senha de admin primeiro.")
        if not self._check(senha or "", admin):
            self.sleep(FAILED_LOGIN_DELAY_SECONDS)
            raise AdminRequiredError("Senha incorreta.")
        token = secrets.token_urlsafe(32)
        expires = time.time() + TOKEN_TTL_SECONDS
        _SESSIONS[token] = expires
        return {"token": token, "expira_em": int(expires)}

    def logout(self, token: Optional[str]) -> None:
        if token:
            _SESSIONS.pop(token, None)

    def require(self, token: Optional[str]) -> None:
        """Levanta AdminRequiredError se nao for o admin logado na maquina publicadora."""
        self._require_publisher()
        self.require_local(token)

    def require_local(self, token: Optional[str]) -> None:
        """Admin logado nesta maquina, publicadora ou nao (WhatsApp e resumo: o PC reserva do robo)."""
        if not self._valid_token(token):
            raise AdminRequiredError("Entre como admin para fazer isso.")

    # ------------------------------------------------------------------

    def _require_publisher(self) -> None:
        if not self.is_publisher():
            raise AdminRequiredError(
                "Só a máquina publicadora da base oficial pode administrar o assistente "
                "(Backup > Base oficial > Papel desta máquina: Publica a base)."
            )

    @staticmethod
    def _valid_token(token: Optional[str]) -> bool:
        if not token:
            return False
        expires = _SESSIONS.get(token)
        if expires is None:
            return False
        if expires < time.time():
            _SESSIONS.pop(token, None)
            return False
        return True

    @staticmethod
    def _check(password: str, admin: Dict[str, Any]) -> bool:
        try:
            expected = _hash_password(password, str(admin["salt"]), int(admin.get("iteracoes") or PBKDF2_ITERATIONS))
        except (KeyError, ValueError, TypeError):
            return False
        return hmac.compare_digest(expected, str(admin.get("hash") or ""))
