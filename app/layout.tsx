import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Airplane Rush",
  description: "A cooperative cabin-crew party game for friends playing across devices.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
