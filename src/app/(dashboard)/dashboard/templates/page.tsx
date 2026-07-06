import { TemplatesManager } from "@/components/templates/templates-manager";
import { getCurrentUser } from "@/lib/supabase/server";
import type { EmailTemplate } from "@/lib/types";

export default async function TemplatesPage() {
  const { supabase, user } = await getCurrentUser();

  if (!supabase || !user) {
    return null;
  }

  const { data } = await supabase
    .from("templates")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  return <TemplatesManager initialTemplates={(data ?? []) as EmailTemplate[]} />;
}
