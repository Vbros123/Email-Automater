import { describe, expect, it } from "vitest";
import { campaignCreateSchema } from "@/lib/validators";

const ids = Array.from({ length: 50 }, (_, index) =>
  `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`,
);

describe("campaign validation", () => {
  it("allows up to 50 contacts", () => {
    const parsed = campaignCreateSchema.safeParse({
      name: "Launch follow-up",
      templateId: "11111111-1111-4111-8111-111111111111",
      selectedContactIds: ids,
      unsubscribeFooter: "Reply unsubscribe to opt out.",
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects campaigns over the default cap", () => {
    const parsed = campaignCreateSchema.safeParse({
      name: "Too large",
      templateId: "11111111-1111-4111-8111-111111111111",
      selectedContactIds: [
        ...ids,
        "22222222-2222-4222-8222-222222222222",
      ],
    });

    expect(parsed.success).toBe(false);
  });
});
