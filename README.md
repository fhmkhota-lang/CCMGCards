# CCMG Cards — Social Card Studio

Social-card studio for the 14 Cape Community Media Group (CCMG) titles. A fork
of IOL Titles (`fhmkhota-lang/IOLTitles`) with the same features — live
per-title feeds, search, + From URL, Single / Carousel / Infographic (AI key
points), breaking-news banner, colour/white logo picker, Square + Reel
downloads, shortened share captions and Supabase team ticks — in its own repo,
site and workers.

## Files
| File | Purpose |
|------|---------|
| `index.html` | App shell: header, publication picker, search, From-URL, designer |
| `app.js` | Feed, designer, card renderers (4 themes), carousel/infographic, ticks, share |
| `style.css` | Dark studio chrome + publication-pill picker |
| `worker.js` | Cloudflare Worker: per-title RSS, image/fullimage/shorten/claude proxies |
| `data.js` | Empty offline fallback (all titles have live feeds) |
| `logos/` | `<key>.png` (colour) + `<key>-white.png` per title, `ccmg.png` header logo |

## The 14 titles and feeds (verified 2026-09-30)
Each title's own site `https://<site>/rss/` — 30 items with images (CapeTowner 50).

| Key | Title | Site | Theme |
|-----|-------|------|-------|
| athlonenews | Athlone News | athlonenews.co.za | classic |
| atlanticsun | Atlantic Sun | atlanticsun.co.za | classic |
| bolander | Bolander | **bolanderlifestyle.co.za** | magazine |
| capetowner | CapeTowner | capetowner.co.za | lifestyle |
| constantiabergbulletin | Constantiaberg Bulletin | constantiabergbulletin.co.za | classic |
| dfa | DFA (Diamond Fields Advertiser) | dfa.co.za | broadsheet |
| falsebayecho | False Bay Echo | falsebayecho.co.za | classic |
| isolezwelesixhosa | Isolezwe lesiXhosa | isolezwelesixhosa.co.za | classic |
| plainsman | Plainsman | plainsman.co.za | classic |
| sentinelnews | Sentinel News | sentinelnews.co.za | classic |
| southernmail | Southern Mail | southernmail.co.za | classic |
| southernsuburbstatler | Southern Suburbs Tatler | southernsuburbstatler.co.za | classic |
| tabletalk | Tabletalk | tabletalk.co.za | classic |
| vukani | Vukani | **vukaninews.co.za** | classic |

`vukani.co.za` and `bolander.co.za` don't resolve — those two use the domains above.

## Card themes
- **classic** (11 titles) — the IOL Titles card: masthead top-left (CCMG's blue
  box mastheads are drawn as-is, no white chip), brand-colour kicker pill, big
  uppercase white headline, `*asterisks*` colour words, bottom bar with the domain.
- **lifestyle** (CapeTowner) — unchanged from IOL Titles: round logo, amber wash
  fixed at the bottom, navy sentence-case headline. The *White* logo option
  swaps in the blue CCMG "the CapeTowner" masthead.
- **broadsheet** (DFA) — white newspaper-page panel with red DFA masthead, red
  kicker, heavy condensed black headline (red `*words*`), red rule, footer with
  domain and Kimberley · Northern Cape. Top / Bottom = flush panel, Middle =
  floating inset panel.
- **magazine** (Bolander) — thin white frame, magenta masthead, magenta wash that
  follows the text, white kicker pill, white sentence-case headline (pink `*words*`).

## Deployment
Mirrors IOL Titles exactly:
- **Site**: GitHub Pages — `fhmkhota-lang.github.io/CCMGCards/`, using the open
  worker `ccmgcards` (`https://ccmgcards.faheem-khota.workers.dev`) for feeds.
  Deploy: `npx wrangler deploy`.
- **Access-protected build**: worker `ccmgcards-secure` serves the site (static
  assets from an allowlisted `.deploy-public/`) **and** the API on one hostname,
  so one Cloudflare Access login covers everything. Deploy: `./deploy-secure.sh`.
  `app.js` picks the same-origin API automatically when not on github.io.
- **AI**: `/claude` goes to the existing `ioltester` worker (holds `ANTHROPIC_KEY`).
- **Supabase** (`asipandmcgagpswsgbtr`): shared `done_stories` table; ids are
  prefixed `ccmg_<pub>__` so ticks never clash with IOL Cards / IOL Titles.
- Repos: GitHub `fhmkhota-lang/CCMGCards`, GitLab `volt-prototypes/ccmg-cards`.
