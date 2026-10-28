# Leboncoin Search Helper

A userscript that adds one-click price-comparison and spec-sheet shortcuts to [leboncoin.fr](https://www.leboncoin.fr), directly next to listing titles.

[![Userscript](https://img.shields.io/badge/userscript-v2.7-blue)](leboncoin-search-helper.user.js)
[![License: MPL 2.0](https://img.shields.io/badge/license-MPL%202.0-brightgreen)](LICENSE)
[![No dependencies](https://img.shields.io/badge/dependencies-none-lightgrey)](#how-it-works)

Leboncoin tells you what a seller is asking, never whether it is a fair price. This script puts the relevant lookups one click away, so you never retype a listing title into another tab.

## Contents

- [What it does](#what-it-does)
- [Installation](#installation)
- [Usage](#usage)
- [Configuration](#configuration)
- [How it works](#how-it-works)
- [Known limitations](#known-limitations)
- [License](#license)

## What it does

Badges are injected in front of listing titles. Which ones you get depends on the listing category.

### Car listings

| Badge | Opens |
| --- | --- |
| `AR` | Argus spec sheet |
| `CA` | Caradisiac spec sheet |
| `LC` | La Centrale spec sheet |
| `EN` | Encycarpedia spec sheet |
| `Fiche IA` | Google AI Mode, prompted for a colour-coded technical table |

On a car listing page, the query is enriched with criteria the title leaves out — model, registration year, gearbox, trim, version and horsepower — all read from the listing itself.

### Every other listing

| Badge | Opens |
| --- | --- |
| Arrow icon | Google search |
| `EB` | eBay.fr search |
| `AM` | Amazon.fr search |
| `GS` | Google Shopping |

Unlike the spec-sheet badges, which run a Google search with a suffix, these query each marketplace's own search engine, so results are usable straight away.

Both sets work on individual listing pages **and** on search results, where every card gets its own badges.

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) for your browser.
2. Open [`leboncoin-search-helper.user.js`](leboncoin-search-helper.user.js) and click **Raw**.

Tampermonkey picks up the install prompt automatically. Updates are served through `@updateURL`, so later versions are offered without reinstalling.

## Usage

Open any listing or run a search. Badges appear in front of the title; clicking one opens the matching search in a new tab without leaving Leboncoin, and without triggering the listing link underneath.

## Configuration

Everything you are likely to change sits in the constants at the top of the script.

Adding a marketplace takes one entry:

```js
const PRODUCT_SEARCH_SOURCES = [
    {
        badge:   'BC',
        colour:  '#cc0000',
        tooltip: 'Rechercher sur Backmarket',
        buildUrl: query => `https://www.backmarket.fr/fr-fr/search?${new URLSearchParams({ q: query }).toString()}`,
    },
];
```

| Constant | Purpose |
| --- | --- |
| `PRODUCT_SEARCH_SOURCES` | Marketplaces shown on non-car listings |
| `SPEC_SHEET_SOURCES` | Spec-sheet sources shown on car listings |
| `QUERY_BLACKLIST` | Sales fluff stripped from queries (`urgent`, `neuf`, `sous blister`, …) |
| `CAR_CRITERIA_IDS` | Listing criteria used to enrich car queries |
| `AI_TABLE_ROWS` | Rows and colour thresholds requested from Google AI Mode |

## How it works

No build step, no bundler, no external library — a single `.user.js` file of plain DOM code.

Leboncoin is a single-page app that renders listings after the initial HTML, so the script combines a bounded retry loop with a debounced `MutationObserver`. On search results this also covers pagination and newly loaded cards; each card is flagged once it has been handled, so re-scans stay cheap and never duplicate badges.

Result cards are fully covered by an absolutely positioned link. Badges are given their own stacking context so they stay clickable, and their handlers stop the event from reaching that link.

## Known limitations

- Selectors track Leboncoin's current markup and will need updating when the site changes.
- On search results, car queries use the title alone: the extra criteria only exist on the listing page.
- Query filtering is accent-sensitive, so `très bon état` is stripped while `tres bon etat` is not.

## License

[Mozilla Public License 2.0](LICENSE).
