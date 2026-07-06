"use client";

import { useMemo, useState } from "react";
import {
  FileTextIcon,
  Loader2Icon,
  PlusIcon,
  SaveIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  detectTemplateVariables,
  personalizeTemplate,
} from "@/lib/personalization";
import type { EmailTemplate } from "@/lib/types";

type TemplateDraft = Pick<EmailTemplate, "id" | "name" | "subject" | "body">;

const sampleContact = {
  firstName: "Ava",
  lastName: "Chen",
  email: "ava@example.com",
  company: "Northstar Labs",
  role: "Head of Product",
  customFields: { plan: "Growth" },
};

const emptyDraft = {
  id: "",
  name: "",
  subject: "Quick question for {{company|your team}}",
  body: "Hi {{firstName|there}},\n\nI saw your work at {{company}} and wanted to reach out with a short note.\n\nBest,\n{{senderName|Your Name}}",
};

export function TemplatesManager({
  initialTemplates,
}: {
  initialTemplates: EmailTemplate[];
}) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [selectedId, setSelectedId] = useState(initialTemplates[0]?.id ?? "");
  const [draft, setDraft] = useState<TemplateDraft>(
    () => initialTemplates[0] ?? emptyDraft,
  );
  const [isSaving, setIsSaving] = useState(false);

  const detectedVariables = useMemo(
    () => detectTemplateVariables(draft.subject, draft.body),
    [draft.subject, draft.body],
  );
  const preview = useMemo(
    () => personalizeTemplate(draft, sampleContact),
    [draft],
  );

  function selectTemplate(template: EmailTemplate) {
    setSelectedId(template.id);
    setDraft(template);
  }

  function startNewTemplate() {
    setSelectedId("");
    setDraft(emptyDraft);
  }

  async function saveTemplate() {
    setIsSaving(true);

    try {
      const response = await fetch("/api/templates", {
        method: selectedId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedId || undefined,
          name: draft.name,
          subject: draft.subject,
          body: draft.body,
        }),
      });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error ?? "Could not save template.");
      }

      setTemplates((current) => {
        const next = current.filter((template) => template.id !== json.template.id);
        return [json.template, ...next];
      });
      setSelectedId(json.template.id);
      setDraft(json.template);
      toast.success("Template saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save template.");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteTemplate(id: string) {
    const response = await fetch(`/api/templates?id=${id}`, { method: "DELETE" });

    if (!response.ok) {
      toast.error("Could not delete template.");
      return;
    }

    const remaining = templates.filter((template) => template.id !== id);
    setTemplates(remaining);
    setSelectedId(remaining[0]?.id ?? "");
    setDraft(remaining[0] ?? emptyDraft);
    toast.success("Template deleted.");
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Templates</h1>
          <p className="text-muted-foreground">
            Create reusable emails with variables like {"{{firstName}}"} and
            fallback values like {"{{company|your team}}"}.
          </p>
        </div>
        <Button onClick={startNewTemplate} variant="outline">
          <PlusIcon data-icon="inline-start" />
          New template
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Saved templates</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {templates.length ? (
              templates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => selectTemplate(template)}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    selectedId === template.id
                      ? "border-primary bg-accent"
                      : "bg-background hover:bg-muted"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{template.name}</span>
                    <Badge variant="secondary">{template.variables.length}</Badge>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                    {template.subject}
                  </p>
                </button>
              ))
            ) : (
              <div className="flex flex-col items-center gap-2 rounded-lg border p-8 text-center text-sm text-muted-foreground">
                <FileTextIcon className="text-primary" />
                No templates yet.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-lg">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{selectedId ? "Edit template" : "Create template"}</CardTitle>
            {selectedId && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Delete template"
                onClick={() => void deleteTemplate(selectedId)}
              >
                <Trash2Icon data-icon="inline-start" />
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="editor">
              <TabsList>
                <TabsTrigger value="editor">Editor</TabsTrigger>
                <TabsTrigger value="preview">Preview</TabsTrigger>
              </TabsList>
              <TabsContent value="editor" className="mt-5">
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="templateName">Name</FieldLabel>
                    <Input
                      id="templateName"
                      value={draft.name}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      placeholder="Intro follow-up"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="templateSubject">Subject</FieldLabel>
                    <Input
                      id="templateSubject"
                      value={draft.subject}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          subject: event.target.value,
                        }))
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="templateBody">Body</FieldLabel>
                    <Textarea
                      id="templateBody"
                      value={draft.body}
                      rows={12}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          body: event.target.value,
                        }))
                      }
                    />
                  </Field>
                  <div className="flex flex-wrap gap-2">
                    {detectedVariables.length ? (
                      detectedVariables.map((variable) => (
                        <Badge key={variable} variant="secondary">
                          {variable}
                        </Badge>
                      ))
                    ) : (
                      <Badge variant="outline">No variables detected</Badge>
                    )}
                  </div>
                  <Button onClick={saveTemplate} disabled={isSaving}>
                    {isSaving ? (
                      <Loader2Icon data-icon="inline-start" className="animate-spin" />
                    ) : (
                      <SaveIcon data-icon="inline-start" />
                    )}
                    Save template
                  </Button>
                </FieldGroup>
              </TabsContent>
              <TabsContent value="preview" className="mt-5">
                <div className="flex flex-col gap-4 rounded-lg border bg-muted/35 p-4">
                  <div>
                    <div className="text-sm text-muted-foreground">Subject</div>
                    <div className="font-medium">{preview.subject}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Body</div>
                    <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-background p-4 font-sans text-sm leading-6">
                      {preview.body}
                    </pre>
                  </div>
                  {preview.missingVariables.length > 0 && (
                    <Badge variant="secondary">
                      Missing: {preview.missingVariables.join(", ")}
                    </Badge>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
