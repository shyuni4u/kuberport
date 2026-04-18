import Link from "next/link";
import { ClusterPicker } from "./ClusterPicker";
import { apiFetch } from "@/lib/api-server";

export async function TopBar() {
  const me = await apiFetch("/v1/me")
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);

  return (
    <header className="flex items-center gap-6 bg-slate-900 text-slate-100 px-6 py-3 text-sm">
      <Link href="/" className="font-bold">
        kuberport
      </Link>
      <ClusterPicker />
      <nav className="flex gap-4 ml-auto">
        <Link href="/catalog">카탈로그</Link>
        <Link href="/releases">내 릴리스</Link>
        <Link href="/templates">템플릿</Link>
      </nav>
      <span className="ml-2 opacity-80">{me?.email ?? "…"}</span>
      <form action="/api/auth/logout" method="POST">
        <button className="opacity-60 hover:opacity-100">로그아웃</button>
      </form>
    </header>
  );
}
