// Redirect specific Fandom wikis to an independent wiki.
// Key = the fandom subdomain, value = base URL of the independent wiki (no trailing slash).
const REDIRECTS = {
  mysingingmonsters: "https://REPLACE-WITH-MSMPOKEGAMER-WIKI-URL"
};

const sub = location.hostname.split(".")[0];
const target = REDIRECTS[sub];
if (target && !target.includes("REPLACE")) {
  location.replace(target + location.pathname + location.search + location.hash);
}
