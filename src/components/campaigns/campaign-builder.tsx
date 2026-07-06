"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  Loader2Icon,
  MailCheckIcon,
  SendIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { MAX_CAMPAIGN_RECIPIENTS, toPersonalizationContact } from "@/lib/campaigns";
import { personalizeTemplate } from "@/lib/personalization";
import type { Campaign, Contact, EmailTemplate } from "@/lib/types";

type CampaignWithTemplate = Campaign & {
  templates?: { name: string } | null;
};

type ApiResult = {
  email: string;
  status: string;
  detail?: string;
};

export function CampaignBuilder({
  contacts,
  templates,
  campaigns,
}: {
  contacts: Contact[];
  templates: EmailTemplate[];
  campaigns: CampaignWithTemplate[];
}) {
  const [name, setName] = useState("New outreach campaign");
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [unsubscribeFooter, setUnsubscribeFooter] = useState(
    "You are receiving this note because we have a legitimate reason to contact you. Reply with unsubscribe to opt out.",
  );
  const [activeCampaignId, setActiveCampaignId] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isDrafting, setIsDrafting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [overrideUnresolved, setOverrideUnresolved] = useState(false);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [permissionConfirmed, setPermissionConfirmed] = useState(false);
  const [results, setResults] = useState<ApiResult[]>([]);

  const selectedTemplate = templates.find((template) => template.id === templateId);
  const selectedContacts = contacts.filter((contact) =>
    selectedContactIds.includes(contact.id),
  );
  const previews = useMemo(() => {
    if (!selectedTemplate) return [];

    return selectedContacts.map((contact) => ({
      contact,
      preview: personalizeTemplate(
        selectedTemplate,
        toPersonalizationContact(contact),
        { unsubscribeFooter },
      ),
    }));
  }, [selectedContacts, selectedTemplate, unsubscribeFooter]);
  const missingVariables = previews.flatMap((preview) =>
    preview.preview.missingVariables.map((variable) => ({
      email: preview.contact.email,
      variable,
    })),
  );

  function toggleContact(id: string, checked: boolean) {
    setSelectedContactIds((current) => {
      if (checked) {
        if (current.includes(id) || current.length >= MAX_CAMPAIGN_RECIPIENTS) {
          return current;
        }
        return [...current, id];
      }

      return current.filter((contactId) => contactId !== id);
    });
  }

  async function createCampaign() {
    setIsCreating(true);

    try {
      const response = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          templateId,
          selectedContactIds,
          unsubscribeFooter,
        }),
      });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error ?? "Could not create campaign.");
      }

      setActiveCampaignId(json.campaign.id);
      toast.success("Campaign saved. You can create Gmail drafts now.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create campaign.");
    } finally {
      setIsCreating(false);
    }
  }

  async function createDrafts() {
    const campaignId = activeCampaignId;

    if (!campaignId) {
      toast.error("Save the campaign before creating drafts.");
      return;
    }

    setIsDrafting(true);

    try {
      const response = await fetch(`/api/campaigns/${campaignId}/drafts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrideUnresolvedVariables: overrideUnresolved }),
      });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error ?? "Could not create Gmail drafts.");
      }

      setResults(json.results ?? []);
      toast.success(`Created ${json.draftsCreated} Gmail drafts.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create drafts.");
    } finally {
      setIsDrafting(false);
    }
  }

  async function sendEmails() {
    const campaignId = activeCampaignId;

    if (!campaignId || !permissionConfirmed) return;

    setIsSending(true);

    try {
      const response = await fetch(`/api/campaigns/${campaignId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmSend: true,
          permissionConfirmed: true,
        }),
      });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error ?? "Could not send emails.");
      }

      setResults(json.results ?? []);
      setSendDialogOpen(false);
      toast.success(`Sent ${json.sentCount} emails.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send emails.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">Campaigns</h1>
        <p className="text-muted-foreground">
          Build a controlled Gmail draft workflow. Sending is secondary and
          requires explicit confirmation.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.78fr_1.22fr]">
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Campaign setup</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="campaignName">Campaign name</FieldLabel>
                <Input
                  id="campaignName"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel>Template</FieldLabel>
                <Select
                  value={templateId}
                  onValueChange={(value) => setTemplateId(value ?? "")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose a template" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {templates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="unsubscribeFooter">
                  Optional unsubscribe/footer text
                </FieldLabel>
                <Textarea
                  id="unsubscribeFooter"
                  value={unsubscribeFooter}
                  onChange={(event) => setUnsubscribeFooter(event.target.value)}
                />
              </Field>
            </FieldGroup>

            <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4">
              <div className="flex items-center justify-between">
                <div className="font-medium">Contacts</div>
                <Badge variant="secondary">
                  {selectedContactIds.length}/{MAX_CAMPAIGN_RECIPIENTS}
                </Badge>
              </div>
              <div className="max-h-72 overflow-auto rounded-lg border bg-background">
                {contacts.length ? (
                  contacts.map((contact) => (
                    <label
                      key={contact.id}
                      className="flex cursor-pointer items-center gap-3 border-b p-3 text-sm last:border-b-0"
                    >
                      <Checkbox
                        checked={selectedContactIds.includes(contact.id)}
                        onCheckedChange={(checked) =>
                          toggleContact(contact.id, Boolean(checked))
                        }
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {contact.first_name} {contact.last_name}
                        </span>
                        <span className="block truncate text-muted-foreground">
                          {contact.email}
                        </span>
                      </span>
                    </label>
                  ))
                ) : (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    Add contacts before starting a campaign.
                  </div>
                )}
              </div>
            </div>

            <Field orientation="horizontal" className="items-start rounded-lg border p-3">
              <Checkbox
                checked={overrideUnresolved}
                onCheckedChange={(checked) => setOverrideUnresolved(Boolean(checked))}
              />
              <div className="flex flex-col gap-1">
                <FieldLabel>Allow unresolved variables for drafts</FieldLabel>
                <FieldDescription>
                  Keep this off unless you intentionally reviewed every missing
                  value.
                </FieldDescription>
              </div>
            </Field>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                onClick={createCampaign}
                disabled={
                  isCreating ||
                  !name.trim() ||
                  !templateId ||
                  selectedContactIds.length === 0
                }
              >
                {isCreating ? (
                  <Loader2Icon data-icon="inline-start" className="animate-spin" />
                ) : (
                  <CheckCircle2Icon data-icon="inline-start" />
                )}
                Save campaign
              </Button>
              <Button
                variant="outline"
                onClick={createDrafts}
                disabled={isDrafting || !activeCampaignId}
              >
                {isDrafting ? (
                  <Loader2Icon data-icon="inline-start" className="animate-spin" />
                ) : (
                  <MailCheckIcon data-icon="inline-start" />
                )}
                Create Gmail drafts
              </Button>
              <Button
                variant="secondary"
                onClick={() => setSendDialogOpen(true)}
                disabled={!activeCampaignId}
              >
                <SendIcon data-icon="inline-start" />
                Send emails
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          {missingVariables.length > 0 && !overrideUnresolved && (
            <Alert>
              <AlertTriangleIcon />
              <AlertTitle>Missing variables detected</AlertTitle>
              <AlertDescription>
                Draft creation will skip recipients with unresolved variables
                unless you explicitly override.
              </AlertDescription>
            </Alert>
          )}

          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>Personalized preview</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {previews.length ? (
                previews.slice(0, 5).map(({ contact, preview }) => (
                  <div key={contact.id} className="rounded-lg border bg-muted/30 p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-medium">
                          {contact.first_name} {contact.last_name}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {contact.email}
                        </div>
                      </div>
                      {preview.missingVariables.length ? (
                        <Badge variant="secondary">
                          Missing {preview.missingVariables.length}
                        </Badge>
                      ) : (
                        <Badge>Ready</Badge>
                      )}
                    </div>
                    <div className="flex flex-col gap-3 rounded-lg bg-background p-4 text-sm">
                      <p className="font-medium">{preview.subject}</p>
                      <pre className="whitespace-pre-wrap font-sans leading-6 text-muted-foreground">
                        {preview.body}
                      </pre>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
                  Select contacts and a template to preview personalized emails.
                </div>
              )}
            </CardContent>
          </Card>

          {results.length > 0 && (
            <Card className="rounded-lg">
              <CardHeader>
                <CardTitle>Draft/send results</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Recipient</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Detail</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map((result) => (
                      <TableRow key={`${result.email}-${result.status}`}>
                        <TableCell>{result.email}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              ["sent", "draft_created"].includes(result.status)
                                ? "default"
                                : "secondary"
                            }
                          >
                            {result.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{result.detail ?? "None"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle>Recent campaigns</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Recipients</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.length ? (
                campaigns.map((campaign) => (
                  <TableRow key={campaign.id}>
                    <TableCell>{campaign.name}</TableCell>
                    <TableCell>{campaign.templates?.name ?? "Unknown"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{campaign.status}</Badge>
                    </TableCell>
                    <TableCell>{campaign.selected_contact_ids.length}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center">
                    No campaigns yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm sending</DialogTitle>
            <DialogDescription>
              Sending uses existing Gmail drafts. This action is intentionally
              separate from draft creation.
            </DialogDescription>
          </DialogHeader>
          <Field orientation="horizontal" className="items-start rounded-lg border p-3">
            <Checkbox
              checked={permissionConfirmed}
              onCheckedChange={(checked) => setPermissionConfirmed(Boolean(checked))}
            />
            <div className="flex flex-col gap-1">
              <FieldLabel>
                I have permission or a legitimate reason to contact these
                recipients.
              </FieldLabel>
              <FieldDescription>
                EmailFlow AI does not support unsolicited bulk email, scraped
                lists, or purchased lists.
              </FieldDescription>
            </div>
          </Field>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={sendEmails}
              disabled={!permissionConfirmed || isSending}
            >
              {isSending ? (
                <Loader2Icon data-icon="inline-start" className="animate-spin" />
              ) : (
                <SendIcon data-icon="inline-start" />
              )}
              Confirm send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
