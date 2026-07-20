/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  reactStrictMode: true,
  trailingSlash: true,
  images: {
    unoptimized: true,
    domains: ["images.unsplash.com", "avatars.githubusercontent.com"],
  },
  basePath: "",
  assetPrefix: "",
  webpack: (config, { isServer }) => {
    // Next 14 mis-shares server chunks between the coexisting Pages and App
    // routers on Windows ("Cannot find module './NNNN.js'" from
    // webpack-runtime during page-data collection). Server bundles aren't
    // download-size sensitive, so disable chunk splitting there entirely.
    // Remove once the Pages Router is fully migrated away.
    if (isServer) {
      config.optimization.splitChunks = false;
    }
    return config;
  },
};

module.exports = nextConfig;