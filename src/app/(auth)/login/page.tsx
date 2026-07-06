import Link from "next/link";
import { MailCheckIcon } from "lucide-react";
import { AuthForm } from "@/components/auth/auth-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-muted/35 px-4 py-10">
      <Card className="w-full max-w-md rounded-lg">
        <CardHeader className="text-center">
          <Link href="/" className="mx-auto grid size-10 place-items-center rounded-lg bg-primary text-primary-foreground">
            <MailCheckIcon />
          </Link>
          <CardTitle>Log in to EmailFlow AI</CardTitle>
        </CardHeader>
        <CardContent>
          <AuthForm mode="login" />
        </CardContent>
      </Card>
    </main>
  );
}
