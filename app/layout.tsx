import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "./globals.css";
import { Toaster } from "sonner";
import { getBrand } from "@/lib/brand";
import Shell from "@/app/components/Shell";

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrand();
  return {
    title: `${brand.name} — back-office`,
    description: "Commandes, contacts et relances des artisans.",
    robots: { index: false, follow: false },
    // PWA : icône iOS + mode plein écran quand l'app est ajoutée à l'écran d'accueil.
    icons: { apple: "/icon-pwa/180" },
    appleWebApp: { capable: true, title: brand.name, statusBarStyle: "default" },
  };
}

export const viewport = {
  themeColor: "#ffffff",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const brand = await getBrand();
  return (
    <html lang="fr-CH" style={{ ["--brand" as string]: brand.color }} data-brand-name={brand.name} data-studio={brand.studio ? "1" : "0"}>
      <body className="min-h-screen antialiased">
        <Shell>{children}</Shell>
        <Toaster position="top-right" richColors closeButton toastOptions={{ style: { fontFamily: "var(--font-sans)" } }} />
      </body>
    </html>
  );
}
