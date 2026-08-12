import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/live-status",
  trailingSlash: true,
};

export default nextConfig;
