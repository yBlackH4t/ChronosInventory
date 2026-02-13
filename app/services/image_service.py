"""
Servico de gerenciamento de imagens de produto.
Responsabilidade: processar e armazenar imagens no banco.
"""

from __future__ import annotations

from io import BytesIO
from typing import Dict, List, Optional

from PIL import Image

from core.database.repositories.product_repository import ProductRepository
from core.exceptions import FileOperationException, ProductNotFoundException, ValidationException


class ImageService:
    """Servico de imagens com suporte a multiplas imagens por produto."""

    MAX_IMAGES_PER_PRODUCT = 5
    MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024

    def __init__(self):
        self.product_repo = ProductRepository()

    def get_photo_bytes(self, product_id: int) -> Optional[bytes]:
        return self.product_repo.get_product_image(product_id)

    def get_photo_path(self, product_id: int) -> Optional[bytes]:
        # Compatibilidade com UI antiga.
        return self.get_photo_bytes(product_id)

    def list_photos(self, product_id: int) -> List[Dict]:
        if not self.product_repo.exists(product_id):
            raise ProductNotFoundException(f"Produto com ID {product_id} nao encontrado.")
        return self.product_repo.list_product_images(product_id)

    def get_photo_by_id(self, product_id: int, image_id: int) -> Optional[Dict]:
        return self.product_repo.get_product_image_by_id(product_id, image_id)

    def save_photo(self, source_path: str, product_id: int) -> bool:
        """
        Mantem compatibilidade com fluxo antigo por caminho de arquivo.
        Atualiza/substitui a imagem principal.
        """
        try:
            with Image.open(source_path) as img:
                image_bytes = self._normalize_image(img)
            self.product_repo.replace_primary_product_image(product_id, image_bytes, "image/jpeg")
            return True
        except Exception as exc:
            raise FileOperationException(f"Erro ao processar imagem: {exc}")

    def upload_photo_bytes(
        self,
        product_id: int,
        file_bytes: bytes,
        mime_type: str,
        as_primary: bool = False,
    ) -> Dict:
        """
        Adiciona nova imagem ao produto.
        """
        if not file_bytes:
            raise ValidationException("Arquivo vazio.")
        if len(file_bytes) > self.MAX_IMAGE_SIZE_BYTES:
            raise ValidationException("Imagem muito grande. Limite: 5MB.")

        current_count = self.product_repo.count_product_images(product_id)
        if current_count >= self.MAX_IMAGES_PER_PRODUCT:
            raise ValidationException(f"Limite de {self.MAX_IMAGES_PER_PRODUCT} imagens por produto.")

        try:
            with Image.open(BytesIO(file_bytes)) as img:
                normalized = self._normalize_image(img)
            image_id = self.product_repo.add_product_image(
                product_id=product_id,
                image_bytes=normalized,
                mime_type="image/jpeg",
                is_primary=as_primary,
            )
            return {
                "id": image_id,
                "size_bytes": len(normalized),
                "mime_type": "image/jpeg",
            }
        except ValidationException:
            raise
        except ProductNotFoundException:
            raise
        except Exception as exc:
            raise FileOperationException(f"Erro ao processar imagem: {exc}")

    def replace_primary_photo_bytes(self, product_id: int, file_bytes: bytes) -> Dict:
        """
        Semantica legada do endpoint /produtos/{id}/imagem: substitui principal.
        """
        if not file_bytes:
            raise ValidationException("Arquivo vazio.")
        if len(file_bytes) > self.MAX_IMAGE_SIZE_BYTES:
            raise ValidationException("Imagem muito grande. Limite: 5MB.")

        try:
            with Image.open(BytesIO(file_bytes)) as img:
                normalized = self._normalize_image(img)
            image_id = self.product_repo.replace_primary_product_image(
                product_id=product_id,
                image_bytes=normalized,
                mime_type="image/jpeg",
            )
            return {
                "id": image_id,
                "size_bytes": len(normalized),
                "mime_type": "image/jpeg",
            }
        except ValidationException:
            raise
        except ProductNotFoundException:
            raise
        except Exception as exc:
            raise FileOperationException(f"Erro ao processar imagem: {exc}")

    def delete_photo(self, product_id: int) -> bool:
        """
        Compatibilidade legada: remove todas as imagens do produto.
        """
        removed = self.product_repo.clear_product_images(product_id)
        return removed > 0

    def delete_photo_by_id(self, product_id: int, image_id: int) -> bool:
        return self.product_repo.delete_product_image(product_id, image_id)

    def set_primary_photo(self, product_id: int, image_id: int) -> bool:
        return self.product_repo.set_primary_product_image(product_id, image_id)

    def has_photo(self, product_id: int) -> bool:
        return self.get_photo_bytes(product_id) is not None

    def get_photo_count(self) -> int:
        # Compatibilidade: quantidade de produtos com imagem.
        return self.product_repo.count_products_with_images()

    def get_product_photo_count(self, product_id: int) -> int:
        return self.product_repo.count_product_images(product_id)

    def _normalize_image(self, img: Image.Image) -> bytes:
        # Normaliza canais para RGB
        if img.mode in ("RGBA", "LA", "P"):
            background = Image.new("RGB", img.size, (255, 255, 255))
            if img.mode == "P":
                img = img.convert("RGBA")
            background.paste(img, mask=img.split()[-1] if img.mode == "RGBA" else None)
            img = background
        elif img.mode != "RGB":
            img = img.convert("RGB")

        # Reduz tamanho para economizar storage e trafego.
        img.thumbnail((1200, 1200), Image.Resampling.LANCZOS)

        buffer = BytesIO()
        img.save(buffer, format="JPEG", quality=85, optimize=True)
        return buffer.getvalue()
