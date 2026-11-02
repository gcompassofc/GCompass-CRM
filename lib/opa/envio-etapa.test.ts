// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  escopoDoFunil,
  linkWhatsApp,
  montarListaDoEnvio,
  personalizar,
  podeReceber,
  primeiroNomeDoLead,
  sugestaoDaEtapa,
  telefoneWhatsApp,
  temLinkOuValor,
  type LinhaEnvio,
} from "./envio-etapa";
import { FUNIS } from "./estrutura";

const linha = (id: string, dono: string | null, extra: Partial<LinhaEnvio> = {}): LinhaEnvio => ({
  id,
  title: `Lead ${id} · Compradores`,
  owner_user_id: dono,
  tags: [],
  contacts: { name: `Helena ${id}`, phone_number: "+55 12 99123-4567" },
  ...extra,
});

describe("primeiroNomeDoLead", () => {
  it("pega a primeira palavra com letra, sem emoji nem pontuação", () => {
    expect(primeiroNomeDoLead("Helena Prado")).toBe("Helena");
    expect(primeiroNomeDoLead("  🏠 Maria, da Vila")).toBe("Maria");
    expect(primeiroNomeDoLead("123 Otávio")).toBe("Otávio");
  });

  it("só arruma maiúscula de nome todo igual", () => {
    expect(primeiroNomeDoLead("JOÃO SILVA")).toBe("João");
    expect(primeiroNomeDoLead("joão silva")).toBe("João");
    expect(primeiroNomeDoLead("McCartney")).toBe("McCartney");
  });

  it("sem nome ou cifrado devolve vazio", () => {
    expect(primeiroNomeDoLead("")).toBe("");
    expect(primeiroNomeDoLead(null)).toBe("");
    expect(primeiroNomeDoLead("pii1.v1.abc")).toBe("");
  });
});

describe("personalizar", () => {
  it("troca todo [nome] pelo primeiro nome, sem diferenciar maiúscula", () => {
    expect(personalizar("Oi [nome], tudo bem? [Nome], te ligo.", "Helena")).toBe("Oi Helena, tudo bem? Helena, te ligo.");
  });

  it("sem nome, tira o marcador e arruma a frase", () => {
    expect(personalizar("Oi [nome], tudo bem?", "")).toBe("Oi, tudo bem?");
    expect(personalizar("[nome], das casas que te mandei, qual você quer ver?", "")).toBe("Das casas que te mandei, qual você quer ver?");
  });

  it("texto sem marcador vai como está", () => {
    expect(personalizar("Boa tarde. Tudo certo?", "Helena")).toBe("Boa tarde. Tudo certo?");
  });
});

describe("telefoneWhatsApp e linkWhatsApp", () => {
  it("deixa só os dígitos, como a ficha do lead", () => {
    expect(telefoneWhatsApp("+55 (12) 99123-4567")).toBe("5512991234567");
  });

  it("sem número, curto demais ou cifrado = sem número", () => {
    expect(telefoneWhatsApp(null)).toBeNull();
    expect(telefoneWhatsApp("")).toBeNull();
    expect(telefoneWhatsApp("99123-4567")).toBeNull();
    expect(telefoneWhatsApp("pii1.v1.AbC123456789012")).toBeNull();
  });

  it("codifica a mensagem no link (acento, quebra de linha, ? e &)", () => {
    const url = linkWhatsApp("5512991234567", "Oi Helena, ação & visita?\nAté já");
    expect(url).toBe("https://wa.me/5512991234567?text=Oi%20Helena%2C%20a%C3%A7%C3%A3o%20%26%20visita%3F%0AAt%C3%A9%20j%C3%A1");
    expect(decodeURIComponent(new URL(url).searchParams.get("text") ?? "")).toBe("Oi Helena, ação & visita?\nAté já");
  });
});

describe("off market", () => {
  it("reconhece link e valor por escrito", () => {
    expect(temLinkOuValor("Veja https://opailhabela.com.br/imovel/x/")).toBe(true);
    expect(temLinkOuValor("Está em opailhabela.com.br")).toBe(true);
    expect(temLinkOuValor("Sai por R$ 3,2 mi")).toBe(true);
    expect(temLinkOuValor("Pedem 900 mil")).toBe(true);
    expect(temLinkOuValor("Qual dia fica bom para a visita?")).toBe(false);
  });

  it("lead off market fica de fora só se a mensagem tiver link ou valor", () => {
    const off = { telefone: "5512991234567", offMarket: true };
    expect(podeReceber(off, "Qual dia fica bom?")).toBe("ok");
    expect(podeReceber(off, "Te mando: https://x.com.br")).toBe("off-market");
    expect(podeReceber({ telefone: null, offMarket: false }, "Oi")).toBe("sem-numero");
  });
});

describe("sugestaoDaEtapa", () => {
  const slugs = FUNIS.flatMap((f) => f.etapas.map((e) => e[0] as string));

  it("toda etapa dos três funis tem sugestão no tom do Kit", () => {
    for (const slug of [...slugs, "etapa-nova"]) {
      const t = sugestaoDaEtapa(slug, "Marco Henrique");
      expect(t, slug).toContain("[nome]");
      expect(t, slug).not.toMatch(/!|[–—]/);
      expect(t, slug).toMatch(/\?$/);
      // Uma pergunta só, no fim.
      expect(t.split("?").length - 1, slug).toBe(1);
      // A mesma mensagem vai para lead off market: nada de link nem valor.
      expect(temLinkOuValor(t), slug).toBe(false);
      expect(t, slug).not.toContain("{corretor}");
    }
  });

  it("o primeiro contato apresenta quem envia pelo primeiro nome", () => {
    expect(sugestaoDaEtapa("lead-recebido", "Marco Henrique")).toBe("Oi [nome], aqui é Marco, da OPA. Para eu te ajudar melhor: a casa é para morar, para as temporadas ou para investir?");
    expect(sugestaoDaEtapa("lead-recebido", "")).toContain("Oi [nome], aqui é da equipe da OPA.");
  });
});

describe("escopo do Funil e do envio", () => {
  it("corretor fica com os leads dele, mesmo pedindo outro corretor na URL", () => {
    expect(escopoDoFunil({ role: "agent", plataforma: false, userId: "eu", corretor: "outro" })).toBe("eu");
    expect(escopoDoFunil({ role: "agent", plataforma: false, userId: "eu" })).toBe("eu");
  });

  it("gestor vê a equipe, ou o corretor que filtrou", () => {
    expect(escopoDoFunil({ role: "manager", plataforma: false, userId: "eu" })).toBeNull();
    expect(escopoDoFunil({ role: "admin", plataforma: false, userId: "eu", corretor: "ana" })).toBe("ana");
    expect(escopoDoFunil({ role: "agent", plataforma: true, userId: "eu" })).toBeNull();
  });

  it("lead de outro corretor nunca entra na lista do corretor", () => {
    const linhas = [linha("1", "eu"), linha("2", "outro"), linha("3", null), linha("4", "eu")];
    expect(montarListaDoEnvio(linhas, "eu").map((i) => i.id)).toEqual(["1", "4"]);
    expect(montarListaDoEnvio(linhas, null).map((i) => i.id)).toEqual(["1", "2", "3", "4"]);
  });

  it("monta nome, primeiro nome, telefone e off market de cada lead", () => {
    const [a, b] = montarListaDoEnvio(
      [
        linha("1", "eu"),
        linha("2", "eu", { contacts: { name: null, phone_number: null }, title: "OTÁVIO REIS · Compradores", tags: ["off-market-comprador"] }),
      ],
      "eu",
    );
    expect(a).toEqual({ id: "1", nome: "Helena 1", primeiroNome: "Helena", telefone: "5512991234567", offMarket: false });
    expect(b).toEqual({ id: "2", nome: "OTÁVIO REIS", primeiroNome: "Otávio", telefone: null, offMarket: true });
  });
});
