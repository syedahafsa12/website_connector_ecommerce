/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      { source: "/.well-known/agentic-commerce/:slug", destination: "/api/well-known/agentic-commerce/:slug" },
    ];
  },
};

export default nextConfig;
