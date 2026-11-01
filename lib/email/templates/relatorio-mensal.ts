/**
 * E-mail do relatório mensal da OPA (estrutura pronta, envio desligado:
 * lib/opa/relatorio-mensal.ts). Uma seção por pergunta do gestor, número grande
 * e rótulo curto. Só o primeiro nome do corretor, nada de lead.
 */
import { COR_OPA, esc, moldeHtml, moldeTexto } from "@/lib/email/molde";
import type { LinhaContagem, RelatorioMensal } from "@/lib/opa/relatorio-mensal";

const reais = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function secao(titulo: string, linhas: Array<[string, string]>): string {
  if (linhas.length === 0) return "";
  const tr = linhas
    .map(
      ([r, v]) =>
        `<tr><td style="padding:8px 0;border-top:1px solid ${COR_OPA.borda};font-size:14px;color:${COR_OPA.texto}">${esc(r)}</td><td align="right" style="padding:8px 0;border-top:1px solid ${COR_OPA.borda};font-size:14px;font-weight:700;color:${COR_OPA.petroleo}">${esc(v)}</td></tr>`,
    )
    .join("");
  return `<p style="margin:26px 0 6px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${COR_OPA.apoio}">${esc(titulo)}</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${tr}</table>`;
}

const contagens = (ls: LinhaContagem[]): Array<[string, string]> => ls.map((l) => [l.rotulo, String(l.total)]);

export function buildRelatorioMensalEmail(r: RelatorioMensal, urlBase: string): { subject: string; html: string; text: string } {
  const base = urlBase.replace(/\/$/, "");
  const prazo = r.prazo.pct === null ? "sem lead avaliado" : `${r.prazo.pct}% no prazo`;
  const vendas = r.vendas.valorCents === null ? String(r.vendas.total) : `${r.vendas.total} (${reais(r.vendas.valorCents)})`;
  const subject = `Relatório de ${r.mes}: ${r.leadsNovos} leads novos e ${r.vendas.total} vendas`;

  const resumo: Array<[string, string]> = [
    ["Leads novos", String(r.leadsNovos)],
    ["Primeira resposta", prazo],
    ["Visitas feitas", String(r.visitas.feitas)],
    ["Em proposta ou negociação", String(r.propostas)],
    ["Vendas", vendas],
    ["Perdidos", String(r.perdidos.total)],
  ];
  const corretores: Array<[string, string]> = r.porCorretor.map((c) => [
    c.nome,
    `${c.leads} leads, ${c.pct === null ? "sem avaliação" : `${c.pct}% no prazo`}`,
  ]);

  const blocos = [
    secao("Resumo", resumo),
    secao("De onde vieram", contagens(r.porOrigem)),
    secao("Por corretor", corretores),
    secao("Onde estão no funil", contagens(r.funil)),
    secao("Motivos de perda", contagens(r.perdidos.motivos)),
  ].join("\n              ");

  const html = moldeHtml({
    urlBase: base,
    previa: `${r.leadsNovos} leads novos, ${prazo}.`,
    titulo: `Como foi ${esc(r.mes)}`,
    paragrafos: [esc("Os números do mês no funil de compradores. O detalhe de cada lead fica no CRM.")],
    blocos,
    botao: { rotulo: "Abrir o CRM", url: esc(`${base}/app/hoje`) },
    observacao: esc("Você recebe este resumo por ser gestor ou administrador. Para não receber mais, peça ao administrador."),
  });

  const text = moldeTexto({
    titulo: `Como foi ${r.mes}`,
    linhas: [
      ...resumo.map(([a, b]) => `${a}: ${b}`),
      "",
      "De onde vieram:",
      ...r.porOrigem.map((o) => `  ${o.rotulo}: ${o.total}`),
      "",
      "Por corretor:",
      ...corretores.map(([a, b]) => `  ${a}: ${b}`),
    ],
    url: `${base}/app/hoje`,
  });

  return { subject, html, text };
}
