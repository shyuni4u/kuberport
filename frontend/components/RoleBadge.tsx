import type { Role } from "@/lib/role";

type Props = { role: Role; withLabel?: boolean };

const palette: Record<Role, string> = {
  admin: "bg-purple-50 text-purple-800",
  user: "bg-teal-50 text-teal-800",
};

const shortLabel: Record<Role, string> = {
  admin: "Admin",
  user: "User",
};

const longLabel: Record<Role, string> = {
  admin: "Admin · 템플릿 작성",
  user: "User · 카탈로그 소비",
};

export function RoleBadge({ role, withLabel = false }: Props) {
  return (
    <span
      className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium ${palette[role]}`}
    >
      {withLabel ? longLabel[role] : shortLabel[role]}
    </span>
  );
}
