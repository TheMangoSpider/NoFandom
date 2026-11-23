// No Fandom: hides search results that come from Fandom / Wikia.
//
// A result counts as Fandom if either
//   (1) it contains a link whose address is on fandom.com / wikia.com / wikia.org, or
//   (2) it shows an address line that STARTS with such a host
//       (e.g. "mysingingmonsters.fandom.com › wiki › Page"). Ordinary text that merely
//       mentions fandom.com, like a forum snippet, does not count.
// Once found, the whole result block is hidden.

const BAD_HOST = /(^|\.)(fandom\.com|wikia\.com|wikia\.org)$/;
const BAD_URL_TEXT =
  /^\s*(https?:\/\/)?([a-z0-9-]+\.)*(fandom\.com|wikia\.com|wikia\.org)(?=[\s/›»>·.:?#]|$)/i;
const MAX_URL_TEXT = 150;

// Per-site result containers. To support a new engine, add its hostname and a
// selector for the element wrapping ONE whole result. Sites not listed here use
// the generic detection below.
const SITE_RESULT_SELECTORS = {
  "ecosia.org": ".mainline__result-wrapper, article.result"
};

const siteRoot = location.hostname.split(".").slice(-2).join(".");
const isOwn = h => h === siteRoot || h.endsWith("." + siteRoot);
const hostOf = a => { try { return new URL(a.href, location.href).hostname; } catch { return null; } };
const isBad = h => BAD_HOST.test(h);

function otherHosts(root) {
  const set = new Set();
  for (const l of root.querySelectorAll("a[href^='http']")) {
    const h = hostOf(l);
    if (h && !isBad(h) && !isOwn(h)) set.add(h);
  }
  return set;
}

// Generic: climb until the parent would also contain another site's link.
function climbByLinks(start) {
  let el = start;
  while (el.parentElement && el.parentElement !== document.body) {
    const p = el.parentElement;
    if (p.offsetHeight > window.innerHeight * 0.9) break;
    if (otherHosts(p).size > 0) return el;
    el = p;
  }
  return el;
}

// Generic: the lowest ancestor that is one of 3+ same-tag, same-class siblings
// (one item of a results list); falls back to climbByLinks.
function genericBlock(start) {
  let el = start;
  while (el.parentElement && el.parentElement !== document.body) {
    const p = el.parentElement;
    if (p.offsetHeight > window.innerHeight * 0.9) break;
    if (el.className && el.offsetHeight >= 60 && otherHosts(el).size <= 3) {
      const sibs = [...p.children].filter(x => x.tagName === el.tagName && x.className === el.className);
      if (sibs.length >= 3) return el;
    }
    el = p;
  }
  return climbByLinks(start);
}

function resultBlock(start) {
  const sel = SITE_RESULT_SELECTORS[siteRoot];
  return (sel && start.closest(sel)) || genericBlock(start);
}

function hide(start) {
  const box = resultBlock(start);
  if (box !== document.body && box !== document.documentElement) {
    box.style.setProperty("display", "none", "important");
  }
}

function sweep() {
  for (const a of document.querySelectorAll("a[href]")) {
    const h = hostOf(a);
    if (h && isBad(h)) hide(a);
  }

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const tag = n.parentElement && n.parentElement.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") return NodeFilter.FILTER_REJECT;
      const t = n.nodeValue;
      return t.length <= MAX_URL_TEXT && BAD_URL_TEXT.test(t) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    }
  });
  while (walker.nextNode()) {
    const el = walker.currentNode.parentElement;
    if (el && el.offsetParent !== null) hide(el);
  }
}

let queued = false;
function schedule() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; sweep(); });
}

sweep();
new MutationObserver(schedule).observe(document.documentElement, {
  childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["href"]
});
