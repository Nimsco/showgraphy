# API

Base path: `/api`. JSON errors use `{ "message": "..." }`. Authenticated routes use `Authorization: Bearer <access-token>`. Send cookies and the readable `sg_csrf` token in `X-CSRF-Token` for mutating requests.

## Authentication

- `GET /auth/csrf`: issue a CSRF token.
- `POST /auth/register`: create an account and default watchlist.
- `POST /auth/login`: password login.
- `POST /auth/refresh`: rotate the refresh cookie and return a new access token.
- `POST /auth/logout`: revoke the current refresh family.
- `GET /auth/me`: current user projection.
- `POST /auth/password/forgot`: request a recovery link; always returns a neutral accepted response.
- `POST /auth/password/reset`: consume a one-use, expiring password reset token and revoke sessions.
- `POST /auth/verify-email`: verify an email using a one-use token.
- `POST /auth/verify/resend`: resend verification mail for the signed-in account.
- `GET /auth/google`, `GET /auth/google/callback`: optional Google OAuth.

## Catalog, library, and ratings

- `GET /catalog/search?q=&category=&page=`: provider-backed search; disabled provider list is included when keys are missing.
- `POST /catalog/manual`: create a manual title.
- `GET /catalog/:id`: provider title metadata, TMDB and AniList scores when available, and separate Showgraphy community scores.
- `GET /library?status=&category=&q=&sort=&page=`; `POST /library`; `PATCH /library/:id`; `DELETE /library/:id`.
- `PUT /titles/:id/rating`: create or update the signed-in user's community rating; `DELETE /titles/:id/rating` removes it.

## Lists and profiles

- `GET /lists`, `POST /lists`, `PATCH /lists/:id`, `DELETE /lists/:id`, `POST /lists/:id/items`, `DELETE /lists/:id/items/:titleId`.
- `POST /lists/:id/share`: create a share token; `DELETE /lists/:id/share`: revoke active shares; `GET /shares/:token`: public view if valid.
- `GET /profiles/:username`: public profile with private fields and hidden sections removed.
- `PATCH /users/me`: profile, privacy, and theme preference update.
- `GET /stats`: current user's privacy-aware statistics.

## Social community

All `/social` routes require an access token.

- `GET /social/people?q=&page=&limit=` searches usernames or returns recent public members; blocked users and private profiles are excluded.
- `POST /social/users/:username/follow`, `DELETE /social/users/:username/follow`; `GET /social/users/:username/status` returns server-derived counts and relationship state.
- `GET /social/users/:username/followers|following|mutual?page=&limit=` returns paginated public connections.
- `POST /social/users/:username/block`, `DELETE /social/users/:username/block`; `GET /social/blocks` lists blocked members.
- `GET /social/feed?page=&limit=` combines completed titles, reviews, and ratings from followed members while applying each member's activity privacy settings.
- `GET /social/notifications?page=&limit=&unread=` returns notifications and the unread count; `PATCH /social/notifications/:id/read` and `PATCH /social/notifications/read-all` update read state.
- `GET /social/conversations?page=&limit=&requests=` returns the inbox or received requests; `POST /social/conversations/:username` creates or returns a unique participant pair.
- `GET /social/conversations/:conversationId` returns the authorized other participant and request state.
- `GET /social/conversations/:conversationId/messages?limit=&before=` returns authorized history; `POST /social/conversations/:conversationId/messages` sends idempotent, rate-limited text messages; `PATCH|DELETE /social/conversations/:conversationId/messages/:messageId` edit or soft-delete a sender-owned message and notify both participants over the existing socket event; `PATCH /social/conversations/:conversationId/{accept|decline|read}` handles requests and read state.
- `POST /social/reports` reports a member or a message in a conversation.

## Community

All `/community` routes require an access token and reuse the existing User, MediaTitle, Follow, Block, Notification, and SocialReport collections.

- `GET /community/posts?feed=discover|following|trending&page=&limit=&category=&titleId=&author=&sort=recent|popular` returns a paginated feed. Discover and Following are chronological. Trending uses the recency-decayed score documented in `architecture.md`; title-specific discussions can use `sort=popular`.
- `POST /community/posts` creates a post with a required text title, optional body text, one validated entertainment category, optional canonical movie/series references, verified image references, mentions, spoiler metadata, and/or a poll. Categories default to General. `PATCH /community/posts/:postId` and `DELETE /community/posts/:postId` are author-only.
- `GET /community/posts/:postId` returns a discussion and the signed-in user's like, bookmark, and poll state.
- `POST|DELETE /community/posts/:postId/like`, `POST|DELETE /community/posts/:postId/bookmark`, and `POST /community/posts/:postId/poll-vote` update persistent interactions. Poll votes are single-choice and cannot be changed; vote totals are grouped from vote records.
- `GET|POST /community/posts/:postId/comments` paginates top-level comments and includes each thread's reply count plus its first two replies. `GET /community/posts/:postId/comments/:commentId/replies?page=&limit=` returns one page of direct replies, including counts and previews of their own replies. `parentCommentId` may reference any available comment in the same post, supporting threaded replies at any depth. `PATCH|DELETE /community/comments/:commentId` are author-only. `POST /community/posts/:postId/report` and `POST /community/comments/:commentId/report` submit moderation reports to SocialReport.
- `GET /community/posts/saved?page=&limit=` returns private bookmarks; `GET /community/search?q=&page=&limit=` searches post titles and body text, with an optional category filter. Title search uses `/catalog/search`; People search and follow actions use `/social/people` and `/social/users/:username/follow`.
- `POST /community/uploads/signature` issues an authenticated signed Cloudinary upload scoped to the current account and records a 72-hour cleanup reservation. The client uploads directly to Cloudinary with progress. `POST /community/uploads/delete` removes an unattached draft upload. Post creation verifies each image with Cloudinary before persisting its metadata and consumes its reservation. A server cleanup pass deletes expired, unattached assets.

Community image delivery requires `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` on the server. Upload controls report a configuration error until all three are set. No storage secret is exposed to the client.

The same Render Socket.IO process authenticates private messaging with the existing short-lived access token. Client events are `dm:join`, `dm:send`, `dm:typing`, and `dm:read`; server events are `dm:message`, `dm:typing`, `dm:read`, and `social:notification`. Direct messages use private conversation rooms and re-check participant/block state before joining and sending.

## Global Chat

- `GET /chat/messages?limit=50&before=<messageId>` returns the latest messages or the older page before a message cursor. `after=<messageId>` returns newer messages for reconnect catch-up. Limits are 1-100 and results are ordered oldest-first.
- `POST /chat/messages/:id/report` files one report per user and message.
- Socket.IO connects directly to the Render service at `/socket.io/` using the short-lived in-memory access JWT in the handshake auth payload. The Vercel `/api` rewrite is used by HTTP routes and is not used for the socket.
- Client events: `chat:send` (acknowledged, idempotent client UUID), `chat:delete` (owner-only), and `chat:typing` (ephemeral).
- Server events: `chat:message` (new or deleted message), `chat:presence` (unique online-user count), `chat:typing`, and `chat:auth-expired`.

Catalog and library responses include their resource totals. Social pages return `items`, `page`, and `hasMore`; message history uses `items` and `hasMore` with a message cursor.
