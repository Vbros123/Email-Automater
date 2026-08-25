"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, MailCheckIcon, UnplugIcon } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function GmailConnectionActions({ connected }: { connected: boolean }) {
  const router = useRouter();
  const [disconnecting, setDisconnecting] = useState(false);

  async function disconnect() {
    setDisconnecting(true);
    try {
      const response = await fetch("/api/gmail/disconnect", { method: "POST" });
      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(json.error ?? "Could not disconnect Gmail.");
      }

      toast.success("Gmail disconnected.");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not disconnect Gmail.",
      );
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <a
        href="/api/gmail/connect"
        className={cn(buttonVariants({ variant: "outline" }))}
      >
        <MailCheckIcon data-icon="inline-start" />
        {connected ? "Reconnect Gmail" : "Connect Gmail"}
      </a>

      {connected ? (
        <Button
          variant="secondary"
          onClick={disconnect}
          disabled={disconnecting}
          type="button"
        >
          {disconnecting ? (
            <Loader2Icon data-icon="inline-start" className="animate-spin" />
          ) : (
            <UnplugIcon data-icon="inline-start" />
          )}
          Disconnect
        </Button>
      ) : null}
    </div>
  );
}
