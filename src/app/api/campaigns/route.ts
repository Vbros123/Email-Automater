import { NextRequest, NextResponse } from "next/server";
import { requireUser, parseJsonError } from "@/lib/api";
import { MAX_CAMPAIGN_RECIPIENTS } from "@/lib/campaigns";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { campaignCreateSchema } from "@/lib/validators";

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase
    .from("campaigns")
    .select("*, templates(name)")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Could not load campaigns." }, { status: 500 });
  }

  return NextResponse.json({ campaigns: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const limit = checkRateLimit(`campaign:create:${auth.user.id}`, {
    limit: 20,
    windowMs: 60_000,
  });

  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many campaign requests. Please slow down." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter ?? 60) } },
    );
  }

  const body = await request.json().catch(() => null);
  if (!body) return parseJsonError();

  const parsed = campaignCreateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: `Campaigns can include up to ${MAX_CAMPAIGN_RECIPIENTS} contacts.` },
      { status: 400 },
    );
  }

  const { count: contactCount, error: contactError } = await auth.supabase
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", auth.user.id)
    .in("id", parsed.data.selectedContactIds);

  if (contactError || contactCount !== parsed.data.selectedContactIds.length) {
    return NextResponse.json(
      { error: "One or more selected contacts could not be found." },
      { status: 400 },
    );
  }

  const { data: template } = await auth.supabase
    .from("templates")
    .select("id")
    .eq("id", parsed.data.templateId)
    .eq("user_id", auth.user.id)
    .single();

  if (!template) {
    return NextResponse.json({ error: "Template not found." }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from("campaigns")
    .insert({
      user_id: auth.user.id,
      name: parsed.data.name,
      template_id: parsed.data.templateId,
      selected_contact_ids: parsed.data.selectedContactIds,
      unsubscribe_footer: parsed.data.unsubscribeFooter || null,
      status: "draft",
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: "Could not create campaign." }, { status: 500 });
  }

  return NextResponse.json({ campaign: data }, { status: 201 });
}
