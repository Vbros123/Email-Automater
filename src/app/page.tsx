import Link from "next/link";
import {
  ArrowRightIcon,
  CheckCircle2Icon,
  FileTextIcon,
  GaugeIcon,
  MailCheckIcon,
  ShieldCheckIcon,
  SparklesIcon,
  UsersIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      <header className="border-b bg-background/92 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <MailCheckIcon />
            </span>
            EmailFlow AI
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            <a href="#features" className="transition-colors hover:text-foreground">
              Features
            </a>
            <a href="#safety" className="transition-colors hover:text-foreground">
              Safety
            </a>
            <a href="#workflow" className="transition-colors hover:text-foreground">
              Workflow
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className={cn(
                buttonVariants({ variant: "ghost" }),
                "hidden sm:inline-flex",
              )}
            >
              Log in
            </Link>
            <Link href="/signup" className={buttonVariants()}>
              Get Started
            </Link>
          </div>
        </div>
      </header>

      <section className="bg-page-grid">
        <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8">
          <div className="flex max-w-2xl flex-col gap-7">
            <div className="flex flex-col gap-5">
              <h1 className="max-w-4xl text-5xl font-semibold leading-[1.02] text-balance sm:text-6xl">
                EmailFlow AI
              </h1>
              <p className="max-w-xl text-lg leading-8 text-muted-foreground">
                Build permission-based Gmail outreach workflows with reusable
                templates, CSV contacts, personalized previews, and draft-first
                campaign controls.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/signup" className={buttonVariants({ size: "lg" })}>
                Get Started
                <ArrowRightIcon data-icon="inline-end" />
              </Link>
              <Link
                href="/login"
                className={buttonVariants({ variant: "outline", size: "lg" })}
              >
                Open Dashboard
              </Link>
            </div>
            <div className="grid max-w-xl gap-3 text-sm text-muted-foreground sm:grid-cols-3">
              {["Drafts by default", "50-recipient cap", "Gmail compose scope"].map(
                (item) => (
                  <div key={item} className="flex items-center gap-2">
                    <CheckCircle2Icon className="text-primary" />
                    {item}
                  </div>
                ),
              )}
            </div>
          </div>

          <ProductPreview />
        </div>
      </section>

      <section id="features" className="border-t py-20">
        <div className="mx-auto flex max-w-7xl flex-col gap-10 px-4 sm:px-6 lg:px-8">
          <div className="flex max-w-3xl flex-col gap-3">
            <h2 className="text-3xl font-semibold text-balance">
              Everything needed for careful email automation
            </h2>
            <p className="text-muted-foreground">
              Contacts, templates, personalization, Gmail drafts, and activity
              logging are built around consent and control.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[
              {
                title: "Contact imports",
                icon: UsersIcon,
                text: "Validate CSV rows, preview the import, skip invalid emails, and keep custom fields.",
              },
              {
                title: "Template variables",
                icon: FileTextIcon,
                text: "Detect {{firstName}} variables, support fallbacks, and block unresolved sends.",
              },
              {
                title: "Draft-first Gmail",
                icon: MailCheckIcon,
                text: "Create Gmail drafts with compose scope before any send action is available.",
              },
              {
                title: "Activity controls",
                icon: GaugeIcon,
                text: "Track drafts, sent emails, failures, and campaign status in one place.",
              },
            ].map((feature) => (
              <Card key={feature.title} className="rounded-lg">
                <CardHeader>
                  <feature.icon className="text-primary" />
                  <CardTitle>{feature.title}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm leading-6 text-muted-foreground">
                  {feature.text}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="safety" className="border-t bg-muted/35 py-20">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:px-8">
          <div className="flex flex-col gap-3">
            <ShieldCheckIcon className="text-primary" />
            <h2 className="text-3xl font-semibold">Designed against abuse</h2>
            <p className="text-muted-foreground">
              EmailFlow AI is for legitimate personal and productivity email,
              not scraping, purchased lists, hidden identity, or unsolicited bulk
              messaging.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              "Campaigns are capped at 50 recipients by default.",
              "Sending requires a clear confirmation modal and permission checkbox.",
              "Server routes are authenticated, validated, and rate limited.",
              "Gmail refresh tokens are encrypted before storage.",
            ].map((item) => (
              <div
                key={item}
                className="flex items-start gap-3 rounded-lg border bg-background p-4 text-sm"
              >
                <ShieldCheckIcon className="mt-0.5 text-primary" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="workflow" className="border-t py-20">
        <div className="mx-auto flex max-w-7xl flex-col gap-10 px-4 sm:px-6 lg:px-8">
          <div className="flex max-w-3xl flex-col gap-3">
            <h2 className="text-3xl font-semibold">From template to Gmail drafts</h2>
            <p className="text-muted-foreground">
              Choose contacts, select a template, review the personalized output,
              then create drafts. Sending remains secondary and explicit.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-5">
            {["Contacts", "Template", "Preview", "Drafts", "Confirm"].map(
              (step, index) => (
                <div key={step} className="rounded-lg border bg-card p-4">
                  <div className="mb-6 text-sm text-muted-foreground">
                    Step {index + 1}
                  </div>
                  <div className="font-medium">{step}</div>
                </div>
              ),
            )}
          </div>
        </div>
      </section>

      <footer className="border-t py-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>EmailFlow AI</p>
          <p>Permission-based email automation for Gmail.</p>
        </div>
      </footer>
    </main>
  );
}

function ProductPreview() {
  return (
    <div className="rounded-xl border bg-card p-3 shadow-2xl shadow-primary/10">
      <div className="rounded-lg border bg-background">
        <div className="flex items-center justify-between border-b p-4">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
              <SparklesIcon />
            </span>
            <div>
              <div className="font-medium">Campaign Builder</div>
              <div className="text-xs text-muted-foreground">Create Gmail drafts</div>
            </div>
          </div>
          <Badge variant="secondary">Gmail connected</Badge>
        </div>
        <div className="grid gap-4 p-4 md:grid-cols-[0.82fr_1.18fr]">
          <div className="flex flex-col gap-3">
            {["Choose contacts", "Choose template", "Preview emails"].map(
              (item, index) => (
                <div
                  key={item}
                  className="flex items-center gap-3 rounded-lg border bg-muted/40 p-3"
                >
                  <span className="grid size-7 place-items-center rounded-md bg-background text-xs font-medium">
                    {index + 1}
                  </span>
                  <span className="text-sm font-medium">{item}</span>
                </div>
              ),
            )}
            <div className="rounded-lg border border-primary/30 bg-accent p-3 text-sm">
              Draft-first mode is on. Sends require confirmation.
            </div>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Preview for Ava Chen</div>
                <div className="text-xs text-muted-foreground">ava@example.com</div>
              </div>
              <Badge>Ready</Badge>
            </div>
            <div className="flex flex-col gap-3 rounded-lg bg-muted/45 p-4 text-sm leading-6">
              <p className="font-medium">Quick question for Northstar Labs</p>
              <p className="text-muted-foreground">
                Hi Ava, I saw your work at Northstar Labs and wanted to reach out
                with a short note.
              </p>
              <p className="text-muted-foreground">Best, Taylor</p>
            </div>
            <div className="mt-4 flex justify-end">
              <Button>
                Create Drafts
                <ArrowRightIcon data-icon="inline-end" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
