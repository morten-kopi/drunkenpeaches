import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Sign-in moved to the root. Old links and sent invite emails still
      // point here; the query string (next, error) is kept. Temporary, so
      // browsers don't cache it if /login is ever used again.
      { source: "/login", destination: "/", permanent: false },
    ];
  },
};

export default nextConfig;
