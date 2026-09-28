# Local data-chain pilot

The optimize homepage and recipe panel shells remain in place. Catalog queries
now own ordinary paging and search, including empty results. Catalog recipe IDs
use the captured view renderer inside the existing recipe panel; exact quantities,
alternatives and native animation tracks stay in their contract representation.
Catalog icons use the checked atlas renderer and its native crop/timeline.

Production builds ship one integrity-pinned service worker. The offline library
is at `/offline`; saved catalog images requested by ordinary URLs are checked
against the saved manifest before being served. Corrupt saved images fail closed
and require repair. Clearing unused shell versions does not remove saved catalogs.

`npm run check`, `npm test`, `npm run build`, release verification and `npm run e2e`
are the current pilot gates. Browser checks exercise the actual optimize homepage
online/offline, search, captured recipe view, exact quantity, native animation,
saved-shell reload and image integrity/corruption. They use a synthetic catalog;
they do not establish live GTNH coverage.

`frontend/test/catalog.spec.ts` is retained as the previous CatalogPage UI suite.
Its homepage/route/settings selectors describe the replaced design. It is not
included in `npm run e2e`; its broader domain, browser-restart and cross-tab tests
still need migration. This pilot is not a claim that the old full browser suite
passes, or that all GTNH handlers and domain pages are accepted. The Catalog/API
behavior tests remain enabled. No historical datasets or untracked artifacts are
removed as part of this work.
