#!/usr/bin/env bash
# Emergência: remove o segundo fator (aplicativo, e-mail ou WhatsApp) de quem perdeu o acesso.
# No próximo login ele será obrigado a cadastrar um novo (MFA é forçado p/ admin).
#
#   bash hostgator-setup-kit/reset-mfa.sh dono@empresa.com
source "$(dirname "$0")/_common.sh"
enter_project

EMAIL="${1:-}"
[ -n "$EMAIL" ] || die "Uso: reset-mfa.sh <email>"

c_ylw "Isto remove TODOS os fatores MFA de $EMAIL."
read -r -p "Confirmar? (s/N) " a; resposta_sim "$a" || die "Cancelado."

step "Removendo fatores MFA"
psql_run <<SQL
delete from auth.mfa_factors
where user_id = (select id from auth.users where email = '${EMAIL}');
-- Código por e-mail ou WhatsApp (0125) também sai: a pessoa entra só com a senha.
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) - 'segundo_fator' - 'segundo_fator_whatsapp'
where email = '${EMAIL}';
SQL
c_grn "✓ MFA removido. No próximo login, $EMAIL cadastra um novo autenticador."
