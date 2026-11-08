/**
 * Task 4a do seam de canais — rede de caracterização do caminho de envio.
 *
 * Fixa os 6 desfechos que `sendMessageHandler` produz DEPOIS de inserir a linha
 * (`_handler.ts:219-318`), escrita contra o código ATUAL, antes de qualquer
 * refactor. As Tasks 4b–4d trocam `getWahaClient`/`resolveWahaChatId`/`sendMedia`
 * por `ChannelAdapter` — por isso aqui se asserta o **estado final da linha de
 * mensagem**, nunca a sequência de chamadas internas: teste que asserta chamada
 * travaria exatamente o refactor que ele deveria proteger.
 *
 * Fake próprio de propósito: `tests/invariants/automation-send-whatsapp.test.ts`
 * é o único outro teste que exercita este handler, mas arrasta `gov-helpers` e
 * exige Postgres real — e a pasta `tests/invariants/` está fora do `test:unit` e
 * do CI. Duplicar scaffolding é o preço de uma rede que gateia PR em segundos.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { sendMessageHandler } from '@/app/api/v1/messages/_handler';
import type { HandlerCtx } from '@/lib/api/handlers/types';
import type { SendMessageInput } from '@/lib/schemas';

const ORG = '11111111-1111-4111-8111-111111111111';
const CONV = '22222222-2222-4222-8222-222222222222';
const CONTACT = '33333333-3333-4333-8333-333333333333';
const SESSION = '44444444-4444-4444-8444-444444444444';
const USER = '55555555-5555-4555-8555-555555555555';
const WAHA_BASE = 'http://localhost:3030';

// A URL assinada do Storage é montada com o admin client; ele valida env no
// import, e o desfecho de mídia precisa controlar sucesso E falha da assinatura.
const signedUrl = vi.fn<() => Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }>>(
  async () => ({ data: { signedUrl: 'https://signed.example/a.jpg' }, error: null }),
);
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ storage: { from: () => ({ createSignedUrl: signedUrl }) } }),
}));
// Audit é fire-and-forget e escreve em outra tabela; fora do escopo dos desfechos.
vi.mock('@/lib/audit', () => ({ audit: vi.fn(async () => {}) }));

type Row = Record<string, unknown>;

interface ConversationShape {
  isGroup?: boolean;
  groupChatId?: string | null;
  phoneNumber?: string | null;
  waIdentity?: string | null;
  isBlocked?: boolean;
  sessionStatus?: string | null;
  provider?: string;
  /** Canal excluído pelo usuário (migration 0106) — a linha sobrevive, o canal não. */
  archivedAt?: string | null;
  /**
   * Quando o contato escreveu pela última vez. O padrão é uma data: a maioria dos
   * casos fala de conversa já em andamento, que NÃO passa pela consulta de número
   * (08/11/2026). `null` = primeiro contato, que consulta antes de enviar.
   */
  lastInboundAt?: string | null;
}

function conversationRow(shape: ConversationShape = {}): Row {
  return {
    id: CONV,
    organization_id: ORG,
    contact_id: CONTACT,
    channel_session_id: SESSION,
    is_group: shape.isGroup ?? false,
    group_chat_id: shape.groupChatId ?? null,
    last_inbound_at: shape.lastInboundAt === undefined ? '2026-11-01T12:00:00Z' : shape.lastInboundAt,
    contacts: {
      phone_number: shape.phoneNumber === undefined ? '+5531999998888' : shape.phoneNumber,
      wa_identity: shape.waIdentity ?? null,
      is_blocked: shape.isBlocked ?? false,
    },
    channel_sessions:
      shape.sessionStatus === null
        ? null
        : {
            // `provider` sai do banco desde a migration 0087 — o handler não
            // supõe mais o canal, então a linha falsa também não pode supor.
            provider: shape.provider ?? 'waha',
            waha_session_name: 'default',
            status: shape.sessionStatus ?? 'WORKING',
            archived_at: shape.archivedAt ?? null,
          },
  };
}

/**
 * Fake de `SupabaseClient` com o mínimo que o handler encadeia:
 *   conversations: select().eq().maybeSingle() · update().eq()
 *   messages:      insert().select().single() · update().eq().select().maybeSingle()
 *   rpc('emit_event')
 * O update é merge raso — igual ao que o Postgres faz com um SET de colunas.
 */
function makeSupabase(
  conversation: Row,
  templateRow: Row | null = null,
  /** `semColunaArquivada`: banco em que a migration 0106 ainda não rodou. */
  opts: { semColunaArquivada?: boolean } = {},
) {
  const state: { message: Row | null } = { message: null };

  const client = {
    from(table: string) {
      if (table === 'conversations') {
        return {
          select: (cols?: string) => ({
            eq: () => ({
              maybeSingle: async () =>
                opts.semColunaArquivada === true && (cols ?? '').includes('archived_at')
                  ? {
                      data: null,
                      error: {
                        code: '42703',
                        message: 'column channel_sessions_1.archived_at does not exist',
                      },
                    }
                  : { data: conversation, error: null },
            }),
          }),
          update: () => ({ eq: async () => ({ error: null }) }),
        };
      }
      if (table === 'meta_templates') {
        // O espelho local do template. `templateRow` é injetado por caso; null
        // simula template que não existe (ou WABA errada).
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({ maybeSingle: async () => ({ data: templateRow, error: null }) }),
              }),
            }),
          }),
        };
      }
      if (table === 'messages') {
        return {
          insert: (row: Row) => {
            state.message = {
              id: 'msg-1',
              external_id: null,
              ack: null,
              error_code: null,
              error_message: null,
              ...row,
            };
            return { select: () => ({ single: async () => ({ data: { ...state.message }, error: null }) }) };
          },
          update: (patch: Row) => {
            state.message = { ...state.message, ...patch };
            return {
              eq: () => ({
                select: () => ({ maybeSingle: async () => ({ data: { ...state.message }, error: null }) }),
              }),
            };
          },
        };
      }
      throw new Error(`fake_supabase: tabela inesperada '${table}'`);
    },
    rpc: async () => ({ error: null }),
  };

  return client as unknown as SupabaseClient;
}

const ctx: HandlerCtx = { organization_id: ORG, actor: { type: 'user', id: USER }, requestId: 'req-1' };

function textInput(over: Partial<SendMessageInput> = {}): SendMessageInput {
  return { conversation_id: CONV, type: 'text', body: 'oi', ...over } as SendMessageInput;
}

function wahaConfigured(configured: boolean) {
  vi.stubEnv('WAHA_API_BASE_URL', configured ? WAHA_BASE : '');
  vi.stubEnv('WAHA_API_KEY', configured ? 'hash123' : '');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  signedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed.example/a.jpg' }, error: null });
});

describe('sendMessageHandler — os 6 desfechos do envio', () => {
  it('1. WAHA não configurado: fica queued com queued_reason, nada sai pela rede', async () => {
    wahaConfigured(false);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const msg = await sendMessageHandler(makeSupabase(conversationRow()), ctx, textInput());

    expect(msg.status).toBe('queued');
    expect((msg.metadata as Record<string, unknown>).queued_reason).toBe('waha_not_configured');
    expect(msg.error_code).toBeNull();
    expect(msg.external_id).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('2. sem destinatário resolvível: failed/missing_phone_number', async () => {
    wahaConfigured(true);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const msg = await sendMessageHandler(
      makeSupabase(conversationRow({ phoneNumber: null, waIdentity: null })),
      ctx,
      textInput(),
    );

    expect(msg.status).toBe('failed');
    expect(msg.error_code).toBe('missing_phone_number');
    expect(msg.error_message).toBe('Contato sem telefone para envio WhatsApp.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('3. sessão fora de WORKING: fica queued com channel_session_not_working', async () => {
    wahaConfigured(true);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const msg = await sendMessageHandler(
      makeSupabase(conversationRow({ sessionStatus: 'SCAN_QR_CODE' })),
      ctx,
      textInput(),
    );

    expect(msg.status).toBe('queued');
    expect((msg.metadata as Record<string, unknown>).queued_reason).toBe('channel_session_not_working');
    expect(msg.error_code).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // Os desfechos 4 e 5 gravam a MESMA linha final. O que os separa é o efeito
  // externo — por qual endpoint a mensagem saiu. Isso não é "sequência de
  // chamadas internas": é o que de fato deixa o processo, e o refactor das
  // Tasks 4b–4d tem que preservá-lo (o adapter WAHA fala com o mesmo WAHA).
  it('4. com media_storage_path: sent + external_id + ack 0, pelo endpoint de mídia', async () => {
    wahaConfigured(true);
    const fetchMock = vi.fn(async (..._args: unknown[]) => Response.json({ id: { _serialized: 'MEDIA1' } }));
    vi.stubGlobal('fetch', fetchMock);

    const msg = await sendMessageHandler(
      makeSupabase(conversationRow()),
      ctx,
      textInput({ type: 'image', body: undefined, media_storage_path: `${ORG}/${CONV}/a.jpg`, media_mime: 'image/jpeg' }),
    );

    expect(msg.status).toBe('sent');
    expect(msg.external_id).toBe('MEDIA1');
    expect(msg.ack).toBe(0);
    expect(msg.error_code).toBeNull();
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`${WAHA_BASE}/api/sendImage`);
  });

  it('5. texto puro: sent + external_id + ack 0, pelo endpoint de texto', async () => {
    wahaConfigured(true);
    const fetchMock = vi.fn(async (..._args: unknown[]) => Response.json({ key: { id: 'TEXT1' } }));
    vi.stubGlobal('fetch', fetchMock);

    const msg = await sendMessageHandler(makeSupabase(conversationRow()), ctx, textInput());

    expect(msg.status).toBe('sent');
    expect(msg.external_id).toBe('TEXT1');
    expect(msg.ack).toBe(0);
    expect(msg.error_code).toBeNull();
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`${WAHA_BASE}/api/sendText`);
    // Task 7: a sessão que chega ao fio sai de `resolveSessionRef` (que escolhe a
    // COLUNA conforme o provider), não mais de um acesso direto à coluna do
    // provider legado. Sem esta linha, um resolvedor que devolva a coluna errada
    // manda `session: undefined` e a rede inteira continua verde — medido.
    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)) as {
      session: string;
    };
    expect(body.session).toBe('default');
  });

  it('6. envio lança: failed/waha_error com a mensagem do erro', async () => {
    wahaConfigured(true);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })));

    const msg = await sendMessageHandler(makeSupabase(conversationRow()), ctx, textInput());

    expect(msg.status).toBe('failed');
    expect(msg.error_code).toBe('waha_error');
    // Desde 08/11/2026 o texto leva o corpo da resposta: é ele que diz o motivo.
    expect(msg.error_message).toBe('waha_500: boom');
    expect(msg.external_id).toBeNull();
  });

  // Task 7: o fallback de `error_message` quando o throw NÃO é um `Error`. O
  // valor vai para o banco, então trocá-lo é mudança de comportamento — ele saiu
  // do literal no handler para `adapter.codes`, com o mesmo texto.
  it('6c. throw que não é Error: error_message vem de adapter.codes.unknownError', async () => {
    wahaConfigured(true);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw 'nao-sou-um-Error';
      }),
    );

    const msg = await sendMessageHandler(makeSupabase(conversationRow()), ctx, textInput());

    expect(msg.status).toBe('failed');
    expect(msg.error_code).toBe('waha_error');
    expect(msg.error_message).toBe('waha_unknown');
  });

  // Task 6: o canal sai do banco (`channel_sessions.provider`, migration 0087) e
  // não de um literal. Esta é a sabotagem que reprova o retorno do `getAdapter("waha")`
  // fixo: com o literal de volta, a sessão enviaria pelo canal errado e o teste ficaria
  // vermelho por não ter lançado.
  //
  // ⚠️ Este caso usava `meta_cloud` como "provider sem adapter". Na Fase 3b o adapter
  // da Meta nasceu, e ele deixou de servir — a rede pegou a mudança, que é o trabalho
  // dela. Trocado por um provider que NÃO existe: o que se testa aqui é o fail-closed,
  // não qual canal está pronto. Amarrar o caso a um canal específico o faria expirar de
  // novo na próxima fase.
  it('7. o canal vem da sessão: provider desconhecido falha fechado, não cai em nenhum canal', async () => {
    wahaConfigured(true);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      sendMessageHandler(
        makeSupabase(conversationRow({ provider: 'canal_inexistente' })),
        ctx,
        textInput(),
      ),
    ).rejects.toThrow(/unknown_channel_provider: canal_inexistente/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('7b. sessão meta_cloud agora RESOLVE adapter — a Fase 3b o criou', async () => {
    // O par com o caso 7 é o que dá sentido aos dois: um prova que provider
    // desconhecido não vaza para canal nenhum; este prova que o canal oficial
    // deixou de ser desconhecido.
    wahaConfigured(true);
    vi.stubEnv('META_PHONE_NUMBER_ID', '1103328999528818');
    vi.stubEnv('META_SYSTEM_USER_TOKEN', 'tok');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ id: 'wamid.META' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const msg = await sendMessageHandler(
      makeSupabase(conversationRow({ provider: 'meta_cloud' })),
      ctx,
      textInput(),
    );
    expect((msg as { status: string }).status).toBe('sent');
    expect(String(fetchMock.mock.calls[0]![0])).toContain('graph.facebook.com');
  });

  it('6b. assinatura do Storage falha: failed/storage_sign_failed, não waha_error', async () => {
    wahaConfigured(true);
    signedUrl.mockResolvedValue({ data: null, error: { message: 'no_object' } });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const msg = await sendMessageHandler(
      makeSupabase(conversationRow()),
      ctx,
      textInput({ type: 'image', body: undefined, media_storage_path: `${ORG}/${CONV}/a.jpg`, media_mime: 'image/jpeg' }),
    );

    expect(msg.status).toBe('failed');
    expect(msg.error_code).toBe('storage_sign_failed');
    expect(msg.error_message).toContain('no_object');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // A ORDEM entre os desfechos é comportamento, não detalhe: se o pre-check de
  // configuração descer para depois da resolução do destinatário, uma instalação
  // sem WAHA passa a marcar a mensagem como `failed` em vez de deixá-la em fila.
  it('ordem: sem WAHA E sem telefone → waha_not_configured, nunca missing_phone_number', async () => {
    wahaConfigured(false);
    vi.stubGlobal('fetch', vi.fn());

    const msg = await sendMessageHandler(
      makeSupabase(conversationRow({ phoneNumber: null, waIdentity: null })),
      ctx,
      textInput(),
    );

    expect(msg.status).toBe('queued');
    expect((msg.metadata as Record<string, unknown>).queued_reason).toBe('waha_not_configured');
    expect(msg.error_code).toBeNull();
  });

  it('8. type=template envia pelo caminho do template e grava nome e idioma', async () => {
    // O ramo NOVO. Grava `template_name`/`template_language` porque o tipo sozinho
    // não responde "qual template custou o quê" — e template é cobrado por entrega.
    wahaConfigured(true);
    vi.stubEnv('META_PHONE_NUMBER_ID', '1103328999528818');
    vi.stubEnv('META_SYSTEM_USER_TOKEN', 'tok');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ id: 'wamid.TPL' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const msg = await sendMessageHandler(
      makeSupabase(conversationRow({ provider: 'meta_cloud' }), {
        name: 'pedido_confirmado',
        language: 'pt_BR',
        status: 'APPROVED',
        contract_hash: 'h',
        components: [{ type: 'BODY', text: 'Ola {{1}}' }],
      }),
      ctx,
      {
        conversation_id: 'conv-1',
        type: 'template',
        template_name: 'pedido_confirmado',
        template_language: 'pt_BR',
        template_values: { '1': 'Rafael' },
      } as Parameters<typeof sendMessageHandler>[2],
    );

    const linha = msg as unknown as { status: string; external_id: string; template_name: string };
    expect(linha.status).toBe('sent');
    expect(linha.external_id).toBe('wamid.TPL');
    expect(linha.template_name).toBe('pedido_confirmado');
    expect(String(fetchMock.mock.calls[0]![0])).toContain('graph.facebook.com');
  });

  it('8b. template ausente do espelho FALHA, não envia às cegas', async () => {
    // Sem esta guarda, um nome errado viraria 132000 na Meta — cobrado e tarde.
    wahaConfigured(true);
    vi.stubEnv('META_PHONE_NUMBER_ID', '1103328999528818');
    vi.stubEnv('META_SYSTEM_USER_TOKEN', 'tok');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const msg = await sendMessageHandler(
      makeSupabase(conversationRow({ provider: 'meta_cloud' }), null),
      ctx,
      {
        conversation_id: 'conv-1',
        type: 'template',
        template_name: 'nao_existe',
        template_language: 'pt_BR',
        template_values: {},
      } as Parameters<typeof sendMessageHandler>[2],
    );

    const linha = msg as unknown as { status: string; error_message: string };
    expect(linha.status).toBe('failed');
    expect(linha.error_message).toMatch(/template_missing/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  /**
   * ⭐ A promessa do `comment on column` de 0100 ("não é mais elegível para envio")
   * virando comportamento. `failed` e não `queued` porque fila implica "sai depois",
   * e por este canal não sai nunca: o número já foi deslogado no transporte, e o
   * ledger do agente lê `queued` como algo a reconciliar mais tarde.
   */
  it('8. canal ARQUIVADO: failed/channel_archived, nada sai pela rede', async () => {
    wahaConfigured(true);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const msg = await sendMessageHandler(
      makeSupabase(conversationRow({ archivedAt: '2026-08-05T10:00:00.000Z' })),
      ctx,
      textInput(),
    );

    expect(msg.status).toBe('failed');
    expect(msg.error_code).toBe('channel_archived');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  /**
   * ⭐ Este é O caminho de saída do sistema (UI, automação, MCP e agente passam
   * por aqui). Num clone que subiu o CÓDIGO sem aplicar a migration 0106 — cenário
   * medido neste projeto —, pedir `archived_at` direto derrubaria TODO envio com
   * 42703. Sem a coluna nada está arquivado, então repetir sem ela é o resultado
   * exato, não um paliativo.
   */
  it('9. banco sem a coluna archived_at (migration não aplicada): o envio segue normalmente', async () => {
    wahaConfigured(true);
    const fetchMock = vi.fn(async (..._args: unknown[]) => Response.json({ key: { id: 'TEXT9' } }));
    vi.stubGlobal('fetch', fetchMock);

    const msg = await sendMessageHandler(
      makeSupabase(conversationRow(), null, { semColunaArquivada: true }),
      ctx,
      textInput(),
    );

    expect(msg.status).toBe('sent');
    expect(msg.external_id).toBe('TEXT9');
  });
});

/**
 * Consulta de número antes do primeiro envio (08/11/2026). Lead de formulário com
 * número sem WhatsApp somou 7 "Falhou" com o texto "waha_500" e nada mais.
 * Fetch roteado por URL: a consulta e o envio são chamadas diferentes ao WAHA.
 */
describe('sendMessageHandler — número sem WhatsApp no primeiro contato', () => {
  type Existe = { numberExists: boolean; chatId?: string | null; pn?: string | null };
  function wahaFalso(consulta: (phone: string) => Existe | 'erro') {
    const chamadas: Array<{ url: string; body?: Record<string, unknown> }> = [];
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      chamadas.push({ url, body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined });
      if (url.includes('/api/contacts/check-exists')) {
        const r = consulta(new URL(url).searchParams.get('phone') ?? '');
        return r === 'erro' ? new Response('down', { status: 500 }) : Response.json(r);
      }
      return Response.json({ key: { id: 'TXT' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    return chamadas;
  }
  const envios = (c: Array<{ url: string; body?: Record<string, unknown> }>) => c.filter((x) => x.url.endsWith('/api/sendText'));

  it('nenhuma forma do número tem conta: failed/numero_sem_whatsapp e nada é enviado', async () => {
    wahaConfigured(true);
    const chamadas = wahaFalso(() => ({ numberExists: false }));

    const msg = await sendMessageHandler(
      makeSupabase(conversationRow({ lastInboundAt: null, phoneNumber: '+5511965365270' })),
      ctx,
      textInput(),
    );

    expect(msg.status).toBe('failed');
    expect(msg.error_code).toBe('numero_sem_whatsapp');
    expect(msg.error_message).toMatch(/não tem WhatsApp/);
    expect(envios(chamadas)).toHaveLength(0);
    // Pergunta as duas formas (com e sem o nono dígito) antes de afirmar.
    const consultados = chamadas.map((c) => new URL(c.url).searchParams.get('phone'));
    expect(consultados).toEqual(['5511965365270', '551165365270']);
  });

  it('o WhatsApp conhece o número sem o nono dígito: envia para essa forma', async () => {
    wahaConfigured(true);
    const chamadas = wahaFalso((phone) =>
      phone === '5531998966398'
        ? { numberExists: true, chatId: '123456789@lid', pn: '553198966398@c.us' }
        : { numberExists: false },
    );

    const msg = await sendMessageHandler(
      makeSupabase(conversationRow({ lastInboundAt: null, phoneNumber: '+5531998966398' })),
      ctx,
      textInput(),
    );

    expect(msg.status).toBe('sent');
    expect(envios(chamadas)[0]?.body?.chatId).toBe('553198966398@c.us');
  });

  it('consulta devolve só @lid: envia para o número montado, não para o @lid', async () => {
    wahaConfigured(true);
    const chamadas = wahaFalso(() => ({ numberExists: true, chatId: '999@lid', pn: null }));

    const msg = await sendMessageHandler(
      makeSupabase(conversationRow({ lastInboundAt: null, phoneNumber: '+5511965365270' })),
      ctx,
      textInput(),
    );

    expect(msg.status).toBe('sent');
    expect(envios(chamadas)[0]?.body?.chatId).toBe('5511965365270@c.us');
  });

  it('consulta fora do ar: envia como antes (a consulta nunca segura uma mensagem)', async () => {
    wahaConfigured(true);
    const chamadas = wahaFalso(() => 'erro');

    const msg = await sendMessageHandler(
      makeSupabase(conversationRow({ lastInboundAt: null })),
      ctx,
      textInput(),
    );

    expect(msg.status).toBe('sent');
    expect(envios(chamadas)).toHaveLength(1);
  });

  it('uma forma diz que não e a outra falha: não afirma "sem WhatsApp", envia', async () => {
    wahaConfigured(true);
    const chamadas = wahaFalso((phone) => (phone === '5511965365270' ? { numberExists: false } : 'erro'));

    const msg = await sendMessageHandler(
      makeSupabase(conversationRow({ lastInboundAt: null, phoneNumber: '+5511965365270' })),
      ctx,
      textInput(),
    );

    expect(msg.status).toBe('sent');
    expect(envios(chamadas)).toHaveLength(1);
  });

  it('contato que já escreveu nesta conversa: não consulta', async () => {
    wahaConfigured(true);
    const chamadas = wahaFalso(() => ({ numberExists: false }));

    const msg = await sendMessageHandler(makeSupabase(conversationRow()), ctx, textInput());

    expect(msg.status).toBe('sent');
    expect(chamadas.some((c) => c.url.includes('check-exists'))).toBe(false);
  });

  it('grupo: não consulta', async () => {
    wahaConfigured(true);
    const chamadas = wahaFalso(() => ({ numberExists: false }));

    const msg = await sendMessageHandler(
      makeSupabase(conversationRow({ lastInboundAt: null, isGroup: true, groupChatId: '120363@g.us' })),
      ctx,
      textInput(),
    );

    expect(msg.status).toBe('sent');
    expect(chamadas.some((c) => c.url.includes('check-exists'))).toBe(false);
  });
});
