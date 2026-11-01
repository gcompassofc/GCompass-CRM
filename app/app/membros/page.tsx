import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { listarNumerosDaEquipe } from "@/lib/channels/numeros";
import { createAdminClient } from "@/lib/supabase/admin";
import { CheckCircle, Clock, Info, Kanban, ShieldCheck, Users, WhatsappLogo, WifiSlash, XCircle } from "@/lib/ui/icons";

import { CabecalhoOpa, CorpoOpa } from "../_opa/cabecalho";
import { Avatar, BotaoPilula, Cartao, CartaoNumero, Chip, TituloBloco, iniciaisDe } from "../_opa/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Membros" };

const PAPEL: Record<string, string> = {
  admin: "Administrador",
  manager: "Gestor",
  agent: "Corretor",
  viewer: "Leitura",
};

const ORDEM: Record<string, number> = { admin: 0, manager: 1, agent: 2, viewer: 3 };

/** Matriz do protótipo do CRM da OPA (29/10/2026): o que cada papel pode fazer. */
const MATRIZ: Array<[string, string, string, string]> = [
  ["Ver o panorama completo: todos os corretores, receita, comissão e Meta", "sim", "sim", "nao"],
  ["Ver a fila e o pipeline da equipe", "sim", "sim", "só os seus"],
  ["Criar lead", "sim", "sim", "sim"],
  ["Mover card e preencher campos", "sim", "sim", "só os seus"],
  ["Trocar o corretor de um lead", "sim", "sim", "nao"],
  ["Desligar lembretes de um lead", "sim", "sim", "só os seus"],
  ["Ver conversa nova do WhatsApp antes de classificar", "nao", "nao", "só as suas"],
  ["Marcar conversa como particular (sai do CRM para todos)", "sim", "sim", "só as suas"],
  ["Criar pipeline, etapas e campos obrigatórios", "sim", "sim", "nao"],
  ["Editar regras de lembrete e cadência", "sim", "sim", "nao"],
  ["Conectar WhatsApp", "sim", "só o seu", "só o seu"],
  ["Convidar membros", "sim", "só corretores", "nao"],
  ["Excluir lead (o pedido vem do corretor)", "sim", "nao", "nao"],
  ["Repassar oportunidade de captação", "sim", "sim", "devolve as suas"],
  ["Exportar leads", "sim", "nao", "nao"],
  ["Integrações, Meta, tokens de API, webhooks e MCP", "sim", "sim", "nao"],
];

function Celula({ v }: { v: string }) {
  if (v === "sim") return <CheckCircle weight="fill" className="mx-auto size-5 text-[#1d6b43]" aria-label="sim" />;
  if (v === "nao") return <XCircle className="mx-auto size-5 text-[#c6d3db]" aria-label="não" />;
  return <span className="inline-block rounded-full bg-[#e7f0f5] px-2.5 py-1 text-[12px] font-medium text-[#12455f]">{v}</span>;
}

function ultimoAcesso(iso: string | null | undefined): string {
  if (!iso) return "nunca entrou";
  const dias = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  return `há ${dias} dias`;
}

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

interface Membro {
  id: string;
  nome: string;
  email: string;
  papel: string;
  acesso: string;
  whatsapp: "conectado" | "desconectado" | "sem";
  foto: string | null;
}

async function carregarMembros(orgId: string): Promise<Membro[]> {
  const admin = createAdminClient();
  // Uma chamada ao auth para a equipe toda, em vez de uma por pessoa.
  const [{ data: membros }, numeros, { data: lista }] = await Promise.all([
    admin.from("user_organizations").select("user_id, role").eq("organization_id", orgId).is("revoked_at", null),
    listarNumerosDaEquipe(admin, orgId),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ]);
  const porId = new Map((lista?.users ?? []).map((u) => [u.id, u]));

  return ((membros ?? []) as Array<{ user_id: string; role: string }>)
    .map((m) => {
      const u = porId.get(m.user_id);
      const nome = (u?.user_metadata?.full_name as string | undefined) ?? u?.email?.split("@")[0] ?? "Pessoa";
      // O WhatsApp do corretor é a sessão de que ele é dono; sessões antigas, sem dono,
      // seguem achadas pelo nome (ex. "Luana Machado").
      const sessao =
        numeros.find((s) => s.owner_user_id === m.user_id) ??
        numeros.find((s) => !s.owner_user_id && s.display_name && semAcento(s.display_name) === semAcento(nome));
      return {
        id: m.user_id,
        nome,
        email: u?.email ?? "",
        papel: m.role,
        acesso: ultimoAcesso(u?.last_sign_in_at),
        whatsapp: sessao ? (sessao.status === "WORKING" ? "conectado" : "desconectado") : "sem",
        foto: (u?.user_metadata?.avatar_url as string | undefined) || null,
      } as Membro;
    })
    .sort((a, b) => (ORDEM[a.papel] ?? 9) - (ORDEM[b.papel] ?? 9) || a.nome.localeCompare(b.nome));
}

export default async function MembrosPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app");
  if (org.role !== "manager" && org.role !== "admin") redirect("/app/hoje");

  const membros = await carregarMembros(org.orgId);
  const conectados = membros.filter((m) => m.whatsapp === "conectado").length;
  const gestores = membros.filter((m) => m.papel === "admin" || m.papel === "manager").length;

  return (
    <>
      <CabecalhoOpa secao="Configuração" titulo="Membros" subtitulo="Papéis e o que cada um pode fazer" icone={Users} equipe={false}>
        <BotaoPilula href="/app/team/invite" icone={Users} tom="branco">
          Convidar membro
        </BotaoPilula>
      </CabecalhoOpa>
      <CorpoOpa>
        <div className="grid gap-5 sm:grid-cols-3">
          <CartaoNumero icone={Users} rotulo="Na equipe" valor={membros.length} contexto={`${gestores} na gestão`} />
          <CartaoNumero icone={WhatsappLogo} rotulo="Com WhatsApp conectado" valor={conectados} contexto={`de ${membros.length} membros`} />
          <CartaoNumero icone={ShieldCheck} rotulo="Corretores" valor={membros.filter((m) => m.papel === "agent").length} contexto="veem só os próprios leads" />
        </div>

        <Cartao bloco>
          <TituloBloco icone={Users} titulo="Quem está na equipe" sub="Papel, pipelines, WhatsApp e último acesso" />
          <ul className="mt-5 flex flex-col gap-2">
            {membros.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 rounded-[22px] bg-[#f2f6f9] px-4 py-3">
                <Avatar texto={iniciaisDe(m.nome)} foto={m.foto} tom={m.papel === "admin" ? "escuro" : m.papel === "manager" ? "acao" : "claro"} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-[#0a2d40]">{m.nome}</p>
                  <p className="truncate text-[13px] text-[#5b7284]">{m.email}</p>
                </div>
                <Chip icone={ShieldCheck} tom={m.papel === "admin" ? "escuro" : m.papel === "manager" ? "claro" : "neutro"}>
                  {PAPEL[m.papel] ?? m.papel}
                </Chip>
                <Chip icone={Kanban} tom="neutro" className="hidden md:inline-flex">
                  {m.papel === "agent" ? "Compradores, Captação" : "Todas as pipelines"}
                </Chip>
                {m.whatsapp === "conectado" ? (
                  <Chip icone={WhatsappLogo} tom="ok">
                    conectado
                  </Chip>
                ) : m.whatsapp === "desconectado" ? (
                  <Chip icone={WifiSlash} tom="alerta">
                    desconectado
                  </Chip>
                ) : (
                  <Chip icone={WifiSlash} tom="neutro">
                    sem WhatsApp
                  </Chip>
                )}
                <Chip icone={Clock} tom="neutro">
                  {m.acesso}
                </Chip>
              </li>
            ))}
          </ul>
        </Cartao>

        <Cartao bloco>
          <TituloBloco icone={ShieldCheck} titulo="O que cada papel pode fazer" sub="A regra fica no banco, não só na tela" />
          <p className="mt-4 flex items-center gap-2 text-[13px] text-[#5b7284]">
            <Info className="size-4 shrink-0 text-[#2a7ca8]" /> O corretor não vê o lead de outro nem se a tela tiver erro.
          </p>
          <div className="mt-5 overflow-x-auto">
            <div className="min-w-[640px]">
              <div className="grid grid-cols-[1fr_130px_130px_130px] gap-2 px-4 pb-3 text-center text-[12px] font-semibold text-[#5b7284]">
                <span />
                <span>Administrador total</span>
                <span>Gestor</span>
                <span>Corretor</span>
              </div>
              <ul className="flex flex-col gap-1.5">
                {MATRIZ.map(([o, a, g, at]) => (
                  <li key={o} className="grid grid-cols-[1fr_130px_130px_130px] items-center gap-2 rounded-[18px] px-4 py-2.5 odd:bg-[#f2f6f9]">
                    <span className="text-[14px] text-[#0a2d40]">{o}</span>
                    <span className="text-center">
                      <Celula v={a} />
                    </span>
                    <span className="text-center">
                      <Celula v={g} />
                    </span>
                    <span className="text-center">
                      <Celula v={at} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Cartao>
      </CorpoOpa>
    </>
  );
}
