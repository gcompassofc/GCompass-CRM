import { describe, expect, it } from "vitest";

import { phoneLookupVariants } from "@/lib/channels/phone-variants";
import { corrigirParaONumeroReal, formaJaGravada } from "./ingest";

/** Banco falso: só a consulta de contatos por telefone. */
function bancoCom(gravados: string[]) {
  const consulta = {
    _formas: [] as string[],
    select: () => consulta,
    eq: () => consulta,
    in: (_c: string, formas: string[]) => ((consulta._formas = formas), consulta),
    is: () => consulta,
    order: async () => ({ data: gravados.filter((g) => consulta._formas.includes(g)).map((phone_number) => ({ phone_number })), error: null }),
  };
  return { from: () => consulta } as never;
}

describe("nono dígito: a mesma pessoa não vira dois contatos (13/11/2026, caso da Wandalcy)", () => {
  it("as duas formas do celular de BH se encontram", () => {
    expect(phoneLookupVariants("+5531991234567")).toContain("+553191234567");
    expect(phoneLookupVariants("+553191234567")).toContain("+5531991234567");
  });

  it("formulário gravou com 9, WhatsApp chega sem: a mensagem vai para o contato do formulário", async () => {
    expect(await formaJaGravada(bancoCom(["+5531991234567"]), "org", "+553191234567")).toBe("+5531991234567");
  });

  it("a forma que chegou já existe: fica com ela", async () => {
    expect(await formaJaGravada(bancoCom(["+553191234567", "+5531991234567"]), "org", "+553191234567")).toBe("+553191234567");
  });

  it("ninguém gravado: segue com a forma que chegou", async () => {
    expect(await formaJaGravada(bancoCom([]), "org", "+553191234567")).toBe("+553191234567");
  });

  it("fixo não ganha variante e não consulta nada", async () => {
    expect(await formaJaGravada(bancoCom(["+5531932345678"]), "org", "+553132345678")).toBe("+553132345678");
  });
});

describe("o WhatsApp mostra qual forma do número funciona", () => {
  function bancoQueAtualiza(gravados: string[], falha = false) {
    const feito: Array<{ de: string; para: string }> = [];
    let para = "";
    let de = "";
    const q = {
      update: (v: { phone_number: string }) => ((para = v.phone_number), q),
      eq: (col: string, v: string) => (col === "phone_number" && (de = v), q),
      is: () => q,
      select: async () => {
        if (falha) return { data: null, error: { message: "duplicado" } };
        if (!gravados.includes(de)) return { data: [], error: null };
        feito.push({ de, para });
        return { data: [{ id: "A" }], error: null };
      },
    };
    return { admin: { from: () => q } as never, feito };
  }

  it("cadastro com 99 vira o número com um 9 só quando a mensagem chega por ele", async () => {
    const b = bancoQueAtualiza(["+5531991234567"]);
    expect(await corrigirParaONumeroReal(b.admin, "org", "+5531991234567", "+553191234567")).toBe(true);
    expect(b.feito).toEqual([{ de: "+5531991234567", para: "+553191234567" }]);
  });

  it("não troca número que não é a outra forma do mesmo celular", async () => {
    const b = bancoQueAtualiza(["+5511988887777"]);
    expect(await corrigirParaONumeroReal(b.admin, "org", "+5511988887777", "+553191234567")).toBe(false);
    expect(b.feito).toEqual([]);
  });

  it("se o banco recusa (outro cadastro já tem o número), segue sem trocar", async () => {
    const b = bancoQueAtualiza(["+5531991234567"], true);
    expect(await corrigirParaONumeroReal(b.admin, "org", "+5531991234567", "+553191234567")).toBe(false);
  });
});
