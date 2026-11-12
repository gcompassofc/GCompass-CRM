import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AvatarContato } from "./ui";

// Leads e Funil mostram a mesma foto do WhatsApp da tela Conversas, com as
// iniciais por baixo para quando não há foto (ou ela não carrega).
describe("AvatarContato", () => {
  it("com foto guardada, pede a mesma rota das Conversas e mantém as iniciais por baixo", () => {
    const { container } = render(<AvatarContato nome="Mariana Souza" contatoId="c1" temFoto />);
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe("/api/v1/contacts/c1/avatar");
    expect(container.textContent).toBe("MS");
  });

  it("sem foto, só as iniciais e nenhuma requisição de imagem", () => {
    const { container } = render(<AvatarContato nome="Mariana Souza" contatoId="c1" temFoto={false} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe("MS");
  });

  it("card do Radar sem contato não pede foto", () => {
    const { container } = render(<AvatarContato nome="Casa Praia Grande" contatoId={null} temFoto />);
    expect(container.querySelector("img")).toBeNull();
  });
});
