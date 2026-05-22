import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

function apiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret:
    process.env.AUTH_SECRET ??
    (process.env.NODE_ENV === "production" ? undefined : "humantouch-local-auth-secret"),
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      authorization: {
        params: {
          prompt: "select_account",
          access_type: "offline",
          response_type: "code",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== "google") {
        return false;
      }

      const email = profile?.email;
      if (typeof email !== "string" || email.trim().length === 0) {
        return false;
      }

      const response = await fetch(`${apiBaseUrl()}/api/auth/nextauth/sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.AUTH_SECRET
            ? { "x-nextauth-sync-secret": process.env.AUTH_SECRET }
            : {}),
        },
        body: JSON.stringify({
          email,
          name: typeof profile?.name === "string" ? profile.name : null,
          provider: account.provider,
        }),
      });

      return response.ok;
    },
    async session({ session }) {
      return session;
    },
  },
});
