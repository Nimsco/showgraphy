# Stitch design system

Source of truth: the private Google Stitch project **Showgraphy Cinematic Dashboard** (`projects/4332847054380189031`) and its **Showgraphy Archival Journal** design system. The Stitch project contains journal, discovery, library, collections, title detail, sign-in, profile, insights, and settings screens.

## Tokens

| Role | Value |
|---|---|
| Canvas | `#11101A` |
| Surface | `#1B1926` |
| Elevated surface | `#282438` |
| Orchid action | `#A78BFA` |
| Coral progress and rating | `#FF8E83` |
| Main text | `#F6F3FC` |
| Secondary text | `#A39EB8` |
| Muted metadata | `#6B6582` |
| Headline | Newsreader |
| Interface and body | Manrope |
| Metadata | JetBrains Mono |
| Control radius | 4px |

Use clear editorial hierarchy, poster art at 2:3, restrained borders, and generous spacing. Layouts reflow from full-width desktop grids to two-column mobile poster grids. Avoid decorative gradients, glass effects, and glow. Keep progress and ratings grounded in the viewer's real data; identify estimates as estimates.

## Implementation notes

The Stitch screens are design references. Functional React pages use the same tokens while preserving real routes, account data, accessible controls, loading and error states, and user privacy. Do not copy sample names, fabricated activity, ratings, statistics, or review text from design mockups into the application.
