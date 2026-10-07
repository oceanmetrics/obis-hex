# Redirecting the Shiny app (app.marinesensitivity.org/h3-db) to obis-hex

The retired Shiny app's links, including its Share bookmarks (`?_inputs_&indicator=%22es%22&…`),
should land on the same view here. Caddy sends the whole original query to obis-hex after
`?legacy=`; the app maps it to its hash state (`src/lib/state/legacy.ts`, tests in
`tests/legacy.test.ts`), shows a one-line notice when the old view cannot be reproduced exactly,
and then drops `?legacy=` from the address bar.

## The Caddy block

app.marinesensitivity.org is served by `/share/github/MarineSensitivity/server/caddy/Caddyfile` on
msens (not `server/prod/Caddyfile`, which is the BOEM internal `:80` server and has no h3-db route).
Today `/h3-db/` falls through to the site's final `reverse_proxy rstudio:3838`. Add this inside the
`app.marinesensitivity.org { … }` block, next to the other retirement redirects (after
`redir @species_v7 …`, before `@restricted_app`):

```caddy
	# ---- h3-db retired -> obis-hex (2026-10) -----------------------------
	#
	# The Shiny OBIS-by-H3 app is replaced by a static page that reads the same
	# indicators from Parquet on S3 (https://oceanmetrics.io/obis-hex/). Old links
	# and Share bookmarks (?_inputs_&indicator=%22es%22&preset=...) keep working:
	# the WHOLE original query rides after ?legacy= and obis-hex maps it to its own
	# URL state (oceanmetrics/obis-hex src/lib/state/legacy.ts). {query} goes in
	# unencoded on purpose: the app reads everything after "legacy=" as the old
	# query, so its own & separators survive. An empty {query} gives "?legacy=",
	# which the app ignores. 302, not 301, while the mapping is new: a cached 301
	# could not be corrected if a bookmark turns out to map badly.
	@h3db path_regexp h3db ^/h3-db(?:/.*)?$
	redir @h3db https://oceanmetrics.io/obis-hex/?legacy={query} 302
```

`redir` sorts before `reverse_proxy` in Caddy's directive order, so the block wins over the Shiny
proxy without a `route`. After editing: `caddy validate` (or the server's `DEPLOY_CADDY` step), then
reload.

## Checking it

```sh
curl -sI 'https://app.marinesensitivity.org/h3-db/?_inputs_&indicator=%22sp%22&preset=%22Seagrasses%22&res=4&res_manual=true' \
  | grep -i '^location'
# location: https://oceanmetrics.io/obis-hex/?legacy=_inputs_&indicator=%22sp%22&preset=%22Seagrasses%22&res=4&res_manual=true
```

Opening that location shows species richness for the seagrasses EOV at res 4, and the address bar
becomes `https://oceanmetrics.io/obis-hex/#i=sp&l=eov:seagrasses&…&r=4&…`.

## The mapping

| Shiny input (bookmark param) | obis-hex | notes |
|---|---|---|
| `indicator` `"es"` `"sp"` `"shannon"` `"n"` | `i=` same id | |
| `preset` `"All taxa"` | `l=all` | |
| `preset` EOV (`"Fish"`, `"Hard corals"`, `"Mangroves"`, `"Marine mammals"`, `"Seabirds"`, `"Seagrasses"`, `"Sea turtles"`) | `l=eov:<key>` | exact (same IOOS seeds) |
| `preset` `"Seabirds (class Aves)"`, `"Sharks & rays (Elasmobranchii)"`, `"Marine mammals (Mammalia)"`, `"Sea turtles (order Testudines)"`, `"Mollusks (phylum Mollusca)"`, `"Crustaceans (Malacostraca)"` | `l=taxon:<rank>:<name>` | the release's rank-column group of the same name |
| `preset` `"Bony fishes (Actinopterygii)"` | `l=taxon:class:Teleostei` | notice: OBIS files Actinopterygii (a WoRMS gigaclass) as class Teleostei |
| `preset` `"Corals & anemones (Anthozoa)"` | `l=taxon:class:Hexacorallia` | notice: Anthozoa is a subphylum; Octocorallia is a separate layer |
| `custom_taxon` + `rank` phylum/class/order + `taxon_val` | `l=taxon:<rank>:<taxon_val>` | exact |
| `custom_taxon` + family/genus/species | the preset's layer | notice |
| `custom_aphiaid` + `aphiaid_val` | `l=aphia:<id>` (the live WoRMS subtree layer) | exact; with several ids the first, with a notice; a non-number keeps the preset's layer, with a notice |
| `custom_sql` + `sql` | the EOV or taxon named in the SQL (`idx_h3_eov … eov = '…'`, `idx_h3_taxon … rank/taxon`), else all taxa; the indicator projected `AS value` | notice |
| `years` `[1900, 2026]` | `p=all` | |
| `years` inside one decade (1960s–2020s) | `p=<decade>` | notice unless exactly the decade; taxon groups have no decades (notice, all years); AphiaID layers do |
| `years` across decades | `p=all` | notice |
| `res` + `res_manual=true` | `r=<res>` (capped 7, or 5 with a decade on a release layer) | |
| `res_manual=false` | `r=auto` | |
| `opacity` 0–100 | `o=` 0–1 | |
| `theme` | `t=` | |
| `map_center` `{lng, lat}`, `map_zoom` | `c=lon,lat,zoom` | |
| `sidebar`, `view_title`, `rank`/`taxon_val`/`aphiaid_val`/`sql` without their checkbox, anything else | ignored | |
