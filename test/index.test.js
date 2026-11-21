/**
 * @file Zero-dependency test suite verifying:
 * 1. Static HTML5, self-hosted CSS, JSDoc, and no-JavaScript progressive enhancement invariants.
 * 2. 100% line, branch, and function coverage of `assets/index.js`.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
    bootstrapIfBrowser,
    enhanceCaseStudyFilters,
    enhanceCodeCopyButtons,
    enhanceContactEmail,
    enhanceDiagramInteractions,
    enhanceNavigation,
    enhanceOrgDropdown,
    initPortfolioEnhancements,
    parseTokens
} from '../assets/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

/**
 * Lightweight, explicit DOM classList implementation for deterministic unit tests.
 */
class MockClassList {
    /**
     * Creates an empty class list.
     */
    constructor() {
        /** @type {Set<string>} */
        this.tokens = new Set();
    }

    /**
     * Adds one or more CSS classes.
     *
     * @param {...string} names - Class names to add.
     * @returns {void}
     */
    add(...names) {
        for (const name of names) {
            if (name) {
                this.tokens.add(name);
            }
        }
    }

    /**
     * Checks whether a CSS class is present.
     *
     * @param {string} name - Class name to test.
     * @returns {boolean} True when present.
     */
    contains(name) {
        return this.tokens.has(name);
    }

    /**
     * Adds or removes a class based on `force`.
     *
     * @param {string} name - Class name to toggle.
     * @param {boolean} force - Explicit target state.
     * @returns {boolean} Resulting state.
     */
    toggle(name, force) {
        if (force) {
            this.tokens.add(name);
            return true;
        }
        this.tokens.delete(name);
        return false;
    }
}

/**
 * Minimal DOM Element mock supporting attributes, events, containment, and selector queries.
 */
class MockElement {
    /**
     * Constructs a mock element.
     *
     * @param {string} tagName - Element tag name.
     * @param {Record<string, string>} [attrs] - Initial attributes.
     * @param {string | null} [textContent] - Initial text content.
     */
    constructor(tagName, attrs = {}, textContent = '') {
        this.tagName = tagName.toUpperCase();
        /** @type {Map<string, string>} */
        this.attributes = new Map(Object.entries(attrs));
        this.classList = new MockClassList();
        if (attrs.class) {
            this.classList.add(...attrs.class.split(/\s+/));
        }
        this.textContent = textContent;
        this.value = attrs.value || '';
        this.hidden = false;
        this.href = attrs.href || '';
        this.type = attrs.type || '';
        this.focused = false;
        /** @type {MockElement[]} */
        this.children = [];
        /** @type {MockElement | null} */
        this.parentElement = null;
        /** @type {Map<string, Array<(evt?: unknown) => unknown>>} */
        this.listeners = new Map();
    }

    /**
     * Gets an element ID.
     *
     * @returns {string} Current id attribute or empty string.
     */
    get id() {
        return this.attributes.get('id') || '';
    }

    /**
     * Updates `className` and synchronizes `classList`.
     *
     * @param {string} val - Space-separated class names.
     */
    set className(val) {
        this.attributes.set('class', val);
        this.classList = new MockClassList();
        this.classList.add(...val.split(/\s+/));
    }

    /**
     * Reads `className`.
     *
     * @returns {string} Space-separated class names.
     */
    get className() {
        return Array.from(this.classList.tokens).join(' ');
    }

    /**
     * Reads an attribute value.
     *
     * @param {string} name - Attribute name.
     * @returns {string | null} Attribute value or null.
     */
    getAttribute(name) {
        return this.attributes.has(name) ? (this.attributes.get(name) ?? null) : null;
    }

    /**
     * Sets an attribute value.
     *
     * @param {string} name - Attribute name.
     * @param {string} val - Attribute value.
     * @returns {void}
     */
    setAttribute(name, val) {
        this.attributes.set(name, String(val));
        if (name === 'class') {
            this.classList.add(...String(val).split(/\s+/));
        }
    }

    /**
     * Removes an attribute.
     *
     * @param {string} name - Attribute name.
     * @returns {void}
     */
    removeAttribute(name) {
        this.attributes.delete(name);
    }

    /**
     * Appends a child element.
     *
     * @param {MockElement} child - Child element to append.
     * @returns {MockElement} Appended child.
     */
    appendChild(child) {
        child.parentElement = this;
        this.children.push(child);
        return child;
    }

    /**
     * Inserts a sibling element immediately after `this`.
     *
     * @param {string} position - Insertion position (`afterend`).
     * @param {MockElement} element - Element to insert.
     * @returns {MockElement} Inserted element.
     */
    insertAdjacentElement(position, element) {
        if (position === 'afterend' && this.parentElement) {
            const idx = this.parentElement.children.indexOf(this);
            element.parentElement = this.parentElement;
            this.parentElement.children.splice(idx + 1, 0, element);
        }
        return element;
    }

    /**
     * Checks whether `other` is `this` or a descendant of `this`.
     *
     * @param {unknown} other - Candidate node.
     * @returns {boolean} True when contained.
     */
    contains(other) {
        return other === this || this.descendants().includes(/** @type {MockElement} */ (other));
    }

    /**
     * Registers an event listener.
     *
     * @param {string} event - Event type.
     * @param {(evt?: unknown) => unknown} handler - Callback function.
     * @returns {void}
     */
    addEventListener(event, handler) {
        const list = this.listeners.get(event) || [];
        list.push(handler);
        this.listeners.set(event, list);
    }

    /**
     * Dispatches an event (awaiting async listeners).
     *
     * @param {string} event - Event type.
     * @param {unknown} [payload] - Optional event object.
     * @returns {Promise<void>} Promise settling once all handlers complete.
     */
    async trigger(event, payload = undefined) {
        const list = this.listeners.get(event) || [];
        for (const fn of list) {
            await fn(payload);
        }
    }

    /**
     * Focuses the element.
     *
     * @returns {void}
     */
    focus() {
        this.focused = true;
    }

    /**
     * Collects all descendants in pre-order traversal.
     *
     * @returns {MockElement[]} Flattened list of descendants.
     */
    descendants() {
        /** @type {MockElement[]} */
        const result = [];
        for (const child of this.children) {
            result.push(child, ...child.descendants());
        }
        return result;
    }

    /**
     * Tests whether an element matches one simple selector token.
     *
     * @param {MockElement} el - Candidate element.
     * @param {string} selector - Selector token.
     * @returns {boolean} True when matched.
     */
    static matchesToken(el, selector) {
        if (selector === 'a') {
            return el.tagName === 'A';
        }
        if (selector === 'summary') {
            return el.tagName === 'SUMMARY';
        }
        if (selector === 'details.gh-org-more') {
            return el.tagName === 'DETAILS' && el.classList.contains('gh-org-more');
        }
        if (selector === '[data-cs-filter]') {
            return el.attributes.has('data-cs-filter');
        }
        if (selector === '[data-copyable]') {
            return el.attributes.has('data-copyable');
        }
        if (selector === '[data-repo-card]') {
            return el.attributes.has('data-repo-card');
        }
        if (selector === '[data-repo-card][data-repo-node]') {
            return el.attributes.has('data-repo-card') && el.attributes.has('data-repo-node');
        }
        if (selector === '.case-study-card') {
            return el.classList.contains('case-study-card');
        }
        if (selector === '.arch-svg') {
            return el.classList.contains('arch-svg');
        }
        if (selector === '.code-pane') {
            return el.classList.contains('code-pane');
        }
        if (selector === '.code-pane-header') {
            return el.classList.contains('code-pane-header');
        }
        if (selector === '.profile-tab[data-nav-target]') {
            return el.classList.contains('profile-tab') && el.attributes.has('data-nav-target');
        }
        if (selector === '.gh-year-link-active') {
            return el.classList.contains('gh-year-link-active');
        }
        if (selector === 'a[href^="#cs-"]') {
            const href = el.getAttribute('href') || '';
            return el.tagName === 'A' && href.startsWith('#cs-');
        }
        if (selector === '[data-node-id]') {
            return el.attributes.has('data-node-id');
        }
        return false;
    }

    /**
     * Queries descendant elements using the subset of selectors used in `assets/index.js`.
     *
     * @param {string} selector - CSS selector string.
     * @returns {MockElement[]} Matching descendant elements.
     */
    querySelectorAll(selector) {
        if (selector === '#case-studies .case-study-card') {
            const section = this.descendants().find((el) => el.id === 'case-studies');
            return section ? section.querySelectorAll('.case-study-card') : [];
        }
        if (selector === '.arch-svg [data-node-id]') {
            const svgs = this.descendants().filter((el) => el.classList.contains('arch-svg'));
            return svgs.flatMap((svg) => svg.querySelectorAll('[data-node-id]'));
        }
        return this.descendants().filter((el) => MockElement.matchesToken(el, selector));
    }

    /**
     * Returns the first matching descendant or null.
     *
     * @param {string} selector - CSS selector string.
     * @returns {MockElement | null} First match or null.
     */
    querySelector(selector) {
        return this.querySelectorAll(selector)[0] || null;
    }
}

/**
 * Minimal Document mock wrapping a root `<html>` element and document-level listeners.
 */
class MockDocument {
    /**
     * Creates a new mock document.
     */
    constructor() {
        this.documentElement = new MockElement('html');
        this.body = new MockElement('body');
        this.documentElement.appendChild(this.body);
        /** @type {MockElement | null} */
        this.activeElement = null;
        /** @type {Map<string, Array<(evt?: unknown) => unknown>>} */
        this.listeners = new Map();
    }

    /**
     * Creates a new mock element.
     *
     * @param {string} tag - Element tag name.
     * @returns {MockElement} Created element.
     */
    createElement(tag) {
        return new MockElement(tag);
    }

    /**
     * Finds an element by its `id` attribute.
     *
     * @param {string} id - Target ID.
     * @returns {MockElement | null} Matching element or null.
     */
    getElementById(id) {
        return this.documentElement.descendants().find((el) => el.id === id) || null;
    }

    /**
     * Queries elements across the document.
     *
     * @param {string} selector - CSS selector.
     * @returns {MockElement[]} Matching elements.
     */
    querySelectorAll(selector) {
        return this.documentElement.querySelectorAll(selector);
    }

    /**
     * Registers a document-level event listener.
     *
     * @param {string} event - Event type.
     * @param {(evt?: unknown) => unknown} handler - Callback function.
     * @returns {void}
     */
    addEventListener(event, handler) {
        const list = this.listeners.get(event) || [];
        list.push(handler);
        this.listeners.set(event, list);
    }

    /**
     * Dispatches a document-level event.
     *
     * @param {string} event - Event type.
     * @param {unknown} [payload] - Event payload.
     * @returns {Promise<void>} Settled promise.
     */
    async trigger(event, payload = undefined) {
        for (const fn of this.listeners.get(event) || []) {
            await fn(payload);
        }
    }
}

/**
 * Minimal Window mock with hash navigation events, navigator stub, and optional IntersectionObserver.
 */
class MockWindow {
    /**
     * Creates a mock window.
     *
     * @param {string} [initialHash] - Initial URL hash.
     * @param {Record<string, unknown> | undefined} [navigatorStub] - Optional navigator object.
     * @param {unknown} [observerCtor] - Optional IntersectionObserver constructor.
     */
    constructor(initialHash = '', navigatorStub = undefined, observerCtor = undefined) {
        this.location = { hash: initialHash };
        this.navigator = navigatorStub;
        this.IntersectionObserver = observerCtor;
        /** @type {Map<string, Array<() => void>>} */
        this.listeners = new Map();
    }

    /**
     * Registers a window event listener.
     *
     * @param {string} event - Event type.
     * @param {() => void} handler - Listener callback.
     * @returns {void}
     */
    addEventListener(event, handler) {
        const list = this.listeners.get(event) || [];
        list.push(handler);
        this.listeners.set(event, list);
    }

    /**
     * Fires a window event.
     *
     * @param {string} event - Event type.
     * @returns {void}
     */
    trigger(event) {
        for (const fn of this.listeners.get(event) || []) {
            fn();
        }
    }
}

describe('Static HTML, Self-Hosted CSS, JSDoc & No-JavaScript Progressive Enhancement Invariants', () => {
    const html = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
    const css = fs.readFileSync(path.join(repoRoot, 'assets/styles.css'), 'utf8');
    const js = fs.readFileSync(path.join(repoRoot, 'assets/index.js'), 'utf8');

    it('keeps all five consolidated technical deep dives collapsed by default for fast zero-JS scanning', () => {
        for (const id of ['cs-stanford', 'cs-ml', 'cs-cdd', 'cs-c89', 'cs-libscript']) {
            const tagMatch = html.match(new RegExp(`<details[^>]*id="${id}"[^>]*>`, 'i'));
            assert.ok(tagMatch, `Expected <details id="${id}"> in index.html`);
            assert.doesNotMatch(tagMatch[0], /\bopen\b/i, `Expected <details id="${id}"> to be collapsed by default`);
        }
    });

    it('uses self-hosted CSS without external Tailwind CDN bloat and preserves zero-JS navigation honesty', () => {
        assert.doesNotMatch(html, /cdn\.jsdelivr\.net|tailwindcss/i, 'index.html must not depend on external Tailwind CDN');
        assert.doesNotMatch(html, /class="profile-tab is-active"/i, 'Static HTML must not hardcode a sticky active tab');
        assert.match(css, /section\[id\],\s*details\[id\]\s*\{\s*scroll-margin-top:/);
        assert.match(css, /\.case-study-card:target\s*\{/);
    });

    it('hides JS-only filter controls by default when JavaScript is disabled', () => {
        assert.match(css, /\.js-only\s*\{\s*display:\s*none\s*!important;\s*\}/);
        assert.match(css, /html\.js-enabled\s+\.js-only\s*\{\s*display:\s*block\s*!important;\s*\}/);
        assert.match(html, /id="cs-filter-toolbar"[^>]*class="[^"]*js-only|class="[^"]*js-only[^"]*"[^>]*id="cs-filter-toolbar"/);
    });

    it('contains no duplicate HTML id attributes and no stray XML processing instructions', () => {
        assert.ok(!html.includes('<?xml'), 'Unexpected XML declaration inside HTML5 document');
        assert.ok(!html.includes('href="mailto:"'), 'Empty broken mailto: link must not appear in no-JS HTML');

        const idMatches = [...html.matchAll(/(?<![\w-])id="([^"]+)"/g)].map((m) => m[1]);
        const seen = new Set();
        for (const id of idMatches) {
            assert.ok(!seen.has(id), `Duplicate HTML id found: ${id}`);
            seen.add(id);
        }
    });

    it('provides alt attributes on every img element and valid local asset paths', () => {
        const imgTags = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
        assert.ok(imgTags.length >= 6, 'Expected profile, org, SOM, and contribution images');
        for (const tag of imgTags) {
            assert.match(tag, /\balt="[^"]*"/i, `Missing alt attribute on: ${tag}`);
            if (/\bgh-org-avatar\b/.test(tag)) {
                assert.match(tag, /\balt=""/i, `Expected empty alt="" on decorative avatar beside @org text: ${tag}`);
            } else {
                assert.match(tag, /\balt="[^"]+"/i, `Missing non-empty alt attribute on standalone image: ${tag}`);
            }
        }

        const localSrcs = [...html.matchAll(/\b(?:src|href)="(assets\/[^"]+)"/g)].map((m) => m[1]);
        for (const relPath of localSrcs) {
            assert.ok(fs.existsSync(path.join(repoRoot, relPath)), `Missing referenced local asset: ${relPath}`);
        }
    });

    it('leads with Stanford Medicine clinical AI & hospital optimization, preserves key OSS links, and excludes stale MaxText maintainership, Harvard, or publication references', () => {
        const readme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8');
        assert.doesNotMatch(html, /harvard/i, 'index.html must exclude Harvard references');
        assert.doesNotMatch(readme, /harvard/i, 'README.md must exclude Harvard references');
        assert.doesNotMatch(html, /purely optical/i, 'index.html must exclude "purely optical"');
        assert.doesNotMatch(html, /\b(publications?|preprints?|bibtex|pubmed)\b/i, 'index.html must not reference publications');
        assert.doesNotMatch(
            html,
            /\b(?:co-)?maintains?\b[^.<]*maxtext|(?<!former\s)(?<!former\sco-)maintainer of google[^.<]*maxtext|google maxtext maintainer/i,
            'index.html must not claim active MaxText maintainership'
        );

        const requiredSnippets = [
            'Samuel Marks, PhD | Stanford Medicine',
            'id="stanford"',
            'id="ecosystems"',
            'id="case-studies"',
            'id="bp-stanford"',
            'id="bp-ml"',
            'id="bp-cdd"',
            'id="bp-libscript"',
            'id="bp-c89"',
            'MPAX',
            'MedGemma',
            'VaultGemma',
            'LiteRT',
            'patentless',
            'fundoscopy',
            'eFOCUS',
            'DR SPOC',
            'Restore Monolithic Velocity',
            'Demystify Deployment',
            'Outpace ML Fragmentation',
            'https://github.com/SamuelMarks/SamuelMarks/blob/master/README.md',
            'https://kitchenSink.ai',
            'https://stanford.edu',
            'https://med.stanford.edu',
            'https://github.com/SamuelMarks/hospital-dashboard-platform',
            'https://github.com/SamuelMarks/t1d-analytics',
            'https://github.com/AI-Hypercomputer/maxtext',
            'https://github.com/SamuelMarks/ml-switcheroo',
            'https://github.com/SamuelMarks/ml-switcheroo-compiler',
            'https://github.com/SamuelMarks/zero-zoo',
            'https://github.com/SamuelMarks/c-ci',
            'https://github.com/SamuelMarks/c-multiplatform',
            'https://github.com/SamuelMarks/cdd-ops',
            'https://github.com/offscale/cdd-python',
            'https://github.com/SamuelMarks/libscript',
            'https://github.com/SamuelMarks/msi-rs',
            'https://verMan.io',
            'https://rewriteInC.io'
        ];
        for (const snippet of requiredSnippets) {
            assert.ok(html.includes(snippet), `Expected index.html to include ${snippet}`);
        }
    });

    it('maintains JSDoc documentation blocks for every exported function in assets/index.js', () => {
        const exportedFunctions = [...js.matchAll(/export\s+function\s+(\w+)/g)].map((m) => m[1]);
        assert.equal(exportedFunctions.length, 9);
        for (const fnName of exportedFunctions) {
            const marker = `export function ${fnName}(`;
            const idx = js.indexOf(marker);
            assert.ok(idx > 0, `Expected ${marker} in assets/index.js`);
            const preceding = js.slice(Math.max(0, idx - 500), idx).trimEnd();
            assert.ok(preceding.endsWith('*/') && preceding.includes('/**'), `Missing JSDoc block for ${fnName}`);
        }
    });

    it('enforces extensive .gitignore, .editorconfig, and .gitattributes hygiene rules', () => {
        const gitignore = fs.readFileSync(path.join(repoRoot, '.gitignore'), 'utf8');
        const editorconfig = fs.readFileSync(path.join(repoRoot, '.editorconfig'), 'utf8');
        const gitattributes = fs.readFileSync(path.join(repoRoot, '.gitattributes'), 'utf8');

        const readme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8');
        const selfTest = fs.readFileSync(path.join(repoRoot, 'test/index.test.js'), 'utf8');
        const crlf = String.fromCharCode(13, 10);
        const lf = String.fromCharCode(10);
        for (const [name, content] of [
            ['.gitignore', gitignore],
            ['.editorconfig', editorconfig],
            ['.gitattributes', gitattributes],
            ['index.html', html],
            ['assets/styles.css', css],
            ['assets/index.js', js],
            ['README.md', readme],
            ['test/index.test.js', selfTest]
        ]) {
            assert.ok(!content.includes(crlf), `${name} must use LF line endings`);
            assert.ok(content.endsWith(lf), `${name} must end with a final newline`);
            for (const line of content.split(lf)) {
                assert.doesNotMatch(line, /[ \t]+$/, `${name} must not contain trailing whitespace`);
            }
        }

        for (const pattern of [
            '.DS_Store',
            'Thumbs.db',
            '.idea/',
            '.vscode/',
            '!*.svg',
            'node_modules/',
            'coverage/',
            'dist/',
            '.env',
            '!.env.example'
        ]) {
            assert.ok(gitignore.includes(pattern), `Expected .gitignore to include ${pattern}`);
        }

        assert.match(editorconfig, /^root\s*=\s*true$/m);
        assert.match(editorconfig, /^charset\s*=\s*utf-8$/m);
        assert.match(editorconfig, /^end_of_line\s*=\s*lf$/m);
        assert.ok(editorconfig.includes('[assets/SOM_horiz_Web_*.svg]'));
        assert.ok(editorconfig.includes('[.nojekyll]'));
        assert.match(editorconfig, /^trim_trailing_whitespace\s*=\s*false$/m);

        assert.match(gitattributes, /^\*\s+text=auto\s+eol=lf$/m);
        assert.match(gitattributes, /^\*\.html\s+text\s+eol=lf\s+diff=html$/m);
        assert.match(gitattributes, /^\*\.css\s+text\s+eol=lf\s+diff=css$/m);
        assert.match(gitattributes, /^\*\.md\s+text\s+eol=lf\s+diff=markdown\s+linguist-documentation$/m);
        assert.match(gitattributes, /^\*\.bat\s+text\s+eol=crlf$/m);
        assert.match(gitattributes, /^\*\.png\s+binary$/m);
        assert.match(gitattributes, /^assets\/SOM_horiz_Web_\*\.svg\s+text\s+eol=lf\s+linguist-vendored$/m);
        assert.match(gitattributes, /^\.gitattributes\s+export-ignore$/m);
    });
});

describe('Progressive Enhancement Unit Tests (100% Coverage of assets/index.js)', () => {
    it('enhanceCodeCopyButtons adds 1-click snippet copy buttons and handles missing clipboard or children', async () => {
        const doc = new MockDocument();
        assert.equal(enhanceCodeCopyButtons(/** @type {any} */ (doc), undefined), 0);
        assert.equal(enhanceCodeCopyButtons(/** @type {any} */ (doc), /** @type {any} */ ({})), 0);

        const paneValid = new MockElement('div', { class: 'code-pane' });
        const headerValid = new MockElement('div', { class: 'code-pane-header' }, '  JAX + MPAX  ');
        const preValid = new MockElement('pre', { 'data-copyable': '' }, 'int main(void) { return 0; }');
        paneValid.appendChild(headerValid);
        paneValid.appendChild(preValid);

        const paneNullText = new MockElement('div', { class: 'code-pane' });
        const headerNullText = new MockElement('div', { class: 'code-pane-header' }, null);
        const preNullText = new MockElement('pre', { 'data-copyable': '' }, null);
        paneNullText.appendChild(headerNullText);
        paneNullText.appendChild(preNullText);

        const paneIncomplete = new MockElement('div', { class: 'code-pane' });
        doc.body.appendChild(paneValid);
        doc.body.appendChild(paneNullText);
        doc.body.appendChild(paneIncomplete);

        let copiedSnippet = '';
        let failCopy = false;
        const nav = {
            clipboard: {
                /**
                 * Mock clipboard writer for snippet copy tests.
                 *
                 * @param {string} text - Snippet text.
                 * @returns {Promise<void>} Settled promise.
                 */
                writeText: async (text) => {
                    if (failCopy) {
                        throw new Error('denied');
                    }
                    copiedSnippet = text;
                }
            }
        };

        assert.equal(enhanceCodeCopyButtons(/** @type {any} */ (doc), /** @type {any} */ (nav)), 2);

        const statusEl = doc.getElementById('copy-snippet-status');
        assert.ok(statusEl);
        assert.equal(statusEl.getAttribute('aria-live'), 'polite');

        const copyBtn1 = headerValid.children[0];
        assert.equal(copyBtn1.getAttribute('aria-label'), 'Copy code snippet: JAX + MPAX');
        await copyBtn1.trigger('click');
        assert.equal(copiedSnippet, 'int main(void) { return 0; }');
        assert.equal(copyBtn1.textContent, 'Copied');
        assert.equal(statusEl.textContent, 'Copied JAX + MPAX to clipboard.');

        const copyBtn2 = headerNullText.children[0];
        assert.equal(copyBtn2.getAttribute('aria-label'), 'Copy code snippet');
        await copyBtn2.trigger('click');
        assert.equal(copiedSnippet, '');
        assert.equal(statusEl.textContent, 'Copied code snippet to clipboard.');

        failCopy = true;
        await copyBtn1.trigger('click');
        assert.equal(copyBtn1.textContent, 'Error');
        assert.equal(statusEl.textContent, 'Unable to copy JAX + MPAX.');
        await copyBtn2.trigger('click');
        assert.equal(statusEl.textContent, 'Unable to copy code snippet.');
    });

    it('parseTokens handles empty, null, and whitespace-padded strings', () => {
        assert.deepEqual(parseTokens(null), []);
        assert.deepEqual(parseTokens(''), []);
        assert.deepEqual(parseTokens('   '), []);
        assert.deepEqual(parseTokens(' cs0-l1  cs0-l2	cs0-l3 '), ['cs0-l1', 'cs0-l2', 'cs0-l3']);
    });

    it('enhanceContactEmail handles missing element, incomplete attributes, clipboard success, and clipboard errors', async () => {
        const emptyDoc = new MockDocument();
        assert.equal(enhanceContactEmail(/** @type {any} */ (emptyDoc), undefined), false);

        const incompleteDoc = new MockDocument();
        const incompleteSpan = new MockElement('span', { id: 'contact-email', 'data-email-user': 'imsamuel' });
        incompleteDoc.body.appendChild(incompleteSpan);
        assert.equal(enhanceContactEmail(/** @type {any} */ (incompleteDoc), undefined), false);

        const noClipDoc = new MockDocument();
        const row1 = new MockElement('div');
        const span1 = new MockElement('span', {
            id: 'contact-email',
            'data-email-user': 'imsamuel',
            'data-email-domain': 'stanford.edu',
            'aria-label': 'obfuscated'
        }, 'imsamuel [at] stanford.edu');
        row1.appendChild(span1);
        noClipDoc.body.appendChild(row1);
        assert.equal(enhanceContactEmail(/** @type {any} */ (noClipDoc), undefined), true);
        assert.equal(span1.children[0].href, 'mailto:imsamuel@stanford.edu');
        assert.equal(span1.getAttribute('aria-label'), null);
        assert.equal(row1.children.length, 1);

        let copiedText = '';
        const clipDoc = new MockDocument();
        const row2 = new MockElement('div');
        const span2 = new MockElement('span', {
            id: 'contact-email',
            'data-email-user': 'imsamuel',
            'data-email-domain': 'stanford.edu'
        });
        const status2 = new MockElement('span', { id: 'copy-email-status' });
        row2.appendChild(span2);
        row2.appendChild(status2);
        clipDoc.body.appendChild(row2);

        const okNav = {
            clipboard: {
                /**
                 * Writes text to mock clipboard.
                 *
                 * @param {string} val - Text to copy.
                 * @returns {Promise<void>} Resolved promise.
                 */
                writeText: async (val) => {
                    copiedText = val;
                }
            }
        };
        assert.equal(enhanceContactEmail(/** @type {any} */ (clipDoc), /** @type {any} */ (okNav)), true);
        const copyBtn = row2.children[1];
        assert.equal(copyBtn.tagName, 'BUTTON');
        await copyBtn.trigger('click');
        assert.equal(copiedText, 'imsamuel@stanford.edu');
        assert.equal(copyBtn.textContent, 'Copied');
        assert.match(status2.textContent || '', /Copied imsamuel@stanford\.edu/);

        let shouldFail = false;
        const toggleNav = {
            clipboard: {
                /**
                 * Conditionally succeeds or rejects clipboard write.
                 *
                 * @returns {Promise<void>} Settled promise.
                 */
                writeText: async () => {
                    if (shouldFail) {
                        throw new Error('denied');
                    }
                }
            }
        };

        const noStatusDoc = new MockDocument();
        const row3 = new MockElement('div');
        const span3 = new MockElement('span', {
            id: 'contact-email',
            'data-email-user': 'imsamuel',
            'data-email-domain': 'stanford.edu'
        });
        row3.appendChild(span3);
        noStatusDoc.body.appendChild(row3);
        enhanceContactEmail(/** @type {any} */ (noStatusDoc), /** @type {any} */ (toggleNav));
        await row3.children[1].trigger('click');
        assert.equal(row3.children[1].textContent, 'Copied');
        shouldFail = true;
        await row3.children[1].trigger('click');
        assert.equal(row3.children[1].textContent, 'Error');

        const errWithStatusDoc = new MockDocument();
        const row4 = new MockElement('div');
        const span4 = new MockElement('span', {
            id: 'contact-email',
            'data-email-user': 'imsamuel',
            'data-email-domain': 'stanford.edu'
        });
        const status4 = new MockElement('span', { id: 'copy-email-status' });
        row4.appendChild(span4);
        row4.appendChild(status4);
        errWithStatusDoc.body.appendChild(row4);
        enhanceContactEmail(/** @type {any} */ (errWithStatusDoc), /** @type {any} */ (toggleNav));
        await row4.children[1].trigger('click');
        assert.match(status4.textContent || '', /Unable to copy/);
    });

    it('enhanceCaseStudyFilters handles missing toolbar, category/search auto-expansion, collapse/expand, and reset', async () => {
        const emptyDoc = new MockDocument();
        assert.equal(enhanceCaseStudyFilters(/** @type {any} */ (emptyDoc)), null);

        const minDoc = new MockDocument();
        const minToolbar = new MockElement('div', { id: 'cs-filter-toolbar' });
        minDoc.body.appendChild(minToolbar);
        const minCtrl = enhanceCaseStudyFilters(/** @type {any} */ (minDoc));
        assert.ok(minCtrl);
        minCtrl.resetFilters();

        const doc = new MockDocument();
        const toolbar = new MockElement('div', { id: 'cs-filter-toolbar' });
        const btnAll = new MockElement('button', { 'data-cs-filter': 'all', 'aria-pressed': 'true' });
        const btnMl = new MockElement('button', { 'data-cs-filter': 'ml', 'aria-pressed': 'false' });
        const btnFallback = new MockElement('button', { 'data-cs-filter': '' });
        const searchInput = new MockElement('input', { id: 'cs-search-input' });
        const statusEl = new MockElement('div', { id: 'cs-filter-status' });
        const expandBtn = new MockElement('button', { id: 'cs-expand-all' });
        const collapseBtn = new MockElement('button', { id: 'cs-collapse-all' });
        toolbar.appendChild(btnAll);
        toolbar.appendChild(btnMl);
        toolbar.appendChild(btnFallback);
        toolbar.appendChild(searchInput);
        toolbar.appendChild(statusEl);
        toolbar.appendChild(expandBtn);
        toolbar.appendChild(collapseBtn);
        doc.body.appendChild(toolbar);

        const section = new MockElement('section', { id: 'case-studies' });
        const csMl = new MockElement('details', { id: 'cs-ml', class: 'case-study-card', 'data-cs-category': 'ml' }, 'Overview: UniqueHeaderToken');
        const repoA = new MockElement('article', { 'data-repo-card': '' }, 'ml-switcheroo CST rewriter');
        const repoNullText = new MockElement('article', { 'data-repo-card': '' }, null);
        csMl.appendChild(repoA);
        csMl.appendChild(repoNullText);

        const csNoCat = new MockElement('details', { id: 'cs-c89', class: 'case-study-card' }, null);
        const repoB = new MockElement('article', { 'data-repo-card': '' }, 'c-multiplatform ANSI C89');
        csNoCat.appendChild(repoB);

        section.appendChild(csMl);
        section.appendChild(csNoCat);
        doc.body.appendChild(section);

        const controller = enhanceCaseStudyFilters(/** @type {any} */ (doc));
        assert.ok(controller);

        // Selecting a specific category auto-expands matching deep dive
        await btnMl.trigger('click');
        assert.equal(csMl.hidden, false);
        assert.equal(csMl.getAttribute('open'), '');
        assert.equal(csNoCat.hidden, true);
        assert.equal(btnMl.getAttribute('aria-pressed'), 'true');
        assert.equal(btnAll.getAttribute('aria-pressed'), 'false');

        // Collapse & expand only affect visible studies
        await collapseBtn.trigger('click');
        assert.equal(csMl.getAttribute('open'), null);
        await expandBtn.trigger('click');
        assert.equal(csMl.getAttribute('open'), '');

        // Fallback empty data-cs-filter -> 'all'
        await btnFallback.trigger('click');
        assert.equal(csNoCat.hidden, false);

        // Search matching specific repo card
        csMl.removeAttribute('open');
        searchInput.value = 'rewriter';
        await searchInput.trigger('input');
        assert.equal(csMl.hidden, false);
        assert.equal(csMl.getAttribute('open'), '');
        assert.equal(repoA.hidden, false);
        assert.equal(repoNullText.hidden, true);
        assert.equal(csNoCat.hidden, true);

        // Search matching study header text when 0 repo cards match -> reveals all cards in that study
        searchInput.value = 'uniqueheadertoken';
        await searchInput.trigger('input');
        assert.equal(csMl.hidden, false);
        assert.equal(repoA.hidden, false);
        assert.equal(repoNullText.hidden, false);

        // Reset restores everything
        controller.resetFilters();
        assert.equal(searchInput.value, '');
        assert.equal(csMl.hidden, false);
        assert.equal(csNoCat.hidden, false);
        assert.equal(btnAll.getAttribute('aria-pressed'), 'true');
    });

    it('enhanceDiagramInteractions binds bidirectional hover, focus cleanup, click, and keyboard activation', async () => {
        const doc = new MockDocument();
        const section = new MockElement('section', { id: 'case-studies' });

        const emptyStudy = new MockElement('details', { class: 'case-study-card' });
        section.appendChild(emptyStudy);

        const study = new MockElement('details', { class: 'case-study-card' });
        const card1 = new MockElement('article', { 'data-repo-card': '', 'data-repo-node': 'n1' });
        const link1 = new MockElement('a', { href: 'https://github.com/SamuelMarks/ml-switcheroo' });
        card1.appendChild(link1);
        const card2 = new MockElement('article', { 'data-repo-card': '', 'data-repo-node': 'n2' });

        const svg = new MockElement('svg', { class: 'arch-svg' });
        const node1 = new MockElement('g', { 'data-node-id': 'n1' }, '  ODL   Hub  ');
        const node2 = new MockElement('g', { 'data-node-id': 'n2', 'aria-label': 'Existing label' }, null);
        const nodeOrphan = new MockElement('g', { 'data-node-id': 'orphan' }, null);
        svg.appendChild(node1);
        svg.appendChild(node2);
        svg.appendChild(nodeOrphan);

        study.appendChild(card1);
        study.appendChild(card2);
        study.appendChild(svg);
        section.appendChild(study);
        doc.body.appendChild(section);

        assert.equal(enhanceDiagramInteractions(/** @type {any} */ (doc)), 1);
        assert.equal(svg.getAttribute('role'), 'group');
        assert.equal(node1.getAttribute('tabindex'), '0');
        assert.equal(node1.getAttribute('role'), 'button');
        assert.equal(node1.getAttribute('aria-label'), 'ODL Hub — jump to matching repository card');
        assert.equal(node2.getAttribute('aria-label'), 'Existing label');
        assert.equal(nodeOrphan.getAttribute('aria-label'), 'Diagram tier orphan — jump to matching repository card');

        await card1.trigger('mouseenter');
        assert.equal(node1.getAttribute('data-node-active'), 'true');
        assert.equal(node2.getAttribute('data-node-active'), null);

        await card1.trigger('mouseleave');
        assert.equal(node1.getAttribute('data-node-active'), null);

        await card2.trigger('focusin');
        assert.equal(node2.getAttribute('data-node-active'), 'true');
        await card2.trigger('focusout');
        assert.equal(node2.getAttribute('data-node-active'), null);

        await node1.trigger('mouseenter');
        assert.equal(node1.getAttribute('data-node-active'), 'true');
        assert.equal(card1.getAttribute('data-card-active'), 'true');

        await node1.trigger('click');
        assert.equal(link1.focused, true);

        await node1.trigger('mouseleave');
        assert.equal(node1.getAttribute('data-node-active'), null);
        assert.equal(card1.getAttribute('data-card-active'), null);

        // Keyboard focusin/focusout + Enter/Space/other keydown
        await node1.trigger('focusin');
        assert.equal(card1.getAttribute('data-card-active'), 'true');
        await node1.trigger('focusout');
        assert.equal(card1.getAttribute('data-card-active'), null);

        link1.focused = false;
        let prevented = false;
        await node1.trigger('keydown', {
            key: 'Enter',
            /**
             * Records preventDefault invocation.
             *
             * @returns {void}
             */
            preventDefault: () => {
                prevented = true;
            }
        });
        assert.equal(prevented, true);
        assert.equal(link1.focused, true);

        link1.focused = false;
        await node1.trigger('keydown', { key: ' ' });
        assert.equal(link1.focused, true);

        await node1.trigger('keydown', { key: 'Tab' });
        await node1.trigger('keydown', undefined);

        await node2.trigger('click');
        await nodeOrphan.trigger('click');
    });

    it('enhanceNavigation supports tabs, IntersectionObserver scroll-spy, and #cs-* disclosure jumps', async () => {
        const doc = new MockDocument();
        const tabOverview = new MockElement('a', { class: 'profile-tab', 'data-nav-target': 'overview' });
        const tabStudies = new MockElement('a', { class: 'profile-tab', 'data-nav-target': 'case-studies' });
        const tabGhost = new MockElement('a', { class: 'profile-tab', 'data-nav-target': 'missing-sec' });
        const tabEmpty = new MockElement('a', { class: 'profile-tab', 'data-nav-target': '' });
        doc.body.appendChild(tabOverview);
        doc.body.appendChild(tabStudies);
        doc.body.appendChild(tabGhost);
        doc.body.appendChild(tabEmpty);

        const overviewSec = new MockElement('section', { id: 'overview' });
        const contactDiv = new MockElement('div', { id: 'contact' });
        const csSection = new MockElement('section', { id: 'case-studies' });
        const csCdd = new MockElement('details', { id: 'cs-cdd', class: 'case-study-card' });
        csCdd.hidden = true;
        csSection.appendChild(csCdd);

        const jumpValid = new MockElement('a', { href: '#cs-cdd' });
        const jumpMissing = new MockElement('a', { href: '#cs-99' });
        const activeYear = new MockElement('a', { class: 'gh-year-link gh-year-link-active' });
        doc.body.appendChild(overviewSec);
        doc.body.appendChild(contactDiv);
        doc.body.appendChild(csSection);
        doc.body.appendChild(jumpValid);
        doc.body.appendChild(jumpMissing);
        doc.body.appendChild(activeYear);

        let resetCount = 0;
        const filterCtrl = {
            /**
             * Unhides csCdd when reset.
             *
             * @returns {void}
             */
            resetFilters: () => {
                resetCount += 1;
                csCdd.hidden = false;
            }
        };

        /** @type {((entries: Array<{ isIntersecting: boolean, target?: { id?: string } }>) => void) | null} */
        let capturedObserverCb = null;
        /** @type {MockElement[]} */
        const observedTargets = [];

        /**
         * Mock IntersectionObserver implementation for scroll-spy verification.
         */
        class MockIntersectionObserver {
            /**
             * Captures the observer callback.
             *
             * @param {(entries: Array<{ isIntersecting: boolean, target?: { id?: string } }>) => void} cb - Callback.
             */
            constructor(cb) {
                capturedObserverCb = cb;
            }

            /**
             * Records an observed element.
             *
             * @param {MockElement} el - Element to observe.
             * @returns {void}
             */
            observe(el) {
                observedTargets.push(el);
            }
        }

        const win = new MockWindow('#overview', undefined, MockIntersectionObserver);
        enhanceNavigation(/** @type {any} */ (doc), /** @type {any} */ (win), filterCtrl);
        assert.equal(tabOverview.getAttribute('aria-current'), 'location');
        assert.equal(activeYear.getAttribute('aria-current'), 'true');
        assert.equal(observedTargets.length, 2);

        // Scroll-spy updates active tab only on intersecting entry with id
        assert.ok(capturedObserverCb);
        capturedObserverCb([
            { isIntersecting: false, target: { id: 'overview' } },
            { isIntersecting: true, target: {} },
            { isIntersecting: true, target: { id: 'case-studies' } }
        ]);
        assert.equal(tabStudies.getAttribute('aria-current'), 'location');

        await tabOverview.trigger('click');
        assert.equal(tabOverview.getAttribute('aria-current'), 'location');
        await tabEmpty.trigger('click');

        // Clicking #cs-cdd while hidden triggers resetFilters and opens <details>
        await jumpValid.trigger('click');
        assert.equal(resetCount, 1);
        assert.equal(csCdd.getAttribute('open'), '');
        assert.equal(tabStudies.getAttribute('aria-current'), 'location');

        await jumpValid.trigger('click');
        assert.equal(resetCount, 1);

        await jumpMissing.trigger('click');
        win.location.hash = '';
        win.trigger('hashchange');
        win.location.hash = 'invalid';
        win.trigger('hashchange');
        win.location.hash = '#contact';
        win.trigger('hashchange');

        jumpValid.setAttribute('href', '');
        await jumpValid.trigger('click');

        // Window without initial hash activates first tab
        const plainWin = new MockWindow('');
        enhanceNavigation(/** @type {any} */ (doc), /** @type {any} */ (plainWin), null);
        assert.equal(tabOverview.getAttribute('aria-current'), 'location');

        // Window without initial hash when first tab has empty data-nav-target
        const emptyFirstDoc = new MockDocument();
        emptyFirstDoc.body.appendChild(new MockElement('a', { class: 'profile-tab', 'data-nav-target': '' }));
        enhanceNavigation(/** @type {any} */ (emptyFirstDoc), /** @type {any} */ (new MockWindow('')), null);

        // Document with zero tabs
        const zeroTabDoc = new MockDocument();
        enhanceNavigation(/** @type {any} */ (zeroTabDoc), /** @type {any} */ (new MockWindow('')), null);
    });

    it('enhanceOrgDropdown closes open organization popovers on Escape and outside clicks', async () => {
        const emptyDoc = new MockDocument();
        assert.equal(enhanceOrgDropdown(/** @type {any} */ (emptyDoc)), 0);

        const doc = new MockDocument();
        const detailsWithSummary = new MockElement('details', { class: 'gh-org-more', open: '' });
        const summary = new MockElement('summary', {}, 'More');
        const insideLink = new MockElement('a', { href: 'https://github.com/SamuelMarks' });
        detailsWithSummary.appendChild(summary);
        detailsWithSummary.appendChild(insideLink);

        const detailsNoSummary = new MockElement('details', { class: 'gh-org-more' });
        const outsideEl = new MockElement('div');

        doc.body.appendChild(detailsWithSummary);
        doc.body.appendChild(detailsNoSummary);
        doc.body.appendChild(outsideEl);

        assert.equal(enhanceOrgDropdown(/** @type {any} */ (doc)), 2);

        // Non-Escape key does not close
        await doc.trigger('keydown', { key: 'Enter' });
        await doc.trigger('keydown', undefined);
        assert.equal(detailsWithSummary.getAttribute('open'), '');

        // Escape closes open details & focuses summary when focus is unset or inside details
        detailsNoSummary.setAttribute('open', '');
        await doc.trigger('keydown', { key: 'Escape' });
        assert.equal(detailsWithSummary.getAttribute('open'), null);
        assert.equal(detailsNoSummary.getAttribute('open'), null);
        assert.equal(summary.focused, true);

        // Escape when activeElement is inside details restores focus to summary
        summary.focused = false;
        doc.activeElement = insideLink;
        detailsWithSummary.setAttribute('open', '');
        await doc.trigger('keydown', { key: 'Escape' });
        assert.equal(detailsWithSummary.getAttribute('open'), null);
        assert.equal(summary.focused, true);

        // Escape when activeElement is outside details closes menu without stealing focus
        summary.focused = false;
        doc.activeElement = outsideEl;
        detailsWithSummary.setAttribute('open', '');
        await doc.trigger('keydown', { key: 'Escape' });
        assert.equal(detailsWithSummary.getAttribute('open'), null);
        assert.equal(summary.focused, false);

        // Escape when already closed is a no-op
        await doc.trigger('keydown', { key: 'Escape' });

        // focusout keeps open when moving within details, closes when tabbing outside
        detailsWithSummary.setAttribute('open', '');
        await detailsWithSummary.trigger('focusout', undefined);
        await detailsWithSummary.trigger('focusout', { relatedTarget: insideLink });
        assert.equal(detailsWithSummary.getAttribute('open'), '');
        await detailsNoSummary.trigger('focusout', { relatedTarget: outsideEl });
        await detailsWithSummary.trigger('focusout', { relatedTarget: outsideEl });
        assert.equal(detailsWithSummary.getAttribute('open'), null);

        // Inside click keeps open; outside click closes; null click payload is safe
        detailsWithSummary.setAttribute('open', '');
        await doc.trigger('click', { target: insideLink });
        assert.equal(detailsWithSummary.getAttribute('open'), '');

        await doc.trigger('click', undefined);
        assert.equal(detailsWithSummary.getAttribute('open'), '');

        await doc.trigger('click', { target: outsideEl });
        assert.equal(detailsWithSummary.getAttribute('open'), null);
    });

    it('initPortfolioEnhancements and bootstrapIfBrowser mark html.js-enabled', () => {
        const doc = new MockDocument();
        const win = new MockWindow('');
        initPortfolioEnhancements(/** @type {any} */ (doc), /** @type {any} */ (win));
        assert.equal(doc.documentElement.classList.contains('js-enabled'), true);

        assert.equal(bootstrapIfBrowser({}), false);
        const autoDoc = new MockDocument();
        const autoWin = new MockWindow('');
        assert.equal(
            bootstrapIfBrowser({
                document: /** @type {any} */ (autoDoc),
                window: /** @type {any} */ (autoWin)
            }),
            true
        );
        assert.equal(autoDoc.documentElement.classList.contains('js-enabled'), true);
    });
});
