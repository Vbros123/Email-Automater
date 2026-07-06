import type { PersonalizationContact } from "@/lib/types";

const VARIABLE_REGEX = /{{\s*([a-zA-Z0-9_.]+)(?:\s*\|\s*([^}]+?))?\s*}}/g;

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

      if (value) {
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

function readContactValue(contact: PersonalizationContact, path: string) {
  const normalizedPath = path.trim();

  if (normalizedPath.startsWith("customFields.")) {
    const key = normalizedPath.replace("customFields.", "");
    return contact.customFields?.[key]?.trim() ?? "";
  }

  const value = contact[normalizedPath as keyof PersonalizationContact];
  return typeof value === "string" ? value.trim() : "";
}
