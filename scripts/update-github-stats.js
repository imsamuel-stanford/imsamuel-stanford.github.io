/**
 * @file Fetches live GitHub profile statistics for `@SamuelMarks` and updates `index.html`
 * with pixel-accurate, zero-JavaScript HTML5 and inline SVGs whose text is 100% selectable.
 *
 * Mirrors the two statistical surfaces currently displayed on https://github.com/SamuelMarks:
 * 1. The 3-column GitHub Streak Stats SVG card (`Total Contributions`, `Current Streak`, `Longest Streak`).
 * 2. The GitHub Contributions Calendar heatmap, legend, joined Activity Overview card
 *    (organization filters, contributed repositories, and 4-axis cross chart), and year list.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SHORT_MONTHS = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

const NL = String.fromCharCode(10);

/**
 * @typedef {object} CalendarMonth
 * @property {string} label - Three-letter month abbreviation (e.g. `Nov`).
 * @property {number} weekIndex - Zero-based starting week column index.
 * @property {number} colspan - Number of week columns spanned by this month label.
 */

/**
 * @typedef {object} CalendarDay
 * @property {string} date - ISO date string (`YYYY-MM-DD`).
 * @property {number} row - Day-of-week row (`0` = Sunday .. `6` = Saturday).
 * @property {number} col - Zero-based week column (`0` .. `52`).
 * @property {number} level - GitHub intensity bucket (`0` .. `4`).
 * @property {number} count - Parsed contribution count on that date.
 * @property {string} tooltip - Exact human-readable GitHub tooltip label.
 */

/**
 * @typedef {object} OrganizationFilter
 * @property {string} login - GitHub organization handle without `@`.
 * @property {string} href - Absolute URL to the org-filtered profile view.
 * @property {string} avatarUrl - Organization avatar URL.
 */

/**
 * @typedef {object} YearLink
 * @property {number} year - Four-digit contribution year.
 * @property {string} href - Absolute URL to that year's GitHub overview.
 */

/**
 * @typedef {object} ActivityOverview
 * @property {OrganizationFilter[]} featuredOrgs - Primary organization pills shown inline.
 * @property {OrganizationFilter[]} moreOrgs - Overflow organizations inside the `More` menu.
 * @property {string[]} repositories - Featured `owner/name` repositories in Activity Overview.
 * @property {number} otherRepoCount - Count of additional contributed repositories.
 * @property {string} titleText - Accessible summary `<title>` for the 4-axis cross chart.
 * @property {Record<string, number>} percentages - Category percentages (`Commits`, `Pull requests`, `Issues`, `Code review`).
 */

/**
 * @typedef {object} StreakSummary
 * @property {number} totalContributions - All-time contributions across all contribution years.
 * @property {string} totalRange - Formatted account contribution span (e.g. `May 24, 2011 - Present`).
 * @property {number} currentStreak - Length in days of the active contribution streak.
 * @property {string} currentRange - Formatted date span of the active streak.
 * @property {number} longestStreak - Length in days of the longest historical streak.
 * @property {string} longestRange - Formatted date span of the longest streak.
 */

/**
 * @typedef {object} ProfileStats
 * @property {string} username - GitHub login (e.g. `SamuelMarks`).
 * @property {number} yearlyTotal - Rolling-year contribution count shown above the heatmap.
 * @property {CalendarMonth[]} months - Month labels positioned across the heatmap header.
 * @property {CalendarDay[]} days - Daily heatmap cells for the rolling year.
 * @property {ActivityOverview} activity - Parsed Activity Overview metadata and percentages.
 * @property {YearLink[]} years - Ordered list of contribution years (`newest` to `oldest`).
 * @property {StreakSummary} streak - Computed 3-column streak card metrics.
 */

/**
 * Escapes special characters for safe embedding inside HTML5 text and attribute values.
 *
 * @param {string} value - Raw unescaped string.
 * @returns {string} HTML-escaped string.
 */
export function escapeHtml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Decodes common HTML character entities found in GitHub server-rendered attributes.
 *
 * @param {string} value - HTML-encoded string.
 * @returns {string} Decoded plain string.
 */
export function decodeHtmlEntities(value) {
    return value
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
}

/**
 * Formats an integer using US-English thousands separators (e.g. `20600` -> `20,600`).
 *
 * @param {number} value - Numeric count to format.
 * @returns {string} Comma-formatted integer string.
 */
export function formatCount(value) {
    return new Intl.NumberFormat('en-US').format(Math.trunc(value));
}

/**
 * Parses an ISO `YYYY-MM-DD` date string into numeric `[year, month, day]` parts.
 *
 * @param {string} isoDate - Date string in `YYYY-MM-DD` format.
 * @returns {{ year: number, month: number, day: number }} Parsed calendar components.
 */
export function parseIsoDate(isoDate) {
    const parts = isoDate.slice(0, 10).split('-');
    return {
        year: Number(parts[0]),
        month: Number(parts[1]),
        day: Number(parts[2])
    };
}

/**
 * Formats an ISO `YYYY-MM-DD` date for streak labels, omitting the year when it matches
 * `referenceYear` (matching `github-readme-streak-stats` formatting).
 *
 * @param {string} isoDate - Date string in `YYYY-MM-DD` format.
 * @param {number | null} referenceYear - Current year to elide, or `null` to always include year.
 * @returns {string} Formatted date string such as `May 24, 2011` or `Nov 20`.
 */
export function formatStreakDate(isoDate, referenceYear) {
    const { year, month, day } = parseIsoDate(isoDate);
    const monthName = SHORT_MONTHS[month - 1] || 'Jan';
    if (referenceYear !== null && year === referenceYear) {
        return `${monthName} ${day}`;
    }
    return `${monthName} ${day}, ${year}`;
}

/**
 * Formats a start/end streak date interval identically to `github-readme-streak-stats`.
 *
 * @param {string} startDate - Inclusive streak start `YYYY-MM-DD` (or empty when streak is 0).
 * @param {string} endDate - Inclusive streak end `YYYY-MM-DD` (or empty when streak is 0).
 * @param {number} referenceYear - Current reference year for compact date formatting.
 * @returns {string} Formatted range string (e.g. `Jul 2, 2022 - Nov 20`).
 */
export function formatStreakRange(startDate, endDate, referenceYear) {
    if (!startDate || !endDate) {
        return 'No streak';
    }
    if (startDate === endDate) {
        return formatStreakDate(startDate, referenceYear);
    }
    return `${formatStreakDate(startDate, referenceYear)} - ${formatStreakDate(endDate, referenceYear)}`;
}

/**
 * Extracts a numeric contribution count from a GitHub calendar tooltip text.
 *
 * @param {string} tooltipText - Raw tooltip string (e.g. `15 contributions on November 14th.`).
 * @returns {number} Non-negative integer contribution count.
 */
export function parseContributionCount(tooltipText) {
    const match = tooltipText.trim().match(/^([\d,]+)\s+contributions?\b/i);
    if (!match) {
        return 0;
    }
    return Number(match[1].replace(/,/g, ''));
}

/**
 * Normalizes a relative or absolute GitHub href into a full `https://github.com/...` URL.
 *
 * @param {string} rawHref - Href value from GitHub markup.
 * @returns {string} Canonical absolute GitHub URL.
 */
export function normalizeGitHubUrl(rawHref) {
    const decoded = decodeHtmlEntities(rawHref.trim());
    if (decoded.startsWith('https://') || decoded.startsWith('http://')) {
        return decoded;
    }
    if (decoded.startsWith('/')) {
        return `https://github.com${decoded}`;
    }
    return `https://github.com/${decoded}`;
}

/**
 * Parses GitHub's server-rendered `/users/<login>/contributions` or profile contributions
 * fragment into structured calendar, organization, repository, percentage, and year data.
 *
 * @param {string} html - Raw HTML fragment from GitHub.
 * @param {string} username - GitHub username for fallback titles and URLs.
 * @returns {{
 *   yearlyTotal: number,
 *   months: CalendarMonth[],
 *   days: CalendarDay[],
 *   activity: ActivityOverview,
 *   years: YearLink[]
 * }} Structured rolling-year contribution and activity data.
 */
export function parseContributionsFragment(html, username) {
    const headingMatch = html.match(
        /id="js-contribution-activity-description"[^>]*>\s*([\d,]+)\s+contributions/i
    );
    const yearlyTotal = headingMatch ? Number(headingMatch[1].replace(/,/g, '')) : 0;

    /** @type {CalendarMonth[]} */
    const months = [];
    let runningWeek = 0;
    const monthRegex = /<td\b[^>]*class="ContributionCalendar-label"[^>]*colspan="(\d+)"[^>]*>[\s\S]*?<span\b[^>]*aria-hidden="true"[^>]*>([^<]+)<\/span>/gi;
    for (const match of html.matchAll(monthRegex)) {
        const colspan = Number(match[1]);
        const label = match[2].trim();
        if (label) {
            months.push({ label, weekIndex: runningWeek, colspan });
        }
        runningWeek += colspan;
    }

    /** @type {Map<string, string>} */
    const tooltips = new Map();
    const tooltipRegex = /<tool-tip\b[^>]*\bfor="([^"]+)"[^>]*>([\s\S]*?)<\/tool-tip>/gi;
    for (const match of html.matchAll(tooltipRegex)) {
        tooltips.set(match[1], decodeHtmlEntities(match[2].replace(/\s+/g, ' ').trim()));
    }

    /** @type {CalendarDay[]} */
    const days = [];
    const dayCellRegex = /<td\b[^>]*\bdata-date="(\d{4}-\d{2}-\d{2})"[^>]*>/gi;
    for (const match of html.matchAll(dayCellRegex)) {
        const tag = match[0];
        const date = match[1];
        const idMatch = tag.match(/\bid="([^"]+)"/i);
        const cellId = idMatch ? idMatch[1] : '';
        const coordMatch = cellId.match(/contribution-day-component-(\d+)-(\d+)/);
        const ixMatch = tag.match(/\bdata-ix="(\d+)"/i);
        const levelMatch = tag.match(/\bdata-level="(\d+)"/i);

        const row = coordMatch ? Number(coordMatch[1]) : 0;
        const col = coordMatch ? Number(coordMatch[2]) : (ixMatch ? Number(ixMatch[1]) : 0);
        const level = levelMatch ? Number(levelMatch[1]) : 0;
        const tooltip = tooltips.get(cellId) || `Contributions on ${date}.`;
        const count = parseContributionCount(tooltip);
        days.push({ date, row, col, level, count, tooltip });
    }

    /** @type {YearLink[]} */
    const years = [];
    const seenYears = new Set();
    const yearRegex = /<a\b[^>]*\bid="year-link-(\d{4})"[^>]*\bhref="([^"]+)"[^>]*>/gi;
    for (const match of html.matchAll(yearRegex)) {
        const year = Number(match[1]);
        if (!seenYears.has(year)) {
            seenYears.add(year);
            years.push({ year, href: normalizeGitHubUrl(match[2]) });
        }
    }

    const overviewStart = html.indexOf('id="user-activity-overview"');
    const timelineStart = html.indexOf('id="js-contribution-activity"');
    const overviewHtml = overviewStart === -1
        ? ''
        : html.slice(overviewStart, timelineStart === -1 ? html.length : timelineStart);

    const detailsSplit = overviewHtml.indexOf('<details');
    const featuredOrgChunk = detailsSplit === -1 ? overviewHtml : overviewHtml.slice(0, detailsSplit);
    const moreOrgChunk = detailsSplit === -1 ? '' : overviewHtml.slice(detailsSplit);

    /**
     * Extracts organization filter items from an HTML subsection.
     *
     * @param {string} chunk - HTML slice containing `js-org-filter-link` anchors.
     * @returns {OrganizationFilter[]} Parsed organization filter items.
     */
    const extractOrgs = (chunk) => {
        /** @type {OrganizationFilter[]} */
        const result = [];
        const anchorRegex = /<a\b[^>]*class="[^"]*js-org-filter-link[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
        for (const anchorMatch of chunk.matchAll(anchorRegex)) {
            const fullAnchor = anchorMatch[0];
            const inner = anchorMatch[1];
            const hrefMatch = fullAnchor.match(/\bhref="([^"]+)"/i);
            const imgMatch = inner.match(/<img\b[^>]*\bsrc="([^"]+)"/i);
            const handleMatch = inner.match(/@([A-Za-z0-9_.-]+)/);
            if (hrefMatch && imgMatch && handleMatch) {
                result.push({
                    login: handleMatch[1],
                    href: normalizeGitHubUrl(hrefMatch[1]),
                    avatarUrl: decodeHtmlEntities(imgMatch[1])
                });
            }
        }
        return result;
    };

    const featuredOrgs = extractOrgs(featuredOrgChunk);
    const moreOrgs = extractOrgs(moreOrgChunk);

    /** @type {string[]} */
    const repositories = [];
    const contribMatch = overviewHtml.match(/Contributed to([\s\S]*?)<\/div>/i);
    if (contribMatch) {
        const repoLinkRegex = /<a\b[^>]*\bhref="\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)"[^>]*>/gi;
        for (const repoMatch of contribMatch[1].matchAll(repoLinkRegex)) {
            repositories.push(repoMatch[1]);
        }
    }
    const otherRepoMatch = (contribMatch ? contribMatch[1] : overviewHtml).match(
        /(\d[\d,]*)\s+other\s+repositor(?:y|ies)/i
    );
    const otherRepoCount = otherRepoMatch ? Number(otherRepoMatch[1].replace(/,/g, '')) : 0;

    const titleMatch = overviewHtml.match(
        /<svg\b[^>]*class="[^"]*js-activity-overview-graph[^"]*"[\s\S]*?<title>([\s\S]*?)<\/title>/i
    );
    const titleText = titleMatch
        ? decodeHtmlEntities(titleMatch[1].replace(/\s+/g, ' ').trim())
        : `A graph representing ${username}'s contributions over the past year.`;

    const pctMatch = overviewHtml.match(/\bdata-percentages="([^"]+)"/i);
    /** @type {Record<string, number>} */
    const defaultPercentages = {
        Commits: 100,
        'Pull requests': 0,
        Issues: 0,
        'Code review': 0
    };
    /** @type {Record<string, number>} */
    const percentages = pctMatch
        ? JSON.parse(decodeHtmlEntities(pctMatch[1]))
        : defaultPercentages;

    return {
        yearlyTotal,
        months,
        days,
        activity: {
            featuredOrgs,
            moreOrgs,
            repositories,
            otherRepoCount,
            titleText,
            percentages
        },
        years
    };
}

/**
 * Checks whether two ISO `YYYY-MM-DD` dates are consecutive calendar days (`prev + 1 day === next`).
 *
 * @param {string} prevDate - Earlier `YYYY-MM-DD` date string.
 * @param {string} nextDate - Later `YYYY-MM-DD` date string.
 * @returns {boolean} True when `nextDate` is strictly the day immediately after `prevDate`.
 */
export function isNextCalendarDay(prevDate, nextDate) {
    const prevParts = parseIsoDate(prevDate);
    const nextParts = parseIsoDate(nextDate);
    const prevUtc = Date.UTC(prevParts.year, prevParts.month - 1, prevParts.day);
    const nextUtc = Date.UTC(nextParts.year, nextParts.month - 1, nextParts.day);
    return nextUtc - prevUtc === 86_400_000;
}

/**
 * Computes all-time total contributions, current streak, and longest streak from yearly totals
 * and daily contribution counts, matching `github-readme-streak-stats` semantics.
 *
 * @param {object} params - Streak calculation inputs.
 * @param {number[]} params.yearlyTotals - Total contributions reported for each calendar year.
 * @param {Map<string, number>} params.dailyCounts - Map of `YYYY-MM-DD` -> contribution count.
 * @param {string} params.createdDate - Account creation date (`YYYY-MM-DD`).
 * @param {string} params.referenceDate - Latest calendar date to evaluate (`YYYY-MM-DD`).
 * @returns {StreakSummary} Computed streak summary for the 3-column SVG card.
 */
export function computeStreakStats({ yearlyTotals, dailyCounts, createdDate, referenceDate }) {
    const totalContributions = yearlyTotals.reduce((acc, val) => acc + val, 0);
    const referenceYear = parseIsoDate(referenceDate).year;
    const totalRange = `${formatStreakDate(createdDate, null)} - Present`;

    const sortedDays = [...dailyCounts.entries()]
        .filter(([date]) => date <= referenceDate)
        .sort((a, b) => a[0].localeCompare(b[0]));

    let longestStreak = 0;
    let longestStart = '';
    let longestEnd = '';

    let runLength = 0;
    let runStart = '';
    let prevDate = '';

    for (const [date, count] of sortedDays) {
        if (count > 0) {
            if (runLength === 0 || !isNextCalendarDay(prevDate, date)) {
                runLength = 1;
                runStart = date;
            } else {
                runLength += 1;
            }
            prevDate = date;

            if (runLength > longestStreak) {
                longestStreak = runLength;
                longestStart = runStart;
                longestEnd = date;
            }
        } else {
            runLength = 0;
            runStart = '';
            prevDate = '';
        }
    }

    let currentStreak = 0;
    let currentStart = '';
    let currentEnd = '';

    if (sortedDays.length > 0) {
        let idx = sortedDays.length - 1;
        // If today has 0 contributions so far, preserve an active streak ending yesterday.
        if (
            sortedDays[idx][1] === 0 &&
            idx > 0 &&
            sortedDays[idx - 1][1] > 0 &&
            isNextCalendarDay(sortedDays[idx - 1][0], sortedDays[idx][0])
        ) {
            idx -= 1;
        }

        if (sortedDays[idx][1] > 0) {
            currentEnd = sortedDays[idx][0];
            currentStart = currentEnd;
            currentStreak = 1;
            while (
                idx > 0 &&
                sortedDays[idx - 1][1] > 0 &&
                isNextCalendarDay(sortedDays[idx - 1][0], sortedDays[idx][0])
            ) {
                idx -= 1;
                currentStart = sortedDays[idx][0];
                currentStreak += 1;
            }
        }
    }

    return {
        totalContributions,
        totalRange,
        currentStreak,
        currentRange: formatStreakRange(currentStart, currentEnd, referenceYear),
        longestStreak,
        longestRange: formatStreakRange(longestStart, longestEnd, referenceYear)
    };
}

/**
 * Renders the 3-column GitHub Streak Stats inline `<svg>` (`600x195`), visually identical to
 * `https://github-readme-streak-stats-eight.vercel.app/?user=SamuelMarks&card_width=600`
 * on `https://github.com/SamuelMarks`, with 100% selectable `<text>` elements.
 *
 * @param {StreakSummary} streak - Computed streak metrics.
 * @param {string} username - GitHub handle for the accessible `<title>`.
 * @returns {string} Inline SVG markup string.
 */
export function renderStreakSvg(streak, username) {
    const totalStr = escapeHtml(formatCount(streak.totalContributions));
    const currentStr = escapeHtml(formatCount(streak.currentStreak));
    const longestStr = escapeHtml(formatCount(streak.longestStreak));
    const totalRange = escapeHtml(streak.totalRange);
    const currentRange = escapeHtml(streak.currentRange);
    const longestRange = escapeHtml(streak.longestRange);
    const safeUser = escapeHtml(username);
    const fontStack = '&quot;Segoe UI&quot;, Ubuntu, sans-serif';

    const streakAria = `${safeUser}&#39;s GitHub stats: ${totalStr} total contributions, ${currentStr} day current streak, ${longestStr} day longest streak`;

    return [
        `<svg class="gh-streak-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 195" width="600" height="195" role="img" aria-label="${streakAria}">`,
        `    <title>${streakAria}</title>`,
        `    <defs>`,
        `        <clipPath id="gh-streak-outer-clip">`,
        `            <rect width="600" height="195" rx="4.5"/>`,
        `        </clipPath>`,
        `        <mask id="gh-streak-fire-mask">`,
        `            <rect width="600" height="195" fill="white"/>`,
        `            <ellipse cx="300" cy="32" rx="13" ry="18" fill="black"/>`,
        `        </mask>`,
        `    </defs>`,
        `    <g clip-path="url(#gh-streak-outer-clip)">`,
        `        <rect stroke="#E4E2E2" fill="#FFFEFE" rx="4.5" x="0.5" y="0.5" width="599" height="194"/>`,
        `        <line x1="200" y1="28" x2="200" y2="170" stroke-width="1" stroke="#E4E2E2"/>`,
        `        <line x1="400" y1="28" x2="400" y2="170" stroke-width="1" stroke="#E4E2E2"/>`,
        `        <g transform="translate(100, 48)">`,
        `            <text x="0" y="32" text-anchor="middle" fill="#151515" font-family="${fontStack}" font-weight="700" font-size="28px">${totalStr}</text>`,
        `        </g>`,
        `        <g transform="translate(100, 84)">`,
        `            <text x="0" y="32" text-anchor="middle" fill="#151515" font-family="${fontStack}" font-weight="400" font-size="14px">Total Contributions</text>`,
        `        </g>`,
        `        <g transform="translate(100, 114)">`,
        `            <text x="0" y="32" text-anchor="middle" fill="#464646" font-family="${fontStack}" font-weight="400" font-size="12px">${totalRange}</text>`,
        `        </g>`,
        `        <g mask="url(#gh-streak-fire-mask)">`,
        `            <circle cx="300" cy="71" r="40" fill="none" stroke="#B45309" stroke-width="5"/>`,
        `        </g>`,
        `        <g transform="translate(300, 19.5)">`,
        `            <path d="M -12 -0.5 L 15 -0.5 L 15 23.5 L -12 23.5 L -12 -0.5 Z" fill="none"/>`,
        `            <path d="M 1.5 0.67 C 1.5 0.67 2.24 3.32 2.24 5.47 C 2.24 7.53 0.89 9.2 -1.17 9.2 C -3.23 9.2 -4.79 7.53 -4.79 5.47 L -4.76 5.11 C -6.78 7.51 -8 10.62 -8 13.99 C -8 18.41 -4.42 22 0 22 C 4.42 22 8 18.41 8 13.99 C 8 8.6 5.41 3.79 1.5 0.67 Z M -0.29 19 C -2.07 19 -3.51 17.6 -3.51 15.86 C -3.51 14.24 -2.46 13.1 -0.7 12.74 C 1.07 12.38 2.9 11.53 3.92 10.16 C 4.31 11.45 4.51 12.81 4.51 14.2 C 4.51 16.85 2.36 19 -0.29 19 Z" fill="#B45309"/>`,
        `        </g>`,
        `        <g transform="translate(300, 48)">`,
        `            <text x="0" y="32" text-anchor="middle" fill="#151515" font-family="${fontStack}" font-weight="700" font-size="28px">${currentStr}</text>`,
        `        </g>`,
        `        <g transform="translate(300, 108)">`,
        `            <text x="0" y="32" text-anchor="middle" fill="#B45309" font-family="${fontStack}" font-weight="700" font-size="14px">Current Streak</text>`,
        `        </g>`,
        `        <g transform="translate(300, 145)">`,
        `            <text x="0" y="21" text-anchor="middle" fill="#464646" font-family="${fontStack}" font-weight="400" font-size="12px">${currentRange}</text>`,
        `        </g>`,
        `        <g transform="translate(500, 48)">`,
        `            <text x="0" y="32" text-anchor="middle" fill="#151515" font-family="${fontStack}" font-weight="700" font-size="28px">${longestStr}</text>`,
        `        </g>`,
        `        <g transform="translate(500, 84)">`,
        `            <text x="0" y="32" text-anchor="middle" fill="#151515" font-family="${fontStack}" font-weight="400" font-size="14px">Longest Streak</text>`,
        `        </g>`,
        `        <g transform="translate(500, 114)">`,
        `            <text x="0" y="32" text-anchor="middle" fill="#464646" font-family="${fontStack}" font-weight="400" font-size="12px">${longestRange}</text>`,
        `        </g>`,
        `    </g>`,
        `</svg>`
    ].join(NL);
}

/**
 * Renders the GitHub 53-week Contribution Calendar inline `<svg>` with selectable `<text>`
 * month and weekday labels and native `<title>` tooltips on every day cell.
 *
 * @param {CalendarMonth[]} months - Month header spans across the 53-week grid.
 * @param {CalendarDay[]} days - Daily heatmap entries.
 * @param {number} yearlyTotal - Rolling-year contribution total for accessible labeling.
 * @returns {string} Inline SVG markup string.
 */
export function renderCalendarSvg(months, days, yearlyTotal) {
    const maxCol = days.reduce((max, d) => Math.max(max, d.col), 52);
    const gridLeft = 28;
    const gridTop = 18;
    const cellPitch = 13;
    const svgWidth = gridLeft + (maxCol + 1) * cellPitch;
    const svgHeight = gridTop + 7 * cellPitch;

    const monthNodes = months.map((m) => {
        const x = gridLeft + m.weekIndex * cellPitch;
        return `        <text class="gh-calendar-label" x="${x}" y="11">${escapeHtml(m.label)}</text>`;
    });

    const weekdayLabels = [
        { row: 1, text: 'Mon' },
        { row: 3, text: 'Wed' },
        { row: 5, text: 'Fri' }
    ].map(({ row, text }) => {
        const y = gridTop + row * cellPitch + 8.5;
        return `        <text class="gh-calendar-label" x="0" y="${y}">${text}</text>`;
    });

    const sortedDays = [...days].sort((a, b) => (a.col - b.col) || (a.row - b.row));
    const rectNodes = sortedDays.map((day) => {
        const x = gridLeft + day.col * cellPitch;
        const y = gridTop + day.row * cellPitch;
        return `        <rect class="gh-calendar-day" x="${x}" y="${y}" width="10" height="10" rx="2" ry="2" data-date="${escapeHtml(day.date)}" data-level="${day.level}"><title>${escapeHtml(day.tooltip)}</title></rect>`;
    });

    const calendarLabel = `${escapeHtml(formatCount(yearlyTotal))} contributions in the last year`;
    return [
        `<svg class="gh-calendar-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" role="img" aria-label="${calendarLabel}">`,
        `    <title>${calendarLabel}</title>`,
        ...monthNodes,
        ...weekdayLabels,
        ...rectNodes,
        `</svg>`
    ].join(NL);
}

/**
 * Comparator matching GitHub's exact axis-key ordering in `initializeOverviewGraphContainer`:
 * sorts by string length ascending, breaking ties lexicographically.
 *
 * @param {string} a - First category key.
 * @param {string} b - Second category key.
 * @returns {number} Negative, zero, or positive sort order.
 */
export function compareActivityAxisKeys(a, b) {
    if (a.length < b.length) {
        return -1;
    }
    if (a.length > b.length) {
        return 1;
    }
    return a.localeCompare(b);
}

/**
 * Rounds a coordinate to at most 2 decimal places for compact SVG output.
 *
 * @param {number} n - Coordinate value.
 * @returns {number} Rounded coordinate value.
 */
export function roundCoord(n) {
    return Number(n.toFixed(2));
}

/**
 * Renders GitHub's 4-axis Activity Overview cross/spider `<svg>` using GitHub's exact
 * axis ordering (`Code review` top, `Issues` right, `Pull requests` bottom, `Commits` left),
 * normalized polygon extents, `#40c463` highlight blob, `#116329` axes/vertices, and
 * selectable `<text>` labels.
 *
 * @param {Record<string, number>} percentages - Category percentage map.
 * @param {string} titleText - Accessible `<title>` string describing the breakdown.
 * @returns {string} Inline SVG markup string.
 */
export function renderActivityOverviewSvg(percentages, titleText) {
    /** @type {Record<string, number>} */
    const merged = {
        Commits: 0,
        'Pull requests': 0,
        Issues: 0,
        'Code review': 0,
        ...percentages
    };
    const keys = Object.keys(merged).sort(compareActivityAxisKeys);
    const [leftKey, rightKey] = keys.slice(0, 2).sort();
    const [topKey, bottomKey] = keys.slice(2, 4).sort();

    const topPct = merged[topKey];
    const rightPct = merged[rightKey];
    const bottomPct = merged[bottomKey];
    const leftPct = merged[leftKey];

    const canvasSize = 280;
    const pad = 76;
    const cx = canvasSize / 2;
    const cy = canvasSize / 2;
    const maxCoord = canvasSize - pad;
    const radius = cx - pad;

    const maxPct = Math.max(topPct, rightPct, bottomPct, leftPct) / 100;
    const normTop = maxPct > 0 ? (topPct / 100) / maxPct : 0;
    const normRight = maxPct > 0 ? (rightPct / 100) / maxPct : 0;
    const normBottom = maxPct > 0 ? (bottomPct / 100) / maxPct : 0;
    const normLeft = maxPct > 0 ? (leftPct / 100) / maxPct : 0;

    let pyTop = pad + (1 - normTop) * radius;
    let pxRight = maxCoord - (1 - normRight) * radius;
    let pyBottom = Math.max(maxCoord - (1 - normBottom) * radius, cy);
    let pxLeft = pad + (1 - normLeft) * radius;

    if (pyTop + 4 < cy) {
        pyTop += 4;
    }
    if (pxRight - 4 > cx) {
        pxRight -= 4;
    }
    if (pyBottom - 4 > cy) {
        pyBottom -= 4;
    }
    if (pxLeft + 4 < cx) {
        pxLeft += 4;
    }

    const hasAny = (topPct + rightPct + bottomPct + leftPct) > 0;
    const blobPath = hasAny
        ? `M${roundCoord(cx)},${roundCoord(pyTop)} L${roundCoord(pxRight)},${roundCoord(cy)} L${roundCoord(cx)},${roundCoord(pyBottom)} L${roundCoord(pxLeft)},${roundCoord(cy)} z`
        : '';

    /** @type {string[]} */
    const points = [];
    if (topPct > 0) {
        points.push(`        <ellipse class="gh-activity-point" cx="${roundCoord(cx)}" cy="${roundCoord(pyTop - 2)}" rx="3" ry="3" stroke-width="2" fill="#ffffff"/>`);
    }
    if (rightPct > 0) {
        points.push(`        <ellipse class="gh-activity-point" cx="${roundCoord(pxRight + 2)}" cy="${roundCoord(cy)}" rx="3" ry="3" stroke-width="2" fill="#ffffff"/>`);
    }
    if (bottomPct > 0) {
        points.push(`        <ellipse class="gh-activity-point" cx="${roundCoord(cx)}" cy="${roundCoord(pyBottom + 2)}" rx="3" ry="3" stroke-width="2" fill="#ffffff"/>`);
    }
    if (leftPct > 0) {
        points.push(`        <ellipse class="gh-activity-point" cx="${roundCoord(pxLeft - 2)}" cy="${roundCoord(cy)}" rx="3" ry="3" stroke-width="2" fill="#ffffff"/>`);
    }

    /** @type {string[]} */
    const labels = [];
    if (topPct > 0) {
        labels.push(`        <text class="gh-activity-percent" x="${cx}" y="${pad - 25}" text-anchor="middle">${topPct}%</text>`);
    }
    labels.push(`        <text class="gh-activity-label" x="${cx}" y="${pad - 10}" text-anchor="middle">${escapeHtml(topKey)}</text>`);

    if (rightPct > 0) {
        labels.push(`        <text class="gh-activity-percent" x="${maxCoord + 30}" y="${cy - 4}" text-anchor="middle">${rightPct}%</text>`);
        labels.push(`        <text class="gh-activity-label" x="${maxCoord + 30}" y="${cy + 12}" text-anchor="middle">${escapeHtml(rightKey)}</text>`);
    } else {
        labels.push(`        <text class="gh-activity-label" x="${maxCoord + 30}" y="${cy + 4}" text-anchor="middle">${escapeHtml(rightKey)}</text>`);
    }

    if (bottomPct > 0) {
        labels.push(`        <text class="gh-activity-percent" x="${cx}" y="${maxCoord + 18}" text-anchor="middle">${bottomPct}%</text>`);
        labels.push(`        <text class="gh-activity-label" x="${cx}" y="${maxCoord + 34}" text-anchor="middle">${escapeHtml(bottomKey)}</text>`);
    } else {
        labels.push(`        <text class="gh-activity-label" x="${cx}" y="${maxCoord + 18}" text-anchor="middle">${escapeHtml(bottomKey)}</text>`);
    }

    if (leftPct > 0) {
        labels.push(`        <text class="gh-activity-percent" x="${pad - 38}" y="${cy - 4}" text-anchor="middle">${leftPct}%</text>`);
        labels.push(`        <text class="gh-activity-label" x="${pad - 38}" y="${cy + 12}" text-anchor="middle">${escapeHtml(leftKey)}</text>`);
    } else {
        labels.push(`        <text class="gh-activity-label" x="${pad - 38}" y="${cy + 4}" text-anchor="middle">${escapeHtml(leftKey)}</text>`);
    }

    const safeTitle = escapeHtml(titleText);
    return [
        `<svg class="gh-activity-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 32 280 216" role="img" aria-label="${safeTitle}">`,
        `    <title>${safeTitle}</title>`,
        `    <g>`,
        blobPath
            ? `        <path d="${blobPath}" stroke-linejoin="round" fill="#40c463" stroke="#40c463" fill-opacity="0.5" stroke-opacity="0.5" stroke-width="7"/>`
            : '',
        `        <line class="gh-activity-axis" x1="${pad}" y1="${cy}" x2="${maxCoord}" y2="${cy}" stroke-width="2" stroke-linecap="round"/>`,
        `        <line class="gh-activity-axis" x1="${cx}" y1="${pad}" x2="${cx}" y2="${maxCoord}" stroke-width="2" stroke-linecap="round"/>`,
        ...points,
        ...labels,
        `    </g>`,
        `</svg>`
    ].filter(Boolean).join(NL);
}

/**
 * Formats the `"Contributed to ..."` repository summary sentence with clickable GitHub links.
 *
 * @param {string[]} repositories - Featured `owner/repo` names.
 * @param {number} otherRepoCount - Additional repository count.
 * @param {string} username - Fallback GitHub username when no featured repos are listed.
 * @returns {string} HTML snippet for the Activity Overview repository summary.
 */
export function renderContributedReposHtml(repositories, otherRepoCount, username) {
    if (repositories.length === 0) {
        return `Contributed to <a class="gh-link font-semibold" href="https://github.com/${escapeHtml(username)}">@${escapeHtml(username)}</a>`;
    }

    const links = repositories.map(
        (repo) => `<a class="gh-link font-semibold" href="https://github.com/${escapeHtml(repo)}">${escapeHtml(repo)}</a>`
    );

    if (otherRepoCount > 0) {
        const noun = otherRepoCount === 1 ? 'other repository' : 'other repositories';
        return `Contributed to ${links.join(', ')} and <span class="gh-other-repos">${escapeHtml(formatCount(otherRepoCount))} ${noun}</span>`;
    }

    if (links.length === 1) {
        return `Contributed to ${links[0]}`;
    }
    return `Contributed to ${links.slice(0, -1).join(', ')} and ${links[links.length - 1]}`;
}

/**
 * Renders the complete inner HTML of `<section id="contributions">`, combining:
 * - Section heading bar with live rolling-year contribution count
 * - Selectable 3-column GitHub Streak Stats SVG card
 * - Selectable GitHub Yearly Contribution Calendar SVG + legend
 * - Joined Activity Overview card (org pills, `More` menu, contributed repos, 4-axis cross SVG)
 * - Contribution year navigation list
 *
 * @param {ProfileStats} stats - Complete fetched and computed GitHub profile statistics.
 * @returns {string} Indented HTML5 markup for `<section id="contributions">`.
 */
export function renderContributionsSection(stats) {
    const formattedYearly = escapeHtml(formatCount(stats.yearlyTotal));
    const safeUser = escapeHtml(stats.username);
    const streakSvg = renderStreakSvg(stats.streak, stats.username);
    const calendarSvg = renderCalendarSvg(stats.months, stats.days, stats.yearlyTotal);
    const activitySvg = renderActivityOverviewSvg(stats.activity.percentages, stats.activity.titleText);
    const contributedHtml = renderContributedReposHtml(
        stats.activity.repositories,
        stats.activity.otherRepoCount,
        stats.username
    );

    const featuredOrgPills = stats.activity.featuredOrgs.map(
        (org) => [
            `<a class="gh-org-pill" href="${escapeHtml(org.href)}">`,
            `    <img class="gh-org-avatar" src="${escapeHtml(org.avatarUrl)}" alt="" width="20" height="20" loading="lazy">`,
            `    <span>@${escapeHtml(org.login)}</span>`,
            `</a>`
        ].join(NL)
    ).join(NL);

    const moreOrgsDropdown = stats.activity.moreOrgs.length > 0
        ? [
            `<details class="gh-org-more">`,
            `    <summary aria-label="More organizations">More</summary>`,
            `    <div class="gh-org-menu">`,
            `        <div class="gh-org-menu-header">Organizations</div>`,
            `        <ul class="gh-org-menu-list">`,
            ...stats.activity.moreOrgs.map(
                (org) => [
                    `            <li>`,
                    `                <a class="gh-org-menu-link" href="${escapeHtml(org.href)}">`,
                    `                    <img class="gh-org-avatar" src="${escapeHtml(org.avatarUrl)}" alt="" width="20" height="20" loading="lazy">`,
                    `                    <span>@${escapeHtml(org.login)}</span>`,
                    `                </a>`,
                    `            </li>`
                ].join(NL)
            ),
            `        </ul>`,
            `    </div>`,
            `</details>`
        ].join(NL)
        : '';

    const orgBarHtml = (featuredOrgPills || moreOrgsDropdown)
        ? [
            `<div class="gh-org-bar" role="group" aria-label="Organizations contributed to">`,
            featuredOrgPills,
            moreOrgsDropdown,
            `</div>`
        ].filter(Boolean).join(NL)
        : '';

    const yearItemsHtml = stats.years.map((item, idx) => {
        if (idx === 0) {
            return `<li><a class="gh-year-link gh-year-link-active" href="${escapeHtml(item.href)}">${item.year}<span class="sr-only"> (current year)</span></a></li>`;
        }
        return `<li><a class="gh-year-link" href="${escapeHtml(item.href)}">${item.year}</a></li>`;
    }).join(NL);

    return [
        `                <!-- Contributions & Open-Source Activity (auto-updated via npm run update:github-stats) -->`,
        `                <section id="contributions" aria-labelledby="contributions-heading">`,
        `                    <div class="section-heading-bar">`,
        `                        <h2 id="contributions-heading" class="section-title">${formattedYearly} Annual Open-Source Contributions</h2>`,
        `                        <a class="gh-link text-xs" href="https://github.com/${safeUser}">View @${safeUser} on GitHub (800+ repos &middot; 300+ original) &rarr;</a>`,
        `                    </div>`,
        `                    <div class="gh-streak-wrap">`,
        streakSvg,
        `                    </div>`,
        `                    <div class="gh-contrib-layout">`,
        `                        <div class="gh-contrib-main">`,
        `                            <h3 class="gh-yearly-heading">${formattedYearly} contributions in the last year</h3>`,
        `                            <div class="gh-calendar-pane">`,
        `                                <div class="gh-calendar-scroll" tabindex="0" role="region" aria-label="Yearly contribution calendar">`,
        calendarSvg,
        `                                </div>`,
        `                                <div class="gh-calendar-footer">`,
        `                                    <a class="gh-calendar-help" href="https://docs.github.com/articles/why-are-my-contributions-not-showing-up-on-my-profile">Learn how we count contributions</a>`,
        `                                    <div class="gh-calendar-legend" role="group" aria-label="Contribution intensity legend">`,
        `                                        <span aria-hidden="true">Less</span>`,
        `                                        <span class="gh-legend-sq" data-level="0" aria-hidden="true"><span class="sr-only">No contributions</span></span>`,
        `                                        <span class="gh-legend-sq" data-level="1" aria-hidden="true"><span class="sr-only">Low contributions</span></span>`,
        `                                        <span class="gh-legend-sq" data-level="2" aria-hidden="true"><span class="sr-only">Medium-low contributions</span></span>`,
        `                                        <span class="gh-legend-sq" data-level="3" aria-hidden="true"><span class="sr-only">Medium-high contributions</span></span>`,
        `                                        <span class="gh-legend-sq" data-level="4" aria-hidden="true"><span class="sr-only">High contributions</span></span>`,
        `                                        <span aria-hidden="true">More</span>`,
        `                                        <span class="sr-only">Five contribution intensity levels from none to high.</span>`,
        `                                    </div>`,
        `                                </div>`,
        `                            </div>`,
        `                            <div class="gh-activity-pane">`,
        orgBarHtml,
        `                                <div class="gh-activity-grid">`,
        `                                    <div class="gh-activity-left">`,
        `                                        <h4 class="gh-activity-heading">Activity overview</h4>`,
        `                                        <div class="gh-contributed-row">`,
        `                                            <svg class="gh-octicon-repo" aria-hidden="true" height="16" width="16" viewBox="0 0 16 16">`,
        `                                                <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z"/>`,
        `                                            </svg>`,
        `                                            <div>${contributedHtml}</div>`,
        `                                        </div>`,
        `                                    </div>`,
        `                                    <div class="gh-activity-right">`,
        activitySvg,
        `                                    </div>`,
        `                                </div>`,
        `                            </div>`,
        `                        </div>`,
        stats.years.length > 0
            ? [
                `                        <nav class="gh-year-sidebar" aria-label="Contribution activity by year">`,
                `                            <ol class="gh-year-list">`,
                yearItemsHtml,
                `                            </ol>`,
                `                        </nav>`
            ].join(NL)
            : '',
        `                    </div>`,
        `                </section>`
    ].filter(Boolean).join(NL);
}

/**
 * Replaces the `<section id="contributions" ...>...</section>` block inside `index.html`.
 *
 * @param {string} indexHtml - Full contents of `index.html`.
 * @param {string} renderedSection - Replacement `<section id="contributions">...</section>` markup.
 * @returns {string} Updated `index.html` document string.
 */
export function replaceContributionsSection(indexHtml, renderedSection) {
    const pattern = /(?:[ \t]*<!--[^\r\n]*Contributions[^\r\n]*-->\r?\n)?[ \t]*<section\s+id="contributions"[\s\S]*?<\/section>/;
    if (!pattern.test(indexHtml)) {
        throw new Error('Unable to locate <section id="contributions"> in index.html');
    }
    return indexHtml.replace(pattern, renderedSection);
}

/**
 * Fetches text or JSON from a URL and throws an explicit Error on non-2xx HTTP statuses.
 *
 * @param {typeof fetch} fetchFn - Fetch implementation.
 * @param {string} url - Request URL.
 * @param {Record<string, string>} headers - HTTP request headers.
 * @returns {Promise<string>} Response body text.
 */
export async function fetchTextChecked(fetchFn, url, headers) {
    const response = await fetchFn(url, { headers });
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} fetching ${url}`);
    }
    return response.text();
}

/**
 * Parses a `github-readme-streak-stats` SVG document into a `StreakSummary` when valid,
 * ensuring 1:1 parity with the live badge embedded in `@SamuelMarks`'s profile README.
 *
 * @param {string} svgText - Raw SVG markup returned by `github-readme-streak-stats`.
 * @returns {StreakSummary | null} Parsed streak metrics, or `null` if the SVG is an error/invalid response.
 */
export function parseStreakStatsSvg(svgText) {
    /**
     * Reads trimmed `<text>` content inside `<g transform="translate(x, y)">`.
     *
     * @param {number} x - Group X translation.
     * @param {number} y - Group Y translation.
     * @returns {string} Extracted text content or empty string.
     */
    const readGroupText = (x, y) => {
        const pattern = new RegExp(
            `<g\\s+transform=['"]translate\\(${x},\\s*${y}\\)['"][^>]*>[\\s\\S]*?<text[^>]*>([\\s\\S]*?)<\\/text>`,
            'i'
        );
        const match = svgText.match(pattern);
        return match ? decodeHtmlEntities(match[1].replace(/\s+/g, ' ').trim()) : '';
    };

    const totalText = readGroupText(100, 48);
    const totalRange = readGroupText(100, 114);
    const currentText = readGroupText(300, 48);
    const currentRange = readGroupText(300, 145);
    const longestText = readGroupText(500, 48);
    const longestRange = readGroupText(500, 114);

    if (!totalText || !totalRange || !currentText || !currentRange || !longestText || !longestRange) {
        return null;
    }

    const totalContributions = Number(totalText.replace(/,/g, ''));
    const currentStreak = Number(currentText.replace(/,/g, ''));
    const longestStreak = Number(longestText.replace(/,/g, ''));

    if (
        Number.isNaN(totalContributions) ||
        Number.isNaN(currentStreak) ||
        Number.isNaN(longestStreak)
    ) {
        return null;
    }

    return {
        totalContributions,
        totalRange,
        currentStreak,
        currentRange,
        longestStreak,
        longestRange
    };
}

/**
 * Fetches live GitHub profile, rolling-year calendar, activity overview, and multi-year streak
 * statistics for `username` using GitHub's public endpoints.
 *
 * @param {object} [options] - Fetch configuration.
 * @param {string} [options.username] - Target GitHub login (defaults to `SamuelMarks`).
 * @param {typeof fetch} [options.fetchFn] - Custom `fetch` implementation for testing.
 * @param {string} [options.token] - Optional GitHub bearer token for higher API rate limits.
 * @returns {Promise<ProfileStats>} Complete parsed and computed GitHub stats.
 */
export async function fetchGitHubProfileStats(options = {}) {
    const username = options.username || 'SamuelMarks';
    const fetchFn = options.fetchFn || fetch;
    const token = options.token || '';

    const htmlHeaders = {
        'X-Requested-With': 'XMLHttpRequest',
        Accept: 'text/html',
        'User-Agent': 'stanford-imsamuel-stats-updater'
    };

    /** @type {Record<string, string>} */
    const apiHeaders = {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'stanford-imsamuel-stats-updater'
    };
    if (token) {
        apiHeaders.Authorization = `Bearer ${token}`;
    }

    const baseContribUrl = `https://github.com/${encodeURIComponent(username)}?action=show&controller=profiles&tab=contributions&user_id=${encodeURIComponent(username)}`;
    const streakCardUrl = `https://github-readme-streak-stats-eight.vercel.app/?user=${encodeURIComponent(username)}&card_width=600`;

    const rollingHtml = await fetchTextChecked(fetchFn, baseContribUrl, htmlHeaders);
    const rolling = parseContributionsFragment(rollingHtml, username);

    /** @type {StreakSummary | null} */
    let streak = null;
    try {
        const streakSvgText = await fetchTextChecked(fetchFn, streakCardUrl, {
            Accept: 'image/svg+xml,text/plain,*/*',
            'User-Agent': 'stanford-imsamuel-stats-updater'
        });
        streak = parseStreakStatsSvg(streakSvgText);
    } catch {
        streak = null;
    }

    if (!streak) {
        const targetYears = rolling.years.length > 0
            ? rolling.years.map((y) => y.year)
            : [new Date().getUTCFullYear()];

        const yearHtmls = await Promise.all(
            targetYears.map((year) => {
                const yearUrl = `${baseContribUrl}&from=${year}-01-01&to=${year}-12-31`;
                return fetchTextChecked(fetchFn, yearUrl, htmlHeaders);
            })
        );

        /** @type {number[]} */
        const yearlyTotals = [];
        /** @type {Map<string, number>} */
        const dailyCounts = new Map();

        for (const yearHtml of yearHtmls) {
            const parsedYear = parseContributionsFragment(yearHtml, username);
            yearlyTotals.push(parsedYear.yearlyTotal);
            for (const day of parsedYear.days) {
                dailyCounts.set(day.date, day.count);
            }
        }
        for (const day of rolling.days) {
            dailyCounts.set(day.date, day.count);
        }

        let createdDate = '';
        try {
            const userJsonText = await fetchTextChecked(
                fetchFn,
                `https://api.github.com/users/${encodeURIComponent(username)}`,
                apiHeaders
            );
            const userObj = JSON.parse(userJsonText);
            if (typeof userObj.created_at === 'string' && userObj.created_at.length >= 10) {
                createdDate = userObj.created_at.slice(0, 10);
            }
        } catch {
            createdDate = '';
        }

        const sortedDates = [...dailyCounts.keys()].sort();
        const fallbackStart = sortedDates[0] || '2011-05-24';
        const rollingDates = rolling.days.map((d) => d.date).sort();
        const referenceDate = rollingDates[rollingDates.length - 1] || sortedDates[sortedDates.length - 1] || fallbackStart;

        streak = computeStreakStats({
            yearlyTotals,
            dailyCounts,
            createdDate: createdDate || fallbackStart,
            referenceDate
        });
    }

    return {
        username,
        yearlyTotal: rolling.yearlyTotal,
        months: rolling.months,
        days: rolling.days,
        activity: rolling.activity,
        years: rolling.years,
        streak
    };
}

/**
 * Fetches `@SamuelMarks` GitHub stats and writes the selectable HTML + inline SVG section
 * into `index.html`.
 *
 * @param {object} [options] - Updater options.
 * @param {string} [options.indexPath] - Path to `index.html`.
 * @param {string} [options.username] - GitHub username (defaults to `SamuelMarks`).
 * @param {typeof fetch} [options.fetchFn] - Fetch implementation.
 * @param {string} [options.token] - Optional GitHub API token.
 * @param {{ readFileSync: typeof fs.readFileSync, writeFileSync: typeof fs.writeFileSync }} [options.fsImpl] - Optional filesystem implementation for hermetic tests.
 * @returns {Promise<ProfileStats>} Updated profile statistics written to disk.
 */
export async function updateIndexGitHubStats(options = {}) {
    const defaultIndex = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'index.html');
    const indexPath = options.indexPath || defaultIndex;
    const fsImpl = options.fsImpl || fs;
    const stats = await fetchGitHubProfileStats({
        username: options.username,
        fetchFn: options.fetchFn,
        token: options.token
    });
    const currentHtml = fsImpl.readFileSync(indexPath, 'utf8');
    const renderedSection = renderContributionsSection(stats);
    const updatedHtml = replaceContributionsSection(currentHtml, renderedSection);
    fsImpl.writeFileSync(indexPath, updatedHtml, 'utf8');
    return stats;
}

/**
 * CLI entry point invoked when `scripts/update-github-stats.js` is executed directly.
 *
 * @param {string} metaUrl - `import.meta.url` of this module.
 * @param {string[]} argv - Process argument vector (`process.argv`).
 * @param {{
 *   env?: Record<string, string | undefined>,
 *   stdout?: { write: (chunk: string) => unknown },
 *   stderr?: { write: (chunk: string) => unknown },
 *   runUpdate?: typeof updateIndexGitHubStats,
 *   setExitCode?: (code: number) => void
 * }} [runtime] - Injectable process runtime hooks for deterministic CLI testing.
 * @returns {Promise<boolean>} True when executed as main CLI, false when imported as a library.
 */
export async function runCliIfMain(metaUrl, argv, runtime = {}) {
    const entryScript = argv[1] ? path.resolve(argv[1]) : '';
    const modulePath = fileURLToPath(metaUrl);
    if (!entryScript || entryScript !== modulePath) {
        return false;
    }

    const env = runtime.env || process.env;
    const stdout = runtime.stdout || process.stdout;
    const stderr = runtime.stderr || process.stderr;
    const runUpdate = runtime.runUpdate || updateIndexGitHubStats;
    const setExitCode = runtime.setExitCode || ((code) => {
        process.exitCode = code;
    });

    const userFlagIdx = argv.indexOf('--user');
    const username = (userFlagIdx !== -1 && argv[userFlagIdx + 1])
        ? argv[userFlagIdx + 1]
        : (env.GITHUB_USER || 'SamuelMarks');
    const indexFlagIdx = argv.indexOf('--index');
    const indexPath = (indexFlagIdx !== -1 && argv[indexFlagIdx + 1])
        ? argv[indexFlagIdx + 1]
        : undefined;
    const token = env.GITHUB_TOKEN || env.GH_TOKEN || '';

    try {
        const stats = await runUpdate({ indexPath, username, token });
        stdout.write(
            `Updated GitHub stats for @${stats.username}: ` +
            `${formatCount(stats.yearlyTotal)} last-year, ` +
            `${formatCount(stats.streak.totalContributions)} total, ` +
            `${formatCount(stats.streak.currentStreak)}-day streak.${NL}`
        );
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        stderr.write(`Failed to update GitHub stats: ${message}${NL}`);
        setExitCode(1);
    }
    return true;
}

runCliIfMain(import.meta.url, process.argv);
