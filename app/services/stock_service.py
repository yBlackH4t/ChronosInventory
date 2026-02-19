"""
Serviço de gerenciamento de estoque.
Responsabilidade: Orquestrar operações de estoque (CRUD + Movimentações).
"""

import pandas as pd
from typing import Tuple, List, Dict, Any
from app.models.product import Product
from app.models.stock_movement import StockMovement
from app.models.validators import ProductValidator, StockMovementValidator
from core.database.repositories.product_repository import ProductRepository
from core.database.repositories.history_repository import HistoryRepository
from core.exceptions import ValidationException, InsufficientStockException


class StockService:
    """
    Serviço de Estoque.
    Responsabilidade única: Gerenciar operações de estoque.
    """
    
    def __init__(self):
        self.product_repo = ProductRepository()
        self.history_repo = HistoryRepository()
    
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
    
    def get_products_as_dataframe(self, search_term: str = "") -> pd.DataFrame:
        """
        Retorna produtos como DataFrame (compatibilidade com UI antiga).
        
        Args:
            search_term: Termo de busca (opcional)
            
        Returns:
            DataFrame com produtos
        """
        products = self.get_all_products(search_term)
        
        if not products:
            return pd.DataFrame(columns=['ID', 'Produto', 'Canoas', 'PF'])
        
        data = [
            {
                'ID': p.id,
                'Produto': p.nome,
                'Canoas': p.qtd_canoas,
                'PF': p.qtd_pf
            }
            for p in products
        ]
        
        return pd.DataFrame(data)
    
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
            from core.exceptions import ProductNotFoundException
            raise ProductNotFoundException(f"Produto com ID {product_id} não encontrado.")
        
        return Product.from_dict(product_data)
    
    def add_product(self, nome: str, qtd_canoas: int, qtd_pf: int, observacao: str | None = None) -> Product:
        """
        Adiciona novo produto.
        
        Args:
            nome: Nome do produto
            qtd_canoas: Quantidade em Canoas
            qtd_pf: Quantidade em Passo Fundo
            
        Returns:
            Produto criado
            
        Raises:
            ValidationException: Se dados inválidos
        """
        # Valida dados
        ProductValidator.validate_product_data(nome, qtd_canoas, qtd_pf)
        
        # Normaliza nome
        nome_normalizado = nome.strip().upper()
        
        # Adiciona no banco
        product_id = self.product_repo.add(nome_normalizado, qtd_canoas, qtd_pf, observacao)
        
        # Registra log
        self.history_repo.add_log(
            "CADASTRO",
            nome_normalizado,
            0,
            f"Inicial: C={qtd_canoas}/P={qtd_pf}"
        )
        
        # Retorna produto criado
        return Product(
            id=product_id,
            nome=nome_normalizado,
            qtd_canoas=qtd_canoas,
            qtd_pf=qtd_pf,
            observacao=observacao or "",
            ativo=True,
        )

    def update_product(
        self,
        product_id: int,
        nome: str | None = None,
        qtd_canoas: int | None = None,
        qtd_pf: int | None = None,
        observacao: str | None = None
    ) -> Product:
        """
        Atualiza dados do produto.
        
        Args:
            product_id: ID do produto
            nome: Nome do produto (opcional)
            qtd_canoas: Quantidade em Canoas (opcional)
            qtd_pf: Quantidade em Passo Fundo (opcional)
            
        Returns:
            Produto atualizado
            
        Raises:
            ValidationException: Se dados inválidos
            ProductNotFoundException: Se não encontrado
        """
        # Busca produto atual
        current = self.get_product_by_id(product_id)
        
        # Valida e normaliza nome se fornecido
        if nome is not None:
            ProductValidator.validate_product_name(nome)
            nome_normalizado = nome.strip().upper()
        else:
            nome_normalizado = current.nome
        
        # Valida quantidades se fornecidas
        if qtd_canoas is not None:
            ProductValidator.validate_stock_quantity(qtd_canoas)
        else:
            qtd_canoas = current.qtd_canoas
        
        if qtd_pf is not None:
            ProductValidator.validate_stock_quantity(qtd_pf)
        else:
            qtd_pf = current.qtd_pf
        
        # Observacao
        if observacao is None:
            observacao = current.observacao

        # Atualiza no banco
        self.product_repo.update_details(product_id, nome_normalizado, qtd_canoas, qtd_pf, observacao)
        
        return Product(
            id=product_id,
            nome=nome_normalizado,
            qtd_canoas=qtd_canoas,
            qtd_pf=qtd_pf,
            observacao=observacao or "",
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

        self.history_repo.add_log(
            "ATIVACAO" if ativo else "INATIVACAO",
            "LOTE",
            updated,
            f"Atualizacao em lote de status | ids={','.join(str(pid) for pid in valid_ids)}"
            + (f" | motivo={motivo}" if motivo else ""),
        )
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
        self.history_repo.add_log(
            "EXCLUSAO",
            product.nome,
            0,
            "Item removido do sistema"
        )
        
        return product.nome
    
    def process_stock_movement(self, movement: StockMovement) -> bool:
        """
        Processa movimentação de estoque.
        
        Args:
            movement: Dados da movimentação
            
        Returns:
            True se processado com sucesso
            
        Raises:
            ValidationException: Se dados inválidos
            InsufficientStockException: Se estoque insuficiente
        """
        # Valida movimentação
        StockMovementValidator.validate_movement_data(
            movement.operation_type,
            movement.quantity,
            movement.location,
            movement.transfer_direction
        )
        
        # Busca produto atual
        product = self.get_product_by_id(movement.product_id)
        
        # Calcula deltas
        delta_canoas = movement.get_delta_canoas()
        delta_pf = movement.get_delta_pf()
        
        # Valida estoque suficiente para saídas/transferências
        if delta_canoas < 0:
            StockMovementValidator.validate_sufficient_stock(
                product.qtd_canoas,
                abs(delta_canoas),
                "Canoas"
            )
        
        if delta_pf < 0:
            StockMovementValidator.validate_sufficient_stock(
                product.qtd_pf,
                abs(delta_pf),
                "Passo Fundo"
            )
        
        # Atualiza estoque
        self.product_repo.update_stock(movement.product_id, delta_canoas, delta_pf)
        
        # Registra log
        self.history_repo.add_log(
            movement.operation_type.upper(),
            movement.product_name,
            movement.quantity,
            movement.get_log_observation()
        )
        
        return True
    
    def get_total_stock_canoas(self) -> int:
        """Retorna total de estoque em Canoas."""
        return self.product_repo.get_total_stock_canoas()
    
    def get_total_stock_pf(self) -> int:
        """Retorna total de estoque em Passo Fundo."""
        return self.product_repo.get_total_stock_pf()
    
    def get_history_logs(self) -> List[Dict[str, Any]]:
        """Retorna todos os logs de histórico."""
        return self.history_repo.get_all_logs()
    
    def get_exit_counts_for_abc(self) -> Dict[str, int]:
        """
        Retorna contagem de saídas por produto (para Curva ABC).
        
        Returns:
            Dicionário {produto_nome: quantidade_saidas}
        """
        return self.history_repo.get_exit_count_by_product()

    def get_dashboard_summary(self) -> Dict[str, int]:
        """
        Retorna resumo para dashboard.
        """
        total_canoas = self.product_repo.get_total_stock_canoas()
        total_pf = self.product_repo.get_total_stock_pf()
        itens_distintos = self.product_repo.count_products()
        zerados = self.product_repo.count_out_of_stock()
        return {
            "total_canoas": int(total_canoas or 0),
            "total_pf": int(total_pf or 0),
            "total_geral": int((total_canoas or 0) + (total_pf or 0)),
            "itens_distintos": int(itens_distintos or 0),
            "zerados": int(zerados or 0),
        }

