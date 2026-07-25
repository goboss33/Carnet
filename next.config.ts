import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["grammy"],
  experimental: {
    // Uploads via Server Actions (analyse d'échange, inspirations, justificatifs) :
    // le défaut de 1 Mo est trop petit pour une capture d'écran.
    serverActions: { bodySizeLimit: "12mb" },
  },
};

export default nextConfig;
