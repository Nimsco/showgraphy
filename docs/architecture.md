# Architecture

## Runtime

The root npm workspace contains a Vite React client and an Express 5 TypeScript API. The client uses React Router, TanStack Query, React Hook Form, Zod, and semantic CSS tokens. The API uses Mongoose, Zod configuration/request validation, Argon2id, signed JWTs, secure cookies, Helmet, CORS allowlisting, and per-route rate limits. Global Chat adds a Socket.IO server attached to the same Node HTTP server as Express.

## Boundaries

- `server/src/config`: validated environment and Mongo connection.
- `server/src/models`: durable users, titles, sessions, library entries, lists, shares, ratings, chat messages, and chat reports.
- `server/src/services`: authentication, catalog-provider normalization, list sharing, and aggregate calculations.
- `server/src/routes`: versioned REST API groups.
- `server/src/realtime`: socket authentication, ephemeral presence and typing, and live message fan-out.
- `client/src/lib`: typed HTTP client and theme/auth integration.
- `client/src/pages`: landing, authentication, journal, discovery, library, collections, profile, statistics, settings, and Global Chat.

## Authentication

Registration creates a user and a default My Watchlist. Login returns a short-lived access JWT in JSON and sets a rotating refresh JWT as an HttpOnly cookie. Only the refresh-token hash is stored in MongoDB. Refresh validates the session and replaces it. Reuse revokes the whole family. The browser holds access JWTs only in memory and calls refresh after a reload. Mutating cookie-backed flows use a double-submit CSRF token.

## Catalog and ratings

TMDB and AniList are provider adapters behind the API. Results normalize to `MediaTitle`; provider keys never enter the client. TMDB scores remain on a 10 point scale with vote counts, while AniList average and mean scores remain on their 100 point scale. Manual entries are marked `metadataSource=manual`. Community rating aggregates are calculated by MongoDB on the server.

## Data flow

The client requests paginated resources with TanStack Query. Writes are validated again at the API boundary, scoped by authenticated user, and followed by relevant query invalidation. Public profile and share routes use explicit response projections rather than exposing user documents.

## Global Chat transport

The browser connects directly to the Render web service over WSS; HTTP history and reports continue through the same-origin Vercel `/api` rewrite. Socket authentication uses the access JWT in the Socket.IO auth payload, then checks its session and account in MongoDB. On access expiry, the client uses the existing refresh-cookie API and reconnects. Messages persist before broadcast and duplicate retries use a unique client-message index. Presence, typing, and room fan-out are in-process state, so keep one Render instance until a Socket.IO Redis adapter and shared state are configured.
