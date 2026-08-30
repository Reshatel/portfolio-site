/**
 * Canonical origin of the site.
 *
 * - `NEXT_PUBLIC_SITE_URL` wins — set it on Vercel once a custom domain is live.
 * - Otherwise Vercel's own production URL is used, so Open Graph tags are
 *   correct on the default *.vercel.app deployment without any configuration.
 * - Locally it falls back to the dev server.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");
