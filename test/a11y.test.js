/**
 * @file Zero-dependency WCAG 2.2 Level AA & WAI-ARIA 1.2 accessibility regression suite.
 * Mathematically verifies color contrast ratios, ARIA attribute validity, heading hierarchy,
 * link/button accessible names, keyboard scrollable regions, minimum pointer target sizes
 * (SC 2.5.8), focus-not-obscured rules (SC 2.4.11), reduced motion, and forced-colors rules
 * across `index.html`, `assets/styles.css`, and `scripts/update-github-stats.js`.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderContributionsSection } from '../scripts/update-github-stats.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

/**
 * Parses a 3-digit or 6-digit CSS hexadecimal color into `[r, g, b]` 0..255 channels.
 *
 * @param {string} hex - CSS hex color string (e.g. `#fff` or `#8c1515`).
 * @returns {[number, number, number]} Parsed sRGB channels.
 */
function parseHexColor(hex) {
    const clean = hex.trim().replace(/^#/, '');
    if (clean.length === 3) {
        return [
            parseInt(clean[0] + clean[0], 16),
            parseInt(clean[1] + clean[1], 16),
            parseInt(clean[2] + clean[2], 16)
        ];
    }
    if (clean.length === 6) {
        return [
            parseInt(clean.slice(0, 2), 16),
            parseInt(clean.slice(2, 4), 16),
            parseInt(clean.slice(4, 6), 16)
        ];
    }
    throw new Error(`Unsupported hex color: ${hex}`);
}

/**
 * Converts a single 0..255 sRGB channel value to linearized light intensity per WCAG 2.x.
 *
 * @param {number} channel - 8-bit sRGB channel (0..255).
 * @returns {number} Linearized channel intensity (0..1).
 */
function linearizeChannel(channel) {
    const s = channel / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/**
 * Computes WCAG 2.x relative luminance `L` in `[0, 1]` for a hex color.
 *
 * @param {string} hex - CSS hex color string.
 * @returns {number} Relative luminance.
 */
function relativeLuminance(hex) {
    const [r, g, b] = parseHexColor(hex);
    return (
        0.2126 * linearizeChannel(r) +
        0.7152 * linearizeChannel(g) +
        0.0722 * linearizeChannel(b)
    );
}

/**
 * Computes the WCAG 2.x contrast ratio `(L1 + 0.05) / (L2 + 0.05)` between two hex colors.
 *
 * @param {string} fgHex - Foreground hex color.
 * @param {string} bgHex - Background hex color.
 * @returns {number} Contrast ratio in `[1, 21]`.
 */
function contrastRatio(fgHex, bgHex) {
    const l1 = relativeLuminance(fgHex);
    const l2 = relativeLuminance(bgHex);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Extracts `:root` CSS custom property hex values from a stylesheet.
 *
 * @param {string} cssText - Stylesheet source text.
 * @returns {Map<string, string>} Map of `--var-name` to `#hex` value.
 */
function extractCssHexVars(cssText) {
    const rootMatch = cssText.match(/:root\s*\{([\s\S]*?)\}/);
    const vars = new Map();
    if (!rootMatch) {
        return vars;
    }
    for (const match of rootMatch[1].matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,6})\b/g)) {
        vars.set(match[1], match[2]);
    }
    return vars;
}

/**
 * Strips HTML tags and normalizes whitespace to approximate visible text content.
 *
 * @param {string} fragment - HTML fragment.
 * @returns {string} Plain text with collapsed whitespace.
 */
function stripTags(fragment) {
    return fragment
        .replace(/<[^>]*>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&middot;/g, '·')
        .replace(/&num;/g, '#')
        .replace(/&rarr;/g, '→')
        .replace(/&darr;/g, '↓')
        .replace(/&rsquo;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Checks an HTML fragment for WAI-ARIA 1.2 prohibited `aria-label` or `aria-labelledby`
 * attributes on roleless generic `<div>` and `<span>` elements.
 *
 * @param {string} markup - HTML markup to inspect.
 * @returns {string[]} List of offending opening tags.
 */
function findProhibitedGenericAriaLabels(markup) {
    /** @type {string[]} */
    const violations = [];
    for (const match of markup.matchAll(/<(?:div|span)\b[^>]*>/gi)) {
        const tag = match[0];
        if (/\baria-label(?:ledby)?\s*=/i.test(tag) && !/\brole\s*=\s*"[^"]+"/i.test(tag)) {
            violations.push(tag);
        }
    }
    return violations;
}

describe('WCAG 2.2 Level AA & WAI-ARIA 1.2 Automated Accessibility Audit', () => {
    const html = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
    const css = fs.readFileSync(path.join(repoRoot, 'assets/styles.css'), 'utf8');
    const selfFile = fs.readFileSync(path.join(repoRoot, 'test/a11y.test.js'), 'utf8');
    const cssVars = extractCssHexVars(css);

    it('enforces WCAG 1.4.3 (4.5:1 text) and WCAG 1.4.11 (3.0:1 UI/focus) contrast across CSS tokens', () => {
        const ghBg = cssVars.get('--gh-bg');
        const ghSubtle = cssVars.get('--gh-subtle');
        const ghBadgeBg = cssVars.get('--gh-badge-bg');
        const ghText = cssVars.get('--gh-text');
        const ghSecondary = cssVars.get('--gh-secondary');
        const ghLink = cssVars.get('--gh-link');
        const ghOrange = cssVars.get('--gh-orange');
        const ghContribActiveBorder = cssVars.get('--gh-contrib-active-border');
        const stanfordCardinal = cssVars.get('--stanford-cardinal');

        assert.ok(ghBg && ghSubtle && ghBadgeBg && ghText && ghSecondary && ghLink && ghOrange && ghContribActiveBorder && stanfordCardinal);

        // Normal text >= 4.5:1 (WCAG 1.4.3)
        assert.ok(contrastRatio(ghText, ghBg) >= 4.5, `gh-text on gh-bg < 4.5:1`);
        assert.ok(contrastRatio(ghText, ghSubtle) >= 4.5, `gh-text on gh-subtle < 4.5:1`);
        assert.ok(contrastRatio(ghSecondary, ghBg) >= 4.5, `gh-secondary on gh-bg < 4.5:1`);
        assert.ok(contrastRatio(ghSecondary, ghSubtle) >= 4.5, `gh-secondary on gh-subtle < 4.5:1`);
        assert.ok(contrastRatio(ghSecondary, ghBadgeBg) >= 4.5, `gh-secondary on gh-badge-bg < 4.5:1`);
        assert.ok(contrastRatio(ghLink, ghBg) >= 4.5, `gh-link on gh-bg < 4.5:1`);
        assert.ok(contrastRatio(ghLink, ghSubtle) >= 4.5, `gh-link on gh-subtle < 4.5:1`);
        assert.ok(contrastRatio(stanfordCardinal, ghBg) >= 4.5, `stanford-cardinal on gh-bg < 4.5:1`);
        assert.ok(contrastRatio('#ffffff', stanfordCardinal) >= 4.5, `#ffffff on stanford-cardinal < 4.5:1`);

        // UI state indicators, focus rings & active heatmap borders >= 3.0:1 (WCAG 1.4.11)
        assert.ok(
            contrastRatio(ghOrange, ghBg) >= 3.0,
            `Active tab underline --gh-orange (${ghOrange}) on ${ghBg} must be >= 3.0:1`
        );
        assert.ok(
            contrastRatio(ghContribActiveBorder, ghBg) >= 3.0,
            `Active contribution cell border (${ghContribActiveBorder}) on ${ghBg} must be >= 3.0:1`
        );

        // Stanford header/footer focus ring must override global blue (#0969da is 1.81:1 on #8c1515)
        const stanfordFocusMatch = css.match(/\.bg-stanford\s+a:focus-visible\s*\{([^}]*)\}/);
        assert.ok(stanfordFocusMatch, 'Expected explicit .bg-stanford a:focus-visible rule');
        const focusHexMatch = stanfordFocusMatch[1].match(/outline:\s*[^;]*(#[0-9a-fA-F]{3,6})/);
        assert.ok(focusHexMatch, 'Expected hex outline color in .bg-stanford a:focus-visible');
        assert.ok(
            contrastRatio(focusHexMatch[1], stanfordCardinal) >= 3.0,
            `Focus outline ${focusHexMatch[1]} on ${stanfordCardinal} must be >= 3.0:1`
        );
    });

    it('enforces WCAG 1.4.3 text contrast across every inline SVG <text> element in index.html', () => {
        const svgBlocks = [...html.matchAll(/<svg\b[\s\S]*?<\/svg>/gi)].map((m) => m[0]);
        assert.ok(svgBlocks.length >= 8, 'Expected architectural, streak, calendar, and activity SVGs');

        let checkedTextNodes = 0;
        for (const svg of svgBlocks) {
            const isStreak = svg.includes('gh-streak-svg');
            const defaultBg = isStreak ? '#FFFEFE' : '#ffffff';

            // Check grouped <g> blocks pairing <rect fill="..."> backgrounds with <text fill="...">
            for (const gMatch of svg.matchAll(/<g\b[^>]*>([\s\S]*?)<\/g>/gi)) {
                const gBody = gMatch[1];
                if (gBody.includes('<g')) {
                    continue;
                }
                const firstRectFill = gBody.match(/<rect\b[^>]*\bfill="(#[0-9a-fA-F]{3,6})"/i);
                const bg = firstRectFill ? firstRectFill[1] : defaultBg;

                // Pair each <text> with an immediately preceding inline <rect fill="..."> if on same line, else group bg
                const lfChar = String.fromCharCode(10);
                for (const line of gBody.split(lfChar)) {
                    const inlineRect = line.match(/<rect\b[^>]*\bfill="(#[0-9a-fA-F]{3,6})"/i);
                    const lineBg = inlineRect ? inlineRect[1] : bg;
                    for (const textTag of line.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/gi)) {
                        const attrs = textTag[1];
                        const fillMatch = attrs.match(/\bfill="(#[0-9a-fA-F]{3,6})"/i);
                        if (!fillMatch) {
                            continue;
                        }
                        const fg = fillMatch[1];
                        const sizeMatch = attrs.match(/\bfont-size="([\d.]+)/i);
                        const fontSize = sizeMatch ? parseFloat(sizeMatch[1]) : 12;
                        const isBold = /\bfont-weight="(?:700|bold)"/i.test(attrs);
                        const isLarge = fontSize >= 24 || (isBold && fontSize >= 18.66);
                        const minRatio = isLarge ? 3.0 : 4.5;
                        const ratio = contrastRatio(fg, lineBg);
                        checkedTextNodes += 1;
                        assert.ok(
                            ratio >= minRatio,
                            `SVG text "${stripTags(textTag[2])}" (${fg} on ${lineBg}) has contrast ${ratio.toFixed(2)}:1 < ${minRatio}:1`
                        );
                    }
                }
            }
        }
        assert.ok(checkedTextNodes >= 50, `Expected >= 50 verified SVG <text> nodes, checked ${checkedTextNodes}`);
        assert.doesNotMatch(html, /#FB8C00/i, 'Low-contrast #FB8C00 must not appear in index.html');
    });

    it('prohibits aria-label/aria-labelledby on roleless generic <div> and <span> elements and focusable children inside role="img"', () => {
        assert.deepEqual(findProhibitedGenericAriaLabels(html), []);

        // Static HTML <svg role="img"> must not contain focusable children before JS upgrades role to "group"
        for (const svgMatch of html.matchAll(/<svg\b[^>]*\brole="img"[^>]*>([\s\S]*?)<\/svg>/gi)) {
            assert.doesNotMatch(
                svgMatch[1],
                /\btabindex\s*=\s*"0"/i,
                'Static <svg role="img"> must not contain focusable [tabindex="0"] descendants'
            );
        }

        // Verify distinct accessible names for interactive nodes within each architectural SVG
        for (const svgMatch of html.matchAll(/<svg\b[^>]*class="arch-svg"[^>]*>([\s\S]*?)<\/svg>/gi)) {
            const seenLabels = new Set();
            for (const gMatch of svgMatch[1].matchAll(/<g\b([^>]*\bdata-node-id="[^"]+"[^>]*)>([\s\S]*?)<\/g>/gi)) {
                const attrs = gMatch[1];
                const explicitLabel = attrs.match(/\baria-label="([^"]+)"/i);
                const computed = explicitLabel ? explicitLabel[1] : stripTags(gMatch[2]);
                assert.ok(computed.length > 0, 'Interactive diagram <g> must have non-empty accessible text');
                assert.ok(!seenLabels.has(computed), `Duplicate interactive SVG node label within diagram: "${computed}"`);
                seenLabels.add(computed);
            }
        }

        // Also audit generated markup from scripts/update-github-stats.js
        const generated = renderContributionsSection({
            username: 'SamuelMarks',
            yearlyTotal: 6977,
            months: [{ label: 'Nov', weekIndex: 0, colspan: 2 }],
            days: [{ date: '2026-11-20', row: 5, col: 0, level: 2, count: 13, tooltip: '13 contributions' }],
            activity: {
                featuredOrgs: [{ login: 'offscale', avatarUrl: 'https://example.com/a.png', href: 'https://github.com/offscale' }],
                moreOrgs: [{ login: 'google', avatarUrl: 'https://example.com/g.png', href: 'https://github.com/google' }],
                repositories: ['SamuelMarks/cdd-c'],
                otherRepoCount: 10,
                titleText: 'Activity summary',
                percentages: { Commits: 99, 'Pull requests': 1, Issues: 0, 'Code review': 0 }
            },
            years: [
                { year: 2026, href: 'https://github.com/SamuelMarks?from=2026-01-01' },
                { year: 2025, href: 'https://github.com/SamuelMarks?from=2025-01-01' }
            ],
            streak: {
                totalContributions: 20600,
                totalRange: 'May 24, 2011 - Present',
                currentStreak: 1603,
                currentRange: 'Jul 2, 2022 - Nov 20',
                longestStreak: 1603,
                longestRange: 'Jul 2, 2022 - Nov 20'
            }
        });
        assert.deepEqual(findProhibitedGenericAriaLabels(generated), []);
        assert.match(generated, /class="gh-year-link gh-year-link-active"[^>]*>2026<span class="sr-only"> \(current year\)<\/span><\/a>/);
        assert.match(generated, /<summary aria-label="More organizations">More<\/summary>/);
        assert.doesNotMatch(generated, /alt="@[^"]+ organization"/);
    });

    it('maintains a sequential document heading hierarchy (h1 -> h2 -> h3 -> h4) and programmatic skip-link target', () => {
        const headings = [...html.matchAll(/<h([1-6])\b([^>]*)>([\s\S]*?)<\/h\1>/gi)].map((m) => ({
            level: Number(m[1]),
            attrs: m[2],
            text: stripTags(m[3])
        }));

        const h1s = headings.filter((h) => h.level === 1);
        assert.equal(h1s.length, 1, 'Document must contain exactly one <h1>');
        assert.match(h1s[0].text, /Samuel Marks, PhD/);

        let prevLevel = headings[0].level;
        for (const heading of headings.slice(1)) {
            assert.ok(heading.text.length > 0, 'Headings must not be empty');
            assert.ok(
                heading.level <= prevLevel + 1,
                `Skipped heading level from <h${prevLevel}> to <h${heading.level}> ("${heading.text}")`
            );
            prevLevel = heading.level;
        }

        assert.match(html, /<h2 id="overview-heading"/);
        assert.match(html, /<a href="#main-content" class="skip-link">/);
        assert.match(html, /<main id="main-content" tabindex="-1"/);
    });

    it('ensures non-empty, non-stuttered accessible names on all links and underlines prose links (WCAG 1.4.1 & 2.4.4)', () => {
        const links = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)];
        assert.ok(links.length >= 60, 'Expected >= 60 links across profile, deep dives, and contributions');

        for (const [, attrs, inner] of links) {
            const ariaLabel = attrs.match(/\baria-label="([^"]+)"/i);
            const imgAlts = [...inner.matchAll(/<img\b[^>]*\balt="([^"]*)"/gi)].map((m) => m[1]).filter(Boolean);
            const text = stripTags(inner);
            const accessibleName = ariaLabel
                ? ariaLabel[1].trim()
                : [...imgAlts, text].filter(Boolean).join(' ').trim();

            assert.ok(accessibleName.length > 0, `Link missing accessible name: <a${attrs}>`);

            // Detect stuttered "@org organization @org" accessible names
            const handleMatch = text.match(/^@([\w-]+)$/);
            if (handleMatch) {
                assert.equal(
                    imgAlts.length,
                    0,
                    `Avatar inside @${handleMatch[1]} link must have alt="" to avoid stuttered announcement "${accessibleName}"`
                );
            }

            // Icon SVGs inside aria-labelled links must be aria-hidden="true" rather than nested role="img"
            if (ariaLabel && inner.includes('<svg')) {
                assert.doesNotMatch(inner, /\brole="img"/i, `Nested <svg> inside aria-labelled link should use aria-hidden="true": ${ariaLabel[1]}`);
                assert.match(inner, /\baria-hidden="true"/i, `Nested <svg> inside aria-labelled link missing aria-hidden="true": ${ariaLabel[1]}`);
            }
        }

        // Active year link and "More" organizations summary
        assert.match(html, /class="gh-year-link gh-year-link-active"[^>]*>2026<span class="sr-only"> \(current year\)<\/span><\/a>/);
        assert.match(html, /<details class="gh-org-more">\s*<summary aria-label="More organizations">More<\/summary>/);

        // Prose links must carry underline styling so links are never distinguished by < 3:1 color alone (WCAG 1.4.1)
        assert.match(css, /\.gh-link\s*\{[^}]*text-decoration:\s*underline/);
        assert.match(css, /p\s+a\.sidebar-handle\s*\{[^}]*text-decoration:\s*underline/);
    });

    it('enforces WCAG 2.2 SC 2.5.8 target size, SC 2.4.11 focus-not-obscured, SC 2.1.1 scrollable regions, reduced motion, and file hygiene', () => {
        // SC 2.5.8 Target Size (Minimum): >= 24x24 CSS px on compact controls
        for (const [label, pattern] of /** @type {Array<[string, RegExp]>} */ ([
            ['a.meta-pill', /a\.meta-pill\s*\{([^}]*)\}/],
            ['.copy-snippet-btn', /\.copy-snippet-btn\s*\{([^}]*)\}/],
            ['.copy-email-btn', /\.copy-email-btn\s*\{([^}]*)\}/]
        ])) {
            const rule = css.match(pattern);
            assert.ok(rule, `Expected CSS rule for ${label}`);
            assert.match(rule[1], /min-height:\s*24px/, `${label} must specify min-height: 24px`);
            assert.match(rule[1], /min-width:\s*24px/, `${label} must specify min-width: 24px`);
        }

        // SC 2.4.11 Focus Not Obscured (Minimum): scroll-padding-top & focusable scroll-margin-top
        assert.match(css, /html\s*\{[^}]*scroll-padding-top:/);
        assert.match(css, /main\s+\[tabindex="0"\]\s*\{\s*scroll-margin-top:/);

        // SC 2.1.1 Keyboard: horizontally scrollable regions must be keyboard-focusable and labelled
        const preTags = [...html.matchAll(/<pre\b[^>]*\bclass="code-pre"[^>]*>/gi)].map((m) => m[0]);
        assert.equal(preTags.length, 10, 'Expected 10 code blueprint <pre class="code-pre"> blocks');
        for (const tag of preTags) {
            assert.match(tag, /\btabindex="0"/);
            assert.match(tag, /\brole="region"/);
            assert.match(tag, /\baria-label="[^"]+"/);
        }

        const diagramFrames = [...html.matchAll(/<figure\b[^>]*\bclass="diagram-frame"[^>]*>/gi)].map((m) => m[0]);
        assert.equal(diagramFrames.length, 5, 'Expected 5 <figure class="diagram-frame"> containers');
        for (const tag of diagramFrames) {
            assert.match(tag, /\btabindex="0"/);
            assert.match(tag, /\baria-label="[^"]+"/);
        }

        assert.match(html, /<div class="gh-calendar-scroll" tabindex="0" role="region" aria-label="Yearly contribution calendar">/);

        // Motion & Forced Colors resilience
        assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?transition-duration:\s*0\.01ms\s*!important/);
        assert.match(css, /@media\s*\(forced-colors:\s*active\)/);

        // Self-hygiene & JSDoc coverage on every helper in test/a11y.test.js
        const lf = String.fromCharCode(10);
        const crlf = String.fromCharCode(13, 10);
        assert.ok(!selfFile.includes(crlf), 'test/a11y.test.js must use LF line endings');
        assert.ok(selfFile.endsWith(lf), 'test/a11y.test.js must end with LF');
        for (const line of selfFile.split(lf)) {
            assert.doesNotMatch(line, /[ 	]+$/, 'test/a11y.test.js must not contain trailing whitespace');
        }
        const helperFns = [...selfFile.matchAll(/^function\s+(\w+)\s*\(/gm)].map((m) => m[1]);
        assert.equal(helperFns.length, 7);
        for (const fnName of helperFns) {
            const idx = selfFile.indexOf(`function ${fnName}(`);
            const preceding = selfFile.slice(Math.max(0, idx - 400), idx).trimEnd();
            assert.ok(preceding.endsWith('*/') && preceding.includes('/**'), `Missing JSDoc on ${fnName}`);
        }
    });
});
