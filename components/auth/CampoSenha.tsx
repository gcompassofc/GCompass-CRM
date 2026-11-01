"use client";

import { forwardRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { Eye, EyeSlash } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

/**
 * Campo de senha com o botão de mostrar e ocultar. Quem digita no celular erra
 * a senha com facilidade; ver o que digitou evita o "senha incorreta" à toa.
 * Recebe tudo o que o `register()` do react-hook-form passa.
 */
export const CampoSenha = forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  function CampoSenha({ className, ...props }, ref) {
    const [visivel, setVisivel] = useState(false);
    return (
      <div className="relative">
        <Input ref={ref} {...props} type={visivel ? "text" : "password"} className={cn("pr-12", className)} />
        <button
          type="button"
          onClick={() => setVisivel((v) => !v)}
          aria-label={visivel ? "Ocultar senha" : "Mostrar senha"}
          aria-pressed={visivel}
          className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-[14px] text-text-muted transition-colors hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
        >
          {visivel ? <EyeSlash size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
        </button>
      </div>
    );
  },
);
