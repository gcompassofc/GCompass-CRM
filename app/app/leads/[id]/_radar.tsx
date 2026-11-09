import { precoCheioRadar, type RadarDoCard } from "@/lib/opa/radar-captacoes";
import { ArrowSquareOut, Target } from "@/lib/ui/icons";

import { Cartao, Chip, TituloBloco } from "../../_opa/ui";

const data = (iso: string | null | undefined) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : null);

/**
 * O anúncio que o Radar achou (Captações do Radar, 09/11/2026). Na ficha do card
 * do Radar ele ocupa o lugar do Copiloto: ainda não há conversa para a IA ler.
 */
export function CartaoRadar({ radar, dias }: { radar: RadarDoCard; dias: number }) {
  const baixou = radar.precos.length > 1 ? radar.precos[0] : null;
  const fatos: Array<[string, string]> = [
    ["Preço anunciado", precoCheioRadar(radar.preco_anunciado)],
    ["Região", radar.regiao ?? "Sem região"],
    ["Quartos", radar.quartos ? `${radar.quartos}${radar.suites ? ` (${radar.suites} suítes)` : ""}` : "Sem dado"],
  ];
  return (
    <Cartao escuro bloco>
      <TituloBloco
        claro
        icone={Target}
        titulo="O anúncio que o Radar achou"
        sub={`${radar.imobiliaria} · código ${radar.codigo}`}
        acao={<Chip tom="acao">{radar.dist}</Chip>}
      />
      <div className="mt-5 grid gap-2.5 sm:grid-cols-3">
        {fatos.map(([r, v]) => (
          <div key={r} className="rounded-[18px] bg-white/[0.07] px-4 py-3">
            <p className="text-[12px] text-white/60">{r}</p>
            <p className="mt-0.5 text-[18px] font-light tracking-[-0.02em] text-white">{v}</p>
          </div>
        ))}
      </div>
      <ul className="mt-4 flex flex-col gap-1.5 text-[13px] leading-relaxed text-white/75">
        <li>
          Enviado em {data(radar.enviado_em)}
          {dias > 0 ? `, há ${dias} ${dias === 1 ? "dia" : "dias"} sem anotação` : ""}.
        </li>
        {radar.primeira_vez && <li>Visto pelo Radar desde {data(radar.primeira_vez)}.</li>}
        {baixou && radar.preco_anunciado && baixou.preco > radar.preco_anunciado && (
          <li>
            Preço anunciado baixou de {precoCheioRadar(baixou.preco)} para {precoCheioRadar(radar.preco_anunciado)}.
          </li>
        )}
        {radar.outros.map((o) => (
          <li key={o.link}>
            Possivelmente o mesmo imóvel em{" "}
            <a href={o.link} target="_blank" rel="noopener noreferrer" className="font-semibold text-white underline underline-offset-2">
              {o.fonte}
            </a>
            {o.preco ? ` (${precoCheioRadar(o.preco)})` : ""}.
          </li>
        ))}
      </ul>
      <a
        href={radar.link}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-[14px] font-semibold text-[#0a2d40] hover:bg-[#e7f0f5]"
      >
        <ArrowSquareOut className="size-4" /> Ver anúncio
      </a>
    </Cartao>
  );
}
