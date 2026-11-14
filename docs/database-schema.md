# Database schema

All models use timestamps and explicit indexes. IDs are Mongo ObjectIds. The user owns personal records through `userId`.

| Model | Purpose and key constraints |
|---|---|
| User | Identity, Argon2id hash (optional for Google-only users), profile, visibility, per-section privacy, theme preference. Unique normalized email and username. |
| RefreshSession | Hashed refresh token, `jti`, family, user, replacement, revocation, expiration, user agent, IP. TTL on `expiresAt`; indexed by family and user. |
| MediaTitle | Normalized title, alternate names, flexible category tags, movie/series type, origin, language, genre, images, dates, episode metadata, provider IDs, TMDB/AniList scores, community score, metadata source. Provider IDs indexed uniquely where present; text search index. |
| UserLibraryEntry | User/title pair, status, progress, notes, personal rating, dates, rewatches. Unique `(userId,titleId)`. |
| UserList | Owner, slug/name, visibility, type, ordered title references, shareable description and image. Unique `(userId,slug)`. |
| ListShare | List/owner, hashed high-entropy token, expiration and revocation. Lookup by hash; share tokens are never stored in clear text. |
| CommunityRating | User/title/rating. Unique `(userId,titleId)`; the title aggregate is computed server-side. |
| EmailActionToken | Hashed one-use email verification or password reset token with expiration and consumption timestamp. TTL on `expiresAt`; raw tokens are sent only by email. |
| ChatMessage | Global room text, author and client-message ID, username/avatar snapshot, timestamps, and soft-delete timestamp. Unique `(authorId,clientMessageId)` supports safe retries; `(createdAt,_id)` supports cursor history. |
| ChatReport | One report per `(messageId,reporterId)`, with a validated reason, optional details, status, and timestamps. |

Relationships: a user has many library entries, lists, refresh sessions, and community ratings. Entries and ratings reference one normalized title. Lists contain ordered title references. Shares reference one list and its owner. Deleting an account removes owned records, shares, and sessions; ratings can be removed or anonymized by the account deletion service.

Catalog caching and an activity log remain optional follow-up models. Email verification and password reset tokens are included in `EmailActionToken`.
