import Link from "next/link";
import { ClusterPicker } from "./ClusterPicker";
import { TopBarUserMenu } from "./TopBarUserMenu";
import { apiFetch } from "@/lib/api-server";
import { roleFromGroups, type Role } from "@/lib/role";

const NAV_BY_ROLE: Record<Role, Array<{ href: string; label: string }>> = {
  user: [
    { href: "/catalog", label: "카탈로그" },
    { href: "/releases", label: "내 릴리스" },
  ],
  admin: [
    { href: "/templates", label: "Templates" },
    { href: "/releases", label: "Releases" },
    { href: "/admin/teams", label: "Teams" },
  ],
};

export async function TopBar() {
  const me = await apiFetch("/v1/me")
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);

  const role = roleFromGroups(me?.groups ?? null);
  const email = me?.email ?? "…";
  const nav = NAV_BY_ROLE[role];

  return (
    <header className="flex items-center gap-6 bg-slate-900 text-slate-100 px-6 py-3 text-sm">
      <Link href="/" className="font-bold">
        kuberport
      </Link>
      <ClusterPicker />
      <nav className="flex gap-4 ml-auto">
        {nav.map((item) => (
          <Link key={item.href} href={item.href}>
            {item.label}
          </Link>
        ))}
      </nav>
      <TopBarUserMenu email={email} role={role} />
    </header>
  );
}
