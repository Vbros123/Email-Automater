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

  it("supports fallback values and reports missing variables", () => {
    const result = personalizeTemplate(
      {
        subject: "Hello {{company|your team}}",
        body: "Hi {{firstName}}, meet {{missingValue}}",
      },
      { firstName: "Ava" },
    );

    expect(result.subject).toBe("Hello your team");
    expect(result.body).toContain("Hi Ava");
    expect(result.missingVariables).toEqual(["missingValue"]);
  });

  it("detects variables across subject and body", () => {
    expect(
      detectTemplateVariables("For {{company}}", "Hi {{firstName}} {{company}}"),
    ).toEqual(["company", "firstName"]);
  });
});
