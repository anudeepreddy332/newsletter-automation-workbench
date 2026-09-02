import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Newsletter Automation Workbench POC",
  description: "Milestone 2 persistent story selection workbench",
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
