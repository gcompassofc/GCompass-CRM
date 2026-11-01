/**
 * Convite de membro, regra da OPA (01/11/2026): o gerente convida, mas só corretores.
 * A tela esconde as outras opções; este teste prova que o SERVIDOR recusa quando o corpo
 * da requisição pede outro papel.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { ROLE_RANK, type Role } from "@/lib/auth/types";
import { sendEmail } from "@/lib/email/resend";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_APP_URL: "https://crm.exemplo.test" } }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined), isServiceRoleConfigured: () => false }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/auth/invite-token", () => ({ signInviteToken: () => "token-de-teste", INVITE_TTL_SECONDS: 86_400 }));
vi.mock("@/lib/email/templates/invite", () => ({ buildInviteEmail: () => ({ subject: "s", html: "h", text: "t" }) }));
vi.mock("@/lib/email/resend", () => ({ sendEmail: vi.fn(async () => ({ ok: true })) }));

import { POST } from "./route";

const ORG = "22222222-2222-4222-8222-222222222222";
const USER = "11111111-1111-4111-8111-111111111111";

/** requireRole de verdade na parte que importa: o papel de quem chama contra o piso da rota. */
function comoPapel(papel: Role) {
  vi.mocked(requireRole).mockImplementation((async (min: Role) =>
    ROLE_RANK[papel] >= ROLE_RANK[min]
      ? { ok: true, user: { id: USER, email: "quem@convida.test", full_name: "Quem Convida" }, org: { orgId: ORG, name: "OPA", role: papel } }
      : { ok: false, response: fail("forbidden_role", "negado", 403) }) as never);
}

function pedir(papelConvidado: string, email = "novo@opa.test") {
  return POST(
    new NextRequest("http://localhost/api/v1/team/invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ invitations: [{ email, role: papelConvidado }] }),
    }),
  );
}

beforeEach(() => {
  vi.mocked(sendEmail).mockClear();
});

describe("POST /api/v1/team/invite", () => {
  it("gerente convida corretor", async () => {
    comoPapel("manager");
    const res = await pedir("agent");
    expect(res.status).toBe(201);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it.each(["manager", "admin", "viewer"])("gerente pedindo o papel %s leva 403 e nenhum e-mail sai", async (papel) => {
    comoPapel("manager");
    const res = await pedir(papel);
    expect(res.status).toBe(403);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("administrador convida qualquer papel humano", async () => {
    comoPapel("admin");
    for (const papel of ["agent", "viewer", "manager", "admin"]) {
      expect((await pedir(papel, `${papel}@opa.test`)).status).toBe(201);
    }
  });

  it("corretor não convida ninguém", async () => {
    comoPapel("agent");
    const res = await pedir("agent");
    expect(res.status).toBe(403);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/team/invite, link de aceite (0121, A7)", () => {
  const enviados = async (res: Response) =>
    ((await res.json()) as { data: { sent: Array<{ accept_url?: string }> } }).data.sent;

  it.each([true, false])("gerente não recebe o link, com e-mail enviado = %s", async (saiu) => {
    vi.mocked(sendEmail).mockResolvedValueOnce({ ok: saiu } as never);
    comoPapel("manager");
    const sent = await enviados(await pedir("agent"));
    expect(sent).toHaveLength(1);
    expect(sent[0]).not.toHaveProperty("accept_url");
  });

  it("administrador recebe o link", async () => {
    vi.mocked(sendEmail).mockResolvedValueOnce({ ok: false } as never);
    comoPapel("admin");
    const sent = await enviados(await pedir("agent"));
    expect(sent[0]?.accept_url).toBe("https://crm.exemplo.test/team/accept-invite/token-de-teste");
  });
});
