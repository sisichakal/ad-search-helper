# Ad Search Helper

A userscript adding one-click price-comparison and spec-sheet shortcuts to classified ads on [leboncoin.fr](https://www.leboncoin.fr) and [lacentrale.fr](https://www.lacentrale.fr), right next to listing titles.

[![Userscript](https://img.shields.io/badge/userscript-v3.0-blue)](ad-search-helper.user.js)
[![License: MPL 2.0](https://img.shields.io/badge/license-MPL%202.0-brightgreen)](LICENSE)
[![No dependencies](https://img.shields.io/badge/dependencies-none-lightgrey)](#how-it-works)

A listing tells you what the seller is asking, never whether it is a fair price. This script puts the relevant lookups one click away, so you never retype a listing title into another tab.

## Contents

- [What it does](#what-it-does)
- [Where it runs](#where-it-runs)
- [Installation](#installation)
- [Configuration](#configuration)
- [How it works](#how-it-works)
- [Adding a site](#adding-a-site)
- [Known limitations](#known-limitations)
- [License](#license)

## What it does

Badges appear in front of the listing title. Which ones depends on what is being sold.

### Car listings

| Badge | Opens |
| --- | --- |
| `AR` | Argus spec sheet |
| `CA` | Caradisiac spec sheet |
| `LC` | La Centrale spec sheet |
| `EN` | Encycarpedia spec sheet |
| `Fiche IA` | Google AI Mode, prompted for a colour-coded technical table |

The query is enriched with criteria the title leaves out — model, year, gearbox, trim, fuel, power — read from the listing itself. On Leboncoin the "voir plus de critères" block is expanded first, since it hides half of them.

### Every other listing

| Badge | Opens |
| --- | --- |
| Arrow icon | Google search |
| `EB` | eBay.fr search |
| `AM` | Amazon.fr search |
| `GS` | Google Shopping |

These hit each marketplace's own search engine rather than going through Google, so results are usable straight away. They only appear on Leboncoin: La Centrale sells nothing but cars.

Sales filler is stripped from every query — `urgent`, `neuf`, `sous blister`, `ct ok`, `garantie N mois`, `très bon état` — accents or not, since plenty of listings are typed without them.

## Where it runs

- `leboncoin.fr/ad/*` — individual listings
- `leboncoin.fr/recherche*` — results pages, where every card gets its own badges
- `lacentrale.fr/auto-occasion-annonce-*` — individual listings

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) for your browser.
2. Open [`ad-search-helper.user.js`](ad-search-helper.user.js) and click **Raw**.

Tampermonkey picks up the install prompt automatically. Updates are served through `@updateURL`, so later versions are offered without reinstalling.

> **Upgrading?** Remove *Leboncoin Search Helper* and *La Centrale Search Helper* first, or both sets of badges will show up.

## Configuration

Everything you are likely to change sits in the constants at the top of the script.

| Constant | Purpose |
| --- | --- |
| `PRODUCT_SEARCH_SOURCES` | Marketplaces shown on non-car listings |
| `SPEC_SHEET_SOURCES` | Spec-sheet sources shown on car listings |
| `QUERY_BLACKLIST` | Sales filler stripped from queries |
| `AI_TABLE_ROWS` | Rows and colour thresholds requested from Google AI Mode |

Adding a marketplace takes one entry:

```js
{
    badge:   'BC',
    colour:  '#cc0000',
    tooltip: 'Rechercher sur Backmarket',
    buildUrl: query => `https://www.backmarket.fr/fr-fr/search?${new URLSearchParams({ q: query }).toString()}`,
}
```

## How it works

A single `.user.js` file of plain DOM code: no build step, no bundler, no external library.

Both sites do the same job — read a listing, build an enriched query, open the searches — so everything outside the site adapters is shared. An adapter only says where its site keeps the title and the criteria, and which badges belong there.

Both are single-page apps that render listings after the initial HTML, so the script combines a bounded retry loop with a debounced `MutationObserver`. On Leboncoin results this also covers pagination and newly loaded cards; each card is flagged once handled, so re-scans stay cheap and never duplicate badges.

Result cards are fully covered by an absolutely positioned link. Badges are given their own stacking context so they stay clickable, and their handlers stop the event from reaching that link.

Query filtering runs on an accent-free copy of the title, then splices the matched ranges out of the original, so `Citroën` survives untouched while `tres bon etat` is removed just like `très bon état`.

## Adding a site

Add an `@match` line and an entry to `SITES`:

```js
const MY_SITE = {
    key: 'example', host: 'example.com',
    titleSelectors: ['h1'],
    isCarAd: () => true,
    showMarketplaces: false,
    expandCriteria: () => Promise.resolve(),
    criteriaValues: () => [],
    hasSearchPage: false,
};
```

Optional: `queryTitleSelectors` when the page carries a cleaner model line than its heading, and `cleanTitle` to strip noise such as a trailing ad reference.

## Known limitations

- Selectors track each site's current markup and will need updating when it changes.
- A criterion is skipped when the title already contains one of its words longer than two characters. That keeps queries short, but it also drops a power rating whose number happens to appear in the title.
- On Leboncoin results, car queries use the card title alone: the extra criteria only exist on the listing page.

## History

Supersedes two scripts that read a listing and built a search query from it in the same way:

- `Leboncoin-Search-Helper` — this repository, renamed, up to v2.8
- `La-Centrale-Search-Helper` — merged in, repository removed

La Centrale gained the four spec-sheet badges and the AI button in the merge, having previously offered a single hardcoded Argus link.

## License

[Mozilla Public License 2.0](LICENSE).
