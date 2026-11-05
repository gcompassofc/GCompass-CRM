-- 0127: abas "Não respondidas" e "Respondidas" das conversas (pedido do Allyson, 05/11/2026).
--
-- A conversa espera resposta quando a última mensagem é do cliente. A comparação fica
-- numa coluna calculada pelo banco para a lista filtrar e paginar no servidor: a API
-- do banco não compara duas colunas, e filtrar na tela só enxergaria as páginas já
-- carregadas. Pode rodar de novo sem estragar.

alter table public.conversations
  add column if not exists aguardando_resposta boolean
  generated always as (
    last_inbound_at is not null
    and (last_outbound_at is null or last_inbound_at > last_outbound_at)
  ) stored;

create index if not exists idx_conversations_aguardando_resposta
  on public.conversations (organization_id, aguardando_resposta, last_message_at desc);
