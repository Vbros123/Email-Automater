import { ContactsManager } from "@/components/contacts/contacts-manager";
import { getCurrentUser } from "@/lib/supabase/server";
import type { Contact } from "@/lib/types";

export default async function ContactsPage() {
  const { supabase, user } = await getCurrentUser();

  if (!supabase || !user) {
    return null;
  }

  const { data } = await supabase
    .from("contacts")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return <ContactsManager initialContacts={(data ?? []) as Contact[]} />;
}
