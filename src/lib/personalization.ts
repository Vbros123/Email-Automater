import type { PersonalizationContact } from "@/lib/types";

const VARIABLE_REGEX = /{{\s*([a-zA-Z0-9_.]+)(?:\s*\|\s*([^}]+?))?\s*}}/g;

const FIELD_ALIASES: Record<string, keyof PersonalizationContact> = {
  firstname: "firstName",
  first_name: "firstName",
  lastname: "lastName",
  last_name: "lastName",
  email: "email",
  company: "company",
  role: "role",
  notes: "notes",
};

export type PersonalizationResult = {
  subject: string;
  body: string;
  missingVariables: string[];
  usedVariables: string[];
  unresolvedCount: number;
};

export function detectVariables(input: string) {
  const variables = new Set<string>();

  for (const match of input.matchAll(VARIABLE_REGEX)) {
    variables.add(match[1]);
  }

  return Array.from(variables).sort();
}

export function detectTemplateVariables(subject: string, body: string) {
  return Array.from(
    new Set([...detectVariables(subject), ...detectVariables(body)]),
  ).sort();
}

export function personalizeTemplate(
  template: { subject: string; body: string },
  contact: PersonalizationContact,
  options?: { allowUnresolved?: boolean; unsubscribeFooter?: string },
): PersonalizationResult {
  const missingVariables = new Set<string>();
  const usedVariables = new Set<string>();

  const replace = (input: string) =>
    input.replace(VARIABLE_REGEX, (raw, variable: string, fallback?: string) => {
      usedVariables.add(variable);
      const value = readContactValue(contact, variable);

      // Empty string is a resolved value (e.g. contact has no company).
      // Only treat the variable as missing when it is truly absent.
      if (value !== undefined) {
        return value;
      }

      if (fallback?.trim()) {
        return fallback.trim();
      }

      missingVariables.add(variable);
      return options?.allowUnresolved ? raw : "";
    });

  const body = [replace(template.body), options?.unsubscribeFooter]
    .filter(Boolean)
    .join("\n\n");
  const subject = replace(template.subject);

  return {
    subject,
    body,
    missingVariables: Array.from(missingVariables).sort(),
    usedVariables: Array.from(usedVariables).sort(),
    unresolvedCount: missingVariables.size,
  };
}

function readContactValue(
  contact: PersonalizationContact,
  path: string,
): string | undefined {
  const normalizedPath = path.trim();

  if (normalizedPath.toLowerCase().startsWith("customfields.")) {
    const key = normalizedPath.slice(normalizedPath.indexOf(".") + 1);
    if (!contact.customFields || !(key in contact.customFields)) {
      return undefined;
    }
    return contact.customFields[key]?.trim() ?? "";
  }

  const aliasKey = FIELD_ALIASES[normalizedPath.toLowerCase()];
  if (aliasKey) {
    const aliased = contact[aliasKey];
    if (typeof aliased === "string") {
      return aliased.trim();
    }
    // Known contact fields are always considered present once mapped.
    if (aliasKey in contact) {
      return "";
    }
  }

  const direct = contact[normalizedPath as keyof PersonalizationContact];
  if (typeof direct === "string") {
    return direct.trim();
  }

  return undefined;
}
