// No Fandom: hides search results that come from Fandom / Wikia.
//
// A result counts as Fandom if either
//   (1) it contains a link whose address is on fandom.com / wikia.com / wikia.org, or
//   (2) it shows an address line that STARTS with such a host
//       (e.g. "mysingingmonsters.fandom.com › wiki › Page"). Ordinary text that merely
//       mentions fandom.com, like a forum snippet, does not count.
// The whole result block is then marked with data-nofandom (hide.css does the hiding).
// Only nodes the page adds or changes are examined, not the whole page every time.
"use strict";
(() => {
  const MARK = "data-nofandom";               // "hidden" | "shown" on a result block
  const REVEAL = "data-nofandom-reveal";      // on <html> while results are shown
  const BANNER_ID = "nofandom-banner";

  const BAD_HOST = /(^|\.)(fandom\.com|wikia\.com|wikia\.org)$/;
  const BAD_URL_TEXT =
    /^\s*(https?:\/\/)?([a-z0-9-]+\.)*(fandom\.com|wikia\.com|wikia\.org)(?=[\s/›»>·.:?#]|$)/i;
  const MAX_URL_TEXT = 150;

  // Per-site result containers: hostname -> selectors for the element wrapping ONE whole
  // result, outermost first. Sites not listed use the generic detection below.
  const SITE_RESULT_SELECTORS = {
    "ecosia.org": [".mainline__result-wrapper", "article.result"]
  };

  // ---- hostnames -----------------------------------------------------------------
  // "Same site" check that understands endings like .co.uk / .com.au.
  const SECOND_LEVEL = new Set(["co", "com", "org", "net", "gov", "edu", "ac", "or", "ne"]);
  const rootCache = new Map();
  function rootOf(host) {
    let r = rootCache.get(host);
    if (r === undefined) {
      const p = host.split(".");
      const n = p.length >= 3 && p[p.length - 1].length === 2 && SECOND_LEVEL.has(p[p.length - 2]) ? 3 : 2;
      r = p.slice(-n).join(".");
      rootCache.set(host, r);
    }
    return r;
  }
  const ownRoot = rootOf(location.hostname);

  const isBadLink = a => { const h = a.hostname; return !!h && BAD_HOST.test(h); };

  // Distinct hosts of links inside `root` that are neither Fandom nor this search site.
  function otherHosts(root) {
    const set = new Set();
    for (const l of root.querySelectorAll("a[href^='http']")) {
      const h = l.hostname;
      if (h && !BAD_HOST.test(h) && rootOf(h) !== ownRoot) set.add(h);
    }
    return set;
  }

  // ---- finding the block that wraps one result -----------------------------------
  // A block taller than this is probably the whole list, not one result.
  const maxBlockHeight = () => Math.max(window.innerHeight * 0.6, 450);

  // Generic: climb until the parent would also contain another site's link.
  function climbByLinks(start, cap) {
    let el = start;
    while (el.parentElement && el.parentElement !== document.body) {
      const p = el.parentElement;
      if (p.offsetHeight > cap) break;
      if (otherHosts(p).size > 0) return el;
      el = p;
    }
    return el;
  }

  // Generic: lowest ancestor that is one of 3+ same-tag, same-class siblings (one item of a
  // results list); falls back to climbByLinks.
  function genericBlock(start) {
    const cap = maxBlockHeight();
    let el = start;
    while (el.parentElement && el.parentElement !== document.body) {
      const p = el.parentElement;
      if (p.offsetHeight > cap) break;
      if (el.className && el.offsetHeight >= 60 && otherHosts(el).size <= 3) {
        const sibs = [...p.children].filter(x => x.tagName === el.tagName && x.className === el.className);
        if (sibs.length >= 3) return el;
      }
      el = p;
    }
    return climbByLinks(start, cap);
  }

  // Returns [block, isGeneric], or null when the block can't be decided yet.
  function resultBlock(start) {
    const sels = SITE_RESULT_SELECTORS[ownRoot];
    if (sels) for (const s of sels) { const m = start.closest(s); if (m) return [m, false]; }
    // Generic detection compares a result with its neighbours, so it must wait until the page
    // has finished parsing. While Google is still streaming results in, a lone Fandom result
    // has no neighbours yet and would be mistaken for the whole results area.
    if (document.readyState === "loading") return null;
    return [genericBlock(start), true];
  }

  // ---- detection -----------------------------------------------------------------
  const isFandomText = n => n.nodeValue.length <= MAX_URL_TEXT && BAD_URL_TEXT.test(n.nodeValue);

  // Parent elements of text nodes under `root` that look like a Fandom address line.
  function fandomTextParents(root, firstOnly) {
    const out = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const tag = n.parentElement && n.parentElement.tagName;
        if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") return NodeFilter.FILTER_REJECT;
        return isFandomText(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });
    while (walker.nextNode()) {
      out.push(walker.currentNode.parentElement);
      if (firstOnly) break;
    }
    return out;
  }

  const insideMarked = el => !!el.closest("[" + MARK + "]");

  // Reads only. Adds the result blocks (block -> isGeneric) for Fandom matches under/at `n` to `out`.
  function collect(n, out) {
    const add = el => {
      if (!el || insideMarked(el)) return;
      const r = resultBlock(el);
      if (r && r[0] !== document.body && r[0] !== document.documentElement) out.set(r[0], r[1]);
    };
    if (n.nodeType === 3) { if (isFandomText(n)) add(n.parentElement); return; }
    if (n.nodeType !== 1 || n.id === BANNER_ID) return;
    if (n.matches("a[href]") && isBadLink(n)) add(n);
    for (const a of n.querySelectorAll("a[href]")) if (isBadLink(a)) add(a);
    for (const el of fandomTextParents(n, false)) add(el);
  }

  // Does a marked block still contain a Fandom result? (Pages sometimes reuse elements.)
  function stillFandom(b) {
    if (b.matches("a[href]") && isBadLink(b)) return true;
    for (const a of b.querySelectorAll("a[href]")) if (isBadLink(a)) return true;
    return fandomTextParents(b, true).length > 0;
  }

  // ---- marking, reveal toggle, banner --------------------------------------------
  const blocks = new Set();
  const genericBlocks = new WeakSet();   // blocks chosen by the generic method, which can be too big
  let revealed = false;

  const mark = (b, isGeneric) => {
    if (insideMarked(b)) return;
    b.setAttribute(MARK, revealed ? "shown" : "hidden");
    blocks.add(b);
    if (isGeneric) genericBlocks.add(b);
  };
  const unmark = b => { b.removeAttribute(MARK); blocks.delete(b); };

  function outerBlocks() {
    const out = [];
    for (const b of blocks) {
      if (!b.isConnected) { blocks.delete(b); continue; }
      if (!(b.parentElement && b.parentElement.closest("[" + MARK + "]"))) out.push(b);
    }
    return out;
  }

  let banner = null, label = null, button = null;
  function ensureBanner() {
    if (banner) return;
    banner = document.createElement("div");
    banner.id = BANNER_ID;
    const root = banner.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent =
      ".pill{position:fixed;right:16px;bottom:16px;z-index:2147483647;display:flex;gap:10px;" +
      "align-items:center;padding:6px 6px 6px 12px;border-radius:999px;background:#222;color:#fff;" +
      "font:13px/1.2 system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.35)}" +
      "button{font:inherit;border:0;border-radius:999px;padding:5px 11px;cursor:pointer;" +
      "background:#fff;color:#222}button:hover{background:#ddd}";
    const pill = document.createElement("div");
    pill.className = "pill";
    pill.setAttribute("role", "status");
    label = document.createElement("span");
    button = document.createElement("button");
    button.type = "button";
    button.addEventListener("click", toggleReveal);
    pill.append(label, button);
    root.append(style, pill);
    document.documentElement.appendChild(banner);
  }

  function updateBanner() {
    const n = outerBlocks().length;
    if (n === 0) { if (banner) banner.style.display = "none"; return; }
    ensureBanner();
    banner.style.display = "";
    label.textContent = `${n} Fandom result${n === 1 ? "" : "s"} ${revealed ? "shown" : "hidden"}`;
    button.textContent = revealed ? "Hide again" : "Show";
  }

  function toggleReveal() {
    revealed = !revealed;
    document.documentElement.toggleAttribute(REVEAL, revealed);
    for (const b of blocks) if (b.isConnected) b.setAttribute(MARK, revealed ? "shown" : "hidden");
    updateBanner();
  }

  // ---- processing only what changed ----------------------------------------------
  const pending = new Set();
  let scheduled = false;

  function run() {
    if (!scheduled) return;
    scheduled = false;
    const nodes = [...pending];
    pending.clear();

    // Read phase: no DOM writes, so the browser only recalculates layout once.
    const toMark = new Map(), toCheck = new Set();
    for (const n of nodes) {
      if (!n.isConnected) continue;
      collect(n, toMark);
      const el = n.nodeType === 1 ? n : n.parentElement;
      const b = el && el.closest("[" + MARK + "]");
      if (b) toCheck.add(b);
    }
    const toUnmark = [], toRedo = [];
    for (const b of toCheck) {
      if (!stillFandom(b)) toUnmark.push(b);
      // Content arrived after we picked this block and it now holds other sites' results,
      // so it was too big. Drop it and pick again with the full picture.
      else if (genericBlocks.has(b) && otherHosts(b).size > 3) { toUnmark.push(b); toRedo.push(b); }
    }

    // Write phase.
    for (const b of toUnmark) unmark(b);
    for (const [b, g] of toMark) mark(b, g);
    for (const b of toRedo) pending.add(b);
    if (toRedo.length) schedule();
    updateBanner();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(run);   // before the next paint, so hidden results never flash
    setTimeout(run, 300);         // backup for background tabs where rAF is paused
  }

  new MutationObserver(records => {
    for (const r of records) {
      if (r.type === "childList") for (const n of r.addedNodes) pending.add(n);
      else pending.add(r.target);            // href changed, or text changed in place
    }
    schedule();
  }).observe(document.documentElement, {
    childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["href"]
  });

  const scanAll = () => { pending.add(document.documentElement); schedule(); };
  scanAll();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scanAll);
})();
