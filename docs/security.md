# Security notes

- Passwords are hashed with Argon2id. User input is validated with Zod before model writes.
- Access tokens are short-lived. Refresh tokens are HttpOnly cookies, rotate per use, and are stored only as hashes. Reuse invalidates the session family.
- All data mutations require authentication and ownership checks. Public profile/share responses are purpose-built projections.
- A per-session CSRF token is double-submitted in a readable cookie and request header. CORS is restricted to `CORS_ORIGINS`; cookies are SameSite and secure in production.
- Helmet, rate limits, input bounds, and API error middleware protect the HTTP boundary.
- Provider credentials remain server-only. TMDB and AniList scores are kept distinct and are never substituted for one another.
- Production deployment still requires HTTPS, strong unique secrets, a restricted database user, backups, origin allowlisting, and a reviewed Google OAuth configuration.
