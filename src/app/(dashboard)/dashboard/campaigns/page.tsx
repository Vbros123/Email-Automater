import { CampaignBuilder } from "@/components/campaigns/campaign-builder";
import { getCurrentUser } from "@/lib/supabase/server";
import type { Campaign, Contact, EmailTemplate } from "@/lib/types";

export default async function CampaignsPage() {
  const { supabase, user } = await getCurrentUser();

  if (!supabase || !user) {
    return null;
  }

  const [{ data: contacts }, { data: templates }, { data: campaigns }] =
    await Promise.all([
      supabase
        .from("contacts")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("templates")
        .select("*")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false }),
      supabase
        .from("campaigns")
        .select("*, templates(name)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
    ]);

  return (
    <CampaignBuilder
      contacts={(contacts ?? []) as Contact[]}
      templates={(templates ?? []) as EmailTemplate[]}
      campaigns={(campaigns ?? []) as Campaign[]}
    />
  );
}
