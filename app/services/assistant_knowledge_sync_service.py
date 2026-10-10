"""
Leva o conhecimento do especialista para as outras maquinas (docs/PLANO_IA.md, Fase 2c).

Cada maquina tem o proprio banco e ninguem aplica a base oficial inteira no dia a dia (as
filiais lancam movimentos separadamente). Por isso as regras que o admin ensina viajam a
parte, num JSON pequeno, pelos mesmos caminhos da base oficial (Backup > Base oficial):

- maquina publicadora: a cada regra criada, excluida ou aprovada (e ao abrir o backend)
  grava conhecimento_assistente.json na pasta compartilhada (latest/) e no servidor local
  (rota /knowledge);
- outras maquinas: baixam do servidor da publicadora (endereco configurado) ou da pasta
  compartilhada ao abrir o backend, depois a cada 10 min e pelo "Sincronizar agora". As
  regras locais sao trocadas pelas publicadas: so a publicadora ensina.

O estado (ultima publicacao ou recebimento) fica em assistente_conhecimento.json, separado
do assistente_config.json para nunca disputar a gravacao com a chave da API e a senha.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import threading
from datetime import datetime
from typing import Any, Callable, Dict, Iterable, List, Optional, Tuple

from app.services.assistant_knowledge_service import MAX_NOTE_LENGTH, VALID_TYPES
from core.catalog.normalization import canonical_code, is_searchable_code
from core.constants import APP_VERSION
from core.database.repositories.knowledge_repository import KnowledgeRepository
from core.exceptions import ValidationException
from core.utils.file_utils import FileUtils

LOG = logging.getLogger(__name__)

FORMAT_VERSION = 1
KNOWLEDGE_FILENAME = "conhecimento_assistente.json"
LATEST_DIRNAME = "latest"
SYNC_INTERVAL_SECONDS = 600
MAX_RULES = 20000
MAX_CODE_LENGTH = 60
MAX_DATE_LENGTH = 32
ROLE_PUBLISHER = "publisher"
_HASHED_FIELDS = ("codigo_a", "codigo_a_norm", "codigo_b", "codigo_b_norm", "tipo", "observacao")

NO_SOURCE = (
    "Esta máquina ainda não sabe de onde receber o conhecimento: em Backup > Base oficial, informe "
    "o endereço da máquina publicadora ou a pasta compartilhada."
)
NO_DESTINATION = (
    "Publicado só nesta máquina. Para as outras receberem, configure a pasta compartilhada ou ligue "
    "o servidor local em Backup > Base oficial."
)


def _official_base_config() -> Dict[str, Any]:
    from app.services.official_base_service import OfficialBaseService

    return OfficialBaseService().config_store.load()


def _local_share() -> Any:
    from app.services.local_share_service import LocalShareService

    return LocalShareService()


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def rules_hash(rules: Iterable[Dict[str, Any]]) -> str:
    """Impressao digital das regras (sem as datas e sem depender da ordem)."""
    essential = sorted(
        ({k: r.get(k) for k in _HASHED_FIELDS} for r in rules),
        key=lambda r: (str(r["codigo_a_norm"]), str(r["codigo_b_norm"])),
    )
    data = json.dumps(essential, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(data.encode("utf-8")).hexdigest()


def _write_json(path: str, data: Dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp_path = f"{path}.tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    os.replace(tmp_path, path)


def _read_json(path: str) -> Any:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _date(value: Any) -> Optional[str]:
    text = str(value or "").strip()
    return text[:MAX_DATE_LENGTH] or None


class AssistantKnowledgeSyncService:
    _sync_lock = threading.Lock()  # uma publicacao/recebimento por vez no processo
    _periodic_stop: Optional[threading.Event] = None

    def __init__(
        self,
        repository: Optional[KnowledgeRepository] = None,
        config_reader: Optional[Callable[[], Dict[str, Any]]] = None,
        local_share: Any = None,
        state_path: Optional[str] = None,
        run_async: Optional[Callable[[Callable[[], None]], Any]] = None,
    ) -> None:
        self.repository = repository or KnowledgeRepository()
        self.config_reader = config_reader or _official_base_config
        self._local_share = local_share
        self.state_path = state_path or FileUtils.get_assistant_knowledge_state_path()
        self.run_async = run_async or (
            lambda fn: threading.Thread(target=fn, name="assistente-conhecimento", daemon=True).start()
        )

    @property
    def local_share(self) -> Any:
        if self._local_share is None:
            self._local_share = _local_share()
        return self._local_share

    # ------------------------------------------------------------------
    # Entradas
    # ------------------------------------------------------------------

    def sync(self) -> Dict[str, Any]:
        """Publicadora: publica (de novo). Outras maquinas: recebem a versao publicada, se mudou."""
        with type(self)._sync_lock:
            config = self.config_reader()
            if config.get("role") == ROLE_PUBLISHER:
                self._publish(config)
            else:
                self._pull(config)
        return self.status()

    def publish_in_background(self) -> None:
        """Depois de o admin mudar uma regra: publica sem fazer a tela esperar a pasta da rede."""
        self.run_async(self._publish_logged)

    @classmethod
    def start_periodic(cls, interval: float = SYNC_INTERVAL_SECONDS) -> None:
        """Ao abrir o backend: publica ou recebe agora e depois a cada 10 min."""
        if cls._periodic_stop is not None:
            return
        stop = threading.Event()
        cls._periodic_stop = stop

        def loop() -> None:
            while not stop.is_set():
                cls()._sync_logged()
                stop.wait(interval)

        threading.Thread(target=loop, name="assistente-conhecimento", daemon=True).start()

    @classmethod
    def stop_periodic(cls) -> None:
        if cls._periodic_stop is not None:
            cls._periodic_stop.set()
            cls._periodic_stop = None

    def status(self) -> Dict[str, Any]:
        try:
            role = str(self.config_reader().get("role") or "consumer")
        except Exception:
            role = "consumer"
        state = self._state()
        return {
            "papel": role,
            "fonte": state.get("fonte"),
            "publicado_em": state.get("publicado_em"),
            "maquina": state.get("maquina"),
            "total_regras": int(state.get("total_regras") or 0),
            "atualizado_em": state.get("atualizado_em"),
            "verificado_em": state.get("verificado_em"),
            "erro": state.get("erro"),
        }

    def _sync_logged(self) -> None:
        try:
            self.sync()
        except Exception:
            LOG.exception("assistente: falha ao sincronizar o conhecimento")

    def _publish_logged(self) -> None:
        try:
            with type(self)._sync_lock:
                config = self.config_reader()
                if config.get("role") == ROLE_PUBLISHER:
                    self._publish(config)
        except Exception:
            LOG.exception("assistente: falha ao publicar o conhecimento")

    # ------------------------------------------------------------------
    # Maquina publicadora
    # ------------------------------------------------------------------

    def _publish(self, config: Dict[str, Any]) -> None:
        rules = self.repository.export_rules()
        digest = rules_hash(rules)
        previous = self._state()
        # Mesmas regras de antes (ex.: backend reaberto): mantem a data da versao.
        published_at = previous.get("publicado_em") if previous.get("sha256") == digest else None
        payload = {
            "formato": FORMAT_VERSION,
            "publicado_em": published_at or _now(),
            "maquina": str(config.get("machine_label") or ""),
            "publicado_por": str(config.get("publisher_name") or ""),
            "app_version": APP_VERSION,
            "total_regras": len(rules),
            "sha256": digest,
            "regras": rules,
        }

        reached, errors = [], []
        # O servidor local entrega este arquivo (rota /knowledge) quando esta ligado.
        try:
            _write_json(self.local_share.get_knowledge_path(), payload)
            if config.get("server_enabled"):
                reached.append("servidor")
        except OSError as exc:
            errors.append(f"Não consegui gravar o arquivo do servidor local ({exc}).")
        folder = str(config.get("official_base_dir") or "").strip()
        if folder:
            try:
                _write_json(os.path.join(folder, LATEST_DIRNAME, KNOWLEDGE_FILENAME), payload)
                reached.append("pasta")
            except OSError as exc:
                errors.append(f"Não consegui gravar na pasta compartilhada ({exc}).")

        now = _now()
        self._save_state(
            {
                "fonte": " e ".join(reached) or None,
                "sha256": digest,
                "publicado_em": payload["publicado_em"],
                "maquina": payload["maquina"],
                "total_regras": len(rules),
                "atualizado_em": now if reached else previous.get("atualizado_em"),
                "verificado_em": now,
                "erro": " ".join(errors) or (None if reached else NO_DESTINATION),
            }
        )

    # ------------------------------------------------------------------
    # Outras maquinas
    # ------------------------------------------------------------------

    def _pull(self, config: Dict[str, Any]) -> None:
        state = self._state()
        state["verificado_em"] = _now()
        server = str(config.get("remote_server_url") or "").strip()
        folder = str(config.get("official_base_dir") or "").strip()
        if not server and not folder:
            self._save_state({**state, "erro": NO_SOURCE})
            return

        payload, source, errors = None, None, []
        if server:
            try:
                payload, source = self.local_share.fetch_remote_knowledge(server), "servidor"
            except Exception as exc:
                errors.append(str(exc))
        if payload is None and folder:
            try:
                payload, source = _read_json(os.path.join(folder, LATEST_DIRNAME, KNOWLEDGE_FILENAME)), "pasta"
            except FileNotFoundError:
                errors.append("A pasta compartilhada ainda não tem o conhecimento publicado.")
            except (OSError, ValueError) as exc:
                errors.append(f"Não consegui ler o conhecimento na pasta compartilhada: {exc}")
        if payload is None:
            self._save_state({**state, "erro": " ".join(errors)})
            return

        try:
            rules, digest = self._validated(payload)
        except ValidationException as exc:
            self._save_state({**state, "erro": str(exc)})
            return

        if rules_hash(self.repository.export_rules()) != digest:
            self.repository.replace_all(rules)
            state["atualizado_em"] = state["verificado_em"]
        self._save_state(
            {
                **state,
                "fonte": source,
                "sha256": digest,
                "publicado_em": _date(payload.get("publicado_em")),
                "maquina": str(payload.get("maquina") or "")[:120] or None,
                "total_regras": len(rules),
                "atualizado_em": state.get("atualizado_em") or state["verificado_em"],
                "erro": None,
            }
        )

    @staticmethod
    def _validated(payload: Any) -> Tuple[List[Dict[str, Any]], str]:
        """Regras do arquivo publicado, conferidas; qualquer problema = nada e alterado."""
        if not isinstance(payload, dict) or not isinstance(payload.get("regras"), list):
            raise ValidationException("O conhecimento publicado está num formato inválido; nada foi alterado.")
        try:
            version = int(payload.get("formato") or 0)
        except (TypeError, ValueError):
            version = 0
        if version > FORMAT_VERSION:
            raise ValidationException(
                "O conhecimento foi publicado por um Chronos mais novo: atualize esta máquina para receber."
            )
        if version != FORMAT_VERSION:
            raise ValidationException("O conhecimento publicado está num formato inválido; nada foi alterado.")
        raw_rules = payload["regras"]
        if len(raw_rules) > MAX_RULES:
            raise ValidationException("O conhecimento publicado tem regras demais; nada foi alterado.")

        # Conferencia com o que a publicadora calculou: arquivo cortado ou alterado nao entra.
        try:
            received = rules_hash(raw_rules)
        except (AttributeError, KeyError, TypeError):
            raise ValidationException("O conhecimento publicado está num formato inválido; nada foi alterado.")
        if str(payload.get("sha256") or "") != received:
            raise ValidationException("O arquivo do conhecimento veio incompleto ou alterado; nada foi alterado.")

        rules = []
        for item in raw_rules:
            code_a, code_b = str(item.get("codigo_a") or "").strip(), str(item.get("codigo_b") or "").strip()
            norm_a, norm_b = canonical_code(code_a), canonical_code(code_b)
            kind = str(item.get("tipo") or "").strip().upper()
            note = item.get("observacao")
            valid = (
                len(code_a) <= MAX_CODE_LENGTH
                and len(code_b) <= MAX_CODE_LENGTH
                and is_searchable_code(norm_a)
                and is_searchable_code(norm_b)
                and norm_a != norm_b
                and kind in VALID_TYPES
                and (note is None or (isinstance(note, str) and len(note) <= MAX_NOTE_LENGTH))
            )
            if not valid:
                raise ValidationException(
                    f"O conhecimento publicado tem uma regra inválida ({code_a[:20]} / {code_b[:20]}); nada foi alterado."
                )
            if norm_a > norm_b:
                code_a, code_b, norm_a, norm_b = code_b, code_a, norm_b, norm_a
            rules.append(
                {
                    "codigo_a": code_a,
                    "codigo_a_norm": norm_a,
                    "codigo_b": code_b,
                    "codigo_b_norm": norm_b,
                    "tipo": kind,
                    "observacao": note or None,
                    "criado_em": _date(item.get("criado_em")),
                    "atualizado_em": _date(item.get("atualizado_em")),
                }
            )
        return rules, rules_hash(rules)

    # ------------------------------------------------------------------
    # Estado
    # ------------------------------------------------------------------

    def _state(self) -> Dict[str, Any]:
        try:
            data = _read_json(self.state_path)
        except (OSError, ValueError):
            return {}
        return data if isinstance(data, dict) else {}

    def _save_state(self, state: Dict[str, Any]) -> None:
        try:
            _write_json(self.state_path, state)
        except OSError:
            LOG.exception("assistente: nao consegui gravar o estado da sincronizacao do conhecimento")
