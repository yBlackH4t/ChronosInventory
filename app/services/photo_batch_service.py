"""
Importacao de fotos em lote (2.7.19).

O nome do arquivo e o codigo da peca: "178045.jpg" e a principal e "178045_2.jpg",
"178045_3.jpg"... sao as extras. A tela envia nessa ordem e a primeira foto de um produto
sem foto vira a principal (a principal que o produto ja tinha continua). A foto vai para
todo produto cujo nome cita aquele codigo (o cadastro guarda o codigo no nome, "TURBO BORG
S100 178045"). Foto que o produto ja tem (mesmos bytes depois de normalizada) nao entra
de novo.
"""

from __future__ import annotations

import hashlib
import re
from collections import defaultdict
from io import BytesIO
from pathlib import PurePath
from typing import Any, Dict, List, Optional, Tuple

from PIL import Image

from app.services.assistant_knowledge_service import codes_cited_in_name
from app.services.image_service import ImageService
from core.catalog.normalization import canonical_code
from core.exceptions import ValidationException

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
MAX_PRODUCTS_PER_CODE = 5  # mais que isso e pedaco de codigo de kit, nao uma peca

# "178045_2", "178045-3", "178045 (4)": a foto extra numero N. Ate 2 digitos, para nao
# cortar o final de codigos como 856457-009.
_EXTRA_SUFFIX = re.compile(r"^(?P<code>.+?)(?:[_ ]\(?(?P<n1>\d{1,2})\)?|-(?P<n2>\d{1,2}))$")

STATUS_OK = "ok"
STATUS_NO_CODE = "sem_codigo"
STATUS_NO_PRODUCT = "sem_produto"
STATUS_NOT_IMAGE = "nao_e_imagem"
STATUS_AMBIGUOUS = "muitos_produtos"


def parse_file_name(file_name: str) -> Tuple[str, int]:
    """'178045_2.jpg' -> ('178045', 2); '178045.jpg' -> ('178045', 1)."""
    stem = PurePath(str(file_name).replace("\\", "/")).stem.strip()
    match = _EXTRA_SUFFIX.match(stem)
    if match:
        number = match.group("n1") or match.group("n2")
        return canonical_code(match.group("code")), int(number)
    return canonical_code(stem), 1


def is_image_name(file_name: str) -> bool:
    return PurePath(str(file_name)).suffix.lower() in IMAGE_EXTENSIONS


_ALL_PRODUCTS = ""  # chave do indice com todos os produtos, para a busca de reserva


def build_code_index(products: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    """Codigo citado no nome -> produtos (id, nome). So codigos exatos, sem nova/reman."""
    index: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for product in products:
        entry = {"id": int(product["id"]), "nome": str(product.get("nome") or "")}
        index[_ALL_PRODUCTS].append(entry)
        for code in codes_cited_in_name(entry["nome"], expand_family=False):
            index[code].append(entry)
    return index


def _products_for_code(code: str, index: Dict[str, List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    products = list(index.get(code, []))
    if not (code.isdigit() and len(code) >= 6):
        return products
    # Codigo grudado no modelo ("S200G-12709880050") nao sai como codigo do nome. O numero
    # tem que estar inteiro: "856457" nao pega "856457-009".
    pattern = re.compile(rf"(?<!\d)(?<!\d[-./]){code}(?![-./]?\d)")
    seen = {p["id"] for p in products}
    for product in index.get(_ALL_PRODUCTS, []):
        if product["id"] not in seen and pattern.search(product["nome"]):
            products.append(product)
            seen.add(product["id"])
    return products


def match_file(file_name: str, index: Dict[str, List[Dict[str, Any]]]) -> Dict[str, Any]:
    """Para qual produto vai cada arquivo, sem gravar nada."""
    code, number = parse_file_name(file_name)
    item: Dict[str, Any] = {"arquivo": file_name, "codigo": code, "numero": number, "produtos": []}
    if not is_image_name(file_name):
        item["status"] = STATUS_NOT_IMAGE
        return item
    if not code:
        item["status"] = STATUS_NO_CODE
        return item
    products = _products_for_code(code, index)
    if not products:
        item["status"] = STATUS_NO_PRODUCT
    elif len(products) > MAX_PRODUCTS_PER_CODE:
        item["status"] = STATUS_AMBIGUOUS
    else:
        item["status"] = STATUS_OK
        item["produtos"] = sorted(products, key=lambda p: p["id"])
    return item


class PhotoBatchService:
    def __init__(self, image_service: Optional[ImageService] = None):
        self.image_service = image_service or ImageService()
        self.product_repo = self.image_service.product_repo

    def _index(self) -> Dict[str, List[Dict[str, Any]]]:
        products = self.product_repo._execute_query("SELECT id, nome FROM produtos")
        return build_code_index(products)

    def preview(self, file_names: List[str]) -> Dict[str, Any]:
        index = self._index()
        items = [match_file(name, index) for name in file_names]
        products = {p["id"] for item in items for p in item["produtos"]}
        return {
            "itens": items,
            "arquivos_ok": sum(1 for item in items if item["status"] == STATUS_OK),
            "produtos": len(products),
        }

    def _existing_hashes(self, product_id: int) -> set:
        rows = self.product_repo._execute_query(
            "SELECT image_data FROM product_images WHERE product_id = ?", (product_id,)
        )
        return {hashlib.sha1(bytes(row["image_data"])).hexdigest() for row in rows if row.get("image_data")}

    def import_file(self, file_name: str, file_bytes: bytes) -> Dict[str, Any]:
        """Grava a foto em cada produto do codigo. A tela manda a sem numero primeiro."""
        item = match_file(file_name, self._index())
        item["resultados"] = []
        if item["status"] != STATUS_OK:
            return item
        if not file_bytes:
            raise ValidationException("Arquivo vazio.")
        if len(file_bytes) > ImageService.MAX_IMAGE_SIZE_BYTES:
            raise ValidationException("Imagem muito grande. Limite: 5MB.")
        try:
            with Image.open(BytesIO(file_bytes)) as img:
                normalized = self.image_service._normalize_image(img)
        except Exception as exc:
            raise ValidationException(f"Não consegui abrir a imagem: {exc}")
        digest = hashlib.sha1(normalized).hexdigest()

        for product in item["produtos"]:
            pid = product["id"]
            if digest in self._existing_hashes(pid):
                result = "ja_tinha"
            elif self.product_repo.count_product_images(pid) >= ImageService.MAX_IMAGES_PER_PRODUCT:
                result = "limite"
            else:
                self.product_repo.add_product_image(
                    product_id=pid,
                    image_bytes=normalized,
                    mime_type="image/jpeg",
                    is_primary=False,  # a primeira foto do produto ja vira a principal
                )
                result = "adicionada"
            item["resultados"].append({"produto_id": pid, "resultado": result})
        return item
