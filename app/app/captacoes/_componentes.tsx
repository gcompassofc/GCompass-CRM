"use client";

import { useRef } from "react";

import { CaretDown, UploadSimple, Warning } from "@/lib/ui/icons";

import { BotaoEnvio, FormComRetorno } from "../_opa/form-com-retorno";
import { importarDoRadar, marcarErroNoAnuncio } from "./actions";

const MENU =
  "absolute right-0 z-20 mt-2 flex w-[min(90vw,360px)] flex-col gap-3 rounded-[22px] bg-white p-4 text-left shadow-[0_12px_40px_rgba(9,44,62,0.2)]";
const PILULA =
  "inline-flex h-11 cursor-pointer list-none items-center gap-2 rounded-full bg-white px-5 text-[14px] font-semibold text-[#0a2d40] hover:bg-[#e7f0f5] [&::-webkit-details-marker]:hidden";

/** Gestor: sobe o registro.json do Radar. Cria os cards novos e atualiza os que já existem. */
export function ImportarDoRadar() {
  const detalhes = useRef<HTMLDetailsElement>(null);
  return (
    <details ref={detalhes} className="group relative">
      <summary className={PILULA}>
        <UploadSimple className="size-4" /> Importar do Radar <CaretDown className="size-3.5 transition-transform group-open:rotate-180" />
      </summary>
      <div className={MENU}>
        <p className="text-[13px] leading-relaxed text-[#34566b]">
          Escolha o <strong className="font-semibold">registro.json</strong> do Radar (pasta material/distribuicoes). Entram só os imóveis já enviados aos
          corretores; o que já está aqui só tem os dados do anúncio atualizados.
        </p>
        <FormComRetorno action={importarDoRadar} className="flex flex-col gap-3">
          <input
            type="file"
            name="registro"
            accept="application/json,.json"
            required
            className="text-[13px] text-[#34566b] file:mr-3 file:rounded-full file:border-0 file:bg-[#e7f0f5] file:px-4 file:py-2 file:text-[13px] file:font-semibold file:text-[#12455f]"
          />
          <label className="flex items-start gap-2 text-[13px] text-[#34566b]">
            <input type="checkbox" name="avisar" className="mt-0.5 size-4 accent-[#2a7ca8]" />
            Avisar os corretores pelo OPA Lembretes (deixe desmarcado se o e-mail já foi)
          </label>
          <BotaoEnvio
            enviando="Importando"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#0a2d40] px-5 text-[14px] font-semibold text-white hover:bg-[#12455f]"
          >
            <UploadSimple className="size-4" /> Importar
          </BotaoEnvio>
        </FormComRetorno>
      </div>
    </details>
  );
}

/** Corretor aponta erro no anúncio: vira anotação na ficha para a gestão ver. */
export function ErroNoAnuncio({ leadId, erros }: { leadId: string; erros: readonly string[] }) {
  return (
    <details className="group relative">
      <summary className={`${PILULA} text-[#a4410e]`}>
        <Warning className="size-4" /> Algo errado no anúncio
      </summary>
      <div className={`${MENU} left-0 right-auto`}>
        <FormComRetorno action={marcarErroNoAnuncio} sucesso="Anotado na ficha." className="flex flex-col gap-2">
          <input type="hidden" name="leadId" value={leadId} />
          {erros.map((e, i) => (
            <label key={e} className="flex cursor-pointer items-center gap-2.5 rounded-2xl px-3 py-2 text-[14px] text-[#0a2d40] hover:bg-[#eef3f6]">
              <input type="radio" name="erro" value={e} required defaultChecked={i === 0} className="size-4 accent-[#a4410e]" />
              {e}
            </label>
          ))}
          <textarea
            name="obs"
            maxLength={1000}
            placeholder="O que você viu (opcional)"
            className="min-h-[72px] rounded-[18px] bg-[#eef3f6] px-4 py-3 text-[14px] text-[#0a2d40] outline-none placeholder:text-[#5b7284] focus:ring-2 focus:ring-[#8fc4dd]"
          />
          <BotaoEnvio
            enviando="Salvando"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#0a2d40] px-5 text-[14px] font-semibold text-white hover:bg-[#12455f]"
          >
            Anotar na ficha
          </BotaoEnvio>
        </FormComRetorno>
      </div>
    </details>
  );
}
