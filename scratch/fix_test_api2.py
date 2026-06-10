import os

path = r"backend\tests\test_api.py"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace('["qtd_canoas"]', '["inventories"]["11"]')
content = content.replace('["qtd_pf"]', '["inventories"]["12"]')
content = content.replace('"qtd_canoas":', '"inventories": {"11":')
# Wait, replacing '"qtd_canoas": 2, "qtd_pf": 3' directly is hard.
# I'll just use regex.

import re

# Fix POST /produtos  ({"nome": "Produto Fluxo Inicial", "qtd_canoas": 2, "qtd_pf": 3})
content = re.sub(r'"qtd_canoas":\s*(\d+),\s*"qtd_pf":\s*(\d+)', r'"inventories": {"11": \1, "12": \2}', content)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

print("test_api.py patched.")
