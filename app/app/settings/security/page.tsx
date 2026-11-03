import { requireAuth } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { canaisDisponiveis, mascararDestino, metodoDoUsuario } from "@/lib/auth/segundo-fator";
import { SecurityClient } from "./_client";
import { SegundoFatorCard } from "./_segundo-fator";

export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  await requireAuth();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: fatores } = await supabase.auth.mfa.listFactors();
  const temApp = !!fatores?.totp?.some((f) => f.status === "verified");
  const metodo = user ? metodoDoUsuario(user, temApp) : "nenhum";
  const canais = user ? await canaisDisponiveis(user.id) : { email: false, whatsapp: false };
  const whatsapp = String(user?.app_metadata?.segundo_fator_whatsapp ?? "");

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Segurança</h1>
        <p className="text-sm text-muted-foreground">Como você confirma que é você ao entrar no CRM.</p>
      </header>

      <SegundoFatorCard
        metodo={metodo}
        email={user?.email ? mascararDestino("email", user.email) : null}
        whatsapp={whatsapp ? mascararDestino("whatsapp", whatsapp) : null}
        canais={canais}
      />

      <SecurityClient mfaEnrolled={temApp} />
    </div>
  );
}
