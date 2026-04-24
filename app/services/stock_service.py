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
from core.database.repositories.history_repository import HistoryRepository
from core.exceptions import DatabaseException, ValidationException


class StockService:
    """
    Serviço de Estoque.
    Responsabilidade única: Gerenciar operações de estoque.
    """
    
    def __init__(self):
        self.product_repo = ProductRepository()
        self.movement_repo = MovementRepository()
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

    def get_products_by_ids_as_dataframe(self, product_ids: List[int]) -> pd.DataFrame:
        """
        Retorna produtos selecionados como DataFrame, preservando a ordem enviada.
        """
        normalized_ids: List[int] = []
        seen: set[int] = set()
        for raw_id in product_ids:
            product_id = int(raw_id)
            if product_id <= 0 or product_id in seen:
                continue
            normalized_ids.append(product_id)
            seen.add(product_id)

        if not normalized_ids:
            return pd.DataFrame(columns=["ID", "Produto", "Canoas", "PF", "Total", "Onde tem"])

        products_data = self.product_repo.get_by_ids(normalized_ids)
        by_id = {int(item["id"]): item for item in products_data}

        data = []
        for product_id in normalized_ids:
            item = by_id.get(product_id)
            if not item:
                continue
            qtd_canoas = int(item.get("qtd_canoas") or 0)
            qtd_pf = int(item.get("qtd_pf") or 0)
            total = qtd_canoas + qtd_pf
            data.append(
                {
                    "ID": product_id,
                    "Produto": item.get("nome") or "",
                    "Canoas": qtd_canoas,
                    "PF": qtd_pf,
                    "Total": total,
                    "Onde tem": self._location_summary(qtd_canoas, qtd_pf),
                }
            )

        return pd.DataFrame(data, columns=["ID", "Produto", "Canoas", "PF", "Total", "Onde tem"])
    
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
        
        data_hora = datetime.now().strftime(DATE_FORMAT_DB)
        movement_obs = "Estoque inicial gerado no cadastro do produto."
        conn = self.product_repo.db.get_connection()

        try:
            conn.execute("BEGIN")
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO produtos (nome, qtd_canoas, qtd_pf, observacao, ativo)
                VALUES (?, ?, ?, ?, 1)
                """,
                (nome_normalizado, qtd_canoas, qtd_pf, observacao),
            )
            product_id = int(cursor.lastrowid)

            self.movement_repo.insert_history(
                conn,
                "CADASTRO",
                nome_normalizado,
                0,
                f"Inicial: C={qtd_canoas}/P={qtd_pf}",
                data_hora,
            )

            if qtd_canoas > 0:
                self.movement_repo.insert_movement(
                    conn,
                    "ENTRADA",
                    product_id,
                    qtd_canoas,
                    None,
                    "CANOAS",
                    movement_obs,
                    "OPERACAO_NORMAL",
                    None,
                    None,
                    "CADASTRO_INICIAL",
                    None,
                    data_hora,
                )

            if qtd_pf > 0:
                self.movement_repo.insert_movement(
                    conn,
                    "ENTRADA",
                    product_id,
                    qtd_pf,
                    None,
                    "PF",
                    movement_obs,
                    "OPERACAO_NORMAL",
                    None,
                    None,
                    "CADASTRO_INICIAL",
                    None,
                    data_hora,
                )

            conn.commit()
        except ValidationException:
            conn.rollback()
            raise
        except Exception as exc:
            conn.rollback()
            raise DatabaseException(f"Erro ao cadastrar produto: {exc}") from exc
        finally:
            conn.close()
        
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

    def _location_summary(self, qtd_canoas: int, qtd_pf: int) -> str:
        if qtd_canoas > 0 and qtd_pf > 0:
            return "Canoas / PF"
        if qtd_canoas > 0:
            return "Canoas"
        if qtd_pf > 0:
            return "PF"
        return "Sem saldo"

