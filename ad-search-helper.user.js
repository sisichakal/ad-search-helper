// ==UserScript==
// @name         Ad Search Helper
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  Ajoute des raccourcis de recherche sur les annonces Leboncoin et La Centrale : fiches techniques, Google AI Mode, eBay, Amazon et Google Shopping
// @author       You
// @match        https://www.leboncoin.fr/ad/*
// @match        https://www.leboncoin.fr/recherche*
// @match        https://www.lacentrale.fr/auto-occasion-annonce-*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=leboncoin.fr
// @updateURL    https://raw.githubusercontent.com/sisichakal/ad-search-helper/main/ad-search-helper.user.js
// @downloadURL  https://raw.githubusercontent.com/sisichakal/ad-search-helper/main/ad-search-helper.user.js
// @grant        none
// ==/UserScript==

//
// One script, two classified-ad sites.
//
// Both do the same job: read a listing, build an enriched query from it, and
// open the searches that help judge the asking price. Everything outside the
// SITE ADAPTERS section is shared — an adapter only says where its site keeps
// the title and the criteria, and which badges belong there.
//

(function() {
    'use strict';

    // Patterns to strip from any query part (case-insensitive)
    const QUERY_BLACKLIST = [
        /\bct\s+ok\b/i,
        /garantie\s+\d+\s*mois/i,
        /très\s+bon\s+état/i,
        /\bsous\s+blister\b/i,
        /\burgent\b/i,
        /\bneuf\b/i,
    ];

    // Spec-sheet search sources displayed on car ads (array order = display order).
    // Each source is rendered as a short coloured text badge.
    const SPEC_SHEET_SOURCES = [
        {
            suffix:  'fiche argus',
            colour:  '#ff6b35',
            tooltip: 'Rechercher la fiche Argus',
            badge:   'AR',
        },
        {
            suffix:  'fiche technique caradisiac',
            colour:  '#e30613',
            tooltip: 'Rechercher la fiche Caradisiac',
            badge:   'CA',
        },
        {
            suffix:  'fiche technique la centrale',
            colour:  '#0a4a9f',
            tooltip: 'Rechercher la fiche La Centrale',
            badge:   'LC',
        },
        {
            suffix:  'encycarpedia',
            colour:  '#2e7d32',
            tooltip: 'Rechercher la fiche Encycarpedia',
            badge:   'EN',
        },
    ];

    // Colour scale shared with the "Informations Techniques" panel (rendered as emoji dots by the AI)
    const AI_COLOUR_LEGEND = '🟢 bon, 🟠 moyen, 🔴 mauvais, ⚫ très mauvais, ⚪ N/A ou sans seuil';

    // Thresholds shared by the three fuel consumption rows (fuel - electric)
    const CONSUMPTION_COLOURS = '🟢 ≤5 L et ≤15 kWh ; 🟠 ≤6.5 L et ≤18 kWh ; 🔴 ≤8 L et ≤22 kWh ; ⚫ au-delà';

    // Rows requested from Google AI Mode (same layout and colour rules as the "Informations Techniques" panel).
    // Adjust the thresholds in "colours" to match the panel exactly.
    const AI_TABLE_ROWS = [
        { label: 'Longueur / Largeur',              format: '4.42m - 1.83m',          colours: '🟢 L≤4.30m et l≤1.78m ; 🟠 L≤4.40m et l≤1.80m ; 🔴 L≤4.60m ; ⚫ au-delà' },
        { label: 'Poids à vide',                    format: '1250 kg',                colours: '🟢 ≤1300 ; 🟠 ≤1500 ; 🔴 ≤1700 ; ⚫ >1700' },
        { label: 'Volume de coffre + volume utile', format: '475L - 1600L (banquette rabattue)', colours: '🟢 coffre ≥450L ; 🟠 ≥380L ; 🔴 ≥300L ; ⚫ <300L' },
        { label: 'Taille des roues avant',          format: '17"',                    colours: '🟢 ≤16" ; 🟠 17" ; 🔴 18" ; ⚫ ≥19"' },
        { label: 'Puissance réelle maxi',           format: '204 ch',                 colours: '🟢 ≥150 ; 🟠 ≥120 ; 🔴 ≥90 ; ⚫ <90' },
        { label: 'Vitesse maximale',                format: '167 km/h',               colours: '🟢 ≥190 ; 🟠 ≥180 ; 🔴 ≥170 ; ⚫ <170' },
        { label: '0 à 100 km/h',                    format: '8.5 s',                  colours: '🟢 ≤8 ; 🟠 ≤10 ; 🔴 ≤12 ; ⚫ >12' },
        { label: 'Conso Urbain',                    format: '5.2 L/100 km - 16 kWh/100 km', colours: CONSUMPTION_COLOURS },
        { label: 'Conso Mixte',                     format: '5.2 L/100 km - 16 kWh/100 km', colours: CONSUMPTION_COLOURS },
        { label: 'Conso Extra',                     format: '5.2 L/100 km - 16 kWh/100 km', colours: CONSUMPTION_COLOURS },
        { label: 'Réservoir',                       format: '45 L',                   colours: '🟢 ≥50 ; 🟠 ≥40 ; 🔴 ≥30 ; ⚫ <30' },
        { label: 'Architecture',                    format: 'type de motorisation / de moteur électrique', colours: '⚪ toujours' },
    ];

    // Google "udm" parameter value that opens AI Mode instead of the classic results page
    const GOOGLE_AI_MODE_UDM = '50';

    // Google "udm" parameter value that opens the Shopping tab
    const GOOGLE_SHOPPING_UDM = '28';

    // Marketplaces searched on non-car ads (array order = display order).
    // Unlike SPEC_SHEET_SOURCES, these hit each site's own search engine
    // instead of going through Google, so every entry builds its own URL.
    const PRODUCT_SEARCH_SOURCES = [
        {
            badge:   'EB',
            colour:  '#e53238',
            tooltip: 'Rechercher sur eBay.fr',
            buildUrl: query => `https://www.ebay.fr/sch/i.html?${new URLSearchParams({ _nkw: query }).toString()}`,
        },
        {
            badge:   'AM',
            colour:  '#ff9900',
            tooltip: 'Rechercher sur Amazon.fr',
            buildUrl: query => `https://www.amazon.fr/s?${new URLSearchParams({ k: query }).toString()}`,
        },
        {
            badge:   'GS',
            colour:  '#4285f4',
            tooltip: 'Rechercher sur Google Shopping',
            buildUrl: query => `https://www.google.com/search?${new URLSearchParams({ q: query, udm: GOOGLE_SHOPPING_UDM }).toString()}`,
        },
    ];

    const SPARKLE_PATH = 'M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z';

    // Strip diacritics: "très bon état" -> "tres bon etat".
    // Precomposed French letters collapse to a single base letter, so offsets in
    // the result still line up with the original string.
    function deaccent(value) {
        return value.normalize('NFD').replace(/[̀-ͯ]/g, '');
    }

    // Remove blacklisted strings from a value before adding it to the query.
    // Matching ignores accents, because plenty of sellers type "tres bon etat",
    // while the text that survives keeps its original spelling.
    function sanitiseQueryPart(value) {
        const plain = deaccent(value);
        let result = value;

        if (plain.length === value.length) {
            // Collect every match on the accent-free form, then splice the
            // matching ranges out of the original.
            const cuts = [];
            for (const pattern of QUERY_BLACKLIST) {
                const flags = pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g';
                const rx = new RegExp(deaccent(pattern.source), flags);
                let match;
                while ((match = rx.exec(plain)) !== null) {
                    if (match[0].length === 0) {
                        rx.lastIndex++;
                        continue;
                    }
                    cuts.push([match.index, match.index + match[0].length]);
                }
            }

            // Splice from the end so earlier offsets stay valid, skipping any
            // range that overlaps a cut already made.
            cuts.sort((a, b) => b[0] - a[0]);
            let lastStart = Infinity;
            for (const [start, end] of cuts) {
                if (end > lastStart) {
                    continue;
                }
                result = `${result.slice(0, start)} ${result.slice(end)}`;
                lastStart = start;
            }
        } else {
            // Already-decomposed input: offsets cannot be trusted, so filter the
            // accent-free form and return that instead.
            result = plain;
            for (const pattern of QUERY_BLACKLIST) {
                result = result.replace(new RegExp(deaccent(pattern.source), pattern.flags), '');
            }
        }

        // Collapse multiple spaces left by removals
        return result.replace(/\s{2,}/g, ' ').trim();
    }

    // =====================================================================
    // SITE ADAPTERS
    // =====================================================================

    const LEBONCOIN = {
        key:  'leboncoin',
        host: 'leboncoin.fr',

        // Where the badges go, and where the query text comes from
        titleSelectors: [
            'h1[data-testid="ad-title"]',
            'h1[data-test-id="ad-title"]',
            'h1.text-headline-1',
            'h1.text-title-1',
            'h1._1KQme',
            'h1',
        ],

        // Leboncoin sells everything, so the category decides the badges
        isCarAd() {
            if (window.location.href.includes('/voitures/')) {
                return true;
            }
            for (const item of document.querySelectorAll('[data-testid="breadcrumb-item"]')) {
                if (item.textContent.toLowerCase().includes('voitures')) {
                    return true;
                }
            }
            return false;
        },

        // Non-car ads are consumer goods, worth pricing against marketplaces
        showMarketplaces: true,

        // "Voir les X critères supplémentaires" hides half of them
        expandCriteria() {
            const btn = document.querySelector('button[data-qa-id="criteria_more"]');
            if (!btn || btn.textContent.trim().toLowerCase().startsWith('voir moins')) {
                return Promise.resolve();
            }
            return new Promise((resolve) => {
                btn.click();
                setTimeout(resolve, 700);
            });
        },

        // Each criteria block holds a label column then a value column
        criteriaValues() {
            const ids = [
                'criteria_item_u_car_model',
                'criteria_item_regdate',
                'criteria_item_gearbox',
                'criteria_item_u_car_finition',
                'criteria_item_u_car_version',
                'criteria_item_horsepower',
                'criteria_item_horse_power_din',
            ];
            const values = [];
            for (const id of ids) {
                const container = document.querySelector(`[data-qa-id="${id}"]`);
                if (!container || container.children.length < 2) {
                    continue;
                }
                const valueColumn = container.children[1];
                // The title attribute carries the full text when the layout
                // truncates it on screen
                const titled = valueColumn.querySelector('p[title]');
                const raw = titled
                    ? titled.getAttribute('title').trim()
                    : valueColumn.textContent.trim();
                if (raw) {
                    values.push(raw);
                }
            }
            return values;
        },

        // --- search results ---
        hasSearchPage:     true,
        isSearchPage:      () => window.location.pathname.startsWith('/recherche'),
        cardSelector:      '[data-qa-id="aditem_container"]',
        cardTitleSelector: 'p.text-body-1-highlight',

        // The <article> carries the full title, so prefer it over the <p>,
        // which the card layout may visually truncate.
        getCardTitle(card) {
            const article = card.closest('article');
            const label   = article && article.getAttribute('aria-label');
            if (label && label.trim()) {
                return label.trim();
            }
            const p = card.querySelector(this.cardTitleSelector);
            return p ? p.textContent.trim() : null;
        },

        isCarCard(card) {
            const link = card.querySelector('a[href*="/ad/"]');
            return Boolean(link) && link.getAttribute('href').includes('/voitures/');
        },
    };

    const LA_CENTRALE = {
        key:  'lacentrale',
        host: 'lacentrale.fr',

        // Badges are inserted in the ad heading…
        titleSelectors: [
            'h1.AdTitle',
            'h1[data-qa-id="adview-title"]',
            '.AdTitle h1',
            'h1.titleAd',
            'h1',
        ],

        // …but the make/model/version line is a cleaner query than the heading
        queryTitleSelectors: ['[class*="GeneralInformation_makeModelVersion"]'],

        // Headings end with the ad reference, which is noise in a search
        cleanTitle: text => text.replace(/\s+\d{4,}$/, ''),

        // The site only sells cars
        isCarAd:          () => true,
        showMarketplaces: false,
        expandCriteria:   () => Promise.resolve(),

        // Label/value pairs with hashed CSS-module class names. Matching on a
        // fragment survives the rebuilds that change those hashes.
        criteriaValues() {
            const wanted = [
                'année', 'énergie', 'boîte', 'transmission',
                'puissance din', 'puissance fiscale',
            ];
            const values = [];
            for (const line of document.querySelectorAll('[class*="LabelItems_gridLine"]')) {
                const labelEl = line.querySelector('[class*="LabelItems_itemLabelName"]');
                const valueEl = line.querySelector('[class*="LabelItems_itemValue"]');
                if (!labelEl || !valueEl) {
                    continue;
                }
                const label = labelEl.textContent.trim().toLowerCase();
                if (wanted.some(w => label.includes(w))) {
                    const raw = valueEl.textContent.trim();
                    if (raw) {
                        values.push(raw);
                    }
                }
            }
            return values;
        },

        hasSearchPage: false,
    };

    const SITES = [LEBONCOIN, LA_CENTRALE];

    const site = SITES.find(s => window.location.hostname.endsWith(s.host));
    if (!site) {
        return;
    }

    // Flag to prevent concurrent injection attempts
    let injecting = false;

    // Create an SVG icon element
    function createSVGIcon(pathData, colour, size = 20) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', String(size));
        svg.setAttribute('height', String(size));
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', colour);
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        svg.style.marginLeft = '8px';
        svg.style.cursor = 'pointer';
        svg.style.verticalAlign = 'middle';
        svg.style.flexShrink = '0';

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathData);
        svg.appendChild(path);

        return svg;
    }

    // Create a small coloured text badge used as an icon (e.g. "CA", "LC")
    function createTextBadge(label, colour) {
        const badge = document.createElement('span');
        badge.textContent = label;
        badge.style.cssText = [
            'display:inline-flex',
            'align-items:center',
            'justify-content:center',
            'min-width:20px',
            'height:20px',
            'padding:0 4px',
            'margin-left:8px',
            'border-radius:4px',
            `background:${colour}`,
            'color:#fff',
            'font:bold 11px/1 Arial, sans-serif',
            'cursor:pointer',
            'flex-shrink:0',
            'user-select:none',
        ].join(';');
        return badge;
    }

    // Open any URL in a new tab
    function openInNewTab(url) {
        window.open(url, '_blank', 'noopener');
    }

    // Open a Google search in a new tab (classic results or AI Mode)
    function openGoogleSearch(query, aiMode = false) {
        const params = new URLSearchParams({ q: query });
        if (aiMode) {
            params.set('udm', GOOGLE_AI_MODE_UDM);
        }
        openInNewTab(`https://www.google.com/search?${params.toString()}`);
    }

    // Attach a click handler that blocks the default Leboncoin behaviour
    function bindClick(element, handler) {
        element.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            handler();
        });
    }

    // First element matching any selector and holding some text
    function firstMatching(selectors) {
        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el && el.textContent.trim()) {
                return el;
            }
        }
        return null;
    }

    // Where the badges are inserted
    function getTitleElement() {
        return firstMatching(site.titleSelectors);
    }

    // The text the query is built from. Some sites publish a cleaner model
    // line than the heading they show at the top of the page.
    function getAdTitle() {
        const source = (site.queryTitleSelectors && firstMatching(site.queryTitleSelectors))
            || getTitleElement();
        if (!source) {
            return null;
        }
        const text = source.textContent.trim();
        return site.cleanTitle ? site.cleanTitle(text) : text;
    }

    // Check whether a value is already present in the title
    function isDataInTitle(data, title) {
        const normTitle = title.toLowerCase();
        const normData  = data.toLowerCase();
        if (normTitle.includes(normData)) {
            return true;
        }
        return normData.split(' ').some(
            word => word.length > 2 && normTitle.includes(word)
        );
    }

    // Build the enriched query from the title plus whatever criteria the
    // adapter could read off the page, skipping anything the title already says
    function buildEnrichedQuery(title) {
        const cleanTitle = sanitiseQueryPart(title);
        const extras = [];
        for (const raw of site.criteriaValues()) {
            const value = sanitiseQueryPart(raw);
            if (value && !isDataInTitle(value, cleanTitle)) {
                extras.push(value);
            }
        }
        return extras.length > 0 ? `${cleanTitle} ${extras.join(' ')}` : cleanTitle;
    }

    // Build the prompt sent to Google AI Mode to obtain the technical table
    function buildAiPrompt(vehicle) {
        const rows = AI_TABLE_ROWS
            .map((row, index) => `${index + 1}. ${row.label} (format : ${row.format}) → ${row.colours}`)
            .join('\n');
        return [
            `Fiche technique du véhicule suivant : ${vehicle}.`,
            'Réponds uniquement par un tableau à 2 colonnes (Caractéristique | Valeur) contenant exactement ces lignes, dans cet ordre, avec les seuils de couleur indiqués après la flèche :',
            rows,
            `Préfixe chaque valeur d’une pastille de couleur selon ces seuils (${AI_COLOUR_LEGEND}).`,
            'Quand une ligne contient deux valeurs, mets une pastille devant chacune.',
            'Si une donnée est introuvable ou incertaine, écris ⚪ N/A. Ne fais aucune phrase d’introduction.',
            'Indique tes sources sous le tableau.',
        ].join('\n');
    }

    // Create a spec-sheet search icon (Argus, Caradisiac, La Centrale...)
    function createSpecSheetIcon(source, title) {
        const icon = createTextBadge(source.badge, source.colour);
        icon.title = source.tooltip;

        bindClick(icon, function() {
            const query = `${buildEnrichedQuery(title)} ${source.suffix}`;
            console.log(`[SearchHelper] ${source.tooltip}:`, query);
            openGoogleSearch(query);
        });
        return icon;
    }

    // Create a marketplace search icon (eBay, Amazon, Google Shopping).
    // The ad title is used as-is: no car criteria to enrich it with here.
    function createProductSearchIcon(source, title) {
        const icon = createTextBadge(source.badge, source.colour);
        icon.title = source.tooltip;

        bindClick(icon, function() {
            const query = sanitiseQueryPart(title);
            console.log(`[SearchHelper] ${source.tooltip}:`, query);
            openInNewTab(source.buildUrl(query));
        });
        return icon;
    }

    // Create the Google AI Mode button returning a technical table
    function createAiButton(title) {
        const button = document.createElement('button');
        button.type = 'button';
        button.title = 'Demander la fiche technique à l’IA de Google';
        button.style.cssText = [
            'display:inline-flex',
            'align-items:center',
            'gap:4px',
            'margin-left:8px',
            'padding:2px 8px',
            'border:1px solid #8e44ad',
            'border-radius:12px',
            'background:#fff',
            'color:#8e44ad',
            'font:bold 12px/1.4 Arial, sans-serif',
            'cursor:pointer',
            'flex-shrink:0',
        ].join(';');

        const icon = createSVGIcon(SPARKLE_PATH, '#8e44ad', 14);
        icon.style.marginLeft = '0';
        button.append(icon, document.createTextNode('Fiche IA'));

        bindClick(button, function() {
            const prompt = buildAiPrompt(buildEnrichedQuery(title));
            console.log('[SearchHelper] AI prompt:', prompt);
            openGoogleSearch(prompt, true);
        });
        return button;
    }

    // Create the generic Google search icon
    function createGoogleIcon(title) {
        const icon = createSVGIcon(
            'm15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4m-5-4l5-5-5-5m-5 9h11',
            '#4285f4'
        );
        bindClick(icon, () => openGoogleSearch(sanitiseQueryPart(title)));
        icon.title = 'Rechercher sur Google';
        return icon;
    }

    // Check whether icons have already been injected
    function iconsAlreadyExist() {
        return document.querySelector('.search-helper-icon') !== null;
    }

    // ---------------------------------------------------------------------
    // Search results page
    //
    // Card markup:
    //   <article aria-label="full, untruncated title">
    //     <div data-qa-id="aditem_container" class="relative group/adcard">
    //       <a class="absolute inset-0" href="/ad/<category>/<id>">  <- covers the card
    //       <div> … <p class="text-body-1-highlight">title</p> … </div>
    // ---------------------------------------------------------------------

    // Only Leboncoin exposes a results page today; La Centrale opts out
    function isSearchPage() {
        return Boolean(site.hasSearchPage) && site.isSearchPage();
    }

    // Inject the icons into a single result card (no-op if already done)
    function addIconsToCard(card) {
        if (card.dataset.searchHelperDone) {
            return;
        }
        const title = site.getCardTitle(card);
        if (!title) {
            return;
        }
        card.dataset.searchHelperDone = '1';

        const container = document.createElement('span');
        container.className = 'search-helper-icon';
        // The card is fully covered by an <a class="absolute inset-0">.
        // Without an explicit stacking context the badges sit underneath it
        // and every click would open the listing instead.
        container.style.cssText = [
            'display:inline-flex',
            'align-items:center',
            'vertical-align:middle',
            'position:relative',
            'z-index:2',
            'margin-right:6px',
        ].join(';');

        if (site.isCarCard(card)) {
            for (const source of SPEC_SHEET_SOURCES) {
                container.appendChild(createSpecSheetIcon(source, title));
            }
        } else {
            container.appendChild(createGoogleIcon(title));
            if (site.showMarketplaces) {
                for (const source of PRODUCT_SEARCH_SOURCES) {
                    container.appendChild(createProductSearchIcon(source, title));
                }
            }
        }

        // Badges carry a left margin meant to follow the ad title; the first
        // one sits at the start of the line here, so drop it.
        if (container.firstChild) {
            container.firstChild.style.marginLeft = '0';
        }

        const anchor = card.querySelector(site.cardTitleSelector) || card;
        anchor.insertBefore(container, anchor.firstChild);
    }

    // Inject into every card currently in the DOM, returning how many were found
    function addSearchPageIcons() {
        const cards = document.querySelectorAll(site.cardSelector);
        for (const card of cards) {
            addIconsToCard(card);
        }
        return cards.length;
    }

    // Main injection function
    async function addSearchIcons() {
        if (iconsAlreadyExist() || injecting) {
            return;
        }
        injecting = true;

        try {
            const titleElement = getTitleElement();
            const adTitle      = getAdTitle();

            if (!titleElement || !adTitle) {
                console.log('[SearchHelper] Title not found.');
                return;
            }

            const carAd = site.isCarAd();

            if (carAd) {
                await site.expandCriteria();
            }

            // Double-check after async wait — another call may have injected in the meantime
            if (iconsAlreadyExist()) {
                return;
            }

            const container = document.createElement('span');
            container.className = 'search-helper-icon';
            container.style.cssText = 'display:inline-flex;align-items:center;margin-right:10px;vertical-align:middle;';

            if (carAd) {
                for (const source of SPEC_SHEET_SOURCES) {
                    container.appendChild(createSpecSheetIcon(source, adTitle));
                }
                container.appendChild(createAiButton(adTitle));
            } else {
                container.appendChild(createGoogleIcon(adTitle));
                if (site.showMarketplaces) {
                    for (const source of PRODUCT_SEARCH_SOURCES) {
                        container.appendChild(createProductSearchIcon(source, adTitle));
                    }
                }
            }

            titleElement.insertBefore(container, titleElement.firstChild);
            console.log('[SearchHelper] Icons injected.');
        } finally {
            injecting = false;
        }
    }

    // Retry loop until the ad title (ad page) or the first card (results page) shows up
    function initScript() {
        let attempts = 0;
        const maxAttempts = 15;

        function tryInject() {
            attempts++;

            if (isSearchPage()) {
                if (addSearchPageIcons() > 0) {
                    return;
                }
            } else if (getTitleElement() && getAdTitle()) {
                addSearchIcons();
                return;
            }

            if (attempts < maxAttempts) {
                setTimeout(tryInject, 800);
            } else {
                console.log('[SearchHelper] Giving up after', maxAttempts, 'attempts.');
            }
        }

        tryInject();
    }

    // MutationObserver for SPA navigation (debounced)
    let observerTimer = null;
    const observer = new MutationObserver(function(mutations) {
        let hasNewNodes = false;
        for (const mutation of mutations) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                hasNewNodes = true;
                break;
            }
        }
        if (!hasNewNodes) {
            return;
        }

        // On the results page new cards keep arriving (pagination, filters,
        // infinite scroll), so re-scan every time: cards already handled carry
        // a dataset flag and are skipped, which keeps this cheap.
        if (isSearchPage()) {
            clearTimeout(observerTimer);
            observerTimer = setTimeout(addSearchPageIcons, 400);
        } else if (!iconsAlreadyExist() && !injecting) {
            clearTimeout(observerTimer);
            observerTimer = setTimeout(addSearchIcons, 600);
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initScript);
    } else {
        initScript();
    }

})();
