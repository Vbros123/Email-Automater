"use client";

import { useMemo, useRef, useState } from "react";
import {
  Loader2Icon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { parseContactsCsv, type CsvImportPreview } from "@/lib/contacts";
import type { Contact } from "@/lib/types";

export function ContactsManager({ initialContacts }: { initialContacts: Contact[] }) {
  const [contacts, setContacts] = useState(initialContacts);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [preview, setPreview] = useState<CsvImportPreview | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredContacts = useMemo(() => {
    const value = query.trim().toLowerCase();

    if (!value) return contacts;

    return contacts.filter((contact) =>
      [
        contact.first_name,
        contact.last_name,
        contact.email,
        contact.company,
        contact.role,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(value),
    );
  }, [contacts, query]);

  async function createContact(formData: FormData) {
    setIsSaving(true);

    const payload = {
      firstName: String(formData.get("firstName") ?? ""),
      lastName: String(formData.get("lastName") ?? ""),
      email: String(formData.get("email") ?? ""),
      company: String(formData.get("company") ?? ""),
      role: String(formData.get("role") ?? ""),
      notes: String(formData.get("notes") ?? ""),
      customFields: {},
    };

    try {
      const response = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error ?? "Could not save contact.");
      }

      setContacts((current) => mergeContacts(current, json.contacts));
      setOpen(false);
      toast.success("Contact saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save contact.");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteContact(id: string) {
    const response = await fetch(`/api/contacts?id=${id}`, { method: "DELETE" });

    if (!response.ok) {
      toast.error("Could not delete contact.");
      return;
    }

    setContacts((current) => current.filter((contact) => contact.id !== id));
    toast.success("Contact deleted.");
  }

  async function handleCsv(file: File) {
    const text = await file.text();
    setPreview(parseContactsCsv(text));
  }

  async function importPreview() {
    if (!preview?.validContacts.length) return;

    setIsSaving(true);
    try {
      const response = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts: preview.validContacts }),
      });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error ?? "Could not import contacts.");
      }

      setContacts((current) => mergeContacts(current, json.contacts));
      toast.success(`Imported ${json.contacts.length} contacts.`);
      setPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not import contacts.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Contacts</h1>
          <p className="text-muted-foreground">
            Add trusted recipients manually or validate a CSV before importing.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button />}>
            <PlusIcon data-icon="inline-start" />
            Add contact
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add contact</DialogTitle>
              <DialogDescription>
                Save an individual contact for future draft creation.
              </DialogDescription>
            </DialogHeader>
            <form action={createContact} className="flex flex-col gap-5">
              <FieldGroup>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="firstName">First name</FieldLabel>
                    <Input id="firstName" name="firstName" required />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="lastName">Last name</FieldLabel>
                    <Input id="lastName" name="lastName" required />
                  </Field>
                </div>
                <Field>
                  <FieldLabel htmlFor="email">Email</FieldLabel>
                  <Input id="email" name="email" type="email" required />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="company">Company</FieldLabel>
                    <Input id="company" name="company" />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="role">Role</FieldLabel>
                    <Input id="role" name="role" />
                  </Field>
                </div>
                <Field>
                  <FieldLabel htmlFor="notes">Notes</FieldLabel>
                  <Textarea id="notes" name="notes" />
                </Field>
              </FieldGroup>
              <DialogFooter>
                <Button type="submit" disabled={isSaving}>
                  {isSaving && <Loader2Icon data-icon="inline-start" className="animate-spin" />}
                  Save contact
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.72fr_1.28fr]">
        <div className="rounded-lg border bg-background p-4">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-medium">CSV import</h2>
                <p className="text-sm text-muted-foreground">
                  Columns can include firstName, lastName, email, company, role,
                  notes, and custom fields.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
              >
                <UploadIcon data-icon="inline-start" />
                Upload CSV
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleCsv(file);
                }}
              />
            </div>
            {preview && (
              <div className="flex flex-col gap-4 rounded-lg border bg-muted/30 p-4">
                <div className="flex flex-wrap gap-2">
                  <Badge>{preview.summary.validRows} valid</Badge>
                  <Badge variant="secondary">
                    {preview.summary.invalidRows} skipped
                  </Badge>
                  <Badge variant="outline">{preview.summary.totalRows} rows</Badge>
                </div>
                {preview.invalidRows.length > 0 && (
                  <div className="max-h-32 overflow-auto text-sm text-muted-foreground">
                    {preview.invalidRows.slice(0, 6).map((row) => (
                      <p key={row.row}>
                        Row {row.row}: {row.reason}
                      </p>
                    ))}
                  </div>
                )}
                <Button
                  onClick={importPreview}
                  disabled={!preview.validContacts.length || isSaving}
                >
                  {isSaving && <Loader2Icon data-icon="inline-start" className="animate-spin" />}
                  Import valid rows
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-lg border bg-background">
          <div className="flex flex-col gap-4 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-xs">
              <SearchIcon className="pointer-events-none absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search contacts"
                className="pl-8"
              />
            </div>
            <Badge variant="secondary">{filteredContacts.length} contacts</Badge>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredContacts.length ? (
                filteredContacts.map((contact) => (
                  <TableRow key={contact.id}>
                    <TableCell>
                      {contact.first_name} {contact.last_name}
                    </TableCell>
                    <TableCell>{contact.email}</TableCell>
                    <TableCell>{contact.company ?? "None"}</TableCell>
                    <TableCell>{contact.role ?? "None"}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete ${contact.email}`}
                        onClick={() => void deleteContact(contact.id)}
                      >
                        <Trash2Icon />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-28 text-center">
                    No contacts found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

function mergeContacts(current: Contact[], incoming: Contact[]) {
  const byId = new Map(current.map((contact) => [contact.id, contact]));

  incoming.forEach((contact) => byId.set(contact.id, contact));

  return Array.from(byId.values()).sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
}
