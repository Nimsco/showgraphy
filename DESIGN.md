# Brief

Request, word for word:
“i also should have option to remove something from my watchlist. in insights i want to categorize dramas in different category like movies series kdrama cdrama jdrama anime. is it possible to do this?if yes do it. and also i want a share button on insights which i can share as a picture of the screen containing all my stats like how many movies or series completed how many watching how many total hours watched,etc. also make featured titles choosing upto 10 titles and call it {username}'s top 10 in the profile. and also can you add other color themes in the settings also that would make ux better as now its only purpledark or light.”

Product: Showgraphy, a personal record of movies and series.
For: People tracking what they watch, who want useful totals and a profile they can share.
World: cinema, posters, archive.
The one thing: a personal viewing recap with a clear breakdown and a shareable stats image.
Ambition: finished, because the user asked to implement the complete set of features.
Mode: Kit, refining the existing product.
Named aesthetic: none. “Anime” names a media category, not a visual style.
Default set aside: one palette for the whole product, because the user asked for several selectable color themes.
Stack: Existing React, TypeScript, Express, and MongoDB app.
Missing: Runtime estimates can be incomplete when title metadata is missing.

Hard limits:
- Preserve the existing Showgraphy Archival Journal system and its current data boundaries.
- Use actual account and library data. Never invent stats.
- Keep category counts explicit about overlapping categories and runtime estimates.
- Keep the UI usable by keyboard and on narrow screens.

Done means: remove a title from the watchlist, classify library titles in Insights, share a PNG recap of all stats, feature up to ten titles under the username's Top 10 on the profile, and select additional persistent color themes in Settings.

Sources: Existing Showgraphy Archival Journal below; [Year-in-review story cards](https://www.designlounge.live/demo/card-wrapped-story) for the shareable stats composition; [Copy and share controls](https://www.designlounge.live/demo/button-copy-share) for share feedback; [Settings page](https://www.designlounge.live/demo/settings-page-sticky-nav) and [Creator profile masthead](https://www.designlounge.live/demo/profile-creator-masthead) for grouping and profile hierarchy, adapted to the existing system.

# Showgraphy — Stitch design direction

The live Stitch project is **Showgraphy Cinematic Dashboard** (`projects/4332847054380189031`). The interface follows its *Showgraphy Archival Journal* system: a calm, dark cinema archive with editorial typography, disciplined poster layouts, and useful viewing progress.

## Tokens

- Canvas `#11101A`; panels `#1B1926`; elevated surfaces `#282438`.
- Orchid `#A78BFA` marks primary actions and selected states. Coral `#FF8E83` marks progress and ratings. Text `#F6F3FC`, secondary text `#A39EB8`, metadata `#6B6582`.
- Newsreader for display headings, Manrope for interface and body, JetBrains Mono for compact metadata.
- 4px control radius, 1px borders, and planar surfaces. Keep the interface free of gradients, glow effects, and frosted glass.

## Screen structure

- The journal prioritizes the current title and its progress, with recent entries and user collections below.
- Discovery leads with search, category filters, and a readable poster grid.
- The library keeps status and progress visible in a compact ledger.
- Title details center artwork and synopsis, then separate personal and community ratings.
- Collections, insights, profile, settings, and sign-in share the same typography, spacing, borders, and interaction states.

Use real account data. Never ship sample counts, ratings, activity, or reviews as if they belong to a viewer. Keep keyboard focus visible, touch targets comfortable, and layouts usable on narrow screens.

## Appearance themes

Keep Midnight Orchid as the default. The Clear Light palette uses neutral white and gray surfaces with a deep orchid accent. Other dark palettes use distinct, opaque blue-green, green, plum, and warm-brown surface undertones, with brighter hues reserved for controls and selected states. Keep clear separation between the canvas, panels, and raised surfaces; avoid gradients, glow, and glass effects. Text and primary-action pairs are selected to exceed WCAG AA's 4.5:1 contrast target for normal text.

Sources: [Paper & Ink](https://www.designlounge.live/themes/paper-ink) for a readable paper ground, [Night Desk](https://www.designlounge.live/themes/night-desk) for restrained dark surfaces, and [WCAG 2.2 contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum).

## Global Chat

Global Chat extends the Archival Journal system with a chronological message log, grouped sender rows, and a quiet composer. Incoming and outgoing messages use existing surface and primary-soft tokens; user text remains plain text. The message and composer structure is adapted from [Chat thread](https://www.designlounge.live/demo/chat-thread), with the app's existing typography, colors, and controls.
