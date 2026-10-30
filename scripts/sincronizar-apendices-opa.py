"""
Regrava no supabase/baseline.sql os apêndices das migrations do CRM da OPA
(0110 em diante) a partir dos arquivos de migration, para os dois nunca
divergirem. Tudo depois do primeiro "APÊNDICE 0110" é substituído.

Uso (na raiz do repositório):  python scripts/sincronizar-apendices-opa.py
"""
import glob
import os
import re

BASE = "supabase/baseline.sql"
MARCA = "\n-- ============================================================================\n-- APÊNDICE 0110"

s = open(BASE, encoding="utf-8", newline="").read()
nl = "\r\n" if "\r\n" in s else "\n"
s = s.replace("\r\n", "\n")
i = s.find(MARCA)
if i >= 0:
    s = s[:i]
s = s.rstrip("\n") + "\n"

partes = []
for f in sorted(glob.glob("supabase/migrations/2026*_01[1-9][0-9]_*.sql")):
    ts, resto = os.path.basename(f).split("_", 1)
    if not re.match(r"01[1-9]\d_", resto) or resto < "0110":
        continue
    corpo = open(f, encoding="utf-8").read().replace("\r\n", "\n").rstrip("\n")
    partes.append(
        "\n-- ============================================================================\n"
        f"-- APÊNDICE {resto[:-4]} (CRM da OPA) — espelho exato da migration {ts}.\n"
        "-- ============================================================================\n"
        "set search_path = public, extensions;\n\n" + corpo + "\n"
    )
s += "".join(partes) + "\nnotify pgrst, 'reload schema';\n"
open(BASE, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
print(f"{len(partes)} apêndices da OPA no baseline.")
