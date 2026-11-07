/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Hide the floating Next.js dev tools badge (only shown with `npm run dev`).
  devIndicators: false,
  // pdfkit reads its font files from its own folder at runtime: load it with
  // Node's require instead of bundling it (PDF report, /api/report).
  serverExternalPackages: ["pdfkit"],
};

module.exports = nextConfig;
