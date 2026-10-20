/**
 * CompliBot - Public route definitions
 */

export const PUBLIC_ROUTES = ["/login", "/join"];

// "/api/invite" is the join-by-link API; it checks the invite token itself.
export const PUBLIC_API_ROUTES = ["/api/auth", "/api/health", "/api/invite"];

export const EMAIL_VERIFICATION_EXEMPT_ROUTES = ["/api/auth"];
