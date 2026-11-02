/**
 * Troca de papel em Membros (OPA, 02/11/2026).
 *
 * Cobre: "Salvar" só aparece quando o papel muda; salvar chama a rota da base
 * PATCH /api/v1/team/[user_id] e recarrega a tela; erro volta ao papel antigo e
 * explica em palavras (último administrador, sem permissão).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ApiError } from "@/lib/api/types";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/api/client", () => ({ apiClient: { patch: vi.fn() } }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { apiClient } from "@/lib/api/client";
import { toast } from "sonner";
import { TrocarPapel, mensagemDoErro } from "./_trocar-papel";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TrocarPapel", () => {
  it("só mostra Salvar depois de escolher outro papel", async () => {
    render(<TrocarPapel userId="u1" nome="Luana Machado" papel="agent" />);
    expect(screen.queryByRole("button", { name: "Salvar" })).toBeNull();

    await userEvent.selectOptions(screen.getByLabelText("Papel de Luana Machado"), "manager");
    expect(screen.getByRole("button", { name: "Salvar" })).toBeTruthy();
    expect(screen.getByText("Vê a equipe toda e convida corretores.")).toBeTruthy();

    await userEvent.selectOptions(screen.getByLabelText("Papel de Luana Machado"), "agent");
    expect(screen.queryByRole("button", { name: "Salvar" })).toBeNull();
  });

  it("salva pela rota da base e recarrega a tela", async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({ data: { user_id: "u1", role: "manager" } });
    render(<TrocarPapel userId="u1" nome="Luana Machado" papel="agent" />);

    await userEvent.selectOptions(screen.getByLabelText("Papel de Luana Machado"), "manager");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(apiClient.patch).toHaveBeenCalledWith("/api/v1/team/u1", { role: "manager" });
    expect(toast.success).toHaveBeenCalledWith("Luana agora é Gestor.");
  });

  it("erro volta ao papel antigo e avisa", async () => {
    vi.mocked(apiClient.patch).mockRejectedValue(
      new ApiError(409, "state_conflict", undefined, "r1", "Não é possível rebaixar o último admin do tenant."),
    );
    render(<TrocarPapel userId="u2" nome="Allyson" papel="admin" />);

    const seletor = screen.getByLabelText("Papel de Allyson") as HTMLSelectElement;
    await userEvent.selectOptions(seletor, "agent");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("A equipe precisa de pelo menos um administrador."));
    expect(seletor.value).toBe("admin");
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("mensagemDoErro", () => {
  it("traduz os erros da rota", () => {
    expect(mensagemDoErro(new ApiError(403, "forbidden", undefined, "r"))).toBe("Só o administrador troca o papel de alguém.");
    expect(mensagemDoErro(new ApiError(404, "not_found", undefined, "r"))).toBe("Essa pessoa não está mais na equipe.");
    expect(mensagemDoErro(new ApiError(409, "state_conflict", undefined, "r", "Membro está revogado."))).toBe(
      "Essa pessoa não está mais na equipe.",
    );
    expect(mensagemDoErro(new Error("rede"))).toBe("Não deu para trocar o papel. Tente de novo.");
  });
});
