import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Newsletter Automation Workbench POC",
  description: "Milestone 1 deterministic content foundation",
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
