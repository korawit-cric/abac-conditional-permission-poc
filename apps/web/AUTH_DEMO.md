# Backend-owned mock login and revocable sessions

NestJS owns the OAuth-style login flow and PostgreSQL-backed application sessions. Next.js starts login by linking to the API, renders the dashboard, and forwards the HttpOnly cookie during server rendering. The local provider is a teaching stand-in, not ThaiD, and does not authenticate a real person.

## Flow

1. NestJS `/auth/login` creates state and a PKCE verifier.
2. NestJS stores them for five minutes in an AES-256-GCM encrypted, HttpOnly, SameSite=Lax `oauth_attempt` cookie.
3. The local provider returns a short-lived code and selected mock subject to NestJS `/auth/callback`.
4. NestJS validates state and expiry, exchanges the code with the verifier, and maps the subject to an application `User`.
5. NestJS creates an `AuthSession` row containing a SHA-256 hash of a new random token.
6. The encrypted `app_session` cookie contains the raw token and expiry, not identity or permission claims.
7. Protected API requests hash the cookie token and require a matching, unexpired, unrevoked session row.
8. Current-session logout revokes one row; all-device logout revokes every active row for the current user.

The temporary OAuth attempt remains cookie-backed. Application sessions are database-backed so PostgreSQL can revoke a copied cookie immediately.

## Run

Follow the root [`README.md`](../../README.md) to configure the shared secret and URLs, start PostgreSQL, apply migrations, seed users, and run the workspace.

## Production integration

A real ThaiD adapter must use registered endpoints, the exact redirect URI, required client authentication, and verified OIDC identity data, including signature, issuer, audience, expiry, nonce where applicable, and claim mapping. Callback query parameters are not identity.

The temporary login attempt is not reliably single-use across concurrent callbacks because it remains cookie-backed. Production systems should add one-time login-attempt storage when replay consumption is required. Also add rate limits, session cleanup, device metadata, key rotation, and authorization audit logging.
