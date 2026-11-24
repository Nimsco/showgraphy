# Showgraphy UX audit

## Scope reviewed

Reviewed the route map and shared shell, typography and theme tokens, responsive rules, and the page components for the landing and auth flows, journal, discovery, library, title details, collections, insights, profiles, settings, community feed/search/discussions, people, activity, notifications, message inbox/private threads, and Global Chat. Also traced shared forms, dialogs, empty/error states, post/comment threads, and mobile navigation in the frontend source. Checked the signed-in inbox and private conversation in Brave at `showgraphy.vercel.app`.

## Main findings before implementation

- The project already has Newsreader, Manrope, and JetBrains Mono, semantic type variables, a Small/Default/Large preference, account persistence, and an early local preference bootstrap. Those are the right foundations and will be retained.
- Most ordinary metadata and many labels still use fixed 12px text. Post bodies, private messages, and Global Chat messages use 13px; Community comments use 14px. Those reading surfaces need more comfortable defaults, and the 12px mobile overrides need to stop shrinking important text.
- Dark and light theme text tokens are generally distinguishable. The weakest hierarchy comes from very small text and dense spacing, especially timestamps, conversation previews, comments, category controls, and helper copy.
- The inbox API already sorts by most recent activity, but the page only shows an unread dot and the app navigation has no unread-message count. Each conversation needs a numeric unread badge, plus a total unread-conversation count in navigation.
- In the open private thread, the explicit Profile link duplicates the clickable avatar and username. Report/edit/delete controls are exposed in the accessibility tree for every message; on mobile the CSS makes them permanently visible. Message text and composer text are small.
- The Community thread UI sends the selected comment ID for every reply depth. The backend currently accepts active comments as parents, but its error path and nested reply hydration need to preserve and display replies to replies reliably.
- Settings currently asks for an image URL. It needs a device picker backed by signed Cloudinary uploads, as does the private-message composer for attachments.
- The app uses a compact dark archival style with working semantic colors and 44px shared buttons. The implementation will keep its existing palette, fonts, radii, and page structure while widening reading text and improving mobile wrapping and chat spacing.

## Changes guided by this audit

Use the existing centralized text-scale preference and semantic tokens; raise common metadata and reading text through shared styles. Add unread-message counts to inbox rows and navigation, keep the latest conversations first, repair nested comment reply loading, and improve the mobile chat header, message actions, and composer. Add signed Cloudinary image uploads for private messages and profile pictures selected from a device.
