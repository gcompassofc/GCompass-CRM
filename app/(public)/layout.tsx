import { LayoutAcessoOpa } from "@/components/auth/AcessoOpa";
import { marcaOpa } from "@/lib/branding";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  if (marcaOpa()) return <LayoutAcessoOpa>{children}</LayoutAcessoOpa>;
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
