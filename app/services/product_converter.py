"""
Utilitários para conversão de Product entre formatos legado e v2.0.0

Helper para transformar dados de produto para diferentes schemas
"""

from typing import Dict, List, Optional
import sqlite3
from app.models.product import Product
from app.models.inventory_location import InventoryLocation
from backend.app.schemas.white_label import ProductOutV2, ProductInventoryItem
from backend.app.schemas.product import ProductOut
from app.services.inventory_location_service import InventoryLocationService
from app.services.product_inventory_service import ProductInventoryService
from app.services.legacy_compat_service import LegacyCompatService


class ProductConverter:
    """Converte Product para diferentes schemas (legacy e v2.0.0)."""
    
    def __init__(self, connection: sqlite3.Connection):
        self.connection = connection
        self.location_service = InventoryLocationService(connection)
        self.inventory_service = ProductInventoryService(connection)
        self.compat_service = LegacyCompatService(connection)
    
    def to_product_out(self, product: Product) -> ProductOut:
        """
        Converte para schema legado (v1.x).
        
        Args:
            product: Produto com dados legados
            
        Returns:
            ProductOut (schema antigo)
        """
        return ProductOut(
            id=product.id or 0,
            nome=product.nome,
            qtd_canoas=self.compat_service.get_qtd_canoas_from_product(product),
            qtd_pf=self.compat_service.get_qtd_pf_from_product(product),
            total_stock=product.total_stock,
            observacao=product.observacao,
            ativo=bool(product.ativo),
            inativado_em=product.inativado_em,
            motivo_inativacao=product.motivo_inativacao,
        )
    
    def to_product_out_v2(self, product: Product) -> ProductOutV2:
        """
        Converte para schema v2.0.0 com múltiplos estoques.
        
        Args:
            product: Produto
            
        Returns:
            ProductOutV2 com array de estoques
        """
        # Buscar estoques do produto
        estoques_items = self._get_inventory_items(product.id or 0)
        
        # Se não tem estoques, usar dados legados
        if not estoques_items:
            estoques_items = self._build_inventory_items_from_legacy(product)
        
        return ProductOutV2(
            id=product.id or 0,
            nome=product.nome,
            # Manter campos legados para compatibilidade
            qtd_canoas=self.compat_service.get_qtd_canoas_from_product(product),
            qtd_pf=self.compat_service.get_qtd_pf_from_product(product),
            # Novo: array de estoques
            estoques=estoques_items,
            total_stock=product.total_stock,
            observacao=product.observacao,
            ativo=bool(product.ativo),
            inativado_em=product.inativado_em,
            motivo_inativacao=product.motivo_inativacao,
        )
    
    def _get_inventory_items(self, product_id: int) -> List[ProductInventoryItem]:
        """
        Busca items de estoque com informações de locations.
        
        Args:
            product_id: ID do produto
            
        Returns:
            Lista de ProductInventoryItem com dados de location
        """
        items = []
        
        # Buscar todos os estoques do produto
        product_inventories = self.inventory_service.get_all_by_product(product_id)
        
        for inv in product_inventories:
            # Buscar informações da location
            try:
                location = self.location_service.get_by_id(inv.inventory_location_id)
                item = ProductInventoryItem(
                    location_id=location.id or 0,
                    location_name=location.name,
                    location_label=location.label,
                    location_color=location.color,
                    quantidade=inv.quantidade,
                )
                items.append(item)
            except:
                # Location não encontrado, pular
                continue
        
        return items
    
    def _build_inventory_items_from_legacy(self, product: Product) -> List[ProductInventoryItem]:
        """
        Constrói items de estoque a partir de campos legados.
        
        Usado quando produto não tem dados em nova estrutura.
        
        Args:
            product: Produto com dados legados
            
        Returns:
            Lista de ProductInventoryItem construída de qtd_canoas/qtd_pf
        """
        items = []
        
        # Tentar buscar locations padrão
        try:
            canoas_loc, pf_loc = self.compat_service.location_service.get_default_locations()
            
            # Adicionar Canoas se tiver quantidade
            if canoas_loc and product.qtd_canoas and product.qtd_canoas > 0:
                items.append(ProductInventoryItem(
                    location_id=canoas_loc.id or 0,
                    location_name=canoas_loc.name,
                    location_label=canoas_loc.label,
                    location_color=canoas_loc.color,
                    quantidade=product.qtd_canoas,
                ))
            
            # Adicionar PF se tiver quantidade
            if pf_loc and product.qtd_pf and product.qtd_pf > 0:
                items.append(ProductInventoryItem(
                    location_id=pf_loc.id or 0,
                    location_name=pf_loc.name,
                    location_label=pf_loc.label,
                    location_color=pf_loc.color,
                    quantidade=product.qtd_pf,
                ))
        except:
            # Se algo falhar, retornar lista vazia
            pass
        
        return items
    
    def build_estoques_dict(self, estoques: Optional[Dict[int, int]]) -> Dict[int, int]:
        """
        Valida e constrói dict de estoques.
        
        Args:
            estoques: Dict {location_id: quantidade} ou None
            
        Returns:
            Dict validado
            
        Raises:
            ValueError: Se estoques inválidos
        """
        if estoques is None:
            return {}
        
        # Validar que cada location_id existe
        for location_id, quantity in estoques.items():
            if quantity < 0:
                raise ValueError(f"Quantidade negativa para location {location_id}: {quantity}")
            
            try:
                self.location_service.get_by_id(location_id)
            except:
                raise ValueError(f"Location {location_id} não encontrado")
        
        return estoques
    
    def merge_legacy_with_new(
        self,
        qtd_canoas: Optional[int],
        qtd_pf: Optional[int],
        estoques: Optional[Dict[int, int]]
    ) -> Dict[int, int]:
        """
        Mescla dados legados (qtd_canoas/qtd_pf) com novo format (estoques dict).
        
        Prioridade: estoques dict (novo) > qtd_canoas/qtd_pf (legado)
        
        Args:
            qtd_canoas: Quantidade em Canoas (legada)
            qtd_pf: Quantidade em PF (legada)
            estoques: Dict de locations (novo)
            
        Returns:
            Dict {location_id: quantidade} consolidado
        """
        result = {}
        
        # Começar com dados legados
        if qtd_canoas is not None and qtd_canoas > 0:
            canoas_id, _ = self.compat_service.get_default_location_ids()
            if canoas_id:
                result[canoas_id] = qtd_canoas
        
        if qtd_pf is not None and qtd_pf > 0:
            _, pf_id = self.compat_service.get_default_location_ids()
            if pf_id:
                result[pf_id] = qtd_pf
        
        # Sobrescrever/complementar com dados novos
        if estoques:
            result.update(self.build_estoques_dict(estoques))
        
        return result
