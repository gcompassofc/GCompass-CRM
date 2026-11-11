// @vitest-environment node
/**
 * Avisos do OPA Lembretes ligados um a um (pedido do Allyson, 10/11/2026): voltar só com
 * lead novo, lembrete de prazo e "esse lead está com outro corretor", e ligar o resto depois.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/waha/client", () => ({ getWahaClient: () => null }));

import { textoAvisoDePrazo, textoLeadNovo } from "./aviso-whatsapp";
import { avisoAtivo, avisosDesligados, mesclarConfig } from "./config";
import { itensDePassagem } from "./historico";
import { avisoNaHora, avisosDevidos, avisosLigados, prazosDaTrilha, repasseAtivo } from "./repasse";
import { dadosDaEntrada } from "./veio-de-formulario";

const padrao = mesclarConfig({});
const soLead = mesclarConfig({
  prazos: { ...padrao.prazos, avisos_pago: [20, 60], avisos_organico: [20, 60] },
  avisos: { gestor: [], admin: [], teste: [], desligados: ["repasse", "parado", "radar"] },
});

describe("tipos de aviso", () => {
  it("sem nada gravado, todos ligados", () => {
    expect(padrao.avisos.desligados).toEqual([]);
    expect(avisoAtivo(padrao, "lead_novo")).toBe(true);
    expect(avisoAtivo(padrao, "radar")).toBe(true);
  });

  it("só tipo conhecido entra na lista, sem repetir", () => {
    expect(avisosDesligados(["radar", "radar", "inventado", null, "repasse"])).toEqual(["repasse", "radar"]);
    expect(avisosDesligados("radar")).toEqual([]);
  });

  it("configuração antiga, sem a lista, continua valendo", () => {
    const antiga = mesclarConfig({ avisos: { gestor: ["5512999990000"], admin: [], teste: [] } as never });
    expect(antiga.avisos.desligados).toEqual([]);
    expect(antiga.avisos.gestor).toEqual(["5512999990000"]);
  });

  it("os três que ficam: lead novo, prazo e outro corretor", () => {
    expect(avisoAtivo(soLead, "lead_novo")).toBe(true);
    expect(avisoAtivo(soLead, "prazo")).toBe(true);
    expect(avisoAtivo(soLead, "outro_corretor")).toBe(true);
    expect(avisoAtivo(soLead, "repasse")).toBe(false);
    expect(avisoAtivo(soLead, "parado")).toBe(false);
    expect(avisoAtivo(soLead, "radar")).toBe(false);
  });
});

describe("lembretes de prazo sem repasse", () => {
  it("com repasse, o aviso para antes do fim do prazo (como sempre)", () => {
    expect(repasseAtivo(padrao, "pago")).toBe(true);
    expect(prazosDaTrilha(padrao, "pago").avisos).toEqual([20, 40]);
  });

  it("sem repasse, o lembrete de 1 h sai mesmo com prazo de 1 h", () => {
    expect(repasseAtivo(soLead, "pago")).toBe(false);
    expect(prazosDaTrilha(soLead, "pago")).toEqual({ prazoMin: 60, avisos: [20, 60] });
    expect(avisosLigados(soLead, "organico")).toEqual([20, 60]);
    expect(avisosDevidos(soLead, "pago", 61)).toEqual([20, 60]);
  });

  it("lembrete só sai perto da hora dele", () => {
    expect(avisoNaHora(20, 19)).toBe(false);
    expect(avisoNaHora(20, 20)).toBe(true);
    expect(avisoNaHora(20, 35)).toBe(true);
    expect(avisoNaHora(20, 36)).toBe(false);
    // Lead de três dias atrás, com o lembrete de 1 h recém-criado: não manda.
    expect(avisoNaHora(60, 3 * 24 * 60)).toBe(false);
  });

  it("sem repasse, o texto não fala de fila", () => {
    const t = textoAvisoDePrazo({ corretor: "Luana Machado", lead: "Clodoaldo", esperaMin: 20, faltaMin: 40, proprio: false, semRepasse: true, link: "https://crm/l/1", whatsapp: "5512999990000" });
    expect(t).toBe("Luana, Clodoaldo espera sua resposta há 20 min.\n\nResponder: https://wa.me/5512999990000\n\nFicha: https://crm/l/1");
  });

  it("com repasse, o texto segue dizendo quanto falta", () => {
    const t = textoAvisoDePrazo({ corretor: "Luana", lead: "Clodoaldo", esperaMin: 20, faltaMin: 40, proprio: false, link: "https://crm/l/1", whatsapp: null });
    expect(t).toContain("Faltam 40 min para ele passar para o próximo da fila.");
  });
});

describe("aviso de lead novo", () => {
  it("lead novo do formulário do anúncio", () => {
    const t = textoLeadNovo({ corretor: "Luana Machado", lead: "Clodoaldo Kadima", imovel: "CA006944", canal: "meta", voltou: false, link: "https://crm/l/1", whatsapp: "5512999990000" });
    expect(t).toBe(
      "Luana, lead novo para você: Clodoaldo Kadima.\n\nImóvel CA006944, formulário do anúncio.\n\nResponder: https://wa.me/5512999990000\n\nFicha: https://crm/l/1",
    );
  });

  it("do site, sem imóvel e sem telefone", () => {
    const t = textoLeadNovo({ corretor: "Marco", lead: "Ana", imovel: null, canal: "site", voltou: false, link: "https://crm/l/2", whatsapp: null });
    expect(t).toBe("Marco, lead novo para você: Ana.\n\nVeio pelo formulário do site.\n\nFicha: https://crm/l/2");
  });

  it("quem volta por outro formulário não é chamado de lead novo", () => {
    const t = textoLeadNovo({ corretor: "Marco", lead: "Ana", imovel: "CA007099", canal: "meta", voltou: true, link: "https://crm/l/2", whatsapp: null });
    expect(t.split("\n")[0]).toBe("Marco, Ana preencheu o formulário de novo.");
  });

  it("os dados saem da entrada certa: a primeira, ou a volta", () => {
    const campos = { origem: { canal: "meta" }, imovel_codigo: "CA006944", voltou: { origem: { canal: "site" }, imovel_codigo: "CA007099" } };
    expect(dadosDaEntrada(campos, false)).toEqual({ canal: "meta", imovel: "CA006944" });
    expect(dadosDaEntrada(campos, true)).toEqual({ canal: "site", imovel: "CA007099" });
    expect(dadosDaEntrada(null, false)).toEqual({ canal: null, imovel: null });
  });
});

describe("quem passou a conversa (histórico da ficha)", () => {
  const NOMES: Record<string, string> = { marco: "Marco", luana: "Luana" };
  const nomeDe = (id: string | null | undefined) => NOMES[id ?? ""] ?? "alguém que saiu da equipe";

  it("caso de 10/11: o Marco passou para a Luana a conversa que chegou no número dele", () => {
    const itens = itensDePassagem([{ em: "2026-11-11T00:12:28.000Z", de: null, para: "luana", por: "marco", numeroDe: "marco" }], nomeDe);
    expect(itens).toEqual([{ em: "2026-11-11T00:12:28.000Z", tipo: "conversa", texto: "Marco passou a conversa para Luana", detalhe: "Conversa no WhatsApp de Marco." }]);
  });

  it("assumir, soltar e tirar de outra pessoa", () => {
    const itens = itensDePassagem(
      [
        { em: "a", de: null, para: "luana", por: "luana" },
        { em: "b", de: "luana", para: null, por: "luana" },
        { em: "c", de: "luana", para: "marco", por: "x" },
      ],
      nomeDe,
    );
    expect(itens.map((i) => i.texto)).toEqual(["Luana assumiu a conversa", "Luana soltou a conversa", "alguém que saiu da equipe passou a conversa para Marco"]);
    expect(itens[2]?.detalhe).toBe("Estava com Luana.");
  });

  it("entrega automática do sistema não vira linha (já está na entrada do lead)", () => {
    expect(itensDePassagem([{ em: "a", de: null, para: "luana", por: null }], nomeDe)).toEqual([]);
  });
});
