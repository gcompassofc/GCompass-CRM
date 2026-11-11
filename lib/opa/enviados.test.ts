// @vitest-environment node
/**
 * Agenda > Enviados: o que o OPA Lembretes mandou (pedido do Allyson, 10/11/2026).
 * Os textos abaixo saem das mesmas funções que a rotina usa: se a frase de um aviso
 * mudar e o tipo deixar de ser reconhecido, é aqui que aparece.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/waha/client", () => ({ getWahaClient: () => null }));

import {
  textoAvisoDePrazo,
  textoEscala,
  textoForaDoHorario,
  textoLeadDeOutroCorretor,
  textoLeadNovo,
  textoLembrete,
  textoParado,
  textoRepasseParaGestor,
  textoRepasseParaNovoDono,
  textoRepasseParaQuemPerdeu,
} from "./aviso-whatsapp";
import {
  agruparPorDia,
  chaveTelefone,
  primeiraLinha,
  rotuloDoAviso,
  situacaoDaMensagem,
  textoVisivel,
  tipoDoTexto,
  tituloDoDia,
} from "./enviados";

const link = "https://crm.opailhabela.com.br/app/leads/1";

describe("de que aviso é o texto", () => {
  it("reconhece cada aviso pelo texto que a rotina manda", () => {
    expect(tipoDoTexto(textoLeadNovo({ corretor: "Luana", lead: "Clodoaldo", imovel: "CA006944", canal: "meta", voltou: false, link, whatsapp: null }))).toBe("lead_novo");
    expect(tipoDoTexto(textoLeadNovo({ corretor: "Luana", lead: "Clodoaldo", imovel: null, canal: "site", voltou: true, link, whatsapp: null }))).toBe("lead_novo");
    expect(tipoDoTexto(textoAvisoDePrazo({ corretor: "Luana", lead: "Clodoaldo", esperaMin: 20, faltaMin: 40, proprio: false, link, whatsapp: null }))).toBe("lembrete");
    expect(tipoDoTexto(textoAvisoDePrazo({ corretor: "Luana", lead: "Clodoaldo", esperaMin: 60, faltaMin: 0, proprio: false, semRepasse: true, link, whatsapp: null }))).toBe("lembrete");
    expect(tipoDoTexto(textoForaDoHorario({ corretor: "Paulo", lead: "Geraldo", esperaMin: 30, link, whatsapp: null }))).toBe("lembrete");
    expect(tipoDoTexto(textoLeadDeOutroCorretor({ quemRecebeu: "Marco", telefone: "5512999990000", lead: "Clodoaldo", responsavel: "Luana" }))).toBe("outro_corretor");
    expect(tipoDoTexto(textoRepasseParaNovoDono({ corretor: "Rodrigo", lead: "Ana", de: "Luana", link, whatsapp: null }))).toBe("repasse");
    expect(tipoDoTexto(textoRepasseParaQuemPerdeu({ corretor: "Luana", lead: "Ana", para: "Rodrigo" }))).toBe("repasse");
    expect(tipoDoTexto(textoRepasseParaGestor({ gestor: "Marco", lead: "Ana", de: "Luana", para: "Rodrigo", link }))).toBe("repasse");
    expect(tipoDoTexto(textoEscala({ gestor: "Marco", lead: "Ana", dono: "Luana", link }))).toBe("gestao");
    expect(tipoDoTexto(textoEscala({ gestor: "Marco", lead: "Ana", dono: null, link, motivo: "dono_saiu" }))).toBe("gestao");
    expect(tipoDoTexto(textoParado({ corretor: "Luana", lead: "Ana", etapa: "Proposta feita", dias: 7, link }))).toBe("parado");
    expect(tipoDoTexto(textoLembrete({ corretor: "Luana", mensagem: "Ligar para a Fernanda", lead: null, paraLead: false, link: null, whatsapp: null }))).toBe("agenda");
    expect(tipoDoTexto(textoLembrete({ corretor: "Luana", mensagem: "Oi Fernanda", lead: "Fernanda", paraLead: true, link, whatsapp: null }))).toBe("agenda");
  });

  it("Radar, código de entrada e o resto", () => {
    expect(tipoDoTexto("Oi, Marco.\n\n16 captações da equipe passaram do prazo sem retorno:\nPaulo: Casa · Reino (D9), 15 dias\n\nDecida na ficha: cobrar, dar mais prazo.")).toBe("radar");
    expect(tipoDoTexto("Seu código para entrar no CRM da OPA: 123456\n\nVale por 10 minutos.")).toBe("codigo");
    expect(tipoDoTexto("Você tem 3 leads abertos.")).toBe("outro");
    expect(tipoDoTexto(null)).toBe("outro");
  });

  it("o que alguém escreveu pela tela é sempre aviso escrito, diga o que disser", () => {
    expect(tipoDoTexto("Marco, lead novo para você: teste.", true)).toBe("manual");
  });

  it("o código de entrada nunca aparece na tela", () => {
    const visto = textoVisivel("codigo", "Seu código para entrar no CRM da OPA: 123456");
    expect(visto).not.toContain("123456");
    expect(textoVisivel("manual", "  Reunião às 9h.  ")).toBe("Reunião às 9h.");
    expect(textoVisivel("outro", null)).toBe("(mensagem sem texto)");
  });
});

describe("lista de enviados", () => {
  it("primeira linha com conteúdo", () => {
    expect(primeiraLinha("\n\nMarco, essa é uma mensagem de teste.\n\nOs lembretes...")).toBe("Marco, essa é uma mensagem de teste.");
    expect(primeiraLinha("")).toBe("");
  });

  it("situação: lida ganha de entregue, falha ganha de tudo", () => {
    expect(situacaoDaMensagem({ status: "sent" })).toBe("enviada");
    expect(situacaoDaMensagem({ status: "sent", delivered_at: "2026-11-10T10:00:00Z" })).toBe("entregue");
    expect(situacaoDaMensagem({ status: "delivered", read_at: "2026-11-10T10:01:00Z" })).toBe("lida");
    expect(situacaoDaMensagem({ status: "failed", delivered_at: "2026-11-10T10:00:00Z" })).toBe("falhou");
    expect(situacaoDaMensagem({ status: "queued" })).toBe("na_fila");
  });

  it("o mesmo número com ou sem 55 e com ou sem o nono dígito é a mesma pessoa", () => {
    expect(chaveTelefone("+5512991392393")).toBe("1291392393");
    expect(chaveTelefone("551291392393")).toBe("1291392393");
    expect(chaveTelefone("12 99139-2393")).toBe("1291392393");
    expect(chaveTelefone("123")).toBeNull();
  });

  it("agrupa pelo dia de São Paulo: 01:28 UTC ainda é a noite anterior", () => {
    const agora = Date.parse("2026-11-11T01:40:00Z"); // 22:40 de 10/11 em São Paulo
    const grupos = agruparPorDia(
      [{ em: "2026-11-11T01:28:38Z" }, { em: "2026-11-10T18:58:06Z" }, { em: "2026-11-10T02:30:00Z" }, { em: "2026-11-07T13:00:00Z" }],
      agora,
    );
    expect(grupos.map((g) => [g.titulo, g.itens.length])).toEqual([
      ["Hoje", 2],
      ["Ontem", 1],
      [tituloDoDia("2026-11-07T13:00:00Z", agora), 1],
    ]);
    expect(grupos[2]?.titulo).toMatch(/7 de nov/);
  });

  it("nome do aviso que não saiu", () => {
    expect(rotuloDoAviso("aviso_20")).toBe("Lembrete de 20 min");
    expect(rotuloDoAviso("aviso_60")).toBe("Lembrete de 1 h");
    expect(rotuloDoAviso("lead_novo")).toBe("Lead novo");
    expect(rotuloDoAviso("lead_de_outro_corretor")).toBe("Lead com outro corretor");
    expect(rotuloDoAviso("coisa_nova")).toBe("Aviso");
  });
});
