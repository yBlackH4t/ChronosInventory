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
import secrets
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
        }

    def set_password(self, nova: str, atual: Optional[str] = None) -> None:
        if len(nova or "") < MIN_PASSWORD_LENGTH:
            raise ValidationException(f"A senha precisa ter pelo menos {MIN_PASSWORD_LENGTH} caracteres.")
        admin = self.config_store.load_admin()
        if admin.get("hash") and not self._check(atual or "", admin):
            self.sleep(FAILED_LOGIN_DELAY_SECONDS)
            raise AdminRequiredError("Senha atual incorreta.")
        salt = secrets.token_hex(16)
        self.config_store.save_admin(
            {"salt": salt, "iteracoes": PBKDF2_ITERATIONS, "hash": _hash_password(nova, salt, PBKDF2_ITERATIONS)}
        )
        _SESSIONS.clear()  # trocou a senha: todas as sessoes caem

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
