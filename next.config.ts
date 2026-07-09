import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Le immagini dei servizi possono arrivare fino a 5 MB
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
