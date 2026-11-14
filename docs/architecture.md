# Architecture

## Runtime

The root npm workspace contains a Vite React client and an Express 5 TypeScript API. The client uses React Router, TanStack Query, React Hook Form, Zod, and semantic CSS tokens. The API uses Mongoose, Zod configuration/request validation, Argon2id, signed JWTs, secure cookies, Helmet, CORS allowlisting, and per-route rate limits.

## Boundaries

- `server/src/config`: validated environment and Mongo connection.
- `server/src/models`: durable users, titles, sessions, library entries, lists, shares, and ratings.
- `server/src/services`: authentication, catalog-provider normalization, list sharing, and aggregate calculations.
- `server/src/routes`: versioned REST API groups.
- `client/src/lib`: typed HTTP client and theme/auth integration.
- `client/src/pages`: landing, authentication, journal, discovery, library, collections, profile, statistics, and settings.

## Authentication

Registration creates a user and a default My Watchlist. Login returns a short-lived access JWT in JSON and sets a rotating refresh JWT as an HttpOnly cookie. Only the refresh-token hash is stored in MongoDB. Refresh validates the session and replaces it. Reuse revokes the whole family. The browser holds access JWTs only in memory and calls refresh after a reload. Mutating cookie-backed flows use a double-submit CSRF token.

## Catalog and ratings

TMDB and AniList are provider adapters behind the API. Results normalize to `MediaTitle`; provider keys never enter the client. TMDB scores remain on a 10 point scale with vote counts, while AniList average and mean scores remain on their 100 point scale. Manual entries are marked `metadataSource=manual`. Community rating aggregates are calculated by MongoDB on the server.

## Data flow

The client requests paginated resources with TanStack Query. Writes are validated again at the API boundary, scoped by authenticated user, and followed by relevant query invalidation. Public profile and share routes use explicit response projections rather than exposing user documents.
