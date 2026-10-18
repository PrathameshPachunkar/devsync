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
    const target = process.env.API_PROXY_TARGET?.trim().replace(/\/+$/, "");
    const apiUrl = process.env.NEXT_PUBLIC_API_URL?.trim() ?? "";
    // A relative API URL only works with the proxy. Fail the build loudly
    // instead of shipping a site where every /api call is a 404.
    if (apiUrl.startsWith("/") && !target) {
      throw new Error(
        `NEXT_PUBLIC_API_URL is "${apiUrl}" but API_PROXY_TARGET is not set. ` +
          "Set API_PROXY_TARGET to the API's URL (e.g. https://your-api.up.railway.app) and rebuild.",
      );
    }
    if (target && !/^https?:\/\//.test(target)) {
      throw new Error(`API_PROXY_TARGET must start with https:// (got "${target}")`);
    }
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
