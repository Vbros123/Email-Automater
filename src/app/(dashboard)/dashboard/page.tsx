import Link from "next/link";
import {
  FileTextIcon,
  MailCheckIcon,
  MegaphoneIcon,
  SendIcon,
  UploadIcon,
  UsersIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCurrentUser } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export default async function DashboardPage() {
  const { supabase, user } = await getCurrentUser();

  if (!supabase || !user) {
    return null;
  }

  const [
    contactsCount,
    templatesCount,
    draftsCount,
    sentCount,
    recentActivity,
  ] = await Promise.all([
    supabase
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("templates")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("email_activity")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("action", "draft_created"),
    supabase
      .from("email_activity")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("action", "sent"),
    supabase
      .from("email_activity")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const stats = [
    {
      label: "Total contacts",
      value: contactsCount.count ?? 0,
      icon: UsersIcon,
    },
    {
      label: "Total templates",
      value: templatesCount.count ?? 0,
      icon: FileTextIcon,
    },
    {
      label: "Drafts created",
      value: draftsCount.count ?? 0,
      icon: MailCheckIcon,
    },
    {
      label: "Emails sent",
      value: sentCount.count ?? 0,
      icon: SendIcon,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground">
          Monitor contact health, template coverage, draft creation, and sent
          activity.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="rounded-lg">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </CardTitle>
              <stat.icon className="text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.75fr_1.25fr]">
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Link
              href="/dashboard/templates"
              className={cn(buttonVariants({ variant: "outline" }), "justify-start")}
            >
              <FileTextIcon data-icon="inline-start" />
              Create template
            </Link>
            <Link
              href="/dashboard/contacts"
              className={cn(buttonVariants({ variant: "outline" }), "justify-start")}
            >
              <UploadIcon data-icon="inline-start" />
              Import contacts
            </Link>
            <Link
              href="/dashboard/campaigns"
              className={cn(buttonVariants(), "justify-start")}
            >
              <MegaphoneIcon data-icon="inline-start" />
              Start campaign
            </Link>
          </CardContent>
        </Card>

        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(recentActivity.data ?? []).length ? (
                  (recentActivity.data ?? []).map((activity) => (
                    <TableRow key={activity.id}>
                      <TableCell>{activity.recipient_email}</TableCell>
                      <TableCell>{activity.action.replace("_", " ")}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            activity.status === "success" ? "default" : "secondary"
                          }
                        >
                          {activity.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(activity.created_at).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="h-28 text-center">
                      No activity yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
