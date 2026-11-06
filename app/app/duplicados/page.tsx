import { format } from "date-fns";
import Link from "next/link";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { carregarEquipe } from "@/lib/opa/dados";
import { carregarPessoas, type PessoaDoNumero } from "@/lib/opa/donos-da-conversa";
import { createAdminClient } from "@/lib/supabase/admin";
import { CheckCircle, ChatCircle, Star, UsersThree, Warning } from "@/lib/ui/icons";

import { CabecalhoOpa, CorpoOpa } from "../_opa/cabecalho";
import { Cartao, Chip, TituloBloco, Vazio } from "../_opa/ui";
import { ExcluirConversa, ExcluirLeadDuplicado, PassarAoPrincipal } from "./_acoes";

export const dynamic = "force-dynamic";
export const metadata = { title: "Duplicados" };

const MOTIVO: Record<PessoaDoNumero["motivos"][number], string> = {
  dois_leads: "Mais de um lead aberto",
  corretores_diferentes: "Mais de um corretor conversando",
  contato_repetido: "Mesmo número em dois contatos",
  lead_com_outro: "Lead com outro corretor",
};

const dia = (v: string) => format(new Date(v), "dd/MM/yy HH:mm");

/** Para o gestor ver e o administrador resolver quem é de quem. Só lê; as ações passam pelas rotas de sempre. */
export default async function DuplicadosPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app");
  const admin = user.is_platform_admin || org.role === "admin";
  if (!admin && org.role !== "manager") redirect("/app/hoje");

  const equipe = await carregarEquipe(org.orgId);
  const pessoas = await carregarPessoas(createAdminClient(), org.orgId, (id) => equipe.get(id)?.nome ?? "Corretor");
  const casos = [...new Set(pessoas.values())]
    .filter((p) => p.motivos.length > 0)
    .sort((a, b) => b.motivos.length - a.motivos.length);
  const nomeDe = (id: string | null) => (id ? equipe.get(id)?.nome ?? "Corretor" : "Sem corretor");

  return (
    <>
      <CabecalhoOpa secao="Gestão" titulo="Duplicados" subtitulo="O mesmo número com mais de um corretor ou mais de um lead" icone={UsersThree} equipe={false} ferramentas={false} />
      <CorpoOpa largura="max-w-[1100px]">
        <Cartao bloco>
          <TituloBloco icone={Warning} tom="aviso" titulo={`${casos.length} ${casos.length === 1 ? "caso" : "casos"} para olhar`} sub="O corretor principal é quem falou primeiro com a pessoa. Lead novo já não duplica: o banco barra." />
        </Cartao>

        {casos.length === 0 && (
          <Cartao bloco>
            <Vazio titulo="Nenhum duplicado" texto="Cada número está com um corretor e um lead." />
          </Cartao>
        )}

        {casos.map((p) => {
          const c = p.contatos[0]!;
          const nome = p.contatos.map((x) => x.display_name?.trim() || x.name?.trim()).find(Boolean) ?? "Sem nome";
          const telefone = p.contatos.map((x) => x.phone_number).find(Boolean) ?? "Número protegido";
          return (
            <Cartao key={c.id} className="flex flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-[17px] font-semibold text-[#0a2d40]">{nome}</h2>
                  <p className="text-[13px] text-[#5b7284]">{telefone}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {p.motivos.map((m) => (
                    <Chip key={m} tom="aviso">{MOTIVO[m]}</Chip>
                  ))}
                </div>
              </div>

              {p.principal && (
                <p className="flex flex-wrap items-center gap-1.5 rounded-2xl bg-[#e5f3ea] px-4 py-2.5 text-[14px] text-[#1d6b43]">
                  <Star className="size-4" weight="fill" aria-hidden />
                  <span>
                    <strong>Corretor principal: {p.principal.nome}</strong>, falou primeiro em {dia(p.principal.desde)}
                  </span>
                </p>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <section>
                  <h3 className="mb-1 text-[13px] font-semibold text-[#5b7284]">Conversas</h3>
                  <ul className="flex flex-col divide-y divide-[#eef3f6]">
                    {p.conversas.map((v) => (
                      <li key={v.id} className="flex items-center justify-between gap-2 py-2 text-[14px]">
                        <Link href={`/app/inbox/${v.id}`} className="inline-flex min-w-0 items-center gap-1.5 text-[#1f6a93] hover:underline">
                          <ChatCircle className="size-4 shrink-0" aria-hidden />
                          <span className="truncate">{nomeDe(v.corretorId)}</span>
                          <span className="shrink-0 text-[12px] text-[#5b7284]">desde {dia(v.primeira)}</span>
                        </Link>
                        {admin && <ExcluirConversa id={v.id} />}
                      </li>
                    ))}
                    {p.conversas.length === 0 && <li className="py-2 text-[14px] text-[#5b7284]">Nenhuma conversa.</li>}
                  </ul>
                </section>
                <section>
                  <h3 className="mb-1 text-[13px] font-semibold text-[#5b7284]">Leads abertos</h3>
                  <ul className="flex flex-col divide-y divide-[#eef3f6]">
                    {p.leads.map((l) => (
                      <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[14px]">
                        <Link href={`/app/leads/${l.id}`} className="min-w-0 text-[#1f6a93] hover:underline">
                          <span className="block truncate">{l.title}</span>
                          <span className="text-[12px] text-[#5b7284]">{nomeDe(l.owner_user_id)} · criado em {dia(l.created_at)}</span>
                        </Link>
                        <span className="flex shrink-0 gap-1.5">
                          {p.principal && l.owner_user_id !== p.principal.id && <PassarAoPrincipal leadId={l.id} corretorId={p.principal.id} nome={p.principal.nome} />}
                          {admin && <ExcluirLeadDuplicado leadId={l.id} />}
                        </span>
                      </li>
                    ))}
                    {p.leads.length === 0 && (
                      <li className="flex items-center gap-1.5 py-2 text-[14px] text-[#5b7284]">
                        <CheckCircle className="size-4" aria-hidden /> Nenhum lead aberto.
                      </li>
                    )}
                  </ul>
                </section>
              </div>
            </Cartao>
          );
        })}
      </CorpoOpa>
    </>
  );
}
