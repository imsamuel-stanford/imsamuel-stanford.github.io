/**
 * @file Deterministic test suite verifying:
 * 1. Selectable SVG/HTML GitHub stats invariants in `index.html`, `package.json`, and `assets/styles.css`.
 * 2. 100% JSDoc documentation coverage and 100% line, branch, and function coverage of `scripts/update-github-stats.js`.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
    compareActivityAxisKeys,
    computeStreakStats,
    decodeHtmlEntities,
    escapeHtml,
    fetchGitHubProfileStats,
    fetchTextChecked,
    formatCount,
    formatStreakDate,
    formatStreakRange,
    isNextCalendarDay,
    normalizeGitHubUrl,
    parseContributionCount,
    parseContributionsFragment,
    parseIsoDate,
    parseStreakStatsSvg,
    renderActivityOverviewSvg,
    renderCalendarSvg,
    renderContributedReposHtml,
    renderContributionsSection,
    renderStreakSvg,
    replaceContributionsSection,
    roundCoord,
    runCliIfMain,
    updateIndexGitHubStats
} from '../scripts/update-github-stats.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const scriptPath = path.join(repoRoot, 'scripts', 'update-github-stats.js');
const NL = String.fromCharCode(10);

/**
 * Builds a realistic mock `github-readme-streak-stats` SVG response.
 *
 * @returns {string} Mock streak SVG string.
 */
function buildSampleStreakSvg() {
    return [
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 195">`,
        `  <g transform='translate(100, 48)'><text>20,600</text></g>`,
        `  <g transform='translate(100, 84)'><text>Total Contributions</text></g>`,
        `  <g transform='translate(100, 114)'><text>May 24, 2011 - Present</text></g>`,
        `  <g transform="translate(300, 48)"><text>1,603</text></g>`,
        `  <g transform="translate(300, 108)"><text>Current Streak</text></g>`,
        `  <g transform="translate(300, 145)"><text>Jul 2, 2022 - Nov 20</text></g>`,
        `  <g transform='translate(500, 48)'><text>1,603</text></g>`,
        `  <g transform='translate(500, 84)'><text>Longest Streak</text></g>`,
        `  <g transform='translate(500, 114)'><text>Jul 2, 2022 - Nov 20</text></g>`,
        `</svg>`
    ].join(NL);
}

/**
 * Builds a realistic GitHub server-rendered contributions + activity overview HTML fragment.
 *
 * @returns {string} Mock GitHub contributions HTML fragment.
 */
function buildSampleContributionsHtml() {
    return [
        `<div class="js-yearly-contributions">`,
        `  <h2 id="js-contribution-activity-description">6,977 contributions in the last year</h2>`,
        `  <table>`,
        `    <thead><tr>`,
        `      <td class="ContributionCalendar-label" colspan="3"><span aria-hidden="true">Nov</span></td>`,
        `      <td class="ContributionCalendar-label" colspan="1"><span aria-hidden="true">   </span></td>`,
        `      <td class="ContributionCalendar-label" colspan="4"><span aria-hidden="true">Dec</span></td>`,
        `    </tr></thead>`,
        `    <tbody><tr>`,
        `      <td id="contribution-day-component-1-2" data-ix="2" data-date="2026-11-19" data-level="2" class="ContributionCalendar-day"></td>`,
        `      <tool-tip for="contribution-day-component-1-2">6 contributions on November 19th.</tool-tip>`,
        `      <td id="contribution-day-component-0-2" data-ix="2" data-date="2026-11-18" data-level="1" class="ContributionCalendar-day"></td>`,
        `      <tool-tip for="contribution-day-component-0-2">1 contribution on November 18th.</tool-tip>`,
        `      <td id="custom-cell" data-ix="4" data-date="2026-11-20" data-level="3" class="ContributionCalendar-day"></td>`,
        `      <tool-tip for="custom-cell">13 contributions on November 20th.</tool-tip>`,
        `      <td data-date="2026-11-17" class="ContributionCalendar-day"></td>`,
        `    </tr></tbody>`,
        `  </table>`,
        `</div>`,
        `<div id="user-activity-overview">`,
        `  <a class="js-org-filter-link" href="/SamuelMarks?tab=overview&amp;org=offscale">`,
        `    <img src="https://avatars.githubusercontent.com/u/11748352?s=40&amp;v=4" alt="" /> @offscale`,
        `  </a>`,
        `  <a class="js-org-filter-link" href="/broken-org-without-img">@skipme</a>`,
        `  <details>`,
        `    <summary>More</summary>`,
        `    <a class="js-org-filter-link" href="SamuelMarks?tab=overview&amp;org=AI-Hypercomputer">`,
        `      <img src="https://avatars.githubusercontent.com/u/181000646?s=40&amp;v=4" alt="" />`,
        `      <div>@AI-Hypercomputer</div>`,
        `    </a>`,
        `  </details>`,
        `  <div class="d-flex mb-2">`,
        `    Contributed to <a href="/SamuelMarks/cdd-c">SamuelMarks/cdd-c</a>,`,
        `    <a href="/offscale/cdd-ts">offscale/cdd-ts</a> and <span>169 other repositories</span>`,
        `  </div>`,
        `  <div class="js-activity-overview-graph-container" data-percentages="{&quot;Commits&quot;:99,&quot;Pull requests&quot;:1,&quot;Issues&quot;:0,&quot;Code review&quot;:0}">`,
        `    <svg class="js-activity-overview-graph">`,
        `      <title>A graph representing SamuelMarks&#39;s contributions from November 16, 2025 to November 20, 2026.</title>`,
        `    </svg>`,
        `  </div>`,
        `</div>`,
        `<div id="js-contribution-activity">`,
        `  <a id="year-link-2026" href="/SamuelMarks?tab=overview&amp;from=2026-11-01&amp;to=2026-11-20">2026</a>`,
        `  <a id="year-link-2026" href="/SamuelMarks?tab=overview&amp;from=2026-11-01&amp;to=2026-11-20">2026</a>`,
        `  <a id="year-link-2025" href="https://github.com/SamuelMarks?tab=overview&amp;from=2025-12-01&amp;to=2025-12-31">2025</a>`,
        `</div>`
    ].join(NL);
}

describe('GitHub Stats Static & Documentation Invariants', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    const html = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
    const css = fs.readFileSync(path.join(repoRoot, 'assets', 'styles.css'), 'utf8');
    const scriptSrc = fs.readFileSync(scriptPath, 'utf8');

    it('wires npm run-scripts for updating GitHub stats in package.json', () => {
        assert.equal(pkg.scripts['update:github-stats'], 'node scripts/update-github-stats.js');
        assert.equal(pkg.scripts['github-stats'], 'node scripts/update-github-stats.js');
    });

    it('maintains 100% JSDoc documentation blocks on all exported functions in scripts/update-github-stats.js', () => {
        const exported = [...scriptSrc.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)].map((m) => m[1]);
        assert.equal(exported.length, 24);
        for (const fnName of exported) {
            const syncMarker = `export function ${fnName}(`;
            const asyncMarker = `export async function ${fnName}(`;
            const idx = scriptSrc.includes(syncMarker)
                ? scriptSrc.indexOf(syncMarker)
                : scriptSrc.indexOf(asyncMarker);
            assert.ok(idx > 0, `Expected exported function ${fnName}`);
            const preceding = scriptSrc.slice(Math.max(0, idx - 1200), idx).trimEnd();
            assert.ok(
                preceding.endsWith('*/') && preceding.includes('/**'),
                `Missing JSDoc block immediately above ${fnName}`
            );
        }
    });

    it('renders selectable inline SVGs and HTML instead of raster PNG screenshots in index.html', () => {
        assert.doesNotMatch(html, /github0\.png|github1\.png/i);
        assert.match(html, /<svg class="gh-streak-svg"/);
        assert.match(html, /<svg class="gh-calendar-svg"/);
        assert.match(html, /<svg class="gh-activity-svg"/);
        assert.match(html, />Total Contributions</);
        assert.match(html, />Current Streak</);
        assert.match(html, />Longest Streak</);
        assert.match(html, />Learn how we count contributions</);
        assert.match(html, />Activity overview</);
        assert.match(html, /Contributed to/);
        assert.match(css, /user-select:\s*text/);
    });
});

describe('GitHub Stats Parser, Renderer & CLI Unit Tests (100% Coverage)', () => {
    it('escapes and decodes HTML entities, numbers, URLs, and dates accurately', () => {
        assert.equal(escapeHtml(`<a href="x&y">'test'</a>`), '&lt;a href=&quot;x&amp;y&quot;&gt;&#39;test&#39;&lt;/a&gt;');
        assert.equal(decodeHtmlEntities('&lt;tag attr=&quot;a&amp;b&#39;s&quot;&gt;'), `<tag attr="a&b's">`);
        assert.equal(formatCount(20600.9), '20,600');
        assert.deepEqual(parseIsoDate('2026-11-20T12:00:00Z'), { year: 2026, month: 11, day: 20 });

        assert.equal(formatStreakDate('2011-05-24', null), 'May 24, 2011');
        assert.equal(formatStreakDate('2026-11-20', 2026), 'Nov 20');
        assert.equal(formatStreakDate('2022-07-02', 2026), 'Jul 2, 2022');
        assert.equal(formatStreakDate('2026-00-01', 2026), 'Jan 1');

        assert.equal(formatStreakRange('', '', 2026), 'No streak');
        assert.equal(formatStreakRange('2026-11-20', '', 2026), 'No streak');
        assert.equal(formatStreakRange('2026-11-20', '2026-11-20', 2026), 'Nov 20');
        assert.equal(formatStreakRange('2022-07-02', '2026-11-20', 2026), 'Jul 2, 2022 - Nov 20');

        assert.equal(parseContributionCount('1,234 contributions on May 1st.'), 1234);
        assert.equal(parseContributionCount('1 contribution on May 2nd.'), 1);
        assert.equal(parseContributionCount('No contributions on May 3rd.'), 0);

        assert.equal(normalizeGitHubUrl('https://github.com/SamuelMarks'), 'https://github.com/SamuelMarks');
        assert.equal(normalizeGitHubUrl('http://example.com/x'), 'http://example.com/x');
        assert.equal(normalizeGitHubUrl('/SamuelMarks?tab=overview&amp;org=offscale'), 'https://github.com/SamuelMarks?tab=overview&org=offscale');
        assert.equal(normalizeGitHubUrl('SamuelMarks?tab=overview'), 'https://github.com/SamuelMarks?tab=overview');

        assert.equal(isNextCalendarDay('2024-02-28', '2024-02-29'), true);
        assert.equal(isNextCalendarDay('2024-02-28', '2024-03-01'), false);
        assert.equal(roundCoord(140.6543), 140.65);
    });

    it('parses rich and minimal GitHub contributions HTML fragments', () => {
        const rich = parseContributionsFragment(buildSampleContributionsHtml(), 'SamuelMarks');
        assert.equal(rich.yearlyTotal, 6977);
        assert.deepEqual(rich.months, [
            { label: 'Nov', weekIndex: 0, colspan: 3 },
            { label: 'Dec', weekIndex: 4, colspan: 4 }
        ]);
        assert.equal(rich.days.length, 4);
        assert.deepEqual(rich.days[0], {
            date: '2026-11-19',
            row: 1,
            col: 2,
            level: 2,
            count: 6,
            tooltip: '6 contributions on November 19th.'
        });
        assert.equal(rich.days[2].col, 4);
        assert.equal(rich.days[3].count, 0);
        assert.equal(rich.activity.featuredOrgs.length, 1);
        assert.equal(rich.activity.featuredOrgs[0].login, 'offscale');
        assert.equal(rich.activity.moreOrgs.length, 1);
        assert.equal(rich.activity.moreOrgs[0].login, 'AI-Hypercomputer');
        assert.deepEqual(rich.activity.repositories, ['SamuelMarks/cdd-c', 'offscale/cdd-ts']);
        assert.equal(rich.activity.otherRepoCount, 169);
        assert.equal(rich.activity.percentages.Commits, 99);
        assert.equal(rich.years.length, 2);

        const minimal = parseContributionsFragment('<div>empty</div>', 'SamuelMarks');
        assert.equal(minimal.yearlyTotal, 0);
        assert.deepEqual(minimal.months, []);
        assert.deepEqual(minimal.days, []);
        assert.deepEqual(minimal.years, []);
        assert.equal(minimal.activity.otherRepoCount, 0);
        assert.equal(minimal.activity.percentages.Commits, 100);
        assert.match(minimal.activity.titleText, /SamuelMarks's contributions/);

        const noTimelineOrDetails = parseContributionsFragment(
            '<div id="user-activity-overview"><span>1 other repository</span></div>',
            'SamuelMarks'
        );
        assert.equal(noTimelineOrDetails.activity.otherRepoCount, 1);
    });

    it('computes streak statistics across gaps, active today, active yesterday, and zero-streak cases', () => {
        const dailyCounts = new Map([
            ['2026-11-10', 4],
            ['2026-11-11', 2],
            ['2026-11-12', 5],
            ['2026-11-13', 0],
            ['2026-11-15', 1],
            ['2026-11-18', 3],
            ['2026-11-19', 7],
            ['2026-11-20', 0],
            ['2026-12-01', 99]
        ]);
        const preservedYesterday = computeStreakStats({
            yearlyTotals: [100, 22],
            dailyCounts,
            createdDate: '2011-05-24',
            referenceDate: '2026-11-20'
        });
        assert.equal(preservedYesterday.totalContributions, 122);
        assert.equal(preservedYesterday.totalRange, 'May 24, 2011 - Present');
        assert.equal(preservedYesterday.longestStreak, 3);
        assert.equal(preservedYesterday.longestRange, 'Nov 10 - Nov 12');
        assert.equal(preservedYesterday.currentStreak, 2);
        assert.equal(preservedYesterday.currentRange, 'Nov 18 - Nov 19');

        const emptyStreak = computeStreakStats({
            yearlyTotals: [],
            dailyCounts: new Map(),
            createdDate: '2011-05-24',
            referenceDate: '2026-11-20'
        });
        assert.equal(emptyStreak.totalContributions, 0);
        assert.equal(emptyStreak.currentStreak, 0);
        assert.equal(emptyStreak.currentRange, 'No streak');

        const zeroEndedStreak = computeStreakStats({
            yearlyTotals: [5],
            dailyCounts: new Map([
                ['2026-11-18', 5],
                ['2026-11-19', 0],
                ['2026-11-20', 0]
            ]),
            createdDate: '2011-05-24',
            referenceDate: '2026-11-20'
        });
        assert.equal(zeroEndedStreak.currentStreak, 0);
        assert.equal(zeroEndedStreak.longestStreak, 1);
        assert.equal(zeroEndedStreak.longestRange, 'Nov 18');
    });

    it('parses valid and invalid github-readme-streak-stats SVGs', () => {
        const parsed = parseStreakStatsSvg(buildSampleStreakSvg());
        assert.deepEqual(parsed, {
            totalContributions: 20600,
            totalRange: 'May 24, 2011 - Present',
            currentStreak: 1603,
            currentRange: 'Jul 2, 2022 - Nov 20',
            longestStreak: 1603,
            longestRange: 'Jul 2, 2022 - Nov 20'
        });

        assert.equal(parseStreakStatsSvg('<svg><text>Error</text></svg>'), null);

        const nanSvg = buildSampleStreakSvg().replace('20,600', 'not-a-number');
        assert.equal(parseStreakStatsSvg(nanSvg), null);
    });

    it('renders selectable SVGs, repository summaries, and full/minimal contributions sections', () => {
        assert.equal(compareActivityAxisKeys('Issues', 'Commits'), -1);
        assert.equal(compareActivityAxisKeys('Commits', 'Issues'), 1);
        assert.equal(compareActivityAxisKeys('Abc', 'Abd'), -1);

        const allPositiveSvg = renderActivityOverviewSvg(
            { Commits: 60, 'Pull requests': 20, Issues: 10, 'Code review': 10 },
            'All four axes active'
        );
        assert.match(allPositiveSvg, />60%</);
        assert.match(allPositiveSvg, />20%</);
        assert.match(allPositiveSvg, />10%</);
        assert.equal([...allPositiveSvg.matchAll(/class="gh-activity-point"/g)].length, 4);

        const zeroSvg = renderActivityOverviewSvg(
            { Commits: 0, 'Pull requests': 0, Issues: 0, 'Code review': 0 },
            'Zero activity'
        );
        assert.doesNotMatch(zeroSvg, /<path d="M/);
        assert.doesNotMatch(zeroSvg, /gh-activity-point/);
        assert.doesNotMatch(zeroSvg, /gh-activity-percent/);

        const sparseSvg = renderActivityOverviewSvg({}, 'Sparse percentages');
        assert.match(sparseSvg, /<svg class="gh-activity-svg"/);

        assert.match(renderContributedReposHtml([], 0, 'SamuelMarks'), /@SamuelMarks/);
        assert.equal(
            renderContributedReposHtml(['SamuelMarks/cdd-c'], 0, 'SamuelMarks'),
            'Contributed to <a class="gh-link font-semibold" href="https://github.com/SamuelMarks/cdd-c">SamuelMarks/cdd-c</a>'
        );
        assert.match(
            renderContributedReposHtml(['SamuelMarks/cdd-c', 'SamuelMarks/libscript'], 0, 'SamuelMarks'),
            /cdd-c<\/a> and <a[^>]+>SamuelMarks\/libscript<\/a>/
        );
        assert.match(
            renderContributedReposHtml(['SamuelMarks/cdd-c'], 1, 'SamuelMarks'),
            /1 other repository<\/span>/
        );
        assert.match(
            renderContributedReposHtml(['SamuelMarks/cdd-c'], 5, 'SamuelMarks'),
            /5 other repositories<\/span>/
        );

        const calSvg = renderCalendarSvg(
            [{ label: 'Nov', weekIndex: 0, colspan: 2 }],
            [
                { date: '2026-11-17', row: 2, col: 0, level: 1, count: 3, tooltip: '3 contributions' },
                { date: '2026-11-16', row: 1, col: 0, level: 0, count: 0, tooltip: 'No contributions' }
            ],
            3
        );
        assert.ok(calSvg.indexOf('2026-11-16') < calSvg.indexOf('2026-11-17'));

        const streakSvg = renderStreakSvg({
            totalContributions: 20600,
            totalRange: 'May 24, 2011 - Present',
            currentStreak: 1603,
            currentRange: 'Jul 2, 2022 - Nov 20',
            longestStreak: 1603,
            longestRange: 'Jul 2, 2022 - Nov 20'
        }, 'SamuelMarks');
        assert.match(streakSvg, />20,600</);
        assert.match(streakSvg, /#B45309/);
        assert.doesNotMatch(streakSvg, /#FB8C00/i);

        const minimalSection = renderContributionsSection({
            username: 'SamuelMarks',
            yearlyTotal: 10,
            months: [],
            days: [],
            activity: {
                featuredOrgs: [],
                moreOrgs: [],
                repositories: [],
                otherRepoCount: 0,
                titleText: 'Summary',
                percentages: { Commits: 100, 'Pull requests': 0, Issues: 0, 'Code review': 0 }
            },
            years: [],
            streak: {
                totalContributions: 10,
                totalRange: 'May 24, 2011 - Present',
                currentStreak: 1,
                currentRange: 'Nov 20',
                longestStreak: 1,
                longestRange: 'Nov 20'
            }
        });
        assert.doesNotMatch(minimalSection, /gh-org-bar/);
        assert.doesNotMatch(minimalSection, /gh-year-sidebar/);
        assert.match(minimalSection, /class="gh-calendar-scroll" tabindex="0" role="region" aria-label="Yearly contribution calendar"/);
        assert.match(minimalSection, /class="gh-calendar-legend" role="group" aria-label="Contribution intensity legend"/);

        assert.throws(
            () => replaceContributionsSection('<html><body>No section</body></html>', minimalSection),
            /Unable to locate <section id="contributions">/
        );
    });

    it('fetches profile stats across primary streak-card and multi-year fallback paths', async () => {
        await assert.rejects(
            () => fetchTextChecked(
                /** @type {any} */ (async () => ({ ok: false, status: 503, text: async () => '' })),
                'https://example.com/fail',
                {}
            ),
            /HTTP 503/
        );

        const sampleContribHtml = buildSampleContributionsHtml();
        const sampleStreakSvg = buildSampleStreakSvg();

        // 1. Primary path using default globalThis.fetch + Authorization token
        const originalFetch = globalThis.fetch;
        try {
            /** @type {string[]} */
            const seenAuth = [];
            globalThis.fetch = /** @type {any} */ (async (url, init) => {
                if (init && init.headers && init.headers.Authorization) {
                    seenAuth.push(init.headers.Authorization);
                }
                const urlStr = String(url);
                if (urlStr.includes('streak-stats')) {
                    return { ok: true, status: 200, text: async () => sampleStreakSvg };
                }
                return { ok: true, status: 200, text: async () => sampleContribHtml };
            });

            const defaultStats = await fetchGitHubProfileStats();
            assert.equal(defaultStats.username, 'SamuelMarks');
            assert.equal(defaultStats.streak.totalContributions, 20600);

            const authedStats = await fetchGitHubProfileStats({ token: 'ghs_test_token' });
            assert.equal(authedStats.yearlyTotal, 6977);
            assert.equal(seenAuth.length, 0); // API call skipped when streak SVG succeeds
        } finally {
            globalThis.fetch = originalFetch;
        }

        // 2. Fallback path when streak-stats fails and user API provides created_at + token header
        /** @type {Record<string, string>} */
        let capturedApiHeaders = {};
        const fallbackStats = await fetchGitHubProfileStats({
            username: 'SamuelMarks',
            token: 'ghs_fallback_token',
            fetchFn: /** @type {any} */ (async (url, init) => {
                const urlStr = String(url);
                if (urlStr.includes('streak-stats')) {
                    return { ok: false, status: 502, text: async () => 'Bad Gateway' };
                }
                if (urlStr.includes('api.github.com/users/')) {
                    capturedApiHeaders = init.headers;
                    return {
                        ok: true,
                        status: 200,
                        text: async () => JSON.stringify({ created_at: '2011-05-24T13:46:59Z' })
                    };
                }
                return { ok: true, status: 200, text: async () => sampleContribHtml };
            })
        });
        assert.equal(capturedApiHeaders.Authorization, 'Bearer ghs_fallback_token');
        assert.equal(fallbackStats.streak.totalRange, 'May 24, 2011 - Present');
        assert.equal(fallbackStats.streak.currentStreak, 3);

        // 3. Fallback path with empty rolling fragment, short created_at, and failing user API
        const emptyFallback = await fetchGitHubProfileStats({
            username: 'NoDataUser',
            fetchFn: /** @type {any} */ (async (url) => {
                const urlStr = String(url);
                if (urlStr.includes('streak-stats')) {
                    return { ok: true, status: 200, text: async () => '<svg></svg>' };
                }
                if (urlStr.includes('api.github.com/users/')) {
                    return { ok: true, status: 200, text: async () => JSON.stringify({ created_at: 'short' }) };
                }
                return { ok: true, status: 200, text: async () => '<div></div>' };
            })
        });
        assert.equal(emptyFallback.streak.totalRange, 'May 24, 2011 - Present');

        const apiErrorFallback = await fetchGitHubProfileStats({
            username: 'RateLimitedUser',
            fetchFn: /** @type {any} */ (async (url) => {
                const urlStr = String(url);
                if (urlStr.includes('streak-stats') || urlStr.includes('api.github.com/users/')) {
                    return { ok: false, status: 403, text: async () => 'Forbidden' };
                }
                return {
                    ok: true,
                    status: 200,
                    text: async () => '<td data-date="2020-01-02" class="ContributionCalendar-day"></td>'
                };
            })
        });
        assert.equal(apiErrorFallback.streak.totalRange, 'Jan 2, 2020 - Present');
    });

    it('updates index.html via updateIndexGitHubStats and executes runCliIfMain cleanly', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stanford-gh-stats-'));
        const tmpIndex = path.join(tmpDir, 'index.html');
        fs.writeFileSync(
            tmpIndex,
            [
                '<!DOCTYPE html><html><body>',
                '                <!-- Contributions & Open-Source Activity -->',
                '                <section id="contributions"><p>Old</p></section>',
                '</body></html>'
            ].join(NL),
            'utf8'
        );

        const mockFetch = /** @type {any} */ (async (url) => {
            if (String(url).includes('streak-stats')) {
                return { ok: true, status: 200, text: async () => buildSampleStreakSvg() };
            }
            return { ok: true, status: 200, text: async () => buildSampleContributionsHtml() };
        });

        try {
            const writtenStats = await updateIndexGitHubStats({
                indexPath: tmpIndex,
                fetchFn: mockFetch
            });
            assert.equal(writtenStats.yearlyTotal, 6977);
            const updatedDisk = fs.readFileSync(tmpIndex, 'utf8');
            assert.match(updatedDisk, /6,977 Annual Open-Source Contributions/);

            // Verify default options branch with injected fsImpl (hermetic, no repo mutation)
            let memoryHtml = updatedDisk;
            const originalFetch = globalThis.fetch;
            try {
                globalThis.fetch = mockFetch;
                await updateIndexGitHubStats({
                    fsImpl: {
                        readFileSync: () => memoryHtml,
                        writeFileSync: (_p, data) => {
                            memoryHtml = String(data);
                        }
                    }
                });
                const scriptUrlDefault = pathToFileURL(scriptPath).href;
                assert.equal(
                    await runCliIfMain(scriptUrlDefault, ['node', scriptPath, '--index', tmpIndex]),
                    true
                );
            } finally {
                globalThis.fetch = originalFetch;
            }
            assert.match(memoryHtml, /gh-streak-svg/);
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }

        const scriptUrl = pathToFileURL(scriptPath).href;
        assert.equal(await runCliIfMain(scriptUrl, ['node']), false);
        assert.equal(await runCliIfMain(scriptUrl, ['node', '/other/script.js']), false);

        /** @type {string[]} */
        const outChunks = [];
        /** @type {string[]} */
        const errChunks = [];
        /** @type {number[]} */
        const exitCodes = [];

        const ranSuccess = await runCliIfMain(
            scriptUrl,
            ['node', scriptPath, '--user', 'SamuelMarks'],
            {
                env: { GITHUB_TOKEN: 'tok' },
                stdout: { write: (s) => outChunks.push(s) },
                stderr: { write: (s) => errChunks.push(s) },
                runUpdate: async ({ username, token }) => {
                    assert.equal(username, 'SamuelMarks');
                    assert.equal(token, 'tok');
                    return /** @type {any} */ ({
                        username: 'SamuelMarks',
                        yearlyTotal: 6977,
                        streak: { totalContributions: 20600, currentStreak: 1603 }
                    });
                },
                setExitCode: (code) => exitCodes.push(code)
            }
        );
        assert.equal(ranSuccess, true);
        assert.match(outChunks.join(''), /Updated GitHub stats for @SamuelMarks: 6,977 last-year, 20,600 total, 1,603-day streak/);
        assert.equal(errChunks.length, 0);
        assert.equal(exitCodes.length, 0);

        // Error instance failure + GH_TOKEN + GITHUB_USER env fallbacks
        await runCliIfMain(
            scriptUrl,
            ['node', scriptPath],
            {
                env: { GITHUB_USER: 'EnvUser', GH_TOKEN: 'gh_tok' },
                stdout: { write: (s) => outChunks.push(s) },
                stderr: { write: (s) => errChunks.push(s) },
                runUpdate: async ({ username, token }) => {
                    assert.equal(username, 'EnvUser');
                    assert.equal(token, 'gh_tok');
                    throw new Error('network down');
                },
                setExitCode: (code) => exitCodes.push(code)
            }
        );
        assert.match(errChunks.join(''), /Failed to update GitHub stats: network down/);
        assert.deepEqual(exitCodes, [1]);

        // Non-Error throw + default process.exitCode setter
        const prevExitCode = process.exitCode;
        try {
            await runCliIfMain(
                scriptUrl,
                ['node', scriptPath],
                {
                    env: {},
                    stdout: { write: () => true },
                    stderr: { write: (s) => errChunks.push(s) },
                    runUpdate: async () => {
                        throw 'string failure';
                    }
                }
            );
            assert.equal(process.exitCode, 1);
        } finally {
            process.exitCode = prevExitCode;
        }
    });
});
