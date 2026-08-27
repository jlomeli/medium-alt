import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Next 15.5 has `typedRoutes` on by default. Turn it off — the generated
  // .next/types/routes.d.ts is written during `next build`, which runs AFTER
  // typecheck in CI, so hrefs never resolve when typechecking cleanly. Small
  // routing surface for now; re-enable in Phase 2 if maintenance cost is worth
  // it (probably reorder CI to build → typecheck).
  typedRoutes: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "utfs.io" }, // uploadthing
      { protocol: "https", hostname: "*.ufs.sh" },
    ],
  },
};

export default nextConfig;
