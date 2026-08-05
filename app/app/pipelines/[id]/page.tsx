import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { IS_DEMO_MODE } from "@/lib/demo-mode";
import { MOCK_DEV_PIPELINES } from "@/lib/mock-dev-data";
import { PipelinePageClient } from "./_client";

export const dynamic = "force-dynamic";

export default async function PipelinePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Na demo o funil vem do mock: a consulta iria ao host falso, voltaria vazia
  // e o `notFound()` abaixo transformaria "sem banco" em "este funil não
  // existe" — a tela abria em branco depois de o usuário clicar no card que a
  // própria demo acabou de mostrar.
  if (IS_DEMO_MODE) {
    const doMock = MOCK_DEV_PIPELINES.find((p) => p.id === id);
    if (!doMock) notFound();
    return <PipelinePageClient pipelineId={id} initialName={doMock.name} />;
  }

  const supabase = await createClient();
  const { data: pipeline } = await supabase
    .from("crm_pipelines")
    .select("id, name, vocabulary")
    .eq("id", id)
    .maybeSingle();
  if (!pipeline) notFound();
  return <PipelinePageClient pipelineId={id} initialName={pipeline.name} />;
}
