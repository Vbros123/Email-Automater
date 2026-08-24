import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api";

export async function POST() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  await auth.supabase.from("gmail_connections").delete().eq("user_id", auth.user.id);

  return NextResponse.json({ ok: true });
}

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  await auth.supabase.from("gmail_connections").delete().eq("user_id", auth.user.id);

  const { env } = await import("@/lib/env");
  return NextResponse.redirect(
    `${env.NEXT_PUBLIC_APP_URL}/dashboard/settings?gmail=disconnected`,
  );
}
