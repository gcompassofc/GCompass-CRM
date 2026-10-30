import { redirect } from "next/navigation";

import { perfilAtivo } from "@/lib/navigation/registry";

export default function AppHome() {
  // Na imobiliária o dia começa pelo Hoje (quem espera resposta); no padrão, pelo Inbox.
  redirect(perfilAtivo() === "imobiliaria" ? "/app/hoje" : "/app/inbox");
}
