import type { NextConfig } from "next";
import { fileURLToPath } from "url";
import { dirname } from "path";

const here = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Pin the project root. This app sits inside the portal's repository, and
  // without this Next walks up, finds the portal's lockfile, treats that as the
  // root and tries to compile the portal's files too, which fail here because
  // their dependencies were deliberately not installed.
  turbopack: { root: here },
  outputFileTracingRoot: here,

  // This deployment answers Slack and the biometric device. It serves no pages,
  // so there is nothing to prerender and nothing for a browser to find.
  poweredByHeader: false,
};

export default nextConfig;
