// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/waha/client", () => ({ getWahaClient: () => null }));

import {
  avisarDestino,
  avisarPessoa,
  chaveDoDestino,
  destinosFixos,
  liberadoNoTeste,
  mesmoTelefone,
  montarCanalDeAvisos,
  telefoneDaPessoa,
  telefoneLegivel,
  textoAvisoDePrazo,
  textoEscala,
  textoForaDoHorario,
  textoLeadDeOutroCorretor,
  textoParado,
  textoRepasseParaGestor,
  textoRepasseParaNovoDono,
  textoRepasseParaQuemPerdeu,
} from "./aviso-whatsapp";
import { numeroDeAviso, numerosDeAviso, numerosDoAssistente } from "./config";

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

describe("aviso de lead que está com outro corretor", () => {
  it("curto: o número do lead, o responsável e a observação", () => {
    expect(textoLeadDeOutroCorretor({ quemRecebeu: "Marco Henrique", telefone: "+5512991392393", lead: "Ana Souza", responsavel: "Cristian Spengler" })).toBe(
      "Marco, esse lead (+55 12 99139-2393) está com o corretor responsável Cristian.\n\nObs.: avise esse lead para continuar a conversa com o número do corretor.",
    );
  });

  it("sem telefone, diz o nome; sem os dois, não inventa", () => {
    expect(textoLeadDeOutroCorretor({ quemRecebeu: "Marco", telefone: null, lead: "Ana Souza", responsavel: "Luana" })).toContain("esse lead (Ana Souza) está");
    expect(textoLeadDeOutroCorretor({ quemRecebeu: "Marco", telefone: "", lead: null, responsavel: "Luana" })).toContain("esse lead (que te escreveu agora) está");
  });

  it("telefone legível", () => {
    expect(telefoneLegivel("5512991392393")).toBe("+55 12 99139-2393");
    expect(telefoneLegivel("+55 (12) 3896-1234")).toBe("+55 12 3896-1234");
    expect(telefoneLegivel("+14155550123")).toBe("+14155550123");
    expect(telefoneLegivel(null)).toBeNull();
  });
});

describe("texto da escala", () => {
  it("diz por que a gestão decide", () => {
    expect(textoEscala({ gestor: "Marco", lead: "João", dono: null, link: "x", motivo: "dono_saiu" })).toContain("saiu da equipe");
    expect(textoEscala({ gestor: "Marco", lead: "João", dono: "Luana", link: "x", motivo: "sem_aviso" })).toContain("o aviso não chegou");
    expect(textoEscala({ gestor: "Marco", lead: "João", dono: "Luana", link: "x" })).toContain("ninguém mais da roleta");
  });
});

describe("textos com respiro (10/11/2026)", () => {
  it("aviso de prazo: uma linha em branco entre os parágrafos", () => {
    expect(textoAvisoDePrazo({ corretor: "Luana Machado", lead: "João Silva", esperaMin: 20, faltaMin: 40, proprio: false, link: "https://crm/l/1", whatsapp: "5512999990001" })).toBe(
      "Luana, João Silva espera sua resposta há 20 min.\n\nFaltam 40 min para ele passar para o próximo da fila.\n\nResponder: https://wa.me/5512999990001\n\nFicha: https://crm/l/1",
    );
  });

  it("repasse: o novo dono com respiro, quem perdeu com a bolinha vermelha", () => {
    expect(textoRepasseParaNovoDono({ corretor: "Martin", lead: "João Silva", de: "Luana", link: "L", whatsapp: null })).toBe(
      "Martin, lead novo para você: João Silva.\n\nEle estava com Luana e passou para a sua vez por falta de resposta no prazo. Responda o quanto antes.\n\nFicha: L",
    );
    expect(textoRepasseParaQuemPerdeu({ corretor: "Luana", lead: "João Silva", para: "Martin" })).toBe(
      "🔴 Luana, João Silva passou para Martin: ficou sem resposta além do prazo.",
    );
  });

  it("fora do horário: só o lembrete, sem prazo nem fila", () => {
    const t = textoForaDoHorario({ corretor: "Luana", lead: "João Silva", esperaMin: 30, link: "L", whatsapp: "5512999990001" });
    expect(t).toBe("Luana, o lead João Silva chegou e está sem resposta há 30 min.\n\nResponder: https://wa.me/5512999990001\n\nFicha: L");
    expect(t).not.toMatch(/fila|prazo/);
  });

  it("número fixo da gestão sem pessoa não leva nome", () => {
    expect(textoRepasseParaGestor({ gestor: null, lead: "João Silva", de: "Luana", para: "Martin", link: "L" })).toBe(
      "João Silva saiu de Luana e foi para Martin por falta de resposta no prazo.\n\nFicha: L",
    );
    expect(textoRepasseParaGestor({ gestor: "Marco Henrique", lead: "João", de: "Luana", para: "Martin", link: "L" })).toMatch(/^Marco, João saiu de Luana/);
    expect(textoEscala({ gestor: null, lead: "João", dono: "Luana", link: "L" })).toBe("João passou do prazo e ninguém mais da roleta pôde pegar.\n\nEstá com Luana.\n\nDecida quem atende: L");
    expect(textoParado({ corretor: null, lead: "João", etapa: "Proposta feita", dias: 7, link: "L" })).toMatch(/^João está parado há 7 dias em Proposta feita\./);
  });
});

describe("modo de teste do OPA Lembretes (10/11/2026)", () => {
  it("com número de teste, só ele pode receber; sem número, todos", () => {
    const emTeste = montarCanalDeAvisos([], ["5516988301706"]);
    expect(liberadoNoTeste(emTeste, "+55 16 98830-1706")).toBe(true);
    expect(liberadoNoTeste(emTeste, "551688301706")).toBe(true);
    expect(liberadoNoTeste(emTeste, "5512992096501")).toBe(false);
    expect(liberadoNoTeste(emTeste, null)).toBe(false);
    expect(liberadoNoTeste(montarCanalDeAvisos([]), "5512992096501")).toBe(true);
  });

  it("aviso para quem não está na lista fica retido, sem chegar ao WhatsApp", async () => {
    const canal = montarCanalDeAvisos(
      [sessao({ nomeSessao: "opa-lembretes", nome: "OPA", fone: "5512999990007" }), sessao({ nome: "Luana", fone: "5512999990001", dono: "luana" })],
      ["5516988301706"],
    );
    expect(await avisarPessoa(canal, { id: "luana", nome: "Luana" }, "teste")).toBe("retido");
    expect(await avisarDestino(canal, { userId: null, nome: null, telefone: "5512992096501" }, "teste")).toBe("retido");
  });

  it("quem fala com o assistente: só número válido, com nome e papel conhecidos", () => {
    expect(
      numerosDoAssistente([
        { numero: "16 98830-1706", nome: " Allyson ", papel: "admin" },
        { numero: "5516988301706", nome: "Repetido", papel: "admin" },
        { numero: "123", nome: "Curto", papel: "admin" },
        { numero: "12 99999-0000", nome: "Sem papel", papel: "dono" },
        null,
      ]),
    ).toEqual([{ numero: "5516988301706", nome: "Allyson", papel: "admin", usuario: null }]);
    expect(numerosDoAssistente("x")).toEqual([]);
  });
});

describe("números fixos da gestão e da administração", () => {
  const canal = montarCanalDeAvisos([sessao({ nome: "Marco", fone: "+55 12 99209-6501", dono: "marco" })]);
  const equipe = new Map([["marco", { id: "marco", nome: "Marco Henrique" }]]);

  it("o mesmo número com ou sem 55 e com ou sem o nono dígito", () => {
    expect(mesmoTelefone("5512992096501", "12 99209-6501")).toBe(true);
    expect(mesmoTelefone("551292096501", "5512992096501")).toBe(true);
    expect(mesmoTelefone("5512992096501", "5511992096501")).toBe(false);
    expect(mesmoTelefone(null, "5512992096501")).toBe(false);
  });

  it("número de alguém da equipe ganha o nome; os outros ficam só com o número", () => {
    expect(destinosFixos(["5512992096501", "5516988301706"], canal, equipe)).toEqual([
      { userId: "marco", nome: "Marco Henrique", telefone: "5512992096501" },
      { userId: null, nome: null, telefone: "5516988301706" },
    ]);
  });

  it("cada destino tem a sua reserva: a pessoa, ou o número dentro da marca", () => {
    expect(chaveDoDestino({ userId: "marco", nome: "Marco", telefone: "5512992096501" }, "m1")).toEqual({ userId: "marco", marca: "m1" });
    expect(chaveDoDestino({ userId: null, nome: null, telefone: "5516988301706" }, "m1")).toEqual({ userId: null, marca: "m1 tel:5516988301706" });
  });

  it("número digitado em Configurações vira só dígitos com 55; lixo fica de fora", () => {
    expect(numeroDeAviso("16 98830-1706")).toBe("5516988301706");
    expect(numeroDeAviso("12 974068058")).toBe("5512974068058");
    expect(numeroDeAviso("1234")).toBeNull();
    expect(numerosDeAviso(["16 98830-1706", "5516988301706", "x", null])).toEqual(["5516988301706"]);
    expect(numerosDeAviso(undefined)).toEqual([]);
  });
});
