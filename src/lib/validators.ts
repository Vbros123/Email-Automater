import { z } from "zod";

export const emailSchema = z.string().trim().email().max(320);

export const customFieldsSchema = z
  .record(z.string().min(1).max(80), z.string().max(1000))
  .default({});

export const contactSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: emailSchema,
  company: z.string().trim().max(160).optional().default(""),
  role: z.string().trim().max(160).optional().default(""),
  notes: z.string().trim().max(2000).optional().default(""),
  customFields: customFieldsSchema.optional().default({}),
});

export const contactsImportSchema = z.object({
  contacts: z.array(contactSchema).min(1).max(500),
});

export const templateSchema = z.object({
  name: z.string().trim().min(2).max(140),
  subject: z.string().trim().min(2).max(200),
  body: z.string().trim().min(2).max(20000),
});

export const campaignCreateSchema = z.object({
  name: z.string().trim().min(2).max(140),
  templateId: z.string().uuid(),
  selectedContactIds: z.array(z.string().uuid()).min(1).max(50),
  unsubscribeFooter: z.string().trim().max(2000).optional().default(""),
});

export const draftCreateSchema = z.object({
  overrideUnresolvedVariables: z.boolean().optional().default(false),
});

export const sendConfirmationSchema = z.object({
  confirmSend: z.literal(true),
  permissionConfirmed: z.literal(true),
});

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}
