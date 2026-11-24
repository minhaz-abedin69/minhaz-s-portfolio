# Minhaz Abedin: portfolio

Plain HTML, CSS and JavaScript. No framework, no build step, no dependencies.

## Pages
`index.html` (Profile) Â· `projects.html` Â· `people.html` Â· `library.html` Â· `contact.html` Â· `404.html`

## Editing content
Everything lives in **`js/data.js`**. Pages render from it.

| To addâ€¦            | Edit                | Notes |
|--------------------|---------------------|-------|
| a project          | `projects`          | `featured: true` gives it the large card and puts it on the Profile page |
| a person           | `people`            | schema is documented in the file; the page shows an empty state until you add someone |
| a library item     | `library`           | `type` must match an id in `libraryTypes` |
| CV buttons         | `profile.cv`        | put a PDF in `assets/` and set its path |
| location + clock   | `profile.location`, `profile.timezone` | e.g. `"Asia/Dhaka"`; hidden while empty |
| contact topics     | `contact.topics`    | |

Optional fields left as `""` or `[]` are simply not rendered.

## Before you deploy
`canonical`, Open Graph and `sitemap.xml` use `https://minhaz-abedin69.github.io/portfolio/`.
If your site lives at a different address, find-and-replace that string in the `*.html` files,
`sitemap.xml` and `robots.txt`.

## Structure
```
index.html projects.html people.html library.html contact.html 404.html
css/style.css          design tokens, layout, components, motion, responsive
js/data.js             all content
js/components.js       sidebar nav, phone header, theme, sound, icons, toast (loaded in <head>)
js/render.js           renders pages, top bar and right rail from data
js/main.js             Read more, Share, copy, GitHub followers/stars/repos, contact form
admin.html             the admin panel (not linked from the public site)
js/admin/*             admin panel code: core logic, form schema, form builder, GitHub publisher, app
css/admin.css          admin panel styles
js/led.js              animated LED banner (canvas, reacts to cursor and clicks)
js/motion.js           premium motion: reveals, counters, card tilt/spotlight, magnetic buttons, scroll progress
css/motion.css         all new animations (every rule scoped to data-motion="full")
js/assistant-knowledge.js  AI assistant: facts built from data.js (the only source of truth)
js/assistant-engine.js     AI assistant: conversation logic (local answers + optional AI backend)
js/assistant-ui.js         AI assistant: floating chat UI, timing, session memory
css/assistant.css      AI assistant styles (uses the site's theme variables)
api/chat.js            OPTIONAL server for a real AI model (keys stay in env vars)
assets/                fonts (self-hosted), images, favicons, og.png
tests/smoke.py         browser tests (python3 tests/smoke.py)
_archive/              previous version and stale duplicate files, safe to delete
```

## Tests
`pip install playwright && playwright install chromium && python3 tests/smoke.py`
Mocks GitHub and Web3Forms, so nothing is sent to your inbox.

## AI assistant
A floating assistant answers questions about the portfolio. It opens itself once, after the visitor
has scrolled about 30% and stayed a few seconds (or after about 30 seconds), greets them with a typing
animation, and then remembers the conversation for the rest of the browser session. Tune the timing in
`assistant.autoStart` in `js/data.js`, or set `assistant.enabled: false` to turn it off.

* **It only knows what is in `js/data.js`.** Add `experience` or `achievements` there and it will start
  mentioning them; until then it says they are "not listed" instead of guessing.
* **No server needed.** By default it answers locally. No API key exists anywhere in the browser code.
* **Optional real AI model:** deploy `api/chat.js` (Vercel works as-is; `vercel.json` is included), set
  `AI_API_KEY` (and optionally `AI_PROVIDER`, `AI_MODEL`, `ALLOWED_ORIGIN`) as environment variables on the
  host, then set `assistant.endpoint = "/api/chat"`. If the server is down, the assistant falls back to
  local answers automatically. See `.env.example`.

## GitHub section (Work tab)
Follower count, repositories and stars come from GitHub's public API. The contribution graph uses a public
mirror (`github.contributionsApi` in `js/data.js`) because GitHub only exposes the calendar to authenticated
requests; set it to `""` to hide the graph. Anything that can't be loaded is simply left out.

## Tests
`python3 tests/smoke.py` (browser, including the admin panel), `node tests/assistant.test.js`, `node tests/api.test.js`, `node tests/admin.test.js`.

## Animations
All motion hangs off one switch, `data-motion="full" | "reduce"` on `<html>`.
* By default it follows the device: if the operating system asks for reduced motion (on Windows:
  Settings > Accessibility > Visual effects > Animation effects off), the site stays calm.
* Visitors can override that with the **Animations** button (sparkle icon in the sidebar; "Animations" row in the phone menu).
  The choice is remembered.
* Page load assembles the layout in sequence; sections, cards and chips reveal as you scroll; numbers count up;
  the GitHub graph lights up in a wave; project cards tilt and carry a cursor spotlight; the LED banner glows under the
  cursor and ripples on click; tabs slide; pages glide into each other (where the browser supports view transitions).
* Only `transform` and `opacity` are animated, and pointer effects run for a real mouse only.
* To change or remove an effect, edit `css/motion.css` (visuals) or `js/motion.js` (behaviour).

## Admin panel (`/admin.html`)
Edit every part of the site from forms, without touching code: profile, projects, skills, education, journey,
experience, people, library, contact, social links, assistant and GitHub settings.

* **Drafts.** Everything you type is autosaved in your browser. Undo/redo (Ctrl+Z / Ctrl+Shift+Z), a live count of
  unpublished changes, and **Preview** (opens the real site showing your draft, with an "Exit preview" banner;
  only you see it).
* **Checks.** Required fields, duplicate slugs, invalid email/time zone/username, and links. Only `https://` (and mailto)
  links are accepted, so `javascript:` or `data:` links can never be saved. Publishing is blocked while there are errors.
* **Publish.** Review the exact changes, then publish. The panel commits `js/data.js` to your GitHub repository through
  GitHub's API and the site rebuilds in about a minute. Images and your CV can be uploaded from the form too
  (images are resized and saved to `assets/images/uploads/`).
* **Backup.** Download `data.js` / JSON, copy it, import a backup, or discard your draft.

### Security model (read this)
`admin.html` is an ordinary public page: **it holds no secrets and cannot change anything by itself.** The lock is
GitHub: only someone with a token that has write access to your repository can publish. Create a fine-grained token at
github.com/settings/personal-access-tokens/new, limited to this one repository with **Contents: Read and write**.
The token is kept in memory and in `sessionStorage` (forgotten when the tab closes); "Remember on this device"
is optional and off by default. It is only ever sent to `api.github.com`. The page is marked `noindex` and is not linked
from the site or sitemap. A password prompt would add nothing here, because it could not be enforced on a static site.

### Things to know
* The first publish rewrites `js/data.js` in a generated, comment-free format. Your original annotated version is saved
  in `_archive/data-annotated-before-admin.js`. You can still edit `js/data.js` by hand afterwards.
* The repository name defaults to `portfolio` on branch `main`; change it in "Connect GitHub" if yours differs.
* If you change the same file elsewhere between loading the panel and publishing, GitHub refuses the stale write and
  the panel asks you to reload instead of overwriting.

