// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/waha/client", () => ({ getWahaClient: () => null }));

import { montarCanalDeAvisos, telefoneDaPessoa, textoEscala } from "./aviso-whatsapp";

const sessao = (s: { nome?: string | null; fone?: string | null; dono?: string | null; nomeSessao?: string; status?: string }) => ({
  waha_session_name: s.nomeSessao ?? `s-${Math.random()}`,
  display_name: s.nome ?? null,
  phone_number: s.fone ?? null,
  status: s.status ?? "WORKING",
  owner_user_id: s.dono ?? null,
});

describe("número de quem recebe o aviso (A6)", () => {
  it("a sessão com dono vale para o dono", () => {
    const canal = montarCanalDeAvisos([sessao({ nome: "Luana", fone: "+55 12 99999-0001", dono: "luana" })]);
    expect(telefoneDaPessoa(canal, { id: "luana", nome: "Luana" })).toBe("5512999990001");
  });

  it("trocar o próprio nome para o de um gestor não desvia o aviso dele", () => {
    // O corretor se renomeou "Marco" e conectou o número dele (sessão com dono).
    const canal = montarCanalDeAvisos([sessao({ nome: "Marco", fone: "5512999990002", dono: "corretor" })]);
    // O gestor Marco não tem sessão: o nome da sessão do corretor não casa com ele.
    expect(telefoneDaPessoa(canal, { id: "marco", nome: "Marco" })).toBeUndefined();
  });

  it("sessão antiga sem dono ainda é achada pelo nome, para quem não tem sessão própria", () => {
    const canal = montarCanalDeAvisos([sessao({ nome: "Marco", fone: "5512999990003" })]);
    expect(telefoneDaPessoa(canal, { id: "marco", nome: "Marco" })).toBe("5512999990003");
  });

  it("quem tem sessão própria nunca é achado pelo nome, mesmo sem número na sessão dele", () => {
    const canal = montarCanalDeAvisos([sessao({ nome: "Luana", fone: null, dono: "luana" }), sessao({ nome: "Luana", fone: "5512999990004" })]);
    expect(telefoneDaPessoa(canal, { id: "luana", nome: "Luana" })).toBeUndefined();
  });

  it("dois números sem dono com o mesmo nome: ambíguo, nenhum vale", () => {
    const canal = montarCanalDeAvisos([sessao({ nome: "Ana", fone: "5512999990005" }), sessao({ nome: "Ana", fone: "5512999990006" })]);
    expect(telefoneDaPessoa(canal, { id: "ana", nome: "Ana" })).toBeUndefined();
  });

  it("o OPA Lembretes é o canal de envio, não o número de ninguém", () => {
    const canal = montarCanalDeAvisos([sessao({ nomeSessao: "opa-lembretes", nome: "OPA", fone: "5512999990007", dono: "admin" })]);
    expect(canal.sessaoLembretes).toBe("opa-lembretes");
    expect(telefoneDaPessoa(canal, { id: "admin", nome: "OPA" })).toBeUndefined();
  });
});

describe("texto da escala", () => {
  it("diz por que a gestão decide", () => {
    expect(textoEscala({ gestor: "Marco", lead: "João", dono: null, link: "x", motivo: "dono_saiu" })).toContain("saiu da equipe");
    expect(textoEscala({ gestor: "Marco", lead: "João", dono: "Luana", link: "x", motivo: "sem_aviso" })).toContain("o aviso não chegou");
    expect(textoEscala({ gestor: "Marco", lead: "João", dono: "Luana", link: "x" })).toContain("ninguém mais da roleta");
  });
});
