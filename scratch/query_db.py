import sqlite3

conn = sqlite3.connect('estoque.db')
c = conn.cursor()

c.execute("""
    SELECT c.produto_id, p.nome 
    FROM inventory_counts c
    JOIN produtos p ON p.id = c.produto_id
    WHERE c.session_id = 4 AND (p.nome LIKE '%69%' OR CAST(p.id AS TEXT) = '69')
""")
print(c.fetchall())
