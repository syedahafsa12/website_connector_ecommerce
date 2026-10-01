/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    // The legacy console at "/" needs PostgreSQL (DATABASE_URL). The connection experience is the entry point.
    return [{ source: "/", destination: "/connect", permanent: false }];
  },
  async rewrites() {
    return [
      { source: "/.well-known/agentic-commerce/:slug", destination: "/api/well-known/agentic-commerce/:slug" },
    ];
  },
};

export default nextConfig;
