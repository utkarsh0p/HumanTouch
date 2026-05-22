import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/auth";

function apiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.redirect(new URL("/", process.env.AUTH_URL ?? "http://localhost:3000"));
  }

  const { provider } = await params;
  const response = await fetch(`${apiBaseUrl()}/api/integrations/${provider}/connect`, {
    headers: {
      "x-auth-user-email": email,
    },
    redirect: "manual",
  });

  const location = response.headers.get("location") ?? "/";
  const redirectResponse = NextResponse.redirect(location);
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) {
    redirectResponse.headers.set("set-cookie", setCookie);
  }

  return redirectResponse;
}
