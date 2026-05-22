import type { Metadata } from "next";
import { AuthSessionProvider } from "@/components/session-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "HumanTouch",
  description: "Admin agent workspace for HumanTouch",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AuthSessionProvider>{children}</AuthSessionProvider>
      </body>
    </html>
  );
}
