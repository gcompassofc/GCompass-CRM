import { describe, expect, it } from "vitest";

import { chaveDoTelefone } from "./aviso-whatsapp";
import { mesclarConfig, numerosInternos } from "./config";

describe("números internos da gestão (13/11/2026)", () => {
  it("junta gestão, administração, teste e assistente, sem repetir", () => {
    const config = mesclarConfig({
      avisos: { gestor: ["16 91234-5678", "12 99999-0001"], admin: ["5516912345678"], teste: ["12 99999-0002"], desligados: [] },
      assistente: { ligado: true, numeros: [{ numero: "5512999990003", nome: "Kallyl", papel: "admin" }] },
    });
    expect(numerosInternos(config).sort()).toEqual(["5512999990001", "5512999990002", "5512999990003", "5516912345678"]);
  });

  it("configuração vazia não traz número nenhum", () => {
    expect(numerosInternos(mesclarConfig(null))).toEqual([]);
  });

  it("a chave casa com o telefone que chega do WhatsApp (com e sem o nono dígito)", () => {
    const [n] = numerosInternos(mesclarConfig({ avisos: { gestor: ["16 91234-5678"], admin: [], teste: [], desligados: [] } }));
    expect(chaveDoTelefone(n)).toBe(chaveDoTelefone("+5516912345678"));
    expect(chaveDoTelefone(n)).toBe(chaveDoTelefone("551612345678"));
  });
});
