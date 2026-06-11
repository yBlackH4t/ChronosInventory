import sqlite3
import sys

conn = sqlite3.connect('estoque.db')
for row in conn.execute("SELECT sql FROM sqlite_master WHERE type='table'"):
    print(row[0])
