import Link from "next/link";
import { CheckCircle2Icon, MailCheckIcon, PlugZapIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hasEncryptionEnv, hasGoogleEnv } from "@/lib/env";
import { GMAIL_SCOPES } from "@/lib/gmail/client";
import { getCurrentUser } from "@/lib/supabase/server";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ gmail?: string }>;
}) {
  const { supabase, user } = await getCurrentUser();
  const params = await searchParams;

  if (!supabase || !user) {
    return null;
  }

  const { data: connection } = await supabase
    .from("gmail_connections")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const googleReady = hasGoogleEnv();
  const encryptionReady = hasEncryptionEnv();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">Settings</h1>
        <p className="text-muted-foreground">
          Connect Gmail with least-privilege compose access and encrypted token
          storage.
        </p>
      </div>

      {params.gmail === "connected" && (
        <Alert>
          <CheckCircle2Icon />
          <AlertTitle>Gmail connected</AlertTitle>
          <AlertDescription>
            EmailFlow AI can now create Gmail drafts for reviewed campaigns.
          </AlertDescription>
        </Alert>
      )}

      {params.gmail === "failed" && (
        <Alert>
          <PlugZapIcon />
          <AlertTitle>Gmail connection failed</AlertTitle>
          <AlertDescription>
            The OAuth callback could not be completed. Check Google OAuth
            credentials and redirect URI.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Gmail connection</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-4">
              <div>
                <div className="font-medium">
                  {connection?.google_email ?? "No Gmail account connected"}
                </div>
                <div className="text-sm text-muted-foreground">
                  {connection
                    ? `Connected ${new Date(connection.connected_at).toLocaleDateString()}`
                    : "Connect Gmail before creating drafts."}
                </div>
              </div>
              <Badge variant={connection ? "default" : "secondary"}>
                {connection ? "Connected" : "Not connected"}
              </Badge>
            </div>
            <Link
              href="/api/gmail/connect"
              className={buttonVariants({ variant: "outline" })}
            >
              <MailCheckIcon data-icon="inline-start" />
              Connect Gmail
            </Link>
          </CardContent>
        </Card>

        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Security posture</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <StatusRow label="Google OAuth configured" enabled={googleReady} />
            <StatusRow label="Token encryption key configured" enabled={encryptionReady} />
            <StatusRow label="Default behavior creates drafts" enabled />
            <StatusRow label="Sending requires permission confirmation" enabled />
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="font-medium">Gmail scope</div>
              <code className="mt-2 block break-all text-xs text-muted-foreground">
                {GMAIL_SCOPES.join(", ")}
              </code>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatusRow({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg border p-3">
      <span>{label}</span>
      <Badge variant={enabled ? "default" : "secondary"}>
        {enabled ? "Ready" : "Missing"}
      </Badge>
    </div>
  );
}
