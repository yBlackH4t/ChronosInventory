"""
Serviço de gerenciamento de estoque.
Responsabilidade: Orquestrar operações de estoque (CRUD + Movimentações).
"""

import pandas as pd
from datetime import datetime
from typing import Tuple, List, Dict, Any
from app.models.product import Product
from app.models.validators import ProductValidator

from core.constants import DATE_FORMAT_DB
from core.database.repositories.movement_repository import MovementRepository
from core.database.repositories.product_repository import ProductRepository
from core.database.repositories.inventory_location_repository import InventoryLocationRepository
from core.exceptions import DatabaseException, ValidationException, NotFoundException, ProductNotFoundException

UNSET = object()


class StockService:
    """
    Serviço de Estoque.
    Responsabilidade única: Gerenciar operações de estoque.
    """
    
    def __init__(self):
        self.product_repo = ProductRepository()
        self.movement_repo = MovementRepository()

    
    def get_all_products(self, search_term: str = "") -> List[Product]:
        """
        Retorna todos os produtos.
        
        Args:
            search_term: Termo de busca (opcional)
            
        Returns:
            Lista de produtos
        """
        products_data = self.product_repo.get_all(search_term, status="ATIVO")
        return [Product.from_dict(data) for data in products_data]

    def get_products_paginated(
        self,
        search_term: str = "",
        sort_column: str = "nome",
        sort_direction: str = "ASC",
        limit: int = 20,
        offset: int = 0,
        status: str = "ATIVO",
    ) -> Tuple[List[Product], int]:
        """
        Retorna produtos paginados e o total.
        
        Args:
            search_term: Termo de busca (opcional)
            sort_column: Coluna para ordenação
            sort_direction: Direção (ASC/DESC)
            limit: Número máximo de registros
            offset: Deslocamento para paginação
            
        Returns:
            Tupla (lista de produtos, total de itens)
        """
        products_data = self.product_repo.get_all_paginated(
            search_term=search_term,
            sort_column=sort_column,
            sort_direction=sort_direction,
            limit=limit,
            offset=offset,
            status=status,
        )
        total = self.product_repo.count_filtered(search_term, status=status)
        return [Product.from_dict(data) for data in products_data], total

    def get_products_status_paginated(
        self,
        search_term: str = "",
        status: str = "TODOS",
        has_stock: bool | None = None,
        sort_column: str = "nome",
        sort_direction: str = "ASC",
        limit: int = 20,
        offset: int = 0,
    ) -> Tuple[List[Product], int]:
        products_data = self.product_repo.get_all_paginated(
            search_term=search_term,
            status=status,
            has_stock=has_stock,
            sort_column=sort_column,
            sort_direction=sort_direction,
            limit=limit,
            offset=offset,
        )
        total = self.product_repo.count_filtered(
            search_term=search_term,
            status=status,
            has_stock=has_stock,
        )
        return [Product.from_dict(data) for data in products_data], total
    

    def get_product_by_id(self, product_id: int) -> Product:
        """
        Retorna produto por ID.
        
        Args:
            product_id: ID do produto
            
        Returns:
            Produto encontrado
            
        Raises:
            ProductNotFoundException: Se não encontrado
        """
        product_data = self.product_repo.get_by_id(product_id)
        if not product_data:
            raise ProductNotFoundException(f"Produto {product_id} nao encontrado.")
        return Product.from_dict(product_data)

    def get_product_by_name(self, product_name: str) -> Product:
        """
        Retorna um produto pelo seu nome exato (case-insensitive).
        
        Args:
            product_name: Nome do produto
            
        Returns:
            Product
            
        Raises:
            NotFoundException: Se não encontrar.
        """
        # A simple solution is to get_all with search_term, then filter exactly
        products_data = self.product_repo.get_all(search_term=product_name, status="ATIVO")
        for data in products_data:
            if str(data.get("nome", "")).strip().lower() == product_name.strip().lower():
                return Product.from_dict(data)
                
        raise NotFoundException(f"Produto com nome '{product_name}' não encontrado.")
    
    def get_linked_products(self, product_id: int) -> List[Product]:
        """
        Retorna todos os produtos que estão vinculados a este produto.
        """
        products_data = self.product_repo.get_linked_products(product_id)
        return [Product.from_dict(data) for data in products_data]

    def add_product(
        self, 
        nome: str, 
        inventories: Dict[int, int], 
        observacao: str | None = None, 
        product_id: int | None = None, 
        produto_vinculado_id: int | None = None,
        documento_movimento: str | None = None,
        observacao_movimento: str | None = None
    ) -> Product:
        """
        Adiciona novo produto.
        
        Args:
            nome: Nome do produto
            inventories: Dict {local_id: quantidade}
            observacao: Opcional
            product_id: Opcional
            
        Returns:
            Product recém-criado
        """
        from app.models.validators import ProductValidator
        ProductValidator.validate_product_data(nome, inventories)
        nome_norm = nome.strip().upper()
        
        new_id = self.product_repo.add(nome_norm, inventories, observacao, product_id)
        
        # Cria movimentos de entrada para o saldo inicial
        data_hora = datetime.now().strftime(DATE_FORMAT_DB)
        movement_obs = observacao_movimento or "Estoque inicial gerado no cadastro do produto."
        movement_doc = documento_movimento or "CADASTRO_INICIAL"
        conn = self.movement_repo.db.get_connection()
        try:
            conn.execute("BEGIN")
            for loc_id, qty in inventories.items():
                if qty > 0:
                    self.movement_repo.insert_movement(
                        conn=conn,
                        tipo="ENTRADA",
                        produto_id=new_id,
                        quantidade=qty,
                        origem_local_id=None,
                        destino_local_id=loc_id,
                        observacao=movement_obs,
                        natureza="OPERACAO_NORMAL",
                        motivo_ajuste=None,
                        local_externo=None,
                        documento=movement_doc,
                        movimento_ref_id=None,
                        data_hora=data_hora,
                    )
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
        
        # Recupera para retornar o modelo completo
        return self.get_product_by_id(new_id)

    def update_product(
        self,
        product_id: int,
        nome: str | None = UNSET,
        inventories: Dict[int, int] | None = UNSET,
        observacao: str | None = UNSET,
        produto_vinculado_id: int | None = UNSET
    ) -> Product:
        """
        Atualiza dados do produto.
        
        Args:
            product_id: ID do produto
            nome: Nome do produto (opcional)
            inventories: Novo mapeamento de estoques (opcional)
            
        Returns:
            Produto atualizado
            
        Raises:
            ValidationException: Se dados inválidos
            ProductNotFoundException: Se não encontrado
        """
        # Busca produto atual
        current = self.get_product_by_id(product_id)
        
        # Valida e normaliza nome se fornecido
        if nome is not UNSET:
            from app.models.validators import ProductValidator
            ProductValidator.validate_product_name(nome)
            nome_normalizado = nome.strip().upper()
        else:
            nome_normalizado = current.nome
        
        # Valida quantidades se fornecidas
        if inventories is not UNSET:
            for loc_id, qty in inventories.items():
                from app.models.validators import ProductValidator
                ProductValidator.validate_stock_quantity(qty)
            merged_inventories = inventories
        else:
            merged_inventories = current.inventories
        
        # Observacao
        if observacao is not UNSET:
            observacao = observacao
        else:
            observacao = current.observacao
        
        # ID Vinculado
        if produto_vinculado_id is not UNSET:
            produto_vinculado_id = produto_vinculado_id
        else:
            produto_vinculado_id = current.produto_vinculado_id

        # Atualiza no banco
        self.product_repo.update_details(product_id, nome_normalizado, merged_inventories, observacao, produto_vinculado_id)
        
        return Product(
            id=product_id,
            nome=nome_normalizado,
            inventories=merged_inventories,
            observacao=observacao or "",
            produto_vinculado_id=produto_vinculado_id,
            ativo=current.ativo,
            inativado_em=current.inativado_em,
            motivo_inativacao=current.motivo_inativacao,
        )

    def set_products_active(
        self,
        ids: List[int],
        ativo: bool,
        motivo_inativacao: str | None = None,
    ) -> int:
        if not ids:
            raise ValidationException("Informe ao menos um produto para atualizar status.")

        valid_ids: List[int] = []
        for raw_id in ids:
            pid = int(raw_id)
            if pid <= 0:
                raise ValidationException("ID de produto invalido na operacao em lote.")
            valid_ids.append(pid)

        motivo = (motivo_inativacao or "").strip() or None
        updated = self.product_repo.bulk_set_active(valid_ids, ativo=ativo, motivo_inativacao=motivo)


        return updated
    
    def delete_product(self, product_id: int) -> str:
        """
        Remove produto.
        
        Args:
            product_id: ID do produto
            
        Returns:
            Nome do produto removido
            
        Raises:
            ProductNotFoundException: Se não encontrado
        """
        # Busca produto antes de deletar
        product = self.get_product_by_id(product_id)
        
        # Remove do banco
        self.product_repo.delete(product_id)
        
        # Registra log
        pass
        
        return product.nome
    
    def get_total_stock_canoas(self) -> int:
        """Retorna total de estoque em Canoas."""
        return self.product_repo.get_total_stock_canoas()
    
    def get_total_stock_pf(self) -> int:
        """Retorna total de estoque em Passo Fundo."""
        return self.product_repo.get_total_stock_pf()
    
    def get_history_logs(self) -> List[Dict[str, Any]]:
        """Retorna todos os logs de histórico."""
        return []
    
    def get_exit_counts_for_abc(self) -> Dict[str, int]:
        """
        Retorna contagem de saídas por produto (para Curva ABC).
        
        Returns:
            Dicionário {produto_nome: quantidade_saidas}
        """
        return {}

    def get_dashboard_summary(self) -> Dict[str, Any]:
        """
        Retorna resumo para dashboard.
        """
        totals_by_loc = self.product_repo.get_stock_totals_by_location()
        itens_distintos = self.product_repo.count_products()
        zerados = self.product_repo.count_out_of_stock()
        
        locations_summary = []
        total_geral = 0
        
        conn = self.product_repo.db.get_connection()
        try:
            loc_repo = InventoryLocationRepository(conn)
            all_locs = loc_repo.get_all()
        finally:
            conn.close()
        
        for loc in all_locs:
            if not loc.ativo:
                continue
            total = totals_by_loc.get(loc.id, 0)
            total_geral += total
            locations_summary.append({
                "location_id": loc.id,
                "location_name": loc.name,
                "location_label": loc.label or loc.name,
                "color": loc.color,
                "total": total
            })

        return {
            "locations": locations_summary,
            "total_geral": total_geral,
            "itens_distintos": int(itens_distintos or 0),
            "zerados": int(zerados or 0),
        }


