imsamuel-stanford.github.io
===========================

Static files and progressive enhancements for Samuel Marks's Stanford website:
https://web.stanford.edu/~imsamuel/ (and http://web.stanford.edu/people/imsamuel).

Architecture & Progressive Enhancement
--------------------------------------

- **Zero-JavaScript First (`index.html`, `assets/styles.css`):** Self-hosted HTML5 and CSS (zero external CSS CDNs) leading with Stanford School of Medicine Department of Pediatrics deliverables (`hospital-dashboard-platform` for LLM + JAX/MPAX hospital operations optimization and `t1d-analytics` for pediatric T1D & cardiovascular ICU clinical AI), followed by four plain-English Open-Source Ecosystem cards (`ml-switcheroo` / `zero-zoo` portable ML compilers, `CDD` polyglot compilers, `#rewriteInC.io` ANSI C89 stack, and `LibScript` reproducible deployment), five native `<details>`/`<summary>` Technical Deep Dives (collapsed by default for fast scanning, 100% expandable without JS), and pre-rendered GitHub contribution SVGs.
- **Progressive Enhancement Exclusively (`assets/index.js`):** When JavaScript is enabled, `html.js-enabled` unlocks optional conveniences: spam-resistant `mailto:` hydration with clipboard copy, 1-click code-blueprint copy buttons, deep-dive category/keyword filtering with auto-expansion, keyboard-accessible repository-card ↔ SVG-diagram highlighting, `IntersectionObserver` scroll-spy & hash-aware disclosure opening, and `Escape`/outside-click popover dismissal.

Verification
------------

```sh
npm run update:github-stats  # Refresh selectable SVG & HTML GitHub stats from @SamuelMarks
npm test                     # Node built-in test runner with 100% line/branch/function coverage
npm run lint                 # Strict ESLint flat config + HTML5 Tidy validation
```
