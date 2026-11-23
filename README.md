# No Fandom

Browser extension (Manifest V3) that hides Fandom / Wikia wikis from search results.

Tested: Brave Search, Ecosia, Google, Bing, DuckDuckGo.
Google is matched on `google.com` and the main country domains listed in `manifest.json`.

## Features
- Hides every Fandom / Wikia result, whether or not an independent wiki exists.
- A small "N Fandom results hidden" pill with a Show / Hide again button.
- Ecosia results are hidden by CSS before first paint; other sites are hidden right before paint.
- Only changed parts of the page are examined, so it stays cheap on dynamic pages.
- No permissions, no network requests, no data collected (see PRIVACY.md).

## Install (unpacked)
`brave://extensions` or `chrome://extensions` -> Developer mode -> Load unpacked -> pick this folder.

## Adding a search engine
1. Add its results URL to `matches` in `manifest.json` (country domains each need their own entry).
2. Try it. If part of a result is left behind, add the domain and selectors for the element
   wrapping one whole result to `SITE_RESULT_SELECTORS` in `hide.js` (outermost first).
3. Optional: add an early CSS rule in `hide.css` like the Ecosia one to avoid any flash.

## How a result is recognised
A link whose host is on fandom.com / wikia.com / wikia.org, or a short text line that starts with
such an address (the grey URL line under a result). Text that merely mentions fandom.com does not count.
