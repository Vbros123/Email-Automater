import type { Contact, PersonalizationContact } from "@/lib/types";

export const MAX_CAMPAIGN_RECIPIENTS = 50;

export function toPersonalizationContact(
  contact: Pick<
    Contact,
    | "first_name"
    | "last_name"
    | "email"
    | "company"
    | "role"
    | "notes"
    | "custom_fields"
  >,
): PersonalizationContact {
  return {
    firstName: contact.first_name,
    lastName: contact.last_name,
    email: contact.email,
    company: contact.company ?? "",
    role: contact.role ?? "",
    notes: contact.notes ?? "",
    customFields: contact.custom_fields ?? {},
  };
}
