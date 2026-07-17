import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Le immagini eventi possono arrivare fino a 10 MB (+ margine per overhead multipart)
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
