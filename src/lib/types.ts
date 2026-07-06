export type Contact = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  company: string | null;
  role: string | null;
  notes: string | null;
  custom_fields: Record<string, string>;
  created_at: string;
};

export type EmailTemplate = {
  id: string;
  name: string;
  subject: string;
  body: string;
  variables: string[];
  created_at: string;
  updated_at: string;
};

export type CampaignStatus = "draft" | "drafts_created" | "sent" | "failed";

export type Campaign = {
  id: string;
  name: string;
  template_id: string;
  selected_contact_ids: string[];
  status: CampaignStatus;
  unsubscribe_footer: string | null;
  created_at: string;
  updated_at: string;
};

export type EmailActivity = {
  id: string;
  campaign_id: string | null;
  recipient_email: string;
  action: "draft_created" | "sent" | "failed";
  status: string;
  detail: string | null;
  created_at: string;
};

export type ContactInput = {
  firstName: string;
  lastName: string;
  email: string;
  company?: string;
  role?: string;
  notes?: string;
  customFields?: Record<string, string>;
};

export type PersonalizationContact = {
  firstName?: string;
  lastName?: string;
  email?: string;
  company?: string;
  role?: string;
  notes?: string;
  customFields?: Record<string, string>;
};
