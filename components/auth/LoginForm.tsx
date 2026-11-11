"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useTransition, useState } from "react";
import { useRouter } from "next/navigation";

import { loginSchema, type LoginInput } from "@/lib/auth/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CampoSenha } from "@/components/auth/CampoSenha";
import { CampoCaptcha } from "@/components/auth/CampoCaptcha";
import { CircleNotch } from "@/lib/ui/icons";
import { signInWithPassword } from "@/app/actions/auth/signInWithPassword";

export function LoginForm({ next, captchaSiteKey }: { next?: string; captchaSiteKey?: string | null }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [codigoCaptcha, setCodigoCaptcha] = useState<string | null>(null);
  // O código da verificação vale uma vez só: trocar a rodada redesenha o campo e pede outro.
  const [rodadaCaptcha, setRodadaCaptcha] = useState(0);
  const novoCaptcha = () => {
    setCodigoCaptcha(null);
    setRodadaCaptcha((n) => n + 1);
  };

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "", lembrar: true },
  });

  // Já entrou neste aparelho e chegou aqui por um link de fora (WhatsApp,
  // e-mail): o navegador não manda o cookie SameSite=Strict nessa navegação e o
  // proxy mandou para o login. Daqui, um pedido do próprio site leva o cookie:
  // se a sessão responde, segue direto, sem pedir senha de novo.
  useEffect(() => {
    let vivo = true;
    const destino = next && next.startsWith("/") && !next.startsWith("//") ? next : "/app";
    fetch(destino, { method: "HEAD", redirect: "manual", credentials: "same-origin" })
      .then((r) => {
        if (vivo && r.ok && r.type !== "opaqueredirect") router.replace(destino);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [next, router]);

  const onSubmit = (values: LoginInput) => {
    setServerError(null);
    startTransition(async () => {
      // Server Action redirects on success — no return value reaches here.
      // On failure, an error discriminator is returned and rendered inline.
      const res = await signInWithPassword(values, next, codigoCaptcha ?? undefined);
      if (!res) {
        // Should be unreachable (redirect throws), but guard anyway.
        router.replace(next || "/app");
        return;
      }
      novoCaptcha();
      if (res.error === "mfa_required") {
        const params = new URLSearchParams();
        if (next) params.set("next", next);
        if (res.challengeId) params.set("factor", res.challengeId);
        router.replace(`/login/mfa${params.toString() ? `?${params}` : ""}`);
        return;
      }
      if (res.error === "codigo_required") {
        router.replace(`/login/codigo${next ? `?next=${encodeURIComponent(next)}` : ""}`);
        return;
      }
      if (res.error === "invalid_credentials") {
        setServerError("E-mail ou senha incorretos. Confira e tente de novo.");
      } else if (res.error === "rate_limited") {
        setServerError("Muitas tentativas. Aguarde alguns minutos.");
      } else if (res.error === "validation_error") {
        setServerError("Dados inválidos. Confira os campos.");
      } else if (res.error === "captcha_failed") {
        setServerError("A verificação de segurança não passou. Espere um instante e tente de novo.");
      } else {
        setServerError("Erro inesperado. Tente novamente.");
      }
    });
  };

  return (
    <form method="post" onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="email">E-mail</Label>
        {/* `username` (e não `email`) é o que o gerenciador de senhas do navegador
            associa ao login salvo; com `email` ele chegou a preencher o nome. */}
        <Input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="seu@email.com"
          autoFocus
          aria-invalid={errors.email ? true : undefined}
          {...register("email")}
        />
        {errors.email && (
          <p className="text-xs text-destructive">{errors.email.message}</p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Senha</Label>
        <CampoSenha
          id="password"
          autoComplete="current-password"
          aria-invalid={errors.password ? true : undefined}
          {...register("password")}
        />
        {errors.password && (
          <p className="text-xs text-destructive">{errors.password.message}</p>
        )}
      </div>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
        <input
          type="checkbox"
          className="size-5 shrink-0 cursor-pointer rounded border-input accent-[#2a7ca8]"
          {...register("lembrar")}
        />
        <span>Lembrar de mim por 30 dias</span>
      </label>
      {captchaSiteKey && <CampoCaptcha key={rodadaCaptcha} siteKey={captchaSiteKey} onCodigo={setCodigoCaptcha} />}
      {serverError && (
        <div
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {serverError}
        </div>
      )}
      <Button type="submit" className="w-full" disabled={isPending || (Boolean(captchaSiteKey) && !codigoCaptcha)}>
        {isPending ? (
          <span className="inline-flex items-center gap-2">
            <CircleNotch size={18} className="animate-spin" aria-hidden />
            Entrando
          </span>
        ) : (
          "Entrar"
        )}
      </Button>
    </form>
  );
}
