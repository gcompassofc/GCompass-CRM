/**
 * Lead que era contato pessoal (03/11/2026): do contato do CRM até a conversa do WhatsApp.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";

import { chatDoContato } from "./contatos-pessoais";

describe("conversa do WhatsApp a partir do contato", () => {
  it("telefone e lid viram o chat do WhatsApp", () => {
    expect(chatDoContato("phone:5512999994321")).toBe("5512999994321@c.us");
    expect(chatDoContato("lid:123456789")).toBe("123456789@lid");
  });
  it("sem identidade do WhatsApp, não há conversa", () => {
    expect(chatDoContato(null)).toBeNull();
    expect(chatDoContato("email:a@b.com")).toBeNull();
    expect(chatDoContato("phone:")).toBeNull();
  });
});
