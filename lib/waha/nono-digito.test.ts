import { describe, expect, it } from "vitest";

import { phoneLookupVariants } from "@/lib/channels/phone-variants";
import { formaJaGravada } from "./ingest";

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
