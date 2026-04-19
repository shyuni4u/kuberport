"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { key: "overview", label: "개요", suffix: "" },
  { key: "logs", label: "로그", suffix: "/logs" },
] as const;

export function ReleaseTabs({ releaseId }: { releaseId: string }) {
  const pathname = usePathname();
  const base = `/releases/${releaseId}`;
  return (
    <nav className="flex gap-4 border-b">
      {TABS.map((t) => {
        const href = base + t.suffix;
        const active = pathname === href;
        return (
          <Link
            key={t.key}
            href={href}
            className={`px-3 py-2 text-sm ${
              active
                ? "border-b-2 border-blue-700 text-blue-800"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
