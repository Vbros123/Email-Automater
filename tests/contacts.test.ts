import { describe, expect, it } from "vitest";
import { parseContactsCsv } from "@/lib/contacts";
import { emailSchema } from "@/lib/validators";

describe("contact CSV parsing", () => {
  it("imports valid rows and skips invalid emails", () => {
    const csv = [
      "firstName,lastName,email,company,role,Region",
      "Ava,Chen,ava@example.com,Northstar Labs,Head of Product,NA",
      "Bad,Email,not-an-email,Example,Role,EU",
    ].join("\n");

    const preview = parseContactsCsv(csv);

    expect(preview.summary.totalRows).toBe(2);
    expect(preview.summary.validRows).toBe(1);
    expect(preview.summary.invalidRows).toBe(1);
    expect(preview.validContacts[0].customFields).toEqual({ Region: "NA" });
  });
});

describe("email validation", () => {
  it("normalizes valid email addresses", () => {
    expect(emailSchema.parse("ava@example.com")).toBe("ava@example.com");
    expect(() => emailSchema.parse("not-an-email")).toThrow();
  });
});
