import Link from "next/link";
import { ClusterPicker } from "./ClusterPicker";
import { SidebarNavItem } from "./SidebarNavItem";
import type { Role } from "@/lib/role";

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

export function Sidebar({ role }: { role: Role }) {
  const nav = NAV_BY_ROLE[role];
  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 items-center border-b border-sidebar-border px-6">
        <Link href="/" className="text-lg font-bold">
          kuberport
        </Link>
      </div>
      <nav className="flex-1 space-y-1 p-4">
        {nav.map((item) => (
          <SidebarNavItem key={item.href} href={item.href} label={item.label} />
        ))}
      </nav>
      <div className="border-t border-sidebar-border p-4">
        <ClusterPicker />
      </div>
    </aside>
  );
}
