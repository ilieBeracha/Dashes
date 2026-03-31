import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dashes",
  description: "Build and ship web apps with AI agents",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-bg-primary text-text-primary antialiased">
        {children}
      </body>
    </html>
  );
}
