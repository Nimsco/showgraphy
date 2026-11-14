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

Pagination responses include `items`, `page`, `limit`, and `total`.
