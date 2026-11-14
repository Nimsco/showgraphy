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
