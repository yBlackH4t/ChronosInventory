import pandas as pd
import os
import math
from typing import Dict, Any, List, Optional
from datetime import datetime

from app.services.movement_service import MovementService
from app.services.stock_service import StockService
from app.services.inventory_location_service import InventoryLocationService
from core.exceptions import ValidationException, NotFoundException, ProductNotFoundException
from app.services.movement_rules_service import NATUREZA_AJUSTE, MOTIVO_AJUSTE_CORRECAO_INVENTARIO, NATUREZA_OPERACAO_NORMAL

class DynamicImportService:
    def __init__(self, movement_service: MovementService, stock_service: StockService, location_service: InventoryLocationService):
        self.movement_service = movement_service
        self.stock_service = stock_service
        self.location_service = location_service

    def _clean_value(self, val: Any) -> str:
        if pd.isna(val):
            return ""
        if isinstance(val, float):
            if val.is_integer():
                return str(int(val))
        return str(val).strip()

    def analyze_file(self, filepath: str) -> Dict[str, Any]:
        try:
            if filepath.endswith(".csv"):
                df = pd.read_csv(filepath, nrows=5)
            else:
                df = pd.read_excel(filepath, nrows=5)
                
            headers = [str(col).strip() for col in df.columns.tolist()]
            
            preview = []
            for _, row in df.iterrows():
                preview_row = {str(k).strip(): self._clean_value(v) for k, v in row.items()}
                preview.append(preview_row)
                
            return {
                "headers": headers,
                "preview": preview
            }
        except Exception as e:
            raise ValidationException(f"Erro ao analisar o arquivo: {str(e)}")

    def execute_import(self, filepath: str, match_by: str, name_col: str, id_col: str, location_mappings: Dict[str, str], update_stock: bool = True, motivo: Optional[str] = "Ajuste via Importação de Planilha") -> Dict[str, Any]:
        if filepath.endswith(".csv"):
            df = pd.read_csv(filepath)
        else:
            df = pd.read_excel(filepath)
            
        imported = 0
        updated = 0
        skipped = 0
        errors = []
        
        # Load all locations to check if mapped ones exist
        active_locations = self.location_service.get_all_active()
        loc_map = {str(loc.id): loc.id for loc in active_locations}
        
        for idx, row in df.iterrows():
            try:
                product = None
                product_name = self._clean_value(row.get(name_col))
                product_id_str = self._clean_value(row.get(id_col)) if id_col else ""
                
                if match_by == "name":
                    if not product_name:
                        errors.append(f"Linha {idx+2}: Nome do produto vazio. Ignorando.")
                        skipped += 1
                        continue
                    
                    try:
                        product = self.stock_service.get_product_by_name(product_name)
                    except (NotFoundException, ProductNotFoundException):
                        product = None
                        
                elif match_by == "id":
                    if not product_id_str:
                        errors.append(f"Linha {idx+2}: ID vazio. Ignorando.")
                        skipped += 1
                        continue
                        
                    try:
                        product_id = int(product_id_str)
                        product = self.stock_service.get_product_by_id(product_id)
                    except ValueError:
                        errors.append(f"Linha {idx+2}: ID inválido '{product_id_str}'.")
                        skipped += 1
                        continue
                    except (NotFoundException, ProductNotFoundException):
                        product = None

                is_new = False
                if not product:
                    # Create new product
                    if not product_name:
                         errors.append(f"Linha {idx+2}: Tentativa de criar novo produto sem nome.")
                         skipped += 1
                         continue
                         
                    new_product_id = None
                    if product_id_str:
                        try:
                            new_product_id = int(product_id_str)
                        except ValueError:
                            pass
                            
                    product = self.stock_service.add_product(
                        nome=product_name, 
                        inventories={}, 
                        observacao="Criado via Importação",
                        product_id=new_product_id
                    )
                    is_new = True
                    imported += 1
                else:
                    updated += 1
                    
                # Update inventory for each mapped location
                if update_stock:
                    for loc_id_str, col_name in location_mappings.items():
                        if not col_name or loc_id_str not in loc_map:
                            continue
                            
                        loc_id = loc_map[loc_id_str]
                        qty_str = self._clean_value(row.get(col_name))
                        if not qty_str:
                            continue
                            
                        try:
                            imported_qty = int(float(qty_str))
                        except ValueError:
                            errors.append(f"Linha {idx+2}: Quantidade inválida '{qty_str}' na coluna {col_name}.")
                            continue
                            
                        if imported_qty < 0:
                            imported_qty = 0
                            
                        # Calculate delta and apply movement
                        # For a new product, current stock is 0
                        current_qty = 0
                        if not is_new:
                            current_qty = product.inventories.get(loc_id, 0)
                            
                        delta = imported_qty - current_qty
                        
                        if delta != 0:
                            tipo = "ENTRADA" if delta > 0 else "SAIDA"
                            abs_delta = abs(delta)
                            
                            origem = None
                            destino = None
                            
                            if tipo == "ENTRADA":
                                destino = str(loc_id)
                            else:
                                origem = str(loc_id)
                                
                            self.movement_service.create_movement(
                                tipo=tipo,
                                produto_id=product.id,
                                quantidade=abs_delta,
                                origem=origem,
                                destino=destino,
                                observacao=motivo or ("Saldo Inicial" if is_new else "Ajuste de Estoque"),
                                natureza=NATUREZA_OPERACAO_NORMAL if is_new else NATUREZA_AJUSTE,
                                motivo_ajuste=None if is_new else MOTIVO_AJUSTE_CORRECAO_INVENTARIO,
                                local_externo=None,
                                documento=None,
                                movimento_ref_id=None,
                                data=datetime.now()
                            )
                        
            except Exception as e:
                errors.append(f"Linha {idx+2}: Erro inesperado - {str(e)}")
                skipped += 1
                
        return {
            "imported": imported,
            "updated": updated,
            "skipped": skipped,
            "errors": errors[:50],  # Return max 50 errors
            "message": "Importação processada com sucesso." if not errors else f"Processado com {len(errors)} erros."
        }
