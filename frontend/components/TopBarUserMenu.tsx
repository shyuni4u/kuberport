"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RoleBadge } from "./RoleBadge";
import type { Role } from "@/lib/role";

type Props = { email: string; role: Role };

export function TopBarUserMenu({ email, role }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-accent" />
        }
      >
        <RoleBadge role={role} />
        <span className="opacity-80 text-sm">{email}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled>
          <RoleBadge role={role} withLabel />
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          render={
            <form action="/api/auth/logout" method="POST">
              <button type="submit" className="w-full text-left">
                로그아웃
              </button>
            </form>
          }
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
