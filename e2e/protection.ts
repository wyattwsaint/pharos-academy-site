/**
 * Vercel guards preview deployments behind its own SSO login. An unauthenticated
 * request to a preview URL is answered with a 302 to `vercel.com/sso-api`, so a
 * suite pointed at one audits Vercel's login page instead of the site — which is
 * how #19's deployed-axe job first went red: colour-contrast on Vercel's own
 * "Terms"/"Privacy Policy" footer links, and every artefact fetch a redirect.
 *
 * The protection bypass token turns that off per-request. Callers hand it to
 * Playwright as `extraHTTPHeaders`, so every navigation, subresource and API
 * fetch carries it.
 *
 * @see https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection
 */
export function bypassHeaders(secret: string | undefined): Record<string, string> {
  const token = secret?.trim();
  if (!token) return {};

  return {
    'x-vercel-protection-bypass': token,
    // Ask Vercel to set the bypass cookie too, so a redirect or a subresource
    // that loses the header is still let through.
    'x-vercel-set-bypass-cookie': 'samesitenone',
  };
}
