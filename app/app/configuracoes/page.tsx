import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { carregarConfig, type CampoLead, type ConfigOpa, type GrupoEtiqueta } from "@/lib/opa/config";
import { MODELO_BOAS_VINDAS, montarBoasVindas, textoProprioNaTela, VARIAVEIS_BOAS_VINDAS } from "@/lib/opa/boas-vindas-texto";
import { telefoneLegivel } from "@/lib/opa/aviso-whatsapp";
import { carregarEquipe, type Pessoa } from "@/lib/opa/dados";
import { createClient } from "@/lib/supabase/server";
import {
  ArrowRight,
  ArrowsClockwise,
  Buildings,
  CaretDown,
  CaretUp,
  ClipboardText,
  Clock,
  Eye,
  IdentificationCard,
  Info,
  Lock,
  Megaphone,
  Moon,
  PaperPlaneTilt,
  Pause,
  Plus,
  SlidersHorizontal,
  Tag,
  Target,
  Trash,
  WhatsappLogo,
  X,
  XCircle,
} from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { CabecalhoOpa, CorpoOpa } from "../_opa/cabecalho";
import { FormComRetorno } from "../_opa/form-com-retorno";
import { AbasPilula, Avatar, BotaoPilula, Cartao, Chip, IconeRedondo, TituloBloco, iniciaisDe, type Icone } from "../_opa/ui";
import {
  adicionarCampo,
  adicionarCampoVisita,
  adicionarEtiqueta,
  adicionarMotivo,
  alternarMotivoDefinitivo,
  alternarNaRoleta,
  alternarBoasVindas,
  salvarAssinaturas,
  alternarObrigatorioVisita,
  moverCampo,
  moverNaRoleta,
  removerCampo,
  removerCampoVisita,
  removerEtiqueta,
  removerMotivo,
  salvarCaptacao,
  salvarDestinosDosAvisos,
  salvarHorario,
  salvarModeloBoasVindas,
  salvarPrazos,
} from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Configurações" };

type Aba = "roleta" | "mensagens" | "etiquetas" | "campos" | "visita" | "perda" | "horario";

const ABAS: Array<[Aba, string, Icone]> = [
  ["roleta", "Roleta", ArrowsClockwise],
  ["mensagens", "Mensagens padrão", PaperPlaneTilt],
  ["etiquetas", "Etiquetas", Tag],
  ["campos", "Campos do lead", IdentificationCard],
  ["visita", "Ficha de visita", ClipboardText],
  ["perda", "Motivos de perda", XCircle],
  ["horario", "Horário", Clock],
];

const entrada =
  "h-11 rounded-[16px] bg-[#f2f6f9] px-4 text-[14px] text-[#0a2d40] outline-none placeholder:text-[#5b7284] focus:ring-2 focus:ring-[#8fc4dd]";
const botaoPrimario =
  "inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-[#0a2d40] px-5 text-[14px] font-semibold text-white hover:bg-[#12455f]";
const botaoIcone =
  "flex size-8 items-center justify-center rounded-full text-[#5b7284] hover:bg-white hover:text-[#12455f] disabled:pointer-events-none disabled:opacity-30";
const linhaLista = "flex items-center gap-3 rounded-[22px] bg-[#f2f6f9] p-3.5";

export default async function ConfiguracoesPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app");
  if (org.role !== "manager" && org.role !== "admin") redirect("/app/hoje");
  const { aba: abaParam } = await searchParams;
  const aba: Aba = ABAS.some(([k]) => k === abaParam) ? (abaParam as Aba) : "roleta";
  const supabase = await createClient();

  const [config, equipe] = await Promise.all([carregarConfig(supabase, org.orgId), carregarEquipe(org.orgId)]);

  return (
    <>
      <CabecalhoOpa secao="Configuração" titulo="Configurações" subtitulo="As regras da conta, num lugar só" icone={SlidersHorizontal} equipe={false} />
      <CorpoOpa>
        <AbasPilula
          itens={ABAS.map(([k, r, I]) => ({
            href: k === "roleta" ? "/app/configuracoes" : `/app/configuracoes?aba=${k}`,
            rotulo: r,
            icone: I,
            ativo: aba === k,
          }))}
        />

        {aba === "roleta" && <AbaRoleta config={config} equipe={equipe} />}
        {aba === "mensagens" && <AbaMensagens config={config} equipe={equipe} />}
        {aba === "etiquetas" && <AbaEtiquetas config={config} orgId={org.orgId} />}
        {aba === "campos" && <AbaCampos config={config} />}
        {aba === "visita" && <AbaVisita config={config} />}
        {aba === "perda" && <AbaPerda config={config} />}
        {aba === "horario" && <AbaHorario config={config} />}
      </CorpoOpa>
    </>
  );
}

// ---------------------------------------------------------------- peças

function Interruptor({ ligado, rotulo }: { ligado: boolean; rotulo: string }) {
  return (
    <button
      type="submit"
      aria-pressed={ligado}
      aria-label={rotulo}
      title={rotulo}
      className={cn("relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors", ligado ? "bg-[#2a7ca8]" : "bg-[#c6d3db]")}
    >
      <span className={cn("absolute size-[22px] rounded-full bg-white shadow transition-transform", ligado ? "translate-x-[23px]" : "translate-x-[3px]")} />
    </button>
  );
}

function Seletor({ nome, valor, opcoes }: { nome: string; valor: number; opcoes: Array<[number, string]> }) {
  const lista = opcoes.some(([v]) => v === valor) ? opcoes : [...opcoes, [valor, String(valor)] as [number, string]];
  return (
    <select name={nome} defaultValue={valor} className="h-11 shrink-0 rounded-full bg-white px-3 text-[14px] font-semibold text-[#0a2d40] outline-none focus:ring-2 focus:ring-[#8fc4dd]">
      {lista.map(([v, r]) => (
        <option key={v} value={v}>
          {r}
        </option>
      ))}
    </select>
  );
}

/** Uma regra: rótulo à esquerda, valor (texto ou seletor) à direita. */
function Regra({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-[18px] bg-[#f2f6f9] px-4 py-3 text-[14px]">
      <span className="font-medium text-[#0a2d40]">{rotulo}</span>
      <span className="flex items-center gap-2 text-right text-[13px] text-[#5b7284]">{children}</span>
    </li>
  );
}

function Nota({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-[12px] text-[#5b7284]">
      <Info className="mt-0.5 size-3.5 shrink-0 text-[#2a7ca8]" /> <span>{children}</span>
    </p>
  );
}

function BotoesOrdem({ i, total }: { i: number; total: number }) {
  return (
    <>
      <button type="submit" name="direcao" value="subir" disabled={i === 0} className={botaoIcone} aria-label="Subir">
        <CaretUp className="size-4" />
      </button>
      <button type="submit" name="direcao" value="descer" disabled={i === total - 1} className={botaoIcone} aria-label="Descer">
        <CaretDown className="size-4" />
      </button>
    </>
  );
}

// ---------------------------------------------------------------- roleta

function OrdemCorretores({
  ids,
  equipe,
  qual,
  pausados,
  ultimo,
}: {
  ids: string[];
  equipe: Map<string, Pessoa>;
  qual: "leads" | "captacao";
  pausados?: Set<string>;
  ultimo?: string | null;
}) {
  const ativos = ids.filter((id) => !pausados?.has(id));
  const proximo = ativos.length ? ativos[(ativos.indexOf(ultimo ?? "") + 1) % ativos.length] : null;
  const ordem = ids.join(",");
  return (
    <ul className="flex flex-col gap-2">
      {ids.map((id, i) => {
        const p = equipe.get(id);
        const pausado = pausados?.has(id) ?? false;
        return (
          <li key={id} className={cn(linhaLista, "flex-wrap sm:flex-nowrap", pausado && "opacity-60")}>
            <span className="w-4 text-center text-[13px] font-semibold tabular-nums text-[#5b7284]">{i + 1}</span>
            <Avatar texto={iniciaisDe(p?.nome ?? "?")} foto={p?.foto} tom={id === proximo && qual === "leads" ? "escuro" : "claro"} />
            <div className="min-w-[55%] flex-1 sm:min-w-0">
              <p className="truncate text-[15px] font-semibold text-[#0a2d40]">{p?.nome ?? "Pessoa removida"}</p>
              {qual === "leads" && (
                <div className="mt-0.5">
                  {pausado ? (
                    <Chip icone={Pause}>pula a vez</Chip>
                  ) : id === proximo ? (
                    <Chip icone={ArrowRight} tom="acao">
                      próximo
                    </Chip>
                  ) : (
                    <span className="text-[12px] text-[#5b7284]">na roleta</span>
                  )}
                </div>
              )}
            </div>
            <form action={moverNaRoleta} className="ml-auto flex sm:ml-0">
              <input type="hidden" name="roleta" value={qual} />
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="ordem" value={ordem} />
              <BotoesOrdem i={i} total={ids.length} />
            </form>
            {qual === "leads" && (
              <form action={alternarNaRoleta}>
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="ordem" value={ordem} />
                <Interruptor ligado={!pausado} rotulo={pausado ? "Voltar para a roleta" : "Tirar da roleta"} />
              </form>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function AbaRoleta({ config, equipe }: { config: ConfigOpa; equipe: Map<string, Pessoa> }) {
  // Sem ordem salva, a roleta começa pelos atendentes (como o seed e a porta de entrada fazem).
  const atendentes = [...equipe.values()].filter((p) => p.papel === "agent").map((p) => p.id);
  const roleta = config.roleta.length ? config.roleta : atendentes;
  // Quem atende e ainda não está na ordem: aparece desligado, com o interruptor para entrar.
  const fora = [...equipe.values()].filter((p) => p.papel !== "viewer" && !roleta.includes(p.id));
  const ordemCaptacao = config.captacao.ordem.length ? config.captacao.ordem : roleta;
  const pausados = new Set(config.roleta_pausados);
  const prioridade = [
    "Lead que já está no CRM fica com o corretor responsável",
    "Lead próprio (link, WhatsApp ou cadastro) fica com o corretor",
    "Cliente da carteira fica com o dono da carteira",
    "Imóvel com captação ativa vai para o captador",
    "Conversa no WhatsApp do corretor só entra com a etiqueta Lead OPA",
    "O resto vai para o próximo da roleta",
  ];

  return (
    <div className="grid gap-5 xl:grid-cols-2 [&>*]:min-w-0">
      <div className="flex flex-col gap-5">
        <Cartao bloco tour="roleta-ordem">
          <TituloBloco
            icone={ArrowsClockwise}
            titulo="Roleta de leads"
            sub="Tráfego pago, site e formulário, direto no WhatsApp do corretor"
            acao={<Chip tom="claro">{roleta.length - pausados.size} na vez</Chip>}
          />
          <div className="mt-5">
            <OrdemCorretores ids={roleta} equipe={equipe} qual="leads" pausados={pausados} ultimo={config.roleta_ultimo} />
          </div>
          {fora.length > 0 && (
            <div className="mt-5 border-t border-[#e7eef2] pt-5">
              <p className="text-[13px] font-semibold text-[#5b7284]">Fora da roleta · ligue para entrar no fim da fila</p>
              <ul className="mt-3 flex flex-col gap-2">
                {fora.map((p) => (
                  <li key={p.id} className={cn(linhaLista, "opacity-80")}>
                    <Avatar texto={iniciaisDe(p.nome)} foto={p.foto} tom="claro" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold text-[#0a2d40]">{p.nome}</p>
                      <span className="text-[12px] text-[#5b7284]">não recebe lead da roleta</span>
                    </div>
                    <form action={alternarNaRoleta}>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="ordem" value={roleta.join(",")} />
                      <Interruptor ligado={false} rotulo="Colocar na roleta" />
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Cartao>

        <Cartao bloco tour="roleta-prazos">
          <TituloBloco icone={Clock} titulo="Prazos do primeiro atendimento" sub="Sem resposta no prazo, o lead passa para o próximo" />
          <FormComRetorno action={salvarPrazos} sucesso="Prazos salvos." className="mt-5 flex flex-col gap-5">
            <ul className="flex flex-col gap-2">
              <Regra rotulo="Tráfego pago">
                avisos aos {config.prazos.avisos_pago.join(" e ")} min, troca em
                <Seletor nome="pago_min" valor={config.prazos.pago_min} opcoes={[[30, "30 min"], [60, "1 h"], [120, "2 h"]]} />
              </Regra>
              <Regra rotulo="Orgânico">
                avisos aos {config.prazos.avisos_organico.join(", ")} min, troca em
                <Seletor nome="organico_min" valor={config.prazos.organico_min} opcoes={[[120, "2 h"], [180, "3 h"], [240, "4 h"]]} />
              </Regra>
              <Regra rotulo="Prazo, avisos e troca valem para">lead do site e de formulário de anúncio</Regra>
              <Regra rotulo="Lead trazido pelo próprio corretor">fica com ele, sem prazo e sem troca</Regra>
              <Regra rotulo="Roleta inteira sem resposta">escala para a gestão</Regra>
              <Regra rotulo="Fora do horário">o relógio para; só um lembrete aos 30 min</Regra>
            </ul>
            <div>
              <p className="mb-2 text-[13px] font-semibold text-[#34566b]">Lead que já tem dono e entra de novo</p>
              <ul className="flex flex-col gap-2">
                <Regra rotulo="Outro formulário (site ou Meta)">direto ao corretor, card marcado &quot;voltou&quot;</Regra>
                <Regra rotulo="Negócio aberto">corretor responsável, sempre</Regra>
                <Regra rotulo="Ganho ou perdido há menos de">
                  <Seletor nome="volta_dias" valor={config.volta_dias} opcoes={[[30, "30 dias"], [90, "90 dias"], [180, "180 dias"], [365, "1 ano"]]} />
                  mesmo corretor
                </Regra>
                <Regra rotulo="Corretor saiu da OPA ou da roleta">o gestor redistribui</Regra>
              </ul>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Nota>Mesmo lead é o mesmo telefone ou o mesmo e-mail.</Nota>
              <button type="submit" className={botaoPrimario}>
                Salvar prazos
              </button>
            </div>
          </FormComRetorno>
        </Cartao>
      </div>

      <div className="flex flex-col gap-5">
        <Cartao bloco escuro tour="roleta-regras">
          <TituloBloco icone={ArrowRight} claro titulo="Quem fica com o lead" sub="Nesta ordem; a roleta é a última regra" />
          <ol className="mt-5 flex flex-col gap-2">
            {prioridade.map((t, i) => (
              <li key={t} className="flex items-center gap-3 rounded-[18px] bg-white/[0.06] px-4 py-3 text-[14px] text-white/90">
                <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold", i === prioridade.length - 1 ? "bg-[#2a7ca8] text-white" : "bg-white/10 text-white")}>
                  {i + 1}
                </span>
                {t}
              </li>
            ))}
          </ol>
          <p className="mt-4 flex items-start gap-2 text-[12px] text-white/65">
            <Info className="mt-0.5 size-3.5 shrink-0" /> Lead que volta não passa pela roleta e não conta como vez de ninguém.
          </p>
        </Cartao>

        <Cartao bloco>
          <TituloBloco icone={Target} titulo="Roleta de captação" sub="OPA Radar: imóveis que a OPA ainda não tem" />
          <FormComRetorno action={salvarCaptacao} sucesso="Captação salva." className="mt-5 flex flex-col gap-4">
            <ul className="flex flex-col gap-2">
              <Regra rotulo="Imóveis por semana, por corretor">
                <Seletor nome="por_semana" valor={config.captacao.por_semana} opcoes={[[1, "1"], [2, "2"], [3, "3"]]} />
              </Regra>
              <Regra rotulo="Prazo da devolutiva">
                <Seletor nome="devolutiva_dias" valor={config.captacao.devolutiva_dias} opcoes={[[5, "5 dias"], [7, "7 dias"], [10, "10 dias"]]} />
              </Regra>
              <Regra rotulo="Cadastro completo no Painel">
                <Seletor nome="cadastro_dias" valor={config.captacao.cadastro_dias} opcoes={[[10, "10 dias"], [15, "15 dias"], [20, "20 dias"]]} />
              </Regra>
              <Regra rotulo="Tentativas antes da gestão">
                <Seletor nome="tentativas" valor={config.captacao.tentativas} opcoes={[[2, "2"], [3, "3"], [4, "4"]]} />
              </Regra>
              <Regra rotulo="Mais tempo, a pedido">uma vez, mais {config.captacao.mais_tempo_dias} dias</Regra>
              <Regra rotulo="Sem retorno no prazo">passa para o próximo</Regra>
              <Regra rotulo="Quem fica com a captação">quem cadastrar primeiro, com fotos</Regra>
              <Regra rotulo="Parceria entre corretores">divide os 15%, 50/50</Regra>
            </ul>
            <div className="flex justify-end">
              <button type="submit" className={botaoPrimario}>
                Salvar captação
              </button>
            </div>
          </FormComRetorno>
          <p className="mb-2 mt-6 text-[13px] font-semibold text-[#34566b]">Ordem da captação</p>
          <OrdemCorretores ids={ordemCaptacao} equipe={equipe} qual="captacao" />
          <div className="mt-4">
            <Nota>Quem já tentou aquele imóvel é pulado; o OPA Lembretes avisa o corretor novo e quem perdeu.</Nota>
          </div>
        </Cartao>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- mensagens

function AbaMensagens({ config, equipe }: { config: ConfigOpa; equipe: Map<string, Pessoa> }) {
  // Quem pode receber lead da roleta: a assinatura de cada um.
  const naRoleta = (config.roleta.length ? config.roleta : [...equipe.values()].filter((p) => p.papel === "agent").map((p) => p.id))
    .map((id) => equipe.get(id))
    .filter((p): p is Pessoa => Boolean(p));
  const exemplo = montarBoasVindas({
    modelo: config.boas_vindas.modelo,
    nomeLead: "Marlene",
    corretor: "Cristian",
    imovelCodigo: "CA006779",
    bairro: "Siriúba",
    canal: "meta",
    publicado: true,
    respostas: { relacao: "ja_vim_algumas", finalidade: "moradia_veraneio" },
  });
  return (
    <div className="flex max-w-3xl flex-col gap-5">
    <Cartao bloco>
      <TituloBloco
        icone={WhatsappLogo}
        titulo="Boas-vindas ao lead de formulário"
        sub="Sai do WhatsApp do corretor da vez, em até um minuto, assinada com o nome dele"
        acao={
          <form action={alternarBoasVindas}>
            <Interruptor ligado={config.boas_vindas.ligada} rotulo={config.boas_vindas.ligada ? "Desligar a boas-vindas" : "Ligar a boas-vindas"} />
          </form>
        }
      />
      <div className="mt-5 whitespace-pre-line rounded-[20px] bg-[#e7f6ee] px-4 py-3 text-[14px] leading-relaxed text-[#0a2d40]">{exemplo}</div>
      <ul className="mt-4 flex flex-col gap-2 text-[13px] text-[#34566b]">
        <li className="flex items-start gap-2">
          <Info className="mt-0.5 size-4 shrink-0 text-[#2a7ca8]" /> Só para lead novo do formulário do anúncio ou do site. Quem volta, quem já conversa com o corretor e contato particular não recebem.
        </li>
        <li className="flex items-start gap-2">
          <Info className="mt-0.5 size-4 shrink-0 text-[#2a7ca8]" /> Nunca sai por outro número: sem o WhatsApp do corretor conectado, não manda e o motivo fica no histórico do lead.
        </li>
        <li className="flex items-start gap-2">
          <Info className="mt-0.5 size-4 shrink-0 text-[#2a7ca8]" /> Não conta como resposta: o prazo de primeiro atendimento continua valendo.
        </li>
      </ul>
      {naRoleta.length > 0 && (
        <FormComRetorno action={salvarAssinaturas} sucesso="Assinaturas salvas." className="mt-5 flex flex-col gap-3">
          <p className="text-[13px] font-semibold text-[#5b7284]">Como cada corretor assina (&ldquo;Aqui é o ...&rdquo;) e o texto próprio dele</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {naRoleta.map((p) => (
              <li key={p.id} className="flex flex-col gap-2 rounded-[18px] bg-[#f2f6f9] px-3 py-2">
                <div className="flex items-center gap-2.5">
                  <Avatar texto={iniciaisDe(p.nome)} foto={p.foto} tom="claro" />
                  <label className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] text-[#5b7284]">{p.nome}</span>
                    <input
                      name={`assina_${p.id}`}
                      defaultValue={config.boas_vindas.assinaturas[p.id] ?? ""}
                      placeholder={p.nome.split(" ")[0]}
                      maxLength={40}
                      className="h-9 w-full rounded-full bg-white px-3 text-[14px] font-semibold text-[#0a2d40] outline-none focus:ring-2 focus:ring-[#8fc4dd]"
                    />
                  </label>
                </div>
                <textarea
                  name={`texto_${p.id}`}
                  aria-label={`Texto próprio de ${p.nome}`}
                  rows={3}
                  maxLength={600}
                  defaultValue={textoProprioNaTela(config.boas_vindas, p.id, [p.nome, config.boas_vindas.assinaturas[p.id]])}
                  placeholder="Vazio usa o texto da casa"
                  className="w-full resize-y rounded-[14px] bg-white px-3 py-2 text-[13px] text-[#0a2d40] outline-none placeholder:text-[#8aa0ae] focus:ring-2 focus:ring-[#8fc4dd]"
                />
              </li>
            ))}
          </ul>
          <div>
            <button type="submit" className={botaoPrimario}>
              Salvar assinaturas e textos
            </button>
          </div>
        </FormComRetorno>
      )}
      <FormComRetorno action={salvarModeloBoasVindas} sucesso="Texto salvo." className="mt-5 flex flex-col gap-3">
        <label className="text-[13px] font-semibold text-[#5b7284]" htmlFor="modelo-boas-vindas">
          Texto (vazio usa o texto da casa)
        </label>
        <textarea
          id="modelo-boas-vindas"
          name="modelo"
          rows={9}
          maxLength={600}
          defaultValue={config.boas_vindas.modelo}
          placeholder={MODELO_BOAS_VINDAS}
          className="w-full resize-y rounded-[18px] bg-[#f2f6f9] px-4 py-3 text-[14px] text-[#0a2d40] outline-none placeholder:text-[#8aa0ae] focus:ring-2 focus:ring-[#8fc4dd]"
        />
        <div className="flex flex-wrap gap-1.5">
          {VARIAVEIS_BOAS_VINDAS.map(([v, d]) => (
            <span key={v} title={d} className="rounded-full bg-[#eef3f6] px-2.5 py-1 font-mono text-[11px] text-[#34566b]">
              {v}
            </span>
          ))}
        </div>
        <div>
          <button type="submit" className={botaoPrimario}>
            Salvar texto
          </button>
        </div>
      </FormComRetorno>
    </Cartao>
    <Cartao bloco>
      <TituloBloco icone={PaperPlaneTilt} titulo="Mensagens padrão" sub="Vêm do Kit de Atendimento OPA (26/10/2026)" />
      <div className="mt-5 flex flex-wrap gap-1.5">
        {["Atendimento em 6 etapas", "Resgate", "Áudios", "Objeções"].map((t) => (
          <Chip key={t} tom="claro">
            {t}
          </Chip>
        ))}
        {["Médio", "Alto", "Off market"].map((t) => (
          <Chip key={t} icone={Buildings}>
            {t}
          </Chip>
        ))}
      </div>
      <p className="mt-5 flex items-start gap-2 text-[14px] text-[#34566b]">
        <Info className="mt-0.5 size-4 shrink-0 text-[#2a7ca8]" /> O que mudar no kit vale na hora para todos os corretores, dentro da conversa também.
      </p>
      <div className="mt-6">
        <BotaoPilula href="/app/kit" icone={ArrowRight} tom="escuro">
          Abrir o Kit de mensagens
        </BotaoPilula>
      </div>
    </Cartao>
    </div>
  );
}

// ---------------------------------------------------------------- etiquetas

async function contagemDeEtiquetas(orgId: string): Promise<Map<string, number>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("crm_leads").select("tags, custom_fields").eq("organization_id", orgId).eq("status", "open");
  if (error) throw new Error(`contagemDeEtiquetas: ${error.message}`);
  const mapa = new Map<string, number>();
  const somar = (k: string) => mapa.set(k, (mapa.get(k) ?? 0) + 1);
  for (const l of (data ?? []) as Array<{ tags: string[] | null; custom_fields: { etiquetas?: Record<string, string[]> } | null }>) {
    for (const [grupo, valores] of Object.entries(l.custom_fields?.etiquetas ?? {})) {
      for (const v of valores ?? []) somar(`${grupo}:${v}`);
    }
    // Off market também vem da etiqueta do sistema (lib/opa/dados.ts).
    if ((l.tags ?? []).includes("off-market-comprador")) somar("offmarket:Comprador off market");
    if ((l.tags ?? []).includes("off-market-proprietario")) somar("offmarket:Proprietário off market");
  }
  return mapa;
}

function ChipEtiqueta({ grupo, valor, n }: { grupo: string; valor: string; n: number }) {
  return (
    <span className="group inline-flex items-center gap-1.5 rounded-full bg-[#f2f6f9] py-1.5 pl-3.5 pr-2 text-[13px] text-[#0a2d40]">
      {valor}
      <span className="rounded-full bg-white px-1.5 text-[11px] tabular-nums text-[#5b7284]">{n}</span>
      <form action={removerEtiqueta} className="hidden group-hover:block">
        <input type="hidden" name="grupo" value={grupo} />
        <input type="hidden" name="valor" value={valor} />
        <button type="submit" className="flex rounded-full p-0.5 text-[#5b7284] hover:text-[#a4410e]" aria-label={`Remover ${valor}`}>
          <X className="size-3" />
        </button>
      </form>
    </span>
  );
}

function CartaoGrupo({ g, contagem }: { g: GrupoEtiqueta; contagem: Map<string, number> }) {
  const chips = (vals: string[]) => (
    <div className="flex flex-wrap gap-1.5">
      {vals.map((v) => (
        <ChipEtiqueta key={v} grupo={g.chave} valor={v} n={contagem.get(`${g.chave}:${v}`) ?? 0} />
      ))}
    </div>
  );
  const soltos = g.subgrupos ? g.opcoes.filter((o) => !Object.values(g.subgrupos!).flat().includes(o)) : [];
  return (
    <Cartao className={cn(g.destaque && "ring-2 ring-[#8fc4dd]")}>
      <TituloBloco icone={Tag} titulo={g.nome} sub={g.nota ?? `${g.chave}:`} />
      <div className="mt-4 flex flex-col gap-3">
        {g.subgrupos ? (
          <>
            {Object.entries(g.subgrupos).map(([regiao, vals]) => (
              <div key={regiao}>
                <p className="mb-1.5 text-[12px] font-semibold text-[#2a7ca8]">{regiao}</p>
                {chips(vals)}
              </div>
            ))}
            {soltos.length > 0 && (
              <div>
                <p className="mb-1.5 text-[12px] font-semibold text-[#2a7ca8]">Outros</p>
                {chips(soltos)}
              </div>
            )}
          </>
        ) : (
          chips(g.opcoes)
        )}
      </div>
      <form action={adicionarEtiqueta} className="mt-4 flex gap-2">
        <input type="hidden" name="grupo" value={g.chave} />
        <input name="valor" required placeholder="Nova etiqueta" className={cn(entrada, "h-10 min-w-0 flex-1")} />
        <button
          type="submit"
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-[#e7f0f5] text-[#12455f] hover:bg-[#8fc4dd]"
          aria-label="Adicionar etiqueta"
          title="Adicionar etiqueta"
        >
          <Plus className="size-4" weight="bold" />
        </button>
      </form>
    </Cartao>
  );
}

async function AbaEtiquetas({ config, orgId }: { config: ConfigOpa; orgId: string }) {
  const contagem = await contagemDeEtiquetas(orgId);
  const regras: Array<[string, string, Icone]> = [
    ["proprio", "não troca de corretor no fim do prazo", Lock],
    ["status:carteira-do-corretor", "fora do rodízio", ArrowsClockwise],
    ["particular", "sai do CRM inteiro; ninguém vê, nem o administrador", Eye],
    ["status:nao-contatar", "nenhuma mensagem sai para o lead", Megaphone],
  ];
  return (
    <>
      <p className="flex items-center gap-2 text-[14px] text-[#5b7284]">
        <Info className="size-4 shrink-0 text-[#2a7ca8]" />
        Etiqueta filtra a base, entra no cruzamento e escolhe a mensagem de relacionamento (Vela recebe a Semana de Vela).
      </p>
      <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
        {config.etiquetas.map((g) => (
          <CartaoGrupo key={g.chave} g={g} contagem={contagem} />
        ))}
        <Cartao>
          <TituloBloco icone={SlidersHorizontal} titulo="Etiquetas de regra" sub="Mudam o comportamento do CRM" />
          <ul className="mt-4 flex flex-col gap-2">
            {regras.map(([k, v, I]) => (
              <li key={k} className={linhaLista}>
                <IconeRedondo icone={I} tamanho="sm" className="bg-white" />
                <div className="min-w-0 flex-1">
                  <code className="text-[13px] font-semibold text-[#12455f]">{k}</code>
                  <p className="text-[13px] text-[#5b7284]">{v}</p>
                </div>
              </li>
            ))}
          </ul>
        </Cartao>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- campos do lead

function ListaCampos({
  icone,
  titulo,
  sub,
  lista,
  campos,
}: {
  icone: Icone;
  titulo: string;
  sub: string;
  lista: "lead" | "proprietario";
  campos: CampoLead[];
}) {
  return (
    <Cartao bloco>
      <TituloBloco icone={icone} titulo={titulo} sub={sub} acao={<Chip tom="claro">{campos.length} campos</Chip>} />
      <ul className="mt-5 flex flex-col gap-2">
        {campos.map((c, i) => (
          <li key={c.chave} className={linhaLista}>
            <div className="min-w-0 flex-1 pl-1">
              <p className="text-[15px] font-semibold text-[#0a2d40]">{c.rotulo}</p>
              <p className="truncate text-[12px] text-[#5b7284]">
                {c.tipo === "lista" ? (c.opcoes ?? []).join(" · ") : c.tipo === "area" ? "Texto longo" : "Texto"}
                {c.dica ? ` · ex.: ${c.dica}` : ""}
              </p>
            </div>
            <form action={moverCampo} className="flex">
              <input type="hidden" name="lista" value={lista} />
              <input type="hidden" name="chave" value={c.chave} />
              <BotoesOrdem i={i} total={campos.length} />
            </form>
            <form action={removerCampo}>
              <input type="hidden" name="lista" value={lista} />
              <input type="hidden" name="chave" value={c.chave} />
              <button type="submit" className={cn(botaoIcone, "hover:text-[#a4410e]")} aria-label={`Remover ${c.rotulo}`}>
                <Trash className="size-4" />
              </button>
            </form>
          </li>
        ))}
      </ul>
      <form action={adicionarCampo} className="mt-4 grid gap-2 md:grid-cols-[1fr_1fr_auto]">
        <input type="hidden" name="lista" value={lista} />
        <input name="rotulo" required placeholder="Nome do campo" className={entrada} />
        <input name="opcoes" placeholder="Opções com vírgula (vazio = texto)" className={entrada} />
        <button type="submit" className={botaoPrimario}>
          <Plus className="size-4" weight="bold" /> Adicionar
        </button>
      </form>
    </Cartao>
  );
}

function AbaCampos({ config }: { config: ConfigOpa }) {
  return (
    <>
      <p className="flex items-center gap-2 text-[14px] text-[#5b7284]">
        <Lock className="size-4 shrink-0 text-[#2a7ca8]" />
        Diagnóstico feito exige finalidade, região, momento e inegociável; a IA anota da conversa e o corretor confirma.
      </p>
      <div className="grid gap-5 xl:grid-cols-2 [&>*]:min-w-0">
        <ListaCampos icone={IdentificationCard} titulo="Comprador" sub="O que o corretor preenche; nenhum trava etapa" lista="lead" campos={config.campos_lead} />
        <ListaCampos
          icone={Buildings}
          titulo="Proprietário (captação)"
          sub="Endereço e valor liberam a Visita de avaliação"
          lista="proprietario"
          campos={config.campos_proprietario}
        />
      </div>
    </>
  );
}

// ---------------------------------------------------------------- ficha de visita

function AbaVisita({ config }: { config: ConfigOpa }) {
  const fixos = new Set(["quando", "imovel", "interesse"]);
  return (
    <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr] [&>*]:min-w-0">
      <Cartao bloco>
        <TituloBloco icone={ClipboardText} titulo="Ficha de visita" sub="Salvar move o card para Visita realizada" />
        <ul className="mt-5 flex flex-col gap-2">
          {config.ficha_visita.map((c) => (
            <li key={c.chave} className={linhaLista}>
              <div className="min-w-0 flex-1 pl-1">
                <p className="text-[15px] font-semibold text-[#0a2d40]">{c.rotulo}</p>
                {c.opcoes && <p className="truncate text-[12px] text-[#5b7284]">{c.opcoes.join(" · ")}</p>}
              </div>
              {fixos.has(c.chave) ? (
                <Chip icone={Lock}>fixo</Chip>
              ) : (
                <>
                  <span className="hidden text-[12px] text-[#5b7284] sm:inline">{c.obrigatorio ? "obrigatório" : "opcional"}</span>
                  <form action={alternarObrigatorioVisita}>
                    <input type="hidden" name="chave" value={c.chave} />
                    <Interruptor ligado={Boolean(c.obrigatorio)} rotulo={c.obrigatorio ? "Tornar opcional" : "Tornar obrigatório"} />
                  </form>
                  <form action={removerCampoVisita}>
                    <input type="hidden" name="chave" value={c.chave} />
                    <button type="submit" className={cn(botaoIcone, "hover:text-[#a4410e]")} aria-label={`Remover ${c.rotulo}`}>
                      <Trash className="size-4" />
                    </button>
                  </form>
                </>
              )}
            </li>
          ))}
        </ul>
        <form action={adicionarCampoVisita} className="mt-4 grid gap-2 md:grid-cols-[1fr_1fr_auto_auto] md:items-center">
          <input name="rotulo" required placeholder="Nome do campo" className={entrada} />
          <input name="opcoes" placeholder="Opções (vazio = texto)" className={entrada} />
          <label className="flex items-center gap-1.5 px-1 text-[13px] text-[#34566b]">
            <input type="checkbox" name="obrigatorio" className="accent-[#2a7ca8]" /> obrigatório
          </label>
          <button type="submit" className={botaoPrimario}>
            <Plus className="size-4" weight="bold" /> Adicionar
          </button>
        </form>
      </Cartao>

      <Cartao bloco escuro className="h-fit">
        <TituloBloco icone={Eye} claro titulo="Como o corretor vê" sub="Os obrigatórios travam a etapa" />
        <div className="mt-5 flex flex-col gap-3 rounded-[24px] bg-white p-5">
          {config.ficha_visita.map((c) => (
            <div key={c.chave}>
              <p className="text-[12px] font-medium text-[#5b7284]">
                {c.rotulo}
                {c.obrigatorio ? <span className="text-[#a4410e]"> *</span> : ""}
              </p>
              <div className="mt-1 h-9 rounded-[12px] bg-[#f2f6f9] px-3 text-[12px] leading-9 text-[#5b7284]">
                {c.chave === "interesse" ? "1 · 2 · 3 · 4 · 5" : c.opcoes ? c.opcoes[0] : ""}
              </div>
            </div>
          ))}
        </div>
      </Cartao>
    </div>
  );
}

// ---------------------------------------------------------------- motivos de perda

function AbaPerda({ config }: { config: ConfigOpa }) {
  return (
    <Cartao bloco className="max-w-3xl">
      <TituloBloco icone={XCircle} titulo="Motivos de perda" sub="Definitivo tira o lead da cadência de relacionamento" />
      <ul className="mt-5 flex flex-col gap-2">
        {config.motivos_perda.map((m) => (
          <li key={m.motivo} className={linhaLista}>
            <span className="min-w-0 flex-1 pl-1 text-[15px] font-semibold text-[#0a2d40]">{m.motivo}</span>
            {m.definitivo ? (
              <Chip icone={XCircle} tom="alerta">
                sai do relacionamento
              </Chip>
            ) : (
              <Chip icone={ArrowsClockwise}>segue no mensal</Chip>
            )}
            <form action={alternarMotivoDefinitivo}>
              <input type="hidden" name="motivo" value={m.motivo} />
              <Interruptor ligado={m.definitivo} rotulo={m.definitivo ? "Manter no relacionamento" : "Tirar do relacionamento"} />
            </form>
            <form action={removerMotivo}>
              <input type="hidden" name="motivo" value={m.motivo} />
              <button type="submit" className={cn(botaoIcone, "hover:text-[#a4410e]")} aria-label={`Remover ${m.motivo}`}>
                <Trash className="size-4" />
              </button>
            </form>
          </li>
        ))}
      </ul>
      <form action={adicionarMotivo} className="mt-4 flex flex-wrap items-center gap-2">
        <input name="motivo" required placeholder="Novo motivo" className={cn(entrada, "min-w-0 flex-1")} />
        <label className="flex items-center gap-1.5 px-1 text-[13px] text-[#34566b]">
          <input type="checkbox" name="definitivo" className="accent-[#2a7ca8]" /> definitivo
        </label>
        <button type="submit" className={botaoPrimario}>
          <Plus className="size-4" weight="bold" /> Adicionar
        </button>
      </form>
      <div className="mt-4">
        <Nota>Perdido não é coluna: é o resultado do negócio.</Nota>
      </div>
    </Cartao>
  );
}

// ---------------------------------------------------------------- horário

function AbaHorario({ config }: { config: ConfigOpa }) {
  const campoNumeros = "w-full resize-y rounded-[18px] bg-[#f2f6f9] px-4 py-3 font-mono text-[14px] text-[#0a2d40] outline-none placeholder:text-[#8aa0ae] focus:ring-2 focus:ring-[#8fc4dd]";
  return (
    <div className="flex max-w-3xl flex-col gap-5">
    <Cartao bloco>
      <TituloBloco icone={Megaphone} titulo="Quem recebe os avisos" sub="Números de WhatsApp que o OPA Lembretes avisa, um por linha" />
      <FormComRetorno action={salvarDestinosDosAvisos} sucesso="Números salvos." className="mt-5 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-[#5b7284]">Gestão: repasse, escalada, negócio parado e prazo das Captações do Radar</span>
          <textarea name="gestor" rows={4} defaultValue={config.avisos.gestor.map((n) => telefoneLegivel(n) ?? n).join("\n")} placeholder="12 99999-0000" className={campoNumeros} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-[#5b7284]">Administração: boas-vindas que não saiu</span>
          <textarea name="admin" rows={3} defaultValue={config.avisos.admin.map((n) => telefoneLegivel(n) ?? n).join("\n")} placeholder="12 99999-0000" className={campoNumeros} />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Nota>Lista vazia: recebe quem tem o papel de gerente ou administrador, no número que conectou no CRM.</Nota>
          <button type="submit" className={botaoPrimario}>
            Salvar números
          </button>
        </div>
      </FormComRetorno>
    </Cartao>
    <Cartao bloco>
      <TituloBloco icone={Clock} titulo="Horário de atendimento" sub="Fora dele, o prazo do repasse para e o corretor recebe só um lembrete" />
      <FormComRetorno action={salvarHorario} sucesso="Horário salvo." className="mt-5 flex flex-col gap-5">
        <ul className="flex flex-col gap-2">
          {config.horario.map((d, i) => (
            <li key={d.dias} className={cn(linhaLista, "flex-wrap")}>
              <IconeRedondo icone={d.aberto ? Clock : Moon} tamanho="sm" className="bg-white" />
              <span className="min-w-[120px] flex-1 text-[15px] font-semibold text-[#0a2d40]">{d.dias}</span>
              <span className="flex items-center gap-2 text-[13px] text-[#5b7284]">
                <input
                  type="time"
                  name={`abre_${i}`}
                  defaultValue={d.abre || "08:00"}
                  className="h-11 w-28 rounded-full bg-white px-3 text-[14px] text-[#0a2d40] outline-none focus:ring-2 focus:ring-[#8fc4dd]"
                />
                até
                <input
                  type="time"
                  name={`fecha_${i}`}
                  defaultValue={d.fecha || "18:00"}
                  className="h-11 w-28 rounded-full bg-white px-3 text-[14px] text-[#0a2d40] outline-none focus:ring-2 focus:ring-[#8fc4dd]"
                />
              </span>
              <label className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-[13px] font-medium text-[#34566b]">
                <input type="checkbox" name={`aberto_${i}`} defaultChecked={d.aberto} className="accent-[#2a7ca8]" /> aberto
              </label>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Nota>Lead fora do horário recebe a boas-vindas na hora. O corretor recebe um lembrete aos 30 min sem resposta; os avisos com prazo começam na abertura.</Nota>
          <button type="submit" className={botaoPrimario}>
            Salvar horário
          </button>
        </div>
      </FormComRetorno>
    </Cartao>
    </div>
  );
}

