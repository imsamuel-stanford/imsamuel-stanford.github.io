/**
 * @file Progressive enhancement module for Samuel Marks's Stanford profile & open-source deep dives.
 * The page is 100% functional without JavaScript; this module exclusively adds optional
 * client-side conveniences (spam-safe mailto hydration, 1-click snippet copy buttons,
 * deep-dive filtering/search, keyboard-accessible bidirectional SVG highlighting,
 * scroll-spy & hash-aware disclosure navigation, and Escape/outside-click popover dismissal).
 */

/**
 * Splits a whitespace-delimited attribute value into non-empty tokens.
 *
 * @param {string | null} rawValue - Raw attribute string from the DOM.
 * @returns {string[]} Array of non-empty token strings.
 */
export function parseTokens(rawValue) {
    if (!rawValue) {
        return [];
    }
    return rawValue.trim().split(/\s+/).filter(Boolean);
}

/**
 * Upgrades the spam-resistant contact element into a clickable `mailto:` link
 * and an accessible clipboard copy button.
 *
 * @param {Document} doc - Target DOM document.
 * @param {Navigator | undefined} nav - Browser navigator object for clipboard access.
 * @returns {boolean} True when the contact element was found and enhanced.
 */
export function enhanceContactEmail(doc, nav) {
    const emailSpan = doc.getElementById('contact-email');
    if (!emailSpan) {
        return false;
    }

    const user = emailSpan.getAttribute('data-email-user');
    const domain = emailSpan.getAttribute('data-email-domain');
    if (!user || !domain) {
        return false;
    }

    const address = `${user}@${domain}`;
    const mailLink = doc.createElement('a');
    mailLink.href = `mailto:${address}`;
    mailLink.className = 'gh-link';
    mailLink.textContent = address;

    emailSpan.textContent = '';
    emailSpan.removeAttribute('aria-label');
    emailSpan.appendChild(mailLink);

    if (nav && nav.clipboard && typeof nav.clipboard.writeText === 'function') {
        const copyBtn = doc.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'copy-email-btn';
        copyBtn.textContent = 'Copy';
        copyBtn.setAttribute('aria-label', `Copy email address ${address}`);
        emailSpan.insertAdjacentElement('afterend', copyBtn);

        let statusEl = doc.getElementById('copy-email-status');
        if (!statusEl) {
            statusEl = doc.createElement('span');
            statusEl.setAttribute('id', 'copy-email-status');
            statusEl.className = 'sr-only';
            statusEl.setAttribute('aria-live', 'polite');
            copyBtn.insertAdjacentElement('afterend', statusEl);
        }

        copyBtn.addEventListener('click', async () => {
            try {
                await nav.clipboard.writeText(address);
                copyBtn.textContent = 'Copied';
                statusEl.textContent = `Copied ${address} to clipboard.`;
            } catch {
                copyBtn.textContent = 'Error';
                statusEl.textContent = `Unable to copy ${address}.`;
            }
        });
    }

    return true;
}

/**
 * Progressively enhances code blueprint panes with 1-click clipboard copy buttons,
 * unique contextual accessible names, and polite screen-reader status announcements.
 *
 * @param {Document} doc - Target DOM document.
 * @param {Navigator | undefined} nav - Browser navigator object for clipboard access.
 * @returns {number} Number of code panes enhanced with a copy button.
 */
export function enhanceCodeCopyButtons(doc, nav) {
    if (!nav || !nav.clipboard || typeof nav.clipboard.writeText !== 'function') {
        return 0;
    }

    const panes = Array.from(doc.querySelectorAll('.code-pane'));
    let enhancedCount = 0;
    let statusEl = doc.getElementById('copy-snippet-status');

    for (const pane of panes) {
        const header = pane.querySelector('.code-pane-header');
        const pre = pane.querySelector('[data-copyable]');
        if (!header || !pre) {
            continue;
        }
        enhancedCount += 1;

        if (!statusEl) {
            statusEl = doc.createElement('span');
            statusEl.setAttribute('id', 'copy-snippet-status');
            statusEl.className = 'sr-only';
            statusEl.setAttribute('aria-live', 'polite');
            doc.body.appendChild(statusEl);
        }

        const paneLabel = (header.textContent || '').replace(/\s+/g, ' ').trim();
        const targetDesc = paneLabel || 'code snippet';

        const copyBtn = doc.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'copy-snippet-btn';
        copyBtn.textContent = 'Copy';
        copyBtn.setAttribute(
            'aria-label',
            paneLabel ? `Copy code snippet: ${paneLabel}` : 'Copy code snippet'
        );
        copyBtn.addEventListener('click', async () => {
            try {
                await nav.clipboard.writeText(pre.textContent || '');
                copyBtn.textContent = 'Copied';
                statusEl.textContent = `Copied ${targetDesc} to clipboard.`;
            } catch {
                copyBtn.textContent = 'Error';
                statusEl.textContent = `Unable to copy ${targetDesc}.`;
            }
        });
        header.appendChild(copyBtn);
    }

    return enhancedCount;
}

/**
 * Wires interactive category filtering, keyword search, and expand/collapse controls
 * for the technical deep-dive `<details>` accordions.
 *
 * @param {Document} doc - Target DOM document.
 * @returns {{ resetFilters: () => void } | null} Controller handle, or null if toolbar is absent.
 */
export function enhanceCaseStudyFilters(doc) {
    const toolbar = doc.getElementById('cs-filter-toolbar');
    if (!toolbar) {
        return null;
    }

    const filterButtons = Array.from(toolbar.querySelectorAll('[data-cs-filter]'));
    const searchInput = /** @type {HTMLInputElement | null} */ (doc.getElementById('cs-search-input'));
    const statusEl = doc.getElementById('cs-filter-status');
    const expandAllBtn = doc.getElementById('cs-expand-all');
    const collapseAllBtn = doc.getElementById('cs-collapse-all');
    const caseStudies = Array.from(doc.querySelectorAll('#case-studies .case-study-card'));

    let activeCategory = 'all';

    /**
     * Recomputes visibility across deep dives and nested repository cards.
     *
     * @returns {void}
     */
    const applyFilters = () => {
        const rawQuery = searchInput ? searchInput.value.trim().toLowerCase() : '';
        let visibleStudies = 0;
        let visibleCards = 0;

        for (const study of caseStudies) {
            const category = study.getAttribute('data-cs-category') || '';
            const categoryMatches = activeCategory === 'all' || category === activeCategory;
            const repoCards = Array.from(study.querySelectorAll('[data-repo-card]'));
            const studyHeaderText = (study.textContent || '').toLowerCase();

            let matchingRepoCount = 0;
            for (const card of repoCards) {
                const cardText = (card.textContent || '').toLowerCase();
                const cardMatches = rawQuery === '' || cardText.includes(rawQuery);
                card.hidden = !cardMatches;
                if (cardMatches) {
                    matchingRepoCount += 1;
                }
            }

            const queryMatchesStudy = rawQuery === '' || matchingRepoCount > 0 || studyHeaderText.includes(rawQuery);
            if (queryMatchesStudy && rawQuery !== '' && matchingRepoCount === 0) {
                for (const card of repoCards) {
                    card.hidden = false;
                }
                matchingRepoCount = repoCards.length;
            }

            const isVisible = categoryMatches && queryMatchesStudy;
            study.hidden = !isVisible;

            if (isVisible) {
                visibleStudies += 1;
                visibleCards += matchingRepoCount;
                if (rawQuery !== '' || activeCategory !== 'all') {
                    study.setAttribute('open', '');
                }
            }
        }

        if (statusEl) {
            statusEl.textContent = `Showing ${visibleStudies} of ${caseStudies.length} deep dives (${visibleCards} matching repository groups).`;
        }
    };

    for (const btn of filterButtons) {
        btn.addEventListener('click', () => {
            activeCategory = btn.getAttribute('data-cs-filter') || 'all';
            for (const candidate of filterButtons) {
                const isSelected = candidate === btn;
                candidate.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
            }
            applyFilters();
        });
    }

    if (searchInput) {
        searchInput.addEventListener('input', applyFilters);
    }

    if (expandAllBtn) {
        expandAllBtn.addEventListener('click', () => {
            for (const study of caseStudies) {
                if (!study.hidden) {
                    study.setAttribute('open', '');
                }
            }
        });
    }

    if (collapseAllBtn) {
        collapseAllBtn.addEventListener('click', () => {
            for (const study of caseStudies) {
                if (!study.hidden) {
                    study.removeAttribute('open');
                }
            }
        });
    }

    /**
     * Resets category and search filters so all deep dives and cards are visible.
     *
     * @returns {void}
     */
    const resetFilters = () => {
        activeCategory = 'all';
        if (searchInput) {
            searchInput.value = '';
        }
        for (const candidate of filterButtons) {
            const isAll = candidate.getAttribute('data-cs-filter') === 'all';
            candidate.setAttribute('aria-pressed', isAll ? 'true' : 'false');
        }
        applyFilters();
    };

    return { resetFilters };
}

/**
 * Connects repository cards and inline SVG architectural diagram nodes inside each
 * deep dive so hovering, focusing, or activating one highlights or jumps to its counterpart.
 *
 * @param {Document} doc - Target DOM document.
 * @returns {number} Number of deep dives wired with interactive diagram bindings.
 */
export function enhanceDiagramInteractions(doc) {
    const studies = Array.from(doc.querySelectorAll('#case-studies .case-study-card'));
    let wiredCount = 0;

    for (const study of studies) {
        const cards = Array.from(study.querySelectorAll('[data-repo-card][data-repo-node]'));
        const svgNodes = Array.from(study.querySelectorAll('.arch-svg [data-node-id]'));
        if (cards.length === 0 || svgNodes.length === 0) {
            continue;
        }
        wiredCount += 1;

        const archSvgs = Array.from(study.querySelectorAll('.arch-svg'));
        for (const archSvg of archSvgs) {
            archSvg.setAttribute('role', 'group');
        }

        /**
         * Toggles highlight state on SVG nodes matching any token in `targetIds`.
         *
         * @param {string[]} targetIds - Node identifiers to match.
         * @param {boolean} active - Whether highlight should be enabled.
         * @returns {void}
         */
        const setSvgHighlight = (targetIds, active) => {
            for (const svgGroup of svgNodes) {
                const groupIds = parseTokens(svgGroup.getAttribute('data-node-id'));
                const matches = groupIds.some((id) => targetIds.includes(id));
                if (matches) {
                    if (active) {
                        svgGroup.setAttribute('data-node-active', 'true');
                    } else {
                        svgGroup.removeAttribute('data-node-active');
                    }
                }
            }
        };

        /**
         * Toggles highlight state on repository cards matching any token in `targetIds`.
         *
         * @param {string[]} targetIds - Node identifiers to match.
         * @param {boolean} active - Whether highlight should be enabled.
         * @returns {Element[]} Matching repository card elements.
         */
        const setCardHighlight = (targetIds, active) => {
            const matchedCards = [];
            for (const card of cards) {
                const cardIds = parseTokens(card.getAttribute('data-repo-node'));
                const matches = cardIds.some((id) => targetIds.includes(id));
                if (matches) {
                    matchedCards.push(card);
                    if (active) {
                        card.setAttribute('data-card-active', 'true');
                    } else {
                        card.removeAttribute('data-card-active');
                    }
                }
            }
            return matchedCards;
        };

        for (const card of cards) {
            const ids = parseTokens(card.getAttribute('data-repo-node'));
            card.addEventListener('mouseenter', () => setSvgHighlight(ids, true));
            card.addEventListener('mouseleave', () => setSvgHighlight(ids, false));
            card.addEventListener('focusin', () => setSvgHighlight(ids, true));
            card.addEventListener('focusout', () => setSvgHighlight(ids, false));
        }

        for (const svgGroup of svgNodes) {
            const ids = parseTokens(svgGroup.getAttribute('data-node-id'));
            svgGroup.setAttribute('tabindex', '0');
            svgGroup.setAttribute('role', 'button');
            if (!svgGroup.getAttribute('aria-label')) {
                const labelText = (svgGroup.textContent || '').replace(/\s+/g, ' ').trim();
                const baseLabel = labelText || `Diagram tier ${ids.join(' ')}`;
                svgGroup.setAttribute('aria-label', `${baseLabel} — jump to matching repository card`);
            }

            const activateGroup = () => {
                svgGroup.setAttribute('data-node-active', 'true');
                setCardHighlight(ids, true);
            };

            const deactivateGroup = () => {
                svgGroup.removeAttribute('data-node-active');
                setCardHighlight(ids, false);
            };

            const focusMatchingCardLink = () => {
                const matched = setCardHighlight(ids, true);
                const firstLink = matched.length > 0 ? matched[0].querySelector('a') : null;
                if (firstLink && typeof firstLink.focus === 'function') {
                    firstLink.focus();
                }
            };

            svgGroup.addEventListener('mouseenter', activateGroup);
            svgGroup.addEventListener('mouseleave', deactivateGroup);
            svgGroup.addEventListener('focusin', activateGroup);
            svgGroup.addEventListener('focusout', deactivateGroup);
            svgGroup.addEventListener('click', focusMatchingCardLink);
            svgGroup.addEventListener('keydown', (/** @type {KeyboardEvent} */ evt) => {
                if (evt && (evt.key === 'Enter' || evt.key === ' ')) {
                    if (typeof evt.preventDefault === 'function') {
                        evt.preventDefault();
                    }
                    focusMatchingCardLink();
                }
            });
        }
    }

    return wiredCount;
}

/**
 * Enhances top profile tabs (with scroll-spy when `IntersectionObserver` is available)
 * and `#cs-*` anchor links so navigating to a collapsed or filtered deep dive
 * automatically reveals and expands it.
 *
 * @param {Document} doc - Target DOM document.
 * @param {Window} win - Target browser window.
 * @param {{ resetFilters: () => void } | null} filterController - Optional filter controller.
 * @returns {void}
 */
export function enhanceNavigation(doc, win, filterController) {
    const tabs = Array.from(doc.querySelectorAll('.profile-tab[data-nav-target]'));
    for (const yearLink of Array.from(doc.querySelectorAll('.gh-year-link-active'))) {
        yearLink.setAttribute('aria-current', 'true');
    }

    /**
     * Marks the tab matching `targetId` as the active location.
     *
     * @param {string} targetId - Section ID without leading `#`.
     * @returns {void}
     */
    const activateTab = (targetId) => {
        for (const tab of tabs) {
            const matches = tab.getAttribute('data-nav-target') === targetId;
            tab.classList.toggle('is-active', matches);
            if (matches) {
                tab.setAttribute('aria-current', 'location');
            } else {
                tab.removeAttribute('aria-current');
            }
        }
    };

    for (const tab of tabs) {
        tab.addEventListener('click', () => {
            const targetId = tab.getAttribute('data-nav-target');
            if (targetId) {
                activateTab(targetId);
            }
        });
    }

    /**
     * Ensures a targeted `#cs-*` `<details>` element is unhidden and expanded.
     *
     * @param {string} hash - URL hash string (e.g. `#cs-ml`).
     * @returns {void}
     */
    const openTargetFromHash = (hash) => {
        if (!hash || !hash.startsWith('#')) {
            return;
        }
        const id = hash.slice(1);
        const target = doc.getElementById(id);
        if (!target) {
            return;
        }

        if (target.classList.contains('case-study-card')) {
            if (target.hidden && filterController) {
                filterController.resetFilters();
            }
            target.setAttribute('open', '');
            activateTab('case-studies');
        } else if (tabs.some((tab) => tab.getAttribute('data-nav-target') === id)) {
            activateTab(id);
        }
    };

    const csLinks = Array.from(doc.querySelectorAll('a[href^="#cs-"]'));
    for (const link of csLinks) {
        link.addEventListener('click', () => {
            const href = link.getAttribute('href');
            if (href) {
                openTargetFromHash(href);
            }
        });
    }

    if (typeof win.IntersectionObserver === 'function' && tabs.length > 0) {
        const observer = new win.IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting && entry.target && entry.target.id) {
                        activateTab(entry.target.id);
                        break;
                    }
                }
            },
            { rootMargin: '-15% 0px -70% 0px' }
        );

        for (const tab of tabs) {
            const targetId = tab.getAttribute('data-nav-target');
            const sectionEl = targetId ? doc.getElementById(targetId) : null;
            if (sectionEl) {
                observer.observe(sectionEl);
            }
        }
    }

    win.addEventListener('hashchange', () => {
        openTargetFromHash(win.location.hash);
    });

    if (win.location && win.location.hash) {
        openTargetFromHash(win.location.hash);
    } else if (tabs.length > 0) {
        const firstTarget = tabs[0].getAttribute('data-nav-target');
        if (firstTarget) {
            activateTab(firstTarget);
        }
    }
}

/**
 * Progressively enhances `<details class="gh-org-more">` popovers so pressing `Escape`,
 * tabbing out, or clicking outside closes an open menu cleanly without obscuring or stealing focus.
 *
 * @param {Document} doc - Target DOM document.
 * @returns {number} Number of organization dropdowns enhanced.
 */
export function enhanceOrgDropdown(doc) {
    const dropdowns = Array.from(doc.querySelectorAll('details.gh-org-more'));
    if (dropdowns.length === 0) {
        return 0;
    }

    for (const details of dropdowns) {
        details.addEventListener('focusout', (/** @type {FocusEvent} */ evt) => {
            const nextTarget = /** @type {Node | null} */ (evt ? evt.relatedTarget : null);
            if (
                details.getAttribute('open') !== null &&
                nextTarget &&
                typeof details.contains === 'function' &&
                !details.contains(nextTarget)
            ) {
                details.removeAttribute('open');
            }
        });
    }

    doc.addEventListener('keydown', (/** @type {KeyboardEvent} */ evt) => {
        if (!evt || evt.key !== 'Escape') {
            return;
        }
        for (const details of dropdowns) {
            if (details.getAttribute('open') !== null) {
                const focusInside = !doc.activeElement || (
                    typeof details.contains === 'function' &&
                    details.contains(doc.activeElement)
                );
                details.removeAttribute('open');
                const summary = details.querySelector('summary');
                if (focusInside && summary && typeof summary.focus === 'function') {
                    summary.focus();
                }
            }
        }
    });

    doc.addEventListener('click', (/** @type {MouseEvent} */ evt) => {
        const target = /** @type {Node | null} */ (evt ? evt.target : null);
        for (const details of dropdowns) {
            if (
                details.getAttribute('open') !== null &&
                target &&
                typeof details.contains === 'function' &&
                !details.contains(target)
            ) {
                details.removeAttribute('open');
            }
        }
    });

    return dropdowns.length;
}

/**
 * Bootstraps all progressive enhancements on a document/window pair.
 *
 * @param {Document} doc - Target DOM document.
 * @param {Window} win - Target browser window.
 * @returns {void}
 */
export function initPortfolioEnhancements(doc, win) {
    doc.documentElement.classList.add('js-enabled');
    enhanceContactEmail(doc, win.navigator);
    enhanceCodeCopyButtons(doc, win.navigator);
    const filterController = enhanceCaseStudyFilters(doc);
    enhanceDiagramInteractions(doc);
    enhanceNavigation(doc, win, filterController);
    enhanceOrgDropdown(doc);
}

/**
 * Automatically initializes enhancements when running inside a browser global scope.
 *
 * @param {{ document?: Document, window?: Window }} [env] - Global environment object.
 * @returns {boolean} True when browser globals were detected and initialized.
 */
export function bootstrapIfBrowser(env = globalThis) {
    if (env.document && env.window) {
        initPortfolioEnhancements(env.document, env.window);
        return true;
    }
    return false;
}

bootstrapIfBrowser();
