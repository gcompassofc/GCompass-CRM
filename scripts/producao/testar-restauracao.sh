#!/usr/bin/env bash
# Teste de restauração do banco do CRM da OPA (pendência E3 / tarefa #496).
#
# Pergunta que ele responde: se o banco sumir hoje, uma cópia tirada dele volta inteira?
#
# O que faz, tudo dentro da VPS, sem mandar dado para fora:
#   1. tira uma cópia do banco de produção (só leitura; é o mesmo que um backup faz);
#   2. sobe um Postgres vazio e temporário, sem porta aberta, com teto de memória e CPU;
#   3. restaura a cópia nele;
#   4. conta as linhas de cada tabela na produção e na cópia e compara;
#   5. apaga a cópia e o Postgres temporário, dê certo ou dê errado.
#
# Não escreve nada no banco de produção e não mexe no app, no WAHA nem no .env.
# Não imprime conteúdo de tabela: só nomes, contagens e tipos de erro.
#
# O que ele NÃO prova: o backup diário do próprio Supabase (isso se testa no painel do
# Supabase) e os arquivos do Storage, que não ficam no banco.
#
# Uso, pelo Git Bash:
#   bash "D:/3. GCompass/GCompass-CRM/scripts/producao/testar-restauracao.sh"
set -euo pipefail

VPS="root@187.41.110.169"
SSH="ssh -i $HOME/.ssh/opa_crm_ed25519 -o BatchMode=yes -o ConnectTimeout=20 $VPS"

# O roteiro vai para um arquivo na VPS antes de rodar: se o bash lesse o roteiro da entrada
# padrão, o primeiro comando que também lê a entrada (docker -i) engoliria o resto dele.
$SSH 'R=/root/.teste-restauracao.sh; umask 077; cat > "$R" && bash "$R" < /dev/null; s=$?; rm -f "$R"; exit $s' <<'NA_VPS'
set -euo pipefail
umask 077

NOME="crm-teste-restauracao"
IMAGEM="pgvector/pgvector:pg17"
PASTA="/opt/crm/backups/teste-restauracao"
DUMP="$PASTA/banco.dump"
ESQUEMAS="'public','private','auth','storage'"

cd /opt/crm
URL="$(grep '^SUPABASE_DB_URL=' .env | cut -d= -f2- | tr -d "\047\042")"
[ -n "$URL" ] || { echo "PAREI: não achei SUPABASE_DB_URL no .env." >&2; exit 1; }

limpar() {
  docker rm -fv "$NOME" >/dev/null 2>&1 || true
  rm -rf "$PASTA"
}
trap limpar EXIT
limpar
mkdir -p "$PASTA"

prod()  { docker run --rm -i --cpus 1 postgres:17-alpine psql "$URL" -v ON_ERROR_STOP=1 -At "$@"; }
copia() { docker exec -i "$NOME" psql -U postgres -d postgres -At "$@"; }

echo "== 1/6 Lista de tabelas e contagem na produção (antes)"
prod -c "select format('select %L, count(*) from %I.%I;', table_schema || '.' || table_name, table_schema, table_name)
           from information_schema.tables
          where table_type = 'BASE TABLE' and table_schema in ($ESQUEMAS)
          order by 1" > "$PASTA/contar.sql"
echo "   tabelas a conferir: $(wc -l < "$PASTA/contar.sql")"
prod < "$PASTA/contar.sql" | sort > "$PASTA/antes.txt"

echo "== 2/6 Cópia do banco de produção"
t0=$(date +%s)
docker run --rm --cpus 1 postgres:17-alpine pg_dump "$URL" -Fc --no-owner --no-privileges \
  -n public -n private -n auth -n storage > "$DUMP"
t1=$(date +%s)
echo "   cópia: $(du -h "$DUMP" | cut -f1) em $((t1 - t0)) s"
prod < "$PASTA/contar.sql" | sort > "$PASTA/depois.txt"

echo "== 3/6 Postgres temporário (sem porta aberta, 1 GB, 1 CPU)"
docker pull -q "$IMAGEM" >/dev/null
SENHA="$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9')"
docker run -d --name "$NOME" --memory 1g --cpus 1 -e POSTGRES_PASSWORD="$SENHA" "$IMAGEM" >/dev/null
for i in $(seq 1 60); do
  if docker exec "$NOME" pg_isready -q -h 127.0.0.1 -U postgres 2>/dev/null; then break; fi
  sleep 1
  [ "$i" = 60 ] && { echo "PAREI: o Postgres temporário não subiu." >&2; exit 1; }
done
copia -v ON_ERROR_STOP=1 -q <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role authenticator nologin;
create role supabase_admin nologin;
create role supabase_auth_admin nologin;
create role supabase_storage_admin nologin;
create role dashboard_user nologin;
create schema if not exists extensions;
create extension if not exists citext with schema public;
create extension if not exists pg_trgm with schema public;
create extension if not exists vector with schema public;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
SQL
echo "   pronto"

echo "== 4/6 Restauração"
t2=$(date +%s)
docker exec -i "$NOME" pg_restore -U postgres -d postgres --no-owner --no-privileges \
  < "$DUMP" 2> "$PASTA/erros.log" || true
t3=$(date +%s)
echo "   restaurado em $((t3 - t2)) s"

echo "== 5/6 Contagem na cópia e comparação"
copia < "$PASTA/contar.sql" 2>/dev/null | sort > "$PASTA/copia.txt" || true
awk -F'|' '
  FILENAME ~ /antes/  { a[$1] = $2; next }
  FILENAME ~ /depois/ { d[$1] = $2; next }
  FILENAME ~ /copia/  { c[$1] = $2; next }
  END {
    for (t in a) {
      total++
      linhas += a[t]
      lo = (a[t] < d[t]) ? a[t] : d[t]; hi = (a[t] > d[t]) ? a[t] : d[t]
      if (!(t in c))                 { faltou++; print "   FALTOU     " t " (produção: " a[t] ")" }
      else if (c[t] < lo || c[t] > hi) { difere++; print "   DIFERENTE  " t " (produção: " a[t] " a " d[t] ", cópia: " c[t] ")" }
      else                            { ok++; linhasOk += c[t] }
    }
    printf "   tabelas: %d | iguais: %d | diferentes: %d | faltando: %d\n", total, ok, difere + 0, faltou + 0
    printf "   linhas na produção: %d | linhas conferidas na cópia: %d\n", linhas, linhasOk
    exit (difere + faltou > 0) ? 2 : 0
  }' "$PASTA/antes.txt" "$PASTA/depois.txt" "$PASTA/copia.txt" && veredito=0 || veredito=$?

echo "== 6/6 Erros da restauração (só o tipo, sem conteúdo)"
total_erros="$(grep -c '^pg_restore: error' "$PASTA/erros.log" || true)"
erros_de_dado="$(grep -ciE 'COPY failed|could not execute COPY|error returned by PQputCopyData' "$PASTA/erros.log" || true)"
echo "   avisos de estrutura: $total_erros | erros ao copiar dado: $erros_de_dado"
grep -oE 'ERROR:  .*' "$PASTA/erros.log" | sed -E 's/"[^"]*"/"…"/g; s/\([^)]*\)/(…)/g' | cut -c1-90 | sort | uniq -c | sort -rn | head -8 | sed 's/^/   /' || true

docker rmi "$IMAGEM" >/dev/null 2>&1 || true
echo
if [ "$veredito" = 0 ] && [ "$erros_de_dado" = 0 ]; then
  echo "RESULTADO: a cópia voltou inteira. Todas as tabelas conferem com a produção."
else
  echo "RESULTADO: a cópia NÃO voltou inteira. Veja as linhas FALTOU e DIFERENTE acima."
  exit 2
fi
NA_VPS
