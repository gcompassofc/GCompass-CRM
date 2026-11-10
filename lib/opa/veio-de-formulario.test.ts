import { describe, expect, it } from "vitest";

import { leadComOutroCorretor, origemDeFormulario, preencheuFormulario, veioDeFormulario } from "./veio-de-formulario";

describe("lead de formulário", () => {
  it("formulário do anúncio e do site contam", () => {
    expect(origemDeFormulario({ canal: "meta" })).toBe(true);
    expect(origemDeFormulario({ canal: "site" })).toBe(true);
  });

  it("quem escreveu primeiro no WhatsApp não preencheu nada, mesmo vindo de anúncio", () => {
    expect(origemDeFormulario({ canal: "meta", via: "whatsapp" })).toBe(false);
    expect(origemDeFormulario({ canal: "whatsapp" })).toBe(false);
    expect(origemDeFormulario({ canal: "linkbio" })).toBe(false);
    expect(origemDeFormulario(null)).toBe(false);
  });

  it("a boas-vindas olha como o lead nasceu; lead antigo sem origem vale pelo source", () => {
    expect(veioDeFormulario({ origem: { canal: "site" } })).toBe(true);
    expect(veioDeFormulario({ origem: { canal: "meta", via: "whatsapp" } }, "meta")).toBe(false);
    expect(veioDeFormulario({}, "meta")).toBe(true);
    expect(veioDeFormulario(null, "whatsapp")).toBe(false);
  });

  it("lead do WhatsApp que depois voltou por formulário também preencheu", () => {
    const campos = { origem: { canal: "whatsapp", via: "whatsapp" }, voltou: { em: "2026-11-10", vez: 2, origem: { canal: "meta" } } };
    expect(veioDeFormulario(campos)).toBe(false);
    expect(preencheuFormulario(campos)).toBe(true);
  });
});

describe("lead que escreveu para quem não é o responsável", () => {
  const formulario = { origem: { canal: "meta" } };

  it("está com outro corretor: é esse o lead do aviso", () => {
    const leads = [{ id: "l1", owner_user_id: "cristian", custom_fields: formulario }];
    expect(leadComOutroCorretor(leads, "marco")?.id).toBe("l1");
  });

  it("é a vez de quem recebeu: não avisa", () => {
    expect(leadComOutroCorretor([{ id: "l1", owner_user_id: "marco", custom_fields: formulario }], "marco")).toBeNull();
    // Dois cadastros da mesma pessoa, um deles de quem recebeu: também não.
    expect(
      leadComOutroCorretor(
        [
          { id: "l1", owner_user_id: "cristian", custom_fields: formulario },
          { id: "l2", owner_user_id: "marco", custom_fields: {} },
        ],
        "marco",
      ),
    ).toBeNull();
  });

  it("lead que não preencheu formulário fica fora", () => {
    const leads = [{ id: "l1", owner_user_id: "luana", source: "whatsapp", custom_fields: { origem: { canal: "whatsapp", via: "whatsapp" } } }];
    expect(leadComOutroCorretor(leads, "marco")).toBeNull();
    expect(leadComOutroCorretor([], "marco")).toBeNull();
  });
});
