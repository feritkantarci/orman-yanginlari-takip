import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Orman Yangınları - Hat Bakım Sistemi",
  description: "Modern, hızlı ve güvenilir hat bakım takip sistemi.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
