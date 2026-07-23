import type { MetadataRoute } from "next";
import { getBrand } from "@/lib/brand";

/* Manifest PWA — servi sur /manifest.webmanifest (lien injecté par Next).
   Marque blanche : nom du tenant + icônes générées par /icon-pwa/ (initiale
   + point couleur d'accent). display standalone = plein écran sans barre
   d'URL une fois installée. */

export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const brand = await getBrand();
  return {
    name: brand.name,
    short_name: brand.name,
    description: "Commandes, contacts et relances — le back-office de l'atelier.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#faf9f7",
    theme_color: "#ffffff",
    icons: [
      { src: "/icon-pwa/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-pwa/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-pwa/192", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-pwa/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
