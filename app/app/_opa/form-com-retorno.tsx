"use client";

import { useFormStatus } from "react-dom";
import { toast } from "sonner";

import { CircleNotch } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

/**
 * Retorno para as ações dos formulários da OPA (ponto U3 da revisão de 31/10):
 * enquanto grava o botão mostra "enviando" e fica travado (sem clique duplo), e ao
 * terminar sai um aviso de sucesso ou de erro. As ações são as mesmas de antes
 * (Server Actions); aqui só se embrulha a chamada.
 *
 * Aceita as duas formas de resposta que as ações têm hoje: nada (deu certo, ou lançou
 * erro) ou `{ ok: false, erro }`.
 */

type Resultado = void | { ok: true; aviso?: string } | { ok: false; erro: string } | undefined;
export type Acao = (formData: FormData) => Promise<Resultado>;

const SEM_RESPOSTA = "Não deu para salvar. Tente de novo.";

async function executar(acao: Acao, formData: FormData, sucesso: string | undefined, falha?: string): Promise<boolean> {
  try {
    const r = await acao(formData);
    if (r && typeof r === "object" && "ok" in r && r.ok === false) {
      toast.error(r.erro || falha || SEM_RESPOSTA);
      return false;
    }
    if (r && typeof r === "object" && "aviso" in r && r.aviso) toast.message(r.aviso);
    else if (sucesso) toast.success(sucesso);
    return true;
  } catch {
    toast.error(falha ?? SEM_RESPOSTA);
    return false;
  }
}

export function FormComRetorno({
  action,
  sucesso,
  falha,
  className,
  children,
}: {
  action: Acao;
  /** Aviso de sucesso. Sem ele, só o erro aparece. */
  sucesso?: string;
  falha?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <form
      action={async (fd) => {
        // Devolver a promessa mantém o formulário "enviando" até a ação terminar.
        await executar(action, fd, sucesso, falha);
      }}
      className={className}
    >
      {children}
    </form>
  );
}

/**
 * Botão de envio com estado. Dentro de um `FormComRetorno` ele lê o estado do próprio
 * formulário. Com `acao`, ele mesmo é a ação (para o segundo botão do formulário, o
 * "descartar", que antes ia direto para `formAction` sem aviso nenhum).
 */
export function BotaoEnvio({
  children,
  enviando,
  acao,
  sucesso,
  falha,
  className,
  tamanhoIcone = "size-4",
  ...props
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type" | "formAction"> & {
  /** Texto enquanto grava. Em botão só de ícone, deixe vazio e o ícone vira o giro. */
  enviando?: string;
  acao?: Acao;
  sucesso?: string;
  falha?: string;
  tamanhoIcone?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      {...props}
      {...(acao
        ? {
            formAction: async (fd: FormData) => {
              await executar(acao, fd, sucesso, falha);
            },
          }
        : {})}
      disabled={pending || props.disabled}
      aria-busy={pending}
      className={cn(pending && "opacity-70", className)}
    >
      {pending ? (
        <>
          <CircleNotch className={cn(tamanhoIcone, "animate-spin")} aria-hidden />
          {enviando}
        </>
      ) : (
        children
      )}
    </button>
  );
}
