import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const acoes = {
  decidirContato: vi.fn(),
  listarContatosDaEquipe: vi.fn(),
  listarContatosNovos: vi.fn(),
  verConversa: vi.fn(),
  verConversaDaEquipe: vi.fn(),
};
vi.mock("./contatos-novos-actions", () => acoes);
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { ContatosDaEquipe, ContatosNovos } = await import("./contatos-novos");
const { INTERVALO_MS } = await import("./atualiza-sozinho");

const contato = (id: string, nome: string, corretorId = "corretor-1") => ({
  id,
  nome,
  telefone: "+5512999990000",
  ultimoContatoEm: "2026-11-05T12:00:00.000Z",
  mensagens: 1,
  ultimaMensagem: { id: `m-${id}`, direcao: "entrada" as const, texto: "Oi", em: "2026-11-05T12:00:00.000Z" },
  corretorId,
});

const rodada = () => act(() => vi.advanceTimersByTimeAsync(INTERVALO_MS));

beforeEach(() => {
  vi.useFakeTimers();
  Object.values(acoes).forEach((a) => a.mockReset());
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Contatos novos, sem atualizar a página", () => {
  it("contato novo aparece sozinho mesmo com a lista vazia, e o marcado como pessoal no celular some", async () => {
    acoes.listarContatosNovos.mockResolvedValue([]);
    render(<ContatosNovos inicial={[]} />);
    await rodada();
    expect(screen.queryByText("Marina")).toBeNull();

    acoes.listarContatosNovos.mockResolvedValue([contato("a", "Marina")]);
    await rodada();
    expect(screen.getByText("Marina")).toBeTruthy();

    acoes.listarContatosNovos.mockResolvedValue([]);
    await rodada();
    expect(screen.queryByText("Marina")).toBeNull();
  });

  it("avisa ao corretor que o gestor também vê", async () => {
    acoes.listarContatosNovos.mockResolvedValue([contato("a", "Marina")]);
    render(<ContatosNovos inicial={[contato("a", "Marina")]} />);
    expect(screen.getByText(/Você e os gestores veem/)).toBeTruthy();
    expect(screen.queryByText(/Só você vê/)).toBeNull();
  });

  it("contato decidido aqui não volta com uma consulta atrasada", async () => {
    acoes.listarContatosNovos.mockResolvedValue([contato("a", "Marina")]);
    acoes.decidirContato.mockResolvedValue({ ok: true });
    render(<ContatosNovos inicial={[contato("a", "Marina")]} />);
    fireEvent.click(screen.getByRole("button", { name: "É lead" }));
    await act(() => vi.advanceTimersByTimeAsync(0));
    await rodada();
    expect(screen.queryByText("Marina")).toBeNull();
  });
});

describe("Contatos novos da equipe (gestor)", () => {
  const nomes = { "corretor-1": "Luana Souza", "corretor-2": "Pedro Lima" };

  it("mostra uma linha por corretor com a contagem, e os contatos só depois do clique", () => {
    acoes.listarContatosDaEquipe.mockResolvedValue([]);
    render(<ContatosDaEquipe inicial={[contato("a", "Marina"), contato("b", "Rita"), contato("c", "Bia", "corretor-2")]} corretores={nomes} />);
    expect(screen.getByText("Luana Souza")).toBeTruthy();
    expect(screen.getByText(/2 esperando/)).toBeTruthy();
    expect(screen.getByText(/1 esperando/)).toBeTruthy();
    expect(screen.queryByText("Marina")).toBeNull();
    fireEvent.click(screen.getByText("Luana Souza"));
    expect(screen.getByText("Marina")).toBeTruthy();
  });

  it("é só leitura: abre a conversa, mas não tem É lead nem Pessoal", async () => {
    acoes.listarContatosDaEquipe.mockResolvedValue([contato("a", "Marina")]);
    acoes.verConversaDaEquipe.mockResolvedValue({ ok: true, mensagens: [{ id: "m1", direcao: "entrada", texto: "Vi a casa", em: "2026-11-05T12:00:00.000Z" }] });
    render(<ContatosDaEquipe inicial={[contato("a", "Marina")]} corretores={nomes} />);
    fireEvent.click(screen.getByText("Luana Souza"));
    expect(screen.queryByRole("button", { name: "É lead" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Pessoal" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ver conversa" }));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(acoes.verConversaDaEquipe).toHaveBeenCalledWith("a");
    expect(screen.getByText("Vi a casa")).toBeTruthy();
  });

  it("atualiza sozinha: o contato decidido pelo corretor sai da lista do gestor", async () => {
    acoes.listarContatosDaEquipe.mockResolvedValue([]);
    render(<ContatosDaEquipe inicial={[contato("a", "Marina")]} corretores={nomes} />);
    expect(screen.getByText("Luana Souza")).toBeTruthy();
    await rodada();
    expect(screen.queryByText("Luana Souza")).toBeNull();
  });
});
