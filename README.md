# Showgraphy

Showgraphy is a TypeScript MERN app for keeping a personal record of the movies and shows you watch. It supports library statuses and episode progress, custom collections, share links, personal and community ratings, privacy-aware profiles, and viewing statistics.

The UI direction and screen references are maintained in the private Google Stitch project **Showgraphy Cinematic Dashboard** (`projects/4332847054380189031`). The local functional pages follow its Archival Journal design system.

## Local setup

Requirements: Node.js 20.19+ or 22.12+, npm, and a MongoDB database. Copy `server/.env.example` to `server/.env` and `client/.env.example` to `client/.env`. Put the MongoDB connection string in `MONGODB_URI`. Generate separate random values for `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, and `CSRF_SECRET` before running locally. `.env` files are ignored by Git.

Set `VITE_SITE_URL` in `client/.env` to the canonical deployed origin before a production build so share metadata points to the right site.

```powershell
npm install
npm run dev
```

The Vite app runs at `http://localhost:5173`; the API runs at `http://localhost:5000/api`. Build with `npm run build`, typecheck with `npm run typecheck`, and run automated tests with `npm test`.

The public landing page runs without a database. The root dev command keeps Vite running even when the API stops for missing MongoDB or secrets; use `npm run dev:web` to run only the UI. Sign-in and account features require the API configuration above.

## Optional integrations

- **TMDB catalog and ratings:** set `TMDB_API_KEY` or `TMDB_READ_ACCESS_TOKEN` on the server. Search and detail metadata, community vote averages, and vote counts are fetched by the API. The browser never receives the key.
- **AniList:** configure `ANILIST_GRAPHQL_URL`. Anime metadata, average and mean scores, and AniList popularity are fetched through the public GraphQL API; AniList client credentials are not needed for public data.
- **Provider credits:** TMDB attribution is included in the app footer. TMDB requires its logo and the notice that the product is not endorsed or certified by TMDB.
- **Google sign-in:** set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_CALLBACK_URL`.
- **Email:** Configure `SMTP_HOST`, `SMTP_PORT`, optional SMTP credentials, `SMTP_SECURE`, and `SMTP_FROM` to send verification and password recovery links. Recovery requests always use a neutral response. Until SMTP is configured, email actions are safely unavailable.

## Security and data

Passwords use Argon2id. Access JWTs stay in memory in the browser. A rotated refresh JWT is stored only as an HttpOnly cookie, with its hash and session family stored in MongoDB. Cookie writes use same-site controls, CORS allowlisting, and a double-submit CSRF token. Account-owned library entries, lists, ratings, privacy settings, and shares are scoped server-side. Share secrets are random and only their hashes are stored.

Use HTTPS, production secrets, a restricted MongoDB user, and a production origin allowlist before deployment. Set `COOKIE_SECURE=true` in production.

## Project map

`client/` contains the responsive React app. `server/` contains the Express API, Mongoose models, provider adapters, auth, and routes. `docs/architecture.md`, `docs/database-schema.md`, `docs/api-documentation.md`, `docs/security.md`, and `docs/design-system.md` cover implementation details.

## Current service boundaries

Core tracking and manual entries do not depend on a catalog provider. Missing TMDB credentials disable TMDB-backed catalog search. AniList public catalog lookup remains available through its GraphQL endpoint. MongoDB is required for API startup.
