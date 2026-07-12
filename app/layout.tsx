import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Carnet — back-office",
  description: "Commandes, contacts et relances des artisans.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr-CH">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
