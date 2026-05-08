import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HumanTouch",
  description: "Admin agent workspace for HumanTouch",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
