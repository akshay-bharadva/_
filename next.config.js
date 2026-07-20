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
  experimental: {
    // Single worker for page-data collection/export: parallel jest-workers
    // race on the shared server bundles while Pages and App router coexist
    // (Windows). Remove with the webpack overrides below once migrated.
    cpus: 1,
  },
  webpack: (config, { isServer }) => {
    // Next 14 mis-shares server chunks between the coexisting Pages and App
    // routers on Windows ("Cannot find module './NNNN.js'" from
    // webpack-runtime during page-data collection). Server bundles aren't
    // download-size sensitive, so disable chunk splitting there entirely.
    // Remove once the Pages Router is fully migrated away.
    if (isServer) {
      config.optimization.splitChunks = false;
    }
    // The webpack pack cache also corrupts manifests across incremental
    // builds while both routers coexist — build cold until migration ends.
    config.cache = false;
    return config;
  },
};

module.exports = nextConfig;