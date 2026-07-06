"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FileTextIcon,
  LayoutDashboardIcon,
  MailCheckIcon,
  MegaphoneIcon,
  SettingsIcon,
  ShieldCheckIcon,
  UsersIcon,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { LogoutButton } from "@/components/app/logout-button";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboardIcon },
  { href: "/dashboard/contacts", label: "Contacts", icon: UsersIcon },
  { href: "/dashboard/templates", label: "Templates", icon: FileTextIcon },
  { href: "/dashboard/campaigns", label: "Campaigns", icon: MegaphoneIcon },
  { href: "/dashboard/settings", label: "Settings", icon: SettingsIcon },
];

export function AppShell({
  children,
  userEmail,
}: {
  children: React.ReactNode;
  userEmail?: string | null;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
            <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <MailCheckIcon />
            </span>
            EmailFlow AI
          </Link>
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="hidden sm:inline-flex">
              {userEmail ?? "Signed in"}
            </Badge>
            <LogoutButton />
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[240px_1fr] lg:px-8">
        <aside className="lg:sticky lg:top-22 lg:h-fit">
          <nav className="flex gap-2 overflow-x-auto rounded-lg border bg-background p-2 lg:flex-col lg:overflow-visible">
            {navItems.map((item) => {
              const active =
                item.href === "/dashboard"
                  ? pathname === item.href
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    buttonVariants({ variant: active ? "secondary" : "ghost" }),
                    "justify-start",
                  )}
                >
                  <item.icon data-icon="inline-start" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>
        <main className="flex min-w-0 flex-col gap-6">
          <Alert className="border-primary/25 bg-accent">
            <ShieldCheckIcon />
            <AlertTitle>Permission-based sending only</AlertTitle>
            <AlertDescription>
              Do not import scraped or purchased lists. Drafts are created first,
              and sending requires confirmation that recipients may be contacted.
            </AlertDescription>
          </Alert>
          {children}
        </main>
      </div>
    </div>
  );
}
