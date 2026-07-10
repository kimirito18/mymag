import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "mymag",
  description: "Closed manga magazine database prototype"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
