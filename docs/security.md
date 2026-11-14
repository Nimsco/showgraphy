# Security notes

- Passwords are hashed with Argon2id. User input is validated with Zod before model writes.
- Access tokens are short-lived. Refresh tokens are HttpOnly cookies, rotate per use, and are stored only as hashes. Reuse invalidates the session family.
- All data mutations require authentication and ownership checks. Public profile/share responses are purpose-built projections.
- A per-session CSRF token is double-submitted in a readable cookie and request header. CORS is restricted to `CORS_ORIGINS`; cookies are SameSite and secure in production.
- Helmet, rate limits, input bounds, and API error middleware protect the HTTP boundary.
- Global Chat requires a valid access JWT, active refresh session, active account, and allowed browser origin at connection; sends and deletions recheck the session. The refresh cookie is never sent to Socket.IO. Message text is length-limited and rendered as text, message sends are rate-limited and idempotent, and deletion is owner-checked. Reports are unique per reporter/message. Socket diagnostics log only status or failure class, never tokens or cookies.
- Provider credentials remain server-only. TMDB and AniList scores are kept distinct and are never substituted for one another.
- Production deployment still requires HTTPS, strong unique secrets, a restricted database user, backups, origin allowlisting, and a reviewed Google OAuth configuration.
