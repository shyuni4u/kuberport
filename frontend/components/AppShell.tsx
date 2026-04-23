import { apiFetch } from "@/lib/api-server";
import { roleFromGroups } from "@/lib/role";
import { LocaleSwitch } from "./LocaleSwitch";
import { Sidebar } from "./Sidebar";
import { TopBarUserMenu } from "./TopBarUserMenu";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const me = await apiFetch("/v1/me")
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);

  const role = roleFromGroups(me?.groups ?? null);
  const email = me?.email ?? "…";

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar role={role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-6">
          <div className="flex-1" />
          <LocaleSwitch />
          <TopBarUserMenu email={email} role={role} />
        </header>
        <main className="flex-1 overflow-auto">
          <div className="mx-auto w-full max-w-7xl p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
