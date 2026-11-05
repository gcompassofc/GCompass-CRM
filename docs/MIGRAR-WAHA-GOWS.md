---
tags: [cliente/opa, tipo/plano]
atualizado: 2026-11-05
status: vigente
---

# Etiqueta "Lead OPA" e a regra de entrada no CRM

Testado em 05/11/2026 com número Business real no ambiente local: etiqueta antiga, etiqueta nova, mensagens e resposta pelo CRM. No banco do WAHA ficaram 0 mensagens e 0 contatos.

## A regra

Toda conversa é pessoal e não aparece no CRM. Só entra quem tem a etiqueta "Lead OPA", quem é cadastrado e quem chega por anúncio ou pelo site.

Lead sem a etiqueta interna `proprio` é da OPA. O corretor não o marca como pessoal, não o torna próprio e não desliga os avisos. Só o gestor faz, e fica registrado.

Mensagem de quem não é lead fica cifrada por até 7 dias, sem tela nenhuma, para o histórico recente entrar quando virar lead.

## Por que o motor GOWS

No NOWEB sem armazenamento, o evento de etiqueta não sai: o WAHA consulta o armazenamento para montá-lo e dá erro. No GOWS dá para guardar só as etiquetas (`CONFIG_DA_SESSAO` em `lib/waha/client.ts`).

- O evento chega sem o nome da etiqueta: o CRM compara pelo id e, sem conhecer, consulta a lista do número.
- O WAHA não avisa as etiquetas que já existiam ao conectar. A rotina `conciliarEtiquetas` lê a lista a cada 5 minutos, no máximo 20 por número em cada rodada.
- O telefone é a identidade do contato: mensagem por `@lid` com telefone no payload segue pelo telefone.

## A virada

O motor vale para o contêiner inteiro. Ao publicar, o WhatsApp de todos os números cai até cada um ler o QR Code de novo, inclusive o OPA Lembretes. A sessão antiga fica no volume `waha-data`.

1. Rodar `scripts/producao/publicar-opa.sh supabase/migrations/20261105010000_0126_opa_lead_da_opa_travado.sql supabase/migrations/20261105020000_0127_conversa_aguardando_resposta.sql`.
2. Cada corretor abre Meu WhatsApp e lê o QR Code. O OPA Lembretes reconecta em Conexões.
3. Conferir `channel_sessions.etiqueta_lead_id` preenchido em cada número.
4. Clicar num anúncio de verdade e conferir que entrou como lead pago.

## Voltar atrás

O script imprime o comando que volta o app. Para o WAHA, publicar o commit anterior devolve o motor NOWEB e o volume antigo. As sessões antigas podem pedir novo QR Code.
