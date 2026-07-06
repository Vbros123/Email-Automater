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

  const parsed = templateSchema.safeParse(normalizeTemplatePayload(body));

  if (!parsed.success) {
    return NextResponse.json(
      { error: formatTemplateError(parsed.error) },
      { status: 400 },
    );
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
    return NextResponse.json({ error: formatDatabaseError(error) }, { status: 500 });
  }

  return NextResponse.json({ template: data }, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  if (!body) return parseJsonError();

  const parsed = templateSchema
    .extend({ id: z.string().uuid() })
    .safeParse(normalizeTemplatePayload(body));

  if (!parsed.success) {
    return NextResponse.json(
      { error: formatTemplateError(parsed.error) },
      { status: 400 },
    );
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
    return NextResponse.json({ error: formatDatabaseError(error) }, { status: 500 });
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

function normalizeTemplatePayload(body: unknown) {
  if (!body || typeof body !== "object") {
    return body;
  }

  const payload = body as Record<string, unknown>;
  const subject = typeof payload.subject === "string" ? payload.subject.trim() : "";
  const name = typeof payload.name === "string" ? payload.name.trim() : "";

  return {
    ...payload,
    name: name || fallbackTemplateName(subject),
    subject,
    body: typeof payload.body === "string" ? payload.body.trim() : payload.body,
  };
}

function fallbackTemplateName(subject: string) {
  return subject.slice(0, 80).trim() || "Untitled template";
}

function formatTemplateError(error: z.ZodError) {
  const issue = error.issues[0];

  if (!issue) {
    return "Invalid template payload.";
  }

  const field = issue.path.join(".") || "template";
  return `${field}: ${issue.message}`;
}

function formatDatabaseError(error: {
  code?: string;
  message?: string;
  hint?: string;
}) {
  if (error.code === "42P01") {
    return "The Supabase templates table is missing. Run the SQL migration in Supabase, then try again.";
  }

  if (error.code === "42501") {
    return "Supabase blocked this insert with Row Level Security. Check that the migration policies were applied.";
  }

  if (error.code === "PGRST204") {
    return "The Supabase templates table is missing a required column. Re-run the latest SQL migration.";
  }

  return error.message
    ? `Supabase could not save the template: ${error.message}`
    : "Supabase could not save the template. Check the database migration and RLS policies.";
}
