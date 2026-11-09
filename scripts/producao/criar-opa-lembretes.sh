#!/usr/bin/env bash
# Cria o número de avisos "OPA Lembretes" (sessão `opa-lembretes`) no CRM da OPA em produção.
# Detalhes e regras em criar-opa-lembretes.mjs (mesma pasta). Não mexe em nenhuma outra sessão.
#
# Quem roda é o Allyson (o modo auto do Claude Code não mexe na VPS). No PowerShell, pelo Git Bash:
#   & "C:\Program Files\Git\bin\bash.exe" "D:/3. GCompass/GCompass-CRM/scripts/producao/criar-opa-lembretes.sh" +5512991392393
#       -> só confere e diz o que faria (nada é gravado)
#   & "C:\Program Files\Git\bin\bash.exe" "D:/3. GCompass/GCompass-CRM/scripts/producao/criar-opa-lembretes.sh" +5512991392393 --valer
#       -> cria de verdade
#   & "C:\Program Files\Git\bin\bash.exe" "D:/3. GCompass/GCompass-CRM/scripts/producao/criar-opa-lembretes.sh" --conferir
#       -> só leitura: a linha no banco e o estado no WAHA
#
# O script .mjs vai pela entrada padrão para dentro do contêiner do app, que já tem as
# variáveis (Supabase e WAHA): nada de segredo passa pela sua máquina nem fica em arquivo.
set -euo pipefail

AQUI="$(cd "$(dirname "$0")" && pwd)"
VPS="root@187.41.110.169"
SSH="ssh -i $HOME/.ssh/opa_crm_ed25519 -o BatchMode=yes $VPS"
NO_APP="cd /opt/crm && docker compose -f docker-compose.prod.yml exec -T app"

if [ "${1:-}" = "--conferir" ]; then
  $SSH "$NO_APP node --input-type=module -" <<'JS'
const SB = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL).replace(/\/$/, "");
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const r = await fetch(`${SB}/rest/v1/channel_sessions?waha_session_name=eq.opa-lembretes&select=display_name,phone_number,status,owner_user_id,archived_at,created_at`, { headers: { apikey: SR, Authorization: `Bearer ${SR}` } });
console.log("banco:", JSON.stringify(await r.json()));
const w = await fetch(`${process.env.WAHA_API_BASE_URL.replace(/\/$/, "")}/api/sessions/opa-lembretes`, { headers: { "X-Api-Key": process.env.WAHA_API_KEY } });
const s = w.ok ? await w.json() : null;
console.log("WAHA:", w.status, s ? `${s.status}${s.me?.id ? " · " + s.me.id : ""}` : "sem sessão");
JS
  exit 0
fi

TELEFONE="${1:-}"
if [ -z "$TELEFONE" ]; then
  echo "Informe o chip do OPA Lembretes, ex.: criar-opa-lembretes.sh +5512991392393 [--valer]" >&2
  exit 1
fi
MODO="--seco"
[ "${2:-}" = "--valer" ] && MODO=""

if [ -n "$MODO" ]; then echo "== OPA Lembretes · número $TELEFONE · só conferência (nada é gravado)"; else echo "== OPA Lembretes · número $TELEFONE · criando de verdade"; fi
$SSH "$NO_APP node --input-type=module - --telefone=$TELEFONE $MODO" < "$AQUI/criar-opa-lembretes.mjs"

if [ -z "$MODO" ]; then
  echo
  echo "Agora: CRM > Gestão > Conexões > OPA Lembretes > Gerenciar > Reconectar, e leia o QR com o celular do chip."
  echo "Depois, a conferência só de leitura:"
  echo "  & \"C:\\Program Files\\Git\\bin\\bash.exe\" \"$AQUI/criar-opa-lembretes.sh\" --conferir"
fi
