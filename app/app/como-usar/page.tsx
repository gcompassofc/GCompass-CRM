import { redirect } from "next/navigation";

/** Endereço antigo (01/11/2026): a tela virou Tutoriais. Mantém o link direto (`?passo=`). */
export default async function ComoUsarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) if (typeof v === "string") params.set(k, v);
  const qs = params.toString();
  redirect(qs ? `/app/tutoriais?${qs}` : "/app/tutoriais");
}
