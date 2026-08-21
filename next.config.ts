import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The local dashboard is opened through 127.0.0.1 because another process on
  // this machine owns localhost. Allow that explicit development origin so
  // Next.js can serve client chunks and HMR without weakening production.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
