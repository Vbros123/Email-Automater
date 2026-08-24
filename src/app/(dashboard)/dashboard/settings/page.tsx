import {
  CheckCircle2Icon,
  PlugZapIcon,
  UnplugIcon,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GmailConnectionActions } from "@/components/settings/gmail-connection-actions";
import { hasEncryptionEnv, hasGoogleEnv } from "@/lib/env";
import { GMAIL_SCOPES } from "@/lib/gmail/client";
import { getCurrentUser } from "@/lib/supabase/server";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ gmail?: string; detail?: string }>;
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
            Tokens saved{connection?.google_email ? ` for ${connection.google_email}` : ""}.
            You can create drafts from Campaigns.
          </AlertDescription>
        </Alert>
      )}

      {params.gmail === "disconnected" && (
        <Alert>
          <UnplugIcon />
          <AlertTitle>Gmail disconnected</AlertTitle>
          <AlertDescription>
            Tokens cleared. Click Connect Gmail to authorize again.
          </AlertDescription>
        </Alert>
      )}

      {params.gmail === "failed" && (
        <Alert>
          <PlugZapIcon />
          <AlertTitle>Gmail connection failed</AlertTitle>
          <AlertDescription>
            {params.detail
              ? `Details: ${params.detail}`
              : "Check GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, ENCRYPTION_KEY, and that Gmail API is enabled."}
          </AlertDescription>
        </Alert>
      )}

      {params.gmail === "invalid_state" && (
        <Alert>
          <PlugZapIcon />
          <AlertTitle>OAuth state mismatch</AlertTitle>
          <AlertDescription>
            The connect session expired or cookies were blocked. Try Connect
            Gmail again from this same browser tab.
          </AlertDescription>
        </Alert>
      )}

      {params.gmail === "no_refresh_token" && (
        <Alert>
          <PlugZapIcon />
          <AlertTitle>Google did not return a refresh token</AlertTitle>
          <AlertDescription>
            Open{" "}
            <a
              className="underline"
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noreferrer"
            >
              Google Account → Third-party access
            </a>
            , remove this app, then Connect Gmail again and accept all
            permissions.
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

            <GmailConnectionActions connected={Boolean(connection)} />

            <p className="text-xs text-muted-foreground">
              If drafts fail with invalid_grant: Disconnect here, remove the app
              at myaccount.google.com/permissions, then Connect again. Google
              Cloud apps in Testing mode expire refresh tokens after 7 days.
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Security posture</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <StatusRow label="Google OAuth configured" enabled={googleReady} />
            <StatusRow
              label="Token encryption key configured"
              enabled={encryptionReady}
            />
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
