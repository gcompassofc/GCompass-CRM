import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { podeMexerNoNumero } from "@/lib/channels/dono";
import { WhatsappLogo } from "@/lib/ui/icons";

import { CabecalhoOpa, CorpoOpa } from "../_opa/cabecalho";
import { ContatosNovos } from "../_opa/contatos-novos";
import { listarContatosNovos } from "../_opa/contatos-novos-actions";
import { estadoMeuWhatsapp } from "./actions";
import { MeuWhatsappCliente } from "./_cliente";

export const dynamic = "force-dynamic";
export const metadata = { title: "Meu WhatsApp" };

export default async function MeuWhatsappPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app");
  // Leitura e operador de IA não atendem cliente: mesma regra das ações (podeMexerNoNumero).
  if (!podeMexerNoNumero({ papel: org.role, souPlatformAdmin: user.is_platform_admin, userId: user.id, donoDaSessao: user.id })) {
    redirect("/app/hoje");
  }

  const [inicial, contatosNovos] = await Promise.all([estadoMeuWhatsapp(), listarContatosNovos()]);

  return (
    <>
      <CabecalhoOpa secao="Seu espaço" titulo="Meu WhatsApp" subtitulo="Conecte o seu número e veja se ele está no ar" icone={WhatsappLogo} equipe={false} ferramentas={false} />
      <CorpoOpa>
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          <ContatosNovos inicial={contatosNovos} compacto />
          <MeuWhatsappCliente inicial={inicial} />
        </div>
      </CorpoOpa>
    </>
  );
}
