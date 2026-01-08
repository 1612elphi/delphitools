import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  async redirects() {
    return [
      {
        source: "/tools/gradient-generator",
        destination: "/tools/gradient-genny",
        permanent: true, // 308 redirect
      },
    ];
  },
};

export default nextConfig;
