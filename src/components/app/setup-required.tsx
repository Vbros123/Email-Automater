import Link from "next/link";
import { AlertCircleIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";

export function SetupRequired() {
  return (
    <main className="grid min-h-screen place-items-center bg-muted/35 px-4">
      <div className="flex w-full max-w-2xl flex-col gap-5">
        <Alert>
          <AlertCircleIcon />
          <AlertTitle>Environment setup required</AlertTitle>
          <AlertDescription>
            Add the Supabase and Google values from .env.example, run the SQL
            migration in Supabase, then restart the app.
          </AlertDescription>
        </Alert>
        <Link href="/" className={buttonVariants({ variant: "outline" })}>
          Back to landing page
        </Link>
      </div>
    </main>
  );
}
