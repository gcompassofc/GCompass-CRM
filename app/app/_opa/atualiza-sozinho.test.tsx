import { act, render, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
const sinalDeLeads = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("./contatos-novos-actions", () => ({ sinalDeLeads }));

const { AtualizaSozinho, INTERVALO_MS, useRepetir } = await import("./atualiza-sozinho");

const avancar = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

function visibilidade(v: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { value: v, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  vi.useFakeTimers();
  visibilidade("visible");
  refresh.mockClear();
  sinalDeLeads.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("useRepetir", () => {
  it("confere ao abrir e a cada intervalo", async () => {
    const tarefa = vi.fn(async () => {});
    renderHook(() => useRepetir(tarefa));
    await avancar(0);
    expect(tarefa).toHaveBeenCalledTimes(1);
    await avancar(INTERVALO_MS * 2);
    expect(tarefa).toHaveBeenCalledTimes(3);
  });

  it("com a aba escondida não consulta; ao voltar, confere na hora", async () => {
    const tarefa = vi.fn(async () => {});
    renderHook(() => useRepetir(tarefa));
    await avancar(0);
    visibilidade("hidden");
    await avancar(INTERVALO_MS * 3);
    expect(tarefa).toHaveBeenCalledTimes(1);
    visibilidade("visible");
    await avancar(0);
    expect(tarefa).toHaveBeenCalledTimes(2);
  });

  it("não começa uma rodada antes da anterior terminar, e erro não para a repetição", async () => {
    let soltar = () => {};
    const tarefa = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(() => new Promise<void>((r) => (soltar = r)))
      .mockRejectedValueOnce(new Error("rede"))
      .mockResolvedValue();
    renderHook(() => useRepetir(tarefa));
    await avancar(INTERVALO_MS * 2);
    expect(tarefa).toHaveBeenCalledTimes(1);
    soltar();
    await avancar(INTERVALO_MS * 2);
    expect(tarefa).toHaveBeenCalledTimes(3);
  });

  it("para de consultar quando a tela sai", async () => {
    const tarefa = vi.fn(async () => {});
    const { unmount } = renderHook(() => useRepetir(tarefa));
    await avancar(0);
    unmount();
    await avancar(INTERVALO_MS * 3);
    expect(tarefa).toHaveBeenCalledTimes(1);
  });
});

describe("AtualizaSozinho", () => {
  it("só recarrega quando o sinal muda, e a primeira leitura é o ponto de partida", async () => {
    sinalDeLeads.mockResolvedValueOnce("3:a").mockResolvedValueOnce("3:a").mockResolvedValueOnce("4:b").mockResolvedValue("4:b");
    render(<AtualizaSozinho />);
    await avancar(INTERVALO_MS);
    expect(refresh).not.toHaveBeenCalled();
    await avancar(INTERVALO_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
    await avancar(INTERVALO_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
