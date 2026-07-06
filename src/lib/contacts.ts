import Papa from "papaparse";
import { contactSchema, normalizeEmail } from "@/lib/validators";
import type { ContactInput } from "@/lib/types";

export type CsvImportPreview = {
  validContacts: ContactInput[];
  invalidRows: Array<{ row: number; reason: string }>;
  summary: {
    totalRows: number;
    validRows: number;
    invalidRows: number;
  };
};

const standardFields = new Set([
  "firstname",
  "first_name",
  "lastname",
  "last_name",
  "email",
  "company",
  "role",
  "notes",
]);

export function parseContactsCsv(csv: string): CsvImportPreview {
  const result = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
    transform: (value) => value.trim(),
  });

  const validContacts: ContactInput[] = [];
  const invalidRows: CsvImportPreview["invalidRows"] = [];

  result.data.forEach((row, index) => {
    const raw = normalizeRow(row);
    const parsed = contactSchema.safeParse(raw);

    if (parsed.success) {
      validContacts.push({
        ...parsed.data,
        email: normalizeEmail(parsed.data.email),
      });
      return;
    }

    invalidRows.push({
      row: index + 2,
      reason: parsed.error.issues.map((issue) => issue.message).join(", "),
    });
  });

  return {
    validContacts,
    invalidRows,
    summary: {
      totalRows: result.data.length,
      validRows: validContacts.length,
      invalidRows: invalidRows.length,
    },
  };
}

function normalizeRow(row: Record<string, string>) {
  const customFields: Record<string, string> = {};
  const normalized: Record<string, string> = {};

  Object.entries(row).forEach(([key, value]) => {
    const compactKey = key.replace(/\s+/g, "").toLowerCase();

    if (standardFields.has(compactKey)) {
      normalized[compactKey] = value;
      return;
    }

    if (value) {
      customFields[key] = value;
    }
  });

  return {
    firstName: normalized.firstname ?? normalized.first_name ?? "",
    lastName: normalized.lastname ?? normalized.last_name ?? "",
    email: normalized.email ?? "",
    company: normalized.company ?? "",
    role: normalized.role ?? "",
    notes: normalized.notes ?? "",
    customFields,
  };
}
