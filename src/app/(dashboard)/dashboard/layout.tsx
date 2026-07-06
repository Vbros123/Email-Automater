import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { SetupRequired } from "@/components/app/setup-required";
import { getCurrentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { supabase, user } = await getCurrentUser();

  if (!supabase) {
    return <SetupRequired />;
  }

  if (!user) {
    redirect("/login");
  }

  return <AppShell userEmail={user.email}>{children}</AppShell>;
}
