import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, parseJsonError } from "@/lib/api";
import { detectTemplateVariables } from "@/lib/personalization";
import { templateSchema } from "@/lib/validators";

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase
    .from("templates")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Could not load templates." }, { status: 500 });
  }

  return NextResponse.json({ templates: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  if (!body) return parseJsonError();

  const parsed = templateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid template payload." }, { status: 400 });
  }

  const variables = detectTemplateVariables(parsed.data.subject, parsed.data.body);

  const { data, error } = await auth.supabase
    .from("templates")
    .insert({
      user_id: auth.user.id,
      name: parsed.data.name,
      subject: parsed.data.subject,
      body: parsed.data.body,
      variables,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: "Could not save template." }, { status: 500 });
  }

  return NextResponse.json({ template: data }, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  if (!body) return parseJsonError();

  const parsed = templateSchema.extend({ id: z.string().uuid() }).safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid template payload." }, { status: 400 });
  }

  const template = parsed.data;
  const variables = detectTemplateVariables(template.subject, template.body);

  const { data, error } = await auth.supabase
    .from("templates")
    .update({
      name: template.name,
      subject: template.subject,
      body: template.body,
      variables,
    })
    .eq("id", template.id)
    .eq("user_id", auth.user.id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: "Could not update template." }, { status: 500 });
  }

  return NextResponse.json({ template: data });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const id = request.nextUrl.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Template id is required." }, { status: 400 });
  }

  const { error } = await auth.supabase
    .from("templates")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.user.id);

  if (error) {
    return NextResponse.json({ error: "Could not delete template." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
