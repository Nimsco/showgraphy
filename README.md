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

The Vite app runs at `http://localhost:5173`; the API runs at `http://localhost:5000/api`. In development, Vite proxies HTTP `/api` requests to the API. Other LAN devices can use `http://<your-computer-LAN-IP>:5173`; for Global Chat, set `VITE_SOCKET_URL=http://<your-computer-LAN-IP>:5000` and allow inbound TCP port 5000 through the computer firewall as well. Leave `VITE_API_BASE_URL` blank for the proxied HTTP setup. Build with `npm run build`, typecheck with `npm run typecheck`, and run automated tests with `npm test`.

The public landing page runs without a database. The root dev command keeps Vite running even when the API stops for missing MongoDB or secrets; use `npm run dev:web` to run only the UI. Sign-in and account features require the API configuration above.

## Global Chat deployment

Global Chat uses Socket.IO over a direct WebSocket connection to the Render web service. Socket.IO was selected over native `ws` because this app needs reconnects, message acknowledgements, and room broadcasts; `ws` would require implementing those pieces separately. The existing Vercel `/api` rewrite remains for HTTP requests and refresh-cookie handling. The browser connects to Render directly, so the app does not depend on an external rewrite preserving WebSocket upgrade headers. Render accepts inbound WebSockets on the same web-service port as the API. Socket.IO is restricted to the WebSocket transport and validates the browser origin and the in-memory access JWT during the handshake.

Set the public Vite variable `VITE_SOCKET_URL` to `http://localhost:5000` for local development and `https://showgraphy.onrender.com` in Vercel Preview/Production environments (or your Render custom domain). Vite converts the HTTPS origin to WSS for the socket. Add the exact frontend origin, such as `https://showgraphy.vercel.app`, to the Render `CORS_ORIGINS` list; `FRONTEND_URL` and `CLIENT_URL` should also be set to the production frontend origin as they are for the existing app. Redeploy both services after changing these values because Vite embeds its public environment values at build time.

The socket handshake sends the short-lived access JWT in Socket.IO's auth payload. It never sends the refresh cookie to JavaScript. On token expiry, the client rotates the existing HttpOnly refresh cookie through the same-origin `/api/auth/refresh` path, then reconnects with the new access token. Temporary network failures reconnect with backoff without clearing the user's session. Each user can hold up to five chat tabs; sends are limited to five messages per 10 seconds and 20 per minute.

HTTP API: `GET /api/chat/messages?limit=50&before=<id>` returns the latest history page or older messages; `after=<id>` returns newer messages after reconnect. `POST /api/chat/messages/:id/report` files a report. Socket events from the client are `chat:send`, `chat:delete`, and `chat:typing`; server events are `chat:message`, `chat:presence`, `chat:typing`, and `chat:auth-expired`. Messages persist in MongoDB, use a unique author/client-message ID index for retry deduplication, and are returned oldest-first within each page.

Production smoke test: open Global Chat from two signed-in browsers, confirm both show connected status, send a message and confirm it appears in both, then open a third tab in the same account and verify the online count still counts that account once. Keep the chat open past the access-token lifetime to verify refresh and reconnect, then disconnect one of the same-account tabs and confirm the user remains online until the last tab closes. Check the browser Network panel for a `wss://showgraphy.onrender.com/socket.io/` connection. A healthy `/health` response checks the HTTP process only; it does not verify a WebSocket handshake.

Keep the Render backend at one instance for this initial version. Messages are stored in MongoDB, but online presence, typing, and live broadcast fan-out are held in process memory. When scaling Render to multiple instances, add a Socket.IO Redis adapter and shared presence/rate-limit storage before increasing the instance count. Reports are persisted for review, but this repository has no admin role or moderation dashboard yet; disabled accounts are rejected at connection and send time.

## Optional integrations

- **TMDB catalog and ratings:** set `TMDB_API_KEY` or `TMDB_READ_ACCESS_TOKEN` on the server. Search and detail metadata, community vote averages, and vote counts are fetched by the API. The browser never receives the key.
- **AniList:** configure `ANILIST_GRAPHQL_URL`. Anime metadata, average and mean scores, and AniList popularity are fetched through the public GraphQL API; AniList client credentials are not needed for public data.
- **Provider credits:** TMDB attribution is included in the app footer. TMDB requires its logo and the notice that the product is not endorsed or certified by TMDB.
- **Google sign-in:** set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_CALLBACK_URL`. For LAN devices, Google requires a public HTTPS callback host, and its exact callback URI must be registered in the OAuth client. Add that host as `FRONTEND_URL` too. The app forwards the browser host through Vite and returns the OAuth result to the same host.
- **Email:** Configure `SMTP_HOST`, `SMTP_PORT`, optional SMTP credentials, `SMTP_SECURE`, and `SMTP_FROM` to send verification and password recovery links. Recovery requests always use a neutral response. Until SMTP is configured, email actions are safely unavailable.

## Security and data

Passwords use Argon2id. Access JWTs stay in memory in the browser. A rotated refresh JWT is stored only as an HttpOnly cookie, with its hash and session family stored in MongoDB. Cookie writes use same-site controls, CORS allowlisting, and a double-submit CSRF token. Account-owned library entries, lists, ratings, privacy settings, and shares are scoped server-side. Share secrets are random and only their hashes are stored.

Use HTTPS, production secrets, a restricted MongoDB user, and a production origin allowlist before deployment. Set `COOKIE_SECURE=true` in production.

## Project map

`client/` contains the responsive React app. `server/` contains the Express API, Mongoose models, provider adapters, auth, and routes. `docs/architecture.md`, `docs/database-schema.md`, `docs/api-documentation.md`, `docs/security.md`, and `docs/design-system.md` cover implementation details.

## Current service boundaries

Core tracking and manual entries do not depend on a catalog provider. Missing TMDB credentials disable TMDB-backed catalog search. AniList public catalog lookup remains available through its GraphQL endpoint. MongoDB is required for API startup.
