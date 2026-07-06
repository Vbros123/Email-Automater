import { NextRequest, NextResponse } from "next/server";
import { requireUser, parseJsonError } from "@/lib/api";
import { contactsImportSchema, contactSchema, normalizeEmail } from "@/lib/validators";

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase
    .from("contacts")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Could not load contacts." }, { status: 500 });
  }

  return NextResponse.json({ contacts: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  if (!body) return parseJsonError();

  const importPayload = contactsImportSchema.safeParse(body);
  const singlePayload = contactSchema.safeParse(body);

  if (!importPayload.success && !singlePayload.success) {
    return NextResponse.json({ error: "Invalid contact payload." }, { status: 400 });
  }

  const contacts = importPayload.success
    ? importPayload.data.contacts
    : singlePayload.success
      ? [singlePayload.data]
      : [];

  const rows = contacts.map((contact) => ({
    user_id: auth.user.id,
    first_name: contact.firstName,
    last_name: contact.lastName,
    email: normalizeEmail(contact.email),
    company: contact.company || null,
    role: contact.role || null,
    notes: contact.notes || null,
    custom_fields: contact.customFields ?? {},
  }));

  const { data, error } = await auth.supabase
    .from("contacts")
    .upsert(rows, { onConflict: "user_id,email" })
    .select("*");

  if (error) {
    return NextResponse.json({ error: "Could not save contacts." }, { status: 500 });
  }

  return NextResponse.json({ contacts: data ?? [] }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const id = request.nextUrl.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Contact id is required." }, { status: 400 });
  }

  const { error } = await auth.supabase
    .from("contacts")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.user.id);

  if (error) {
    return NextResponse.json({ error: "Could not delete contact." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
