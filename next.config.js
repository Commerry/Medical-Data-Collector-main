/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "export",
  distDir: "electron-dist/renderer",
  assetPrefix: process.env.NODE_ENV === 'production' ? "./" : '',
  trailingSlash: true,
  images: {
    unoptimized: true
  }
};

module.exports = nextConfig;
