import { redirect } from "next/navigation";

import { CabecalhoAcesso } from "@/components/auth/AcessoOpa";
import { CodigoDeAcessoForm } from "@/components/auth/CodigoDeAcessoForm";
import { marcaOpa } from "@/lib/branding";
import { createClient } from "@/lib/supabase/server";
import { exigeCodigo } from "@/lib/auth/segundo-fator-cookie";
import { canaisDisponiveis, destinoSeguro, mascararDestino } from "@/lib/auth/segundo-fator";

export const metadata = { title: "Código de acesso" };
export const dynamic = "force-dynamic";

/** Segundo passo do login para quem escolheu código por e-mail ou WhatsApp (0125). */
export default async function CodigoDeAcessoPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!exigeCodigo(user.app_metadata)) redirect(destinoSeguro(next));

  const canal = user.app_metadata.segundo_fator as "email" | "whatsapp";
  const destino =
    canal === "whatsapp" ? String(user.app_metadata.segundo_fator_whatsapp ?? "") : (user.email ?? "");
  const { email } = await canaisDisponiveis(user.id);
  const opa = marcaOpa();

  return (
    <div className={opa ? "space-y-7" : "space-y-6"}>
      <CabecalhoAcesso
        opa={opa}
        titulo="Confirme que é você"
        subtitulo={`Mandamos um código de 6 números ${canal === "whatsapp" ? "no WhatsApp" : "no e-mail"} ${mascararDestino(canal, destino)}.`}
      />
      <CodigoDeAcessoForm next={next} podeUsarEmail={canal === "whatsapp" && email && !!user.email} />
    </div>
  );
}
