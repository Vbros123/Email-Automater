import "server-only";

import { NextResponse } from "next/server";
import { createAdminClient, getCurrentUser } from "@/lib/supabase/server";

export async function requireUser() {
  const { supabase, user } = await getCurrentUser();

  if (!supabase) {
    return {
      error: NextResponse.json(
        { error: "Supabase environment variables are not configured." },
        { status: 500 },
      ),
    };
  }

  if (!user) {
    return {
      error: NextResponse.json({ error: "Authentication required." }, { status: 401 }),
    };
  }

  return { supabase: createAdminClient() ?? supabase, user };
}

export function parseJsonError() {
  return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
}
