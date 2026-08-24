import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api";

/** Disconnect must be POST only — never GET. Next.js Link prefetches GET routes. */
export async function POST() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { error } = await auth.supabase
    .from("gmail_connections")
    .delete()
    .eq("user_id", auth.user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
