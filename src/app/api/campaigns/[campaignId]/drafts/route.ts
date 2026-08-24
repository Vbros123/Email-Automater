import { NextRequest, NextResponse } from "next/server";
import { requireUser, parseJsonError } from "@/lib/api";
import { MAX_CAMPAIGN_RECIPIENTS, toPersonalizationContact } from "@/lib/campaigns";
import {
  assertGmailAccess,
  createGmailAuth,
  createRawEmail,
  getGmailErrorMessage,
  isGmailAuthError,
  persistGmailTokens,
} from "@/lib/gmail/client";
import { personalizeTemplate } from "@/lib/personalization";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { draftCreateSchema } from "@/lib/validators";
import type { Contact, EmailTemplate } from "@/lib/types";

export const maxDuration = 60;

type Params = {
  params: Promise<{ campaignId: string }>;
};

type DraftResult = {
  email: string;
  status: string;
  detail?: string;
  contactId?: string;
  draftId?: string | null;
};

const GMAIL_CONCURRENCY = 5;

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function run() {
    while (nextIndex < items.length) {
      const current = nextIndex++;
      results[current] = await worker(items[current], current);
    }
  }

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, () => run());
  await Promise.all(runners);
  return results;
}

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const limit = checkRateLimit(`gmail:drafts:${auth.user.id}`, {
    limit: 10,
    windowMs: 60_000,
  });

  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Draft creation is rate limited. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter ?? 60) } },
    );
  }

  const body = await request.json().catch(() => null);
  if (!body) return parseJsonError();

  const parsed = draftCreateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid draft request." }, { status: 400 });
  }

  const { campaignId } = await params;
  const { data: campaign } = await auth.supabase
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .eq("user_id", auth.user.id)
    .single();

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  if (campaign.selected_contact_ids.length > MAX_CAMPAIGN_RECIPIENTS) {
    return NextResponse.json(
      { error: `Campaigns are capped at ${MAX_CAMPAIGN_RECIPIENTS} recipients.` },
      { status: 400 },
    );
  }

  const [{ data: template }, { data: contacts }, { data: connection }] =
    await Promise.all([
      auth.supabase
        .from("templates")
        .select("*")
        .eq("id", campaign.template_id)
        .eq("user_id", auth.user.id)
        .single(),
      auth.supabase
        .from("contacts")
        .select("*")
        .eq("user_id", auth.user.id)
        .in("id", campaign.selected_contact_ids),
      auth.supabase
        .from("gmail_connections")
        .select("*")
        .eq("user_id", auth.user.id)
        .single(),
    ]);

  if (!template || !contacts?.length) {
    return NextResponse.json(
      { error: "Campaign template or contacts are missing." },
      { status: 400 },
    );
  }

  if (!connection) {
    return NextResponse.json(
      { error: "Connect Gmail before creating drafts." },
      { status: 400 },
    );
  }

  if (!connection.refresh_token_encrypted && !connection.access_token_encrypted) {
    return NextResponse.json(
      { error: "Gmail connection is missing tokens. Reconnect Gmail in Settings." },
      { status: 400 },
    );
  }

  const typedTemplate = template as EmailTemplate;
  const typedContacts = contacts as Contact[];

  let gmailAuth;
  try {
    gmailAuth = createGmailAuth(connection);
    await assertGmailAccess(gmailAuth.gmail);
  } catch (error) {
    const detail = getGmailErrorMessage(error);
    return NextResponse.json(
      {
        error: detail,
        results: [],
        draftsCreated: 0,
        message: `Gmail auth failed: ${detail}`,
      },
      { status: 401 },
    );
  }

  const { gmail, auth: oauthClient } = gmailAuth;
  let stoppedForAuth = false;

  const draftResults = await mapPool(
    typedContacts,
    GMAIL_CONCURRENCY,
    async (contact): Promise<DraftResult> => {
      if (stoppedForAuth) {
        return {
          email: contact.email,
          contactId: contact.id,
          status: "failed",
          detail: "Skipped after Gmail auth failure.",
        };
      }

      const personalized = personalizeTemplate(
        typedTemplate,
        toPersonalizationContact(contact),
        {
          allowUnresolved: true,
          unsubscribeFooter: campaign.unsubscribe_footer ?? undefined,
        },
      );

      try {
        const draft = await gmail.users.drafts.create({
          userId: "me",
          requestBody: {
            message: {
              raw: createRawEmail({
                to: contact.email,
                subject: personalized.subject || "(no subject)",
                body: personalized.body || "",
              }),
            },
          },
        });

        return {
          email: contact.email,
          contactId: contact.id,
          status: "draft_created",
          detail: draft.data.id ?? undefined,
          draftId: draft.data.id ?? null,
        };
      } catch (error) {
        if (isGmailAuthError(error)) {
          stoppedForAuth = true;
        }

        return {
          email: contact.email,
          contactId: contact.id,
          status: "failed",
          detail: getGmailErrorMessage(error),
        };
      }
    },
  );

  const successes = draftResults.filter((result) => result.status === "draft_created");
  const failures = draftResults.filter((result) => result.status === "failed");

  // Batch DB writes instead of 2 queries per recipient.
  if (successes.length) {
    await auth.supabase.from("campaign_recipients").upsert(
      successes.map((result) => ({
        user_id: auth.user.id,
        campaign_id: campaign.id,
        contact_id: result.contactId!,
        email: result.email,
        status: "draft_created",
        gmail_draft_id: result.draftId,
        error_message: null,
      })),
      { onConflict: "campaign_id,contact_id" },
    );

    await auth.supabase.from("email_activity").insert(
      successes.map((result) => ({
        user_id: auth.user.id,
        campaign_id: campaign.id,
        recipient_email: result.email,
        action: "draft_created",
        status: "success",
        detail: result.draftId ?? null,
      })),
    );
  }

  if (failures.length) {
    await auth.supabase.from("email_activity").insert(
      failures.map((result) => ({
        user_id: auth.user.id,
        campaign_id: campaign.id,
        recipient_email: result.email,
        action: "failed",
        status: "failed",
        detail: result.detail ?? "Gmail draft creation failed.",
      })),
    );
  }

  try {
    await persistGmailTokens(auth.supabase, auth.user.id, oauthClient);
  } catch {
    // best-effort
  }

  const successfulDrafts = successes.length;
  const failedCount = failures.length;
  const firstFailure = failures[0]?.detail;

  await auth.supabase
    .from("campaigns")
    .update({ status: successfulDrafts ? "drafts_created" : "failed" })
    .eq("id", campaign.id)
    .eq("user_id", auth.user.id);

  const results = draftResults.map(({ email, status, detail }) => ({
    email,
    status,
    detail,
  }));

  return NextResponse.json({
    results,
    draftsCreated: successfulDrafts,
    failedCount,
    message:
      successfulDrafts > 0
        ? `Created ${successfulDrafts} Gmail drafts${failedCount ? ` (${failedCount} failed)` : ""}.`
        : firstFailure
          ? `No drafts created. ${firstFailure}`
          : "No drafts created.",
  });
}
