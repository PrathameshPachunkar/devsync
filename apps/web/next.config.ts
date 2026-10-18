import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@devsync/shared"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  /**
   * Optional same-origin API proxy. With API_PROXY_TARGET set (read at build
   * time) and NEXT_PUBLIC_API_URL=/api, the browser calls /api/... on this site
   * and Next forwards it to the API. The session cookies then belong to this
   * site, which is what makes login work when web and API live on unrelated
   * domains, e.g. *.vercel.app and *.up.railway.app.
   */
  async rewrites() {
    const target = process.env.API_PROXY_TARGET?.replace(/\/+$/, "");
    return target ? [{ source: "/api/:path*", destination: `${target}/:path*` }] : [];
  },
  async redirects() {
    return [
      { source: "/", destination: "/boards", permanent: false },
      { source: "/settings", destination: "/settings/appearance", permanent: false },
    ];
  },
};

export default nextConfig;
