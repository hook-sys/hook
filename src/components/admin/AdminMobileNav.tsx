"use client";

import { useRouter, usePathname } from "next/navigation";
import type { AdminNavGroup } from "@/lib/data/admin-nav";
import { Select } from "@/components/ui/select";

export function AdminMobileNav({ nav }: { nav: AdminNavGroup[] }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div className="border-b border-slate-200 bg-white px-4 py-3 md:hidden">
      <Select
        aria-label="Navigate"
        value={pathname}
        onChange={(e) => router.push(e.target.value)}
      >
        {nav.map((group, i) => (
          <optgroup key={group.title ?? `group-${i}`} label={group.title ?? "Main"}>
            {group.items.map((item) => (
              <option key={item.href} value={item.href}>
                {item.label}
                {item.comingSoon ? " (Coming Soon)" : ""}
              </option>
            ))}
          </optgroup>
        ))}
      </Select>
    </div>
  );
}
