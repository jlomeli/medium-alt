import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "utfs.io" }, // uploadthing
      { protocol: "https", hostname: "*.ufs.sh" },
    ],
  },
};

export default nextConfig;
