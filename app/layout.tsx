import type { Metadata } from "next";

import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Newsletter Builder",
  description: "Build, review, approve, and stage a newsletter from sample stories.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
