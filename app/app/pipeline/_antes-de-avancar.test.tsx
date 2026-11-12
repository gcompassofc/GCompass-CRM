import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const preencherEMover = vi.fn();
vi.mock("../leads/actions", () => ({ preencherEMover }));

const { AntesDeAvancar } = await import("./_antes-de-avancar");

const avanco = (campos: Record<string, string> = {}, sugestoes: Record<string, string> = {}) => ({
  leadId: "l1",
  nome: "Helena Prado",
  etapaId: "e-diag",
  etapaNome: "Diagnóstico feito",
  pedido: { minimo: 2, campos, sugestoes },
});

describe("Antes de avançar (2 dos 4 campos, 12/11/2026)", () => {
  it("vem com a sugestão da IA escrita e marcada, e pede só o que falta para 2", () => {
    render(<AntesDeAvancar avanco={avanco({}, { regiao: "Norte" })} onFechar={() => {}} onMovido={() => {}} />);
    expect((screen.getByLabelText(/Região/) as HTMLInputElement).value).toBe("Norte");
    expect(screen.getByText("a IA leu na conversa")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Falta 1 campo" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("com 2 preenchidos salva e move; os 4 vão juntos para o servidor", async () => {
    preencherEMover.mockResolvedValue({ ok: true });
    const onMovido = vi.fn();
    render(<AntesDeAvancar avanco={avanco({ finalidade: "Moradia" })} onFechar={() => {}} onMovido={onMovido} />);
    fireEvent.click(screen.getByRole("button", { name: "Sem pressa" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Salvar e mover" })));
    const fd = preencherEMover.mock.calls[0]![0] as FormData;
    expect(fd.get("leadId")).toBe("l1");
    expect(fd.get("etapaId")).toBe("e-diag");
    expect(fd.get("finalidade")).toBe("Moradia");
    expect(fd.get("momento")).toBe("Sem pressa");
    expect(onMovido).toHaveBeenCalled();
  });

  it("erro do servidor aparece na janela e o card não anda", async () => {
    preencherEMover.mockResolvedValue({ ok: false, erro: "Preencha pelo menos 2 dos 4 campos." });
    const onMovido = vi.fn();
    render(<AntesDeAvancar avanco={avanco({ finalidade: "Moradia", regiao: "Sul" })} onFechar={() => {}} onMovido={onMovido} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Salvar e mover" })));
    expect(screen.getByText("Preencha pelo menos 2 dos 4 campos.")).toBeTruthy();
    expect(onMovido).not.toHaveBeenCalled();
  });
});
