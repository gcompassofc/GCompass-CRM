-- 0131: chave do OPA Radar (09/11/2026).
--
-- O Radar (coletor radar-ilhabela) manda as distribuições enviadas aos corretores
-- para Captações do Radar sozinho, por POST /api/v1/webhooks/opa-radar/<org>, com
-- esta chave. Fica na mesma tabela do token da porta de entrada: sem policy, só o
-- servidor (service_role) lê e grava. Pode rodar de novo sem estragar.

alter table public.opa_segredos add column if not exists radar_token text;
