"""Refaz as versões leves da foto da tela de acesso da OPA.

Uso (na raiz do repositório): python scripts/opa-foto-login.py
Lê public/opa/login-caneca.jpg e grava login-caneca-<largura>.avif e .webp
em 480, 768 e 1000 px. Precisa do Pillow com AVIF (Pillow 11.2 ou mais novo).
"""
from pathlib import Path

from PIL import Image

PASTA = Path(__file__).resolve().parent.parent / "public" / "opa"
ORIGINAL = PASTA / "login-caneca.jpg"

foto = Image.open(ORIGINAL).convert("RGB")
largura0, altura0 = foto.size
for largura in (480, 768, 1000):
    altura = round(altura0 * largura / largura0)
    versao = foto.resize((largura, altura), Image.LANCZOS)
    versao.save(PASTA / f"login-caneca-{largura}.avif", quality=55)
    versao.save(PASTA / f"login-caneca-{largura}.webp", quality=78, method=6)
    print(f"ok: {largura}px")
