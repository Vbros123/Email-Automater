import { describe, expect, it } from "vitest";
import {
  detectTemplateVariables,
  personalizeTemplate,
} from "@/lib/personalization";

describe("template personalization", () => {
  it("replaces variables and appends footer", () => {
    const result = personalizeTemplate(
      {
        subject: "Quick question for {{company}}",
        body: "Hi {{firstName}},\n\nRole: {{role}}",
      },
      {
        firstName: "Ava",
        company: "Northstar Labs",
        role: "Head of Product",
      },
      { unsubscribeFooter: "Reply unsubscribe to opt out." },
    );

    expect(result.subject).toBe("Quick question for Northstar Labs");
    expect(result.body).toContain("Hi Ava");
    expect(result.body).toContain("Reply unsubscribe");
    expect(result.missingVariables).toEqual([]);
  });

  it("soft-resolves optional vars with defaults and does not block", () => {
    const result = personalizeTemplate(
      {
        subject: "Hello {{company}}",
        body: "Hi {{firstName}}, meet {{missingValue}} from {{senderName}}",
      },
      { firstName: "Ava" },
    );

    expect(result.subject).toBe("Hello your team");
    expect(result.body).toContain("Hi Ava");
    expect(result.body).toContain("from Your Name");
    // optional/unknown vars are not treated as hard missing
    expect(result.missingVariables).toEqual([]);
  });

  it("does not treat empty optional contact fields as missing", () => {
    const result = personalizeTemplate(
      {
        subject: "Quick question for {{company}}",
        body: "Hi {{firstName}}, I saw your work at {{company}}.",
      },
      {
        firstName: "Ava",
        company: "",
      },
    );

    // empty company uses default fallback "your team"
    expect(result.subject).toBe("Quick question for your team");
    expect(result.missingVariables).toEqual([]);
  });

  it("supports snake_case variable aliases", () => {
    const result = personalizeTemplate(
      {
        subject: "For {{first_name}}",
        body: "Hello {{last_name}} at {{company}}",
      },
      {
        firstName: "Ava",
        lastName: "Chen",
        company: "Northstar Labs",
      },
    );

    expect(result.subject).toBe("For Ava");
    expect(result.body).toBe("Hello Chen at Northstar Labs");
    expect(result.missingVariables).toEqual([]);
  });

  it("detects variables across subject and body", () => {
    expect(
      detectTemplateVariables("For {{company}}", "Hi {{firstName}} {{company}}"),
    ).toEqual(["company", "firstName"]);
  });
});
