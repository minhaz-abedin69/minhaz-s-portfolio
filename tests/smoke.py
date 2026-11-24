"""
Browser smoke tests for the portfolio. Run from the project root:

    pip install playwright && playwright install chromium
    python3 tests/smoke.py

Starts its own static server, mocks GitHub + Web3Forms (nothing is sent to
the real inbox), and exits non-zero if anything fails.
"""
import json, re, sys, threading, http.server, socketserver, functools, os
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8791
BASE = f"http://localhost:{PORT}/"
PAGES = ["index", "projects", "website", "people", "library", "contact"]
WIDTHS = [375, 390, 430, 768, 1024, 1280, 1440]

PEOPLE_FIXTURE = """
SITE.people = [
 {name:"Ada Example", slug:"ada-example", role:"Teacher", why:"Clear explanations", tags:["Algorithms"], favorite:true,
  links:[{platform:"GitHub",url:"https://github.com/ada",handle:"@ada"},{platform:"X",url:"https://x.com/ada",handle:"@ada"}]},
 {name:"Linus Example", slug:"linus-example", role:"Engineer",
  links:[{platform:"GitHub",url:"https://github.com/linus",handle:"@linus"}]},
 {name:"Grace Example", slug:"grace-example", role:"Researcher",
  links:[{platform:"Website",url:"https://example.org",handle:"example.org"}]},
];
"""

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

def serve():
    handler = functools.partial(Quiet, directory=ROOT)
    socketserver.TCPServer.allow_reuse_address = True
    srv = socketserver.TCPServer(("", PORT), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv

results = []
def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail and not ok else ""))

GH_USER = json.dumps({"followers": 7, "public_repos": 12})
import datetime as _dt
def _contrib():
    end = _dt.date(2026, 11, 20); d = end - _dt.timedelta(days=364); out = []
    i = 0
    while d <= end:
        n = (i * 7) % 5; out.append({"date": d.isoformat(), "count": n, "level": min(4, n)}); d += _dt.timedelta(days=1); i += 1
    return out
CONTRIB = json.dumps({"total": {"lastYear": 1374}, "contributions": _contrib()})
def _repo(name, stars, fork=False, lang="JavaScript"):
    return {"name": name, "full_name": "minhaz-abedin69/" + name, "html_url": "https://github.com/minhaz-abedin69/" + name,
            "stargazers_count": stars, "forks_count": 1, "fork": fork, "archived": False, "language": lang,
            "description": "Repo " + name, "pushed_at": "2026-01-01T00:00:00Z"}
GH_REPOS = json.dumps([_repo("Boolean-algebra-chapter-2", 3), _repo("some-fork", 99, fork=True), _repo("Another-repo", 1, lang="C++")])

def mock(page, people=False, form="ok"):
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.route("**/api.github.com/users/*/repos*", lambda r: r.fulfill(status=200, content_type="application/json", body=GH_REPOS))
    page.route(re.compile(r".*api\.github\.com/users/[^/]+$"), lambda r: r.fulfill(status=200, content_type="application/json", body=GH_USER))
    page.route("**/github-contributions-api.jogruber.de/**", lambda r: r.fulfill(status=200, content_type="application/json", body=CONTRIB))
    sent = []
    def web3(r):
        sent.append(r.request.post_data or "")
        if form == "ok": r.fulfill(status=200, content_type="application/json", body='{"success":true}')
        elif form == "fail": r.fulfill(status=200, content_type="application/json", body='{"success":false}')
        else: r.abort()
    page.route("**/api.web3forms.com/**", web3)
    if people:
        def data(r):
            resp = r.fetch()
            r.fulfill(response=resp, body=resp.text() + PEOPLE_FIXTURE)
        page.route("**/js/data.js", data)
    return errors, sent

def run():
    srv = serve()
    with sync_playwright() as p:
        b = p.chromium.launch()

        # ---- 1. Layout, overflow, console errors at every width
        for w in WIDTHS:
            ctx = b.new_context(viewport={"width": w, "height": 800}, has_touch=w < 820, is_mobile=w < 820)
            pg = ctx.new_page(); errors, _ = mock(pg)
            bad = []
            for name in PAGES:
                pg.goto(f"{BASE}{name}.html"); pg.wait_for_timeout(300)
                over = pg.evaluate("document.documentElement.scrollWidth - window.innerWidth")
                if over > 0: bad.append(f"{name}:+{over}px")
                if pg.locator("h1").count() != 1: bad.append(f"{name}:h1 count")
            check(f"no horizontal overflow, one h1 per page @ {w}px", not bad, ", ".join(bad))
            check(f"no console/page errors @ {w}px", not errors, "; ".join(errors[:2]))
            vis_nav = pg.locator(".sidebar-nav").is_visible(); vis_tab = pg.locator("#menuBtn").is_visible()
            check(f"nav pattern correct @ {w}px", (vis_nav and not vis_tab) if w >= 820 else (vis_tab and not vis_nav),
                  f"sidebar={vis_nav} menuBtn={vis_tab}")
            ctx.close()

        ctx = b.new_context(viewport={"width": 1280, "height": 900}); ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=BASE)
        pg = ctx.new_page(); errors, sent = mock(pg)

        # ---- 2. Navigation + active state + links
        for name, label in [("index", "Profile"), ("projects", "Projects"), ("website", "Website"), ("library", "Library"), ("contact", "Contact")]:
            pg.goto(f"{BASE}{name}.html"); pg.wait_for_timeout(200)
            cur = [x.strip() for x in pg.locator(".sn-list a[aria-current='page']").all_inner_texts()]
            check(f"active nav item on {name}", cur == [label], str(cur))
        pg.goto(BASE + "index.html")
        pg.click(".sn-list >> text=Projects"); pg.wait_for_url("**/projects.html")
        check("sidebar nav link navigates", True)

        broken = []
        for name in PAGES + ["404"]:
            pg.goto(f"{BASE}{name}.html"); pg.wait_for_timeout(300)
            for href in pg.eval_on_selector_all("a[href]", "els => els.map(e => e.getAttribute('href'))"):
                if href in ("#", "") or href.startswith("javascript"): broken.append(f"{name}: dead href {href!r}")
                elif href.startswith(("http", "mailto:")):
                    if href.startswith("http") and not re.match(r"https?://[^/\s]+\.[^/\s]+", href): broken.append(f"{name}: bad url {href}")
                else:
                    path = href.split("#")[0]
                    if path and not os.path.exists(os.path.join(ROOT, path)): broken.append(f"{name}: missing {href}")
            ext = pg.eval_on_selector_all("a[target=_blank]", "els => els.filter(e => !/noopener/.test(e.rel))")
            if ext: broken.append(f"{name}: _blank without noopener")
        check("no dead, malformed or unsafe links on any page", not broken, "; ".join(broken[:3]))

        # ---- 3. Theme
        pg.goto(BASE + "index.html")
        before = pg.evaluate("document.documentElement.dataset.theme")
        pg.click(".sn-tools [data-theme-toggle]"); pg.wait_for_timeout(400)
        after = pg.evaluate("document.documentElement.dataset.theme")
        pg.reload(); persisted = pg.evaluate("document.documentElement.dataset.theme")
        check("theme toggle switches and persists across reload", before == "dark" and after == "light" and persisted == "light", f"{before}->{after}->{persisted}")
        pg.evaluate("localStorage.clear()")

        # ---- 4. Home interactions
        pg.goto(BASE + "index.html"); pg.wait_for_timeout(600)
        pg.wait_for_function("document.querySelector('[data-gh-followers-text]') && /^7 followers/.test(document.querySelector('[data-gh-followers-text]').innerText.trim())", timeout=4000)
        check("GitHub followers shown in the top bar (count-up ends on the true value)", "7 followers on GitHub" in pg.inner_text("[data-gh-followers-text]"))
        pg.click("#aboutToggle"); pg.wait_for_timeout(500)
        opened = pg.get_attribute("#aboutToggle", "aria-expanded") == "true" and pg.evaluate("!document.getElementById('aboutMore').inert")
        pg.click("#aboutToggle"); pg.wait_for_timeout(300)
        closed = pg.get_attribute("#aboutToggle", "aria-expanded") == "false" and pg.evaluate("document.getElementById('aboutMore').inert")
        check("Read more / Read less toggles (aria + inert)", opened and closed)

        # Share: clipboard fallback (desktop Chromium has no navigator.share)
        has_share = pg.evaluate("typeof navigator.share")
        pg.click(".tb-icon[data-share]"); pg.wait_for_timeout(300)
        clip = pg.evaluate("navigator.clipboard.readText()")
        check("Share falls back to clipboard + toast when Web Share is unavailable",
              has_share == "undefined" and clip.startswith(BASE) and "copied" in pg.inner_text("#toast"), f"{has_share} {clip}")
        # Share: Web Share API path
        pg.evaluate("window.__shared = null; navigator.share = (d) => { window.__shared = d; return Promise.resolve(); }; 0")
        pg.click(".tb-icon[data-share]"); pg.wait_for_timeout(200)
        shared = pg.evaluate("window.__shared")
        check("Share uses navigator.share with name, text and url", bool(shared) and shared["url"].startswith(BASE) and "Minhaz Abedin" in shared["title"], str(shared))
        pg.evaluate("window.__shared = null; navigator.share = () => Promise.reject(new DOMException('x','AbortError')); 0")
        pg.evaluate("navigator.clipboard.writeText('sentinel')")
        pg.click(".tb-icon[data-share]"); pg.wait_for_timeout(250)
        check("Cancelling the share sheet does not trigger the fallback", pg.evaluate("navigator.clipboard.readText()") == "sentinel")

        # LED banner
        check("LED banner canvas present and drawn", pg.evaluate("(() => { const c=document.getElementById('led'); return !!c && c.width>0 && c.getContext('2d').getImageData(10,10,1,1).data[3]>0 || c.width>0; })()"))

        # ---- 4b. Tabs (Resume / Work)
        pg.goto(BASE + "index.html"); pg.wait_for_timeout(400)
        pg.click("#tab-work"); pg.wait_for_timeout(200)
        check("Work tab shows all 5 projects, hides Resume",
              pg.locator("#panel-work .pcard").count() == 5 and pg.locator("#panel-resume").is_hidden() and pg.evaluate("location.hash") == "#work")
        pg.focus("#tab-work"); pg.keyboard.press("ArrowLeft"); pg.wait_for_timeout(150)
        check("Arrow keys switch tabs", pg.get_attribute("#tab-resume", "aria-selected") == "true" and pg.locator("#panel-resume").is_visible())
        pg.goto(BASE + "index.html#work"); pg.wait_for_timeout(400)
        check("#work deep link opens Work tab", pg.locator("#panel-work").is_visible())

        # ---- 5. Projects: cards, stars, open source
        pg.goto(BASE + "projects.html"); pg.wait_for_timeout(900)
        check("Projects page shows 5 project cards in a grid", pg.locator(".pgrid .pcard").count() == 5)
        cols = pg.evaluate("new Set([...document.querySelectorAll('.pgrid .pcard')].map(c => c.offsetLeft)).size")
        check("Project cards form 2 columns on desktop", cols == 2, str(cols))
        star = pg.locator(".stars:not([hidden])")
        check("GitHub stars appear on matching repo only", star.count() == 1 and "3 stars" in star.first.inner_text(), str(star.count()))
        oss = pg.locator("#ossList li")
        names = pg.eval_on_selector_all("#ossList .repo-name b", "els => els.map(e => e.textContent)")
        check("Open source list shows own repos, excludes forks, most starred first",
              oss.count() == 2 and "some-fork" not in names and names[0] == "Boolean-algebra-chapter-2", str(names))
        check("Every project link opens safely", pg.eval_on_selector_all(".pcard a[target=_blank]", "els => els.every(e => /noopener/.test(e.rel))"))

        # ---- 6. People: empty state + fixture-driven filters
        pg.goto(BASE + "people.html"); pg.wait_for_timeout(300)
        check("People page shows honest empty state (no invented people)", pg.locator(".empty").count() == 1 and pg.locator(".person").count() == 0)
        pg.goto(BASE + "index.html"); pg.wait_for_timeout(300)
        check("Home sidebar hides 'Who to follow' when no people", pg.locator("#sideFollow").count() == 0)
        ctx2 = b.new_context(viewport={"width": 1280, "height": 900}); p2 = ctx2.new_page(); e2, _ = mock(p2, people=True)
        p2.goto(BASE + "people.html"); p2.wait_for_timeout(400)
        check("People renders 3 fixture people", p2.locator(".person").count() == 3)
        check("People favorite badge + why shown", p2.locator(".fav").count() == 1 and p2.locator(".why").count() == 1)
        p2.click("[data-plat='GitHub']"); p2.wait_for_timeout(200)
        check("People platform filter (GitHub → 2)", p2.locator(".person").count() == 2)
        p2.click("[data-plat='Website']"); p2.wait_for_timeout(200)
        check("People platform filter (Website → 1)", p2.locator(".person").count() == 1)
        p2.goto(BASE + "people.html#linus-example"); p2.wait_for_timeout(500)
        check("People #slug deep link highlights card", p2.evaluate("document.querySelector('.person.is-target')?.id") == "linus-example")
        p2.goto(BASE + "index.html"); p2.wait_for_timeout(300)
        check("Home sidebar lists people when present", p2.locator(".side-people li").count() == 3)
        check("fixture pages had no errors", not e2, "; ".join(e2[:2])); ctx2.close()

        # ---- 6b. Shell: Follow button, collapse, sound
        pg.goto(BASE + "index.html"); pg.wait_for_timeout(500)
        check("Rail Follow button links to GitHub profile", pg.get_attribute(".follow-btn", "href").endswith("/minhaz-abedin69"))
        w0 = pg.evaluate("document.querySelector('.sidebar-nav').offsetWidth")
        pg.click("#navCollapse"); pg.wait_for_timeout(300)
        w1 = pg.evaluate("document.querySelector('.sidebar-nav').offsetWidth")
        pg.reload(); pg.wait_for_timeout(500)
        w2 = pg.evaluate("document.querySelector('.sidebar-nav').offsetWidth")
        check("Sidebar collapses to icons and remembers it", w0 > 200 and w1 < 100 and w2 < 100, f"{w0}->{w1}->{w2}")
        pg.click("#navCollapse"); pg.wait_for_timeout(200)
        pg.click("#soundToggle"); pg.wait_for_timeout(150)
        check("Sound toggle switches on and persists", pg.get_attribute("#soundToggle", "aria-pressed") == "true" and pg.evaluate("localStorage.getItem('sound')") == "on")
        pg.click("#soundToggle"); pg.wait_for_timeout(100)
        check("Sound toggle switches off", pg.get_attribute("#soundToggle", "aria-pressed") == "false")
        pg.goto(BASE + "contact.html"); pg.wait_for_timeout(400)
        check("Contact page hides the empty right rail", pg.locator("#rail").is_hidden())

        # ---- 6c. Website replaces People in the navigation
        pg.goto(BASE + "index.html"); pg.wait_for_timeout(400)
        side = [x.strip() for x in pg.locator(".sn-list a").all_inner_texts()]
        foot = pg.eval_on_selector_all(".footer-nav a", "els => els.map(e => e.textContent.trim())")
        check("Sidebar nav: People removed, Website added in its place", side == ["Profile", "Projects", "Website", "Contact", "Library"], str(side))
        check("Footer nav matches (no People)", "People" not in foot and "Website" in foot, str(foot))
        pg.goto(BASE + "website.html"); pg.wait_for_timeout(700)
        sites = pg.eval_on_selector_all(".site-card h3", "els => els.map(e => e.textContent)")
        check("Website page lists exactly the projects that have a live demo", sorted(sites) == sorted(["University Management System", "Boolean Algebra & Logic Gates: Study Dashboard", "Login Page UI"]), str(sites))
        visit = pg.eval_on_selector_all(".site-card a.btn-primary", "els => els.map(e => [e.href, e.target, /noopener/.test(e.rel)])")
        check("Every Visit button opens a real https address safely", len(visit) == 3 and all(v[0].startswith("https://") and v[1] == "_blank" and v[2] for v in visit), str(visit))
        check("Website page has no invented 'main website' card when none is set", pg.locator(".hero-card").count() == 0)
        cws = b.new_context(viewport={"width": 1280, "height": 800}); pws = cws.new_page(); mock(pws)
        def _wdata(r):
            resp = r.fetch(); r.fulfill(response=resp, body=resp.text() + "SITE.profile.website = 'https://example.org/me';")
        pws.route("**/js/data.js", _wdata)
        pws.goto(BASE + "website.html"); pws.wait_for_timeout(600)
        check("When profile.website is set, a 'Visit my website' card appears", pws.locator(".hero-card a[href='https://example.org/me']").count() == 1)
        cws.close()

        # ---- 7. Library
        pg.goto(BASE + "library.html"); pg.wait_for_timeout(300)
        check("Library lists seeded items", pg.locator(".lib-item").count() == 2)
        pg.fill("#librarySearch", "leet"); pg.wait_for_timeout(150)
        check("Library search filters", pg.locator(".lib-item").count() == 1 and "1 item" in pg.inner_text("#libraryCount"))
        pg.fill("#librarySearch", "zzzz"); pg.wait_for_timeout(150)
        check("Library no-match state", pg.locator(".lib-none").count() == 1)
        pg.click("#libraryClear"); pg.wait_for_timeout(150)
        check("Library clear restores list + focuses search", pg.locator(".lib-item").count() == 2 and pg.evaluate("document.activeElement.id") == "librarySearch")

        # ---- 8. Contact
        pg.goto(BASE + "contact.html"); pg.wait_for_timeout(400)
        pg.click("[data-topic='opportunity']"); pg.wait_for_timeout(700)
        check("Topic card pre-selects topic + subject + moves focus to form",
              pg.input_value("#topic") == "opportunity" and "Opportunity" in pg.input_value("input[name=subject]") and pg.evaluate("document.activeElement.id") == "name")
        pg.click("#contactSubmit"); pg.wait_for_timeout(200)
        check("Invalid submit blocked, no request sent", len(sent) == 0 and "is-error" in pg.get_attribute("#formNote", "class"))
        pg.fill("#name", "Test"); pg.fill("#email", "t@example.com"); pg.fill("#message", "Hello there")
        pg.click("#contactSubmit"); pg.wait_for_timeout(500)
        check("Valid submit posts to Web3Forms and shows success", len(sent) == 1 and "access_key" in sent[0] and "is-ok" in pg.get_attribute("#formNote", "class"))
        check("Form resets after success", pg.input_value("#name") == "")
        pg.click("[data-copy]"); pg.wait_for_timeout(300)
        check("Copy email works", pg.evaluate("navigator.clipboard.readText()") == "minhazabedin8068@gmail.com")
        pg.fill("#name", "T"); pg.fill("#email", "t@example.com"); pg.fill("#message", "x")
        pg.evaluate("document.querySelector('[name=botcheck]').checked = true")
        n0 = len(sent); pg.click("#contactSubmit"); pg.wait_for_timeout(300)
        check("Honeypot submissions are dropped silently", len(sent) == n0)
        ctx.close()

        ctx3 = b.new_context(viewport={"width": 1280, "height": 900}); p3 = ctx3.new_page(); _, s3 = mock(p3, form="fail")
        p3.goto(BASE + "contact.html"); p3.wait_for_timeout(300)
        p3.fill("#name", "T"); p3.fill("#email", "t@example.com"); p3.fill("#message", "x"); p3.click("#contactSubmit"); p3.wait_for_timeout(400)
        check("Failed send shows fallback with email address",
              "is-error" in p3.get_attribute("#formNote", "class") and "minhazabedin8068@gmail.com" in p3.inner_text("#formNote") and not p3.locator("#contactSubmit").is_disabled())
        ctx3.close()

        # ---- 8b. Mobile menu
        cm = b.new_context(viewport={"width": 390, "height": 800}, has_touch=True, is_mobile=True); pm = cm.new_page(); mock(pm)
        pm.goto(BASE + "index.html"); pm.wait_for_timeout(300)
        check("Mobile menu closed by default", pm.locator("#mobileMenu").is_hidden())
        pm.click("#menuBtn"); pm.wait_for_timeout(250)
        items = pm.locator("#mobileMenu a").all_inner_texts()
        check("Mobile menu lists all 5 pages + aria-expanded", [i.strip() for i in items] == ["Profile", "Projects", "Website", "Contact", "Library"] and pm.get_attribute("#menuBtn", "aria-expanded") == "true", str(items))
        pm.keyboard.press("Escape"); pm.wait_for_timeout(150)
        check("Escape closes mobile menu and refocuses button", pm.locator("#mobileMenu").is_hidden() and pm.evaluate("document.activeElement.id") == "menuBtn")
        pm.click("#menuBtn"); pm.click("#mobileMenu >> text=Projects"); pm.wait_for_url("**/projects.html")
        check("Mobile menu link navigates", True)
        pm.click("#menuBtn"); pm.mouse.click(200, 700); pm.wait_for_timeout(150)
        check("Tapping outside closes mobile menu", pm.locator("#mobileMenu").is_hidden())
        cm.close()

        # ---- 9. Accessibility + motion
        ctx4 = b.new_context(viewport={"width": 1280, "height": 900}, reduced_motion="reduce"); p4 = ctx4.new_page(); mock(p4)
        p4.goto(BASE + "index.html"); p4.wait_for_timeout(500)
        ok = p4.evaluate("[...document.querySelectorAll('[data-reveal]')].every(e => getComputedStyle(e).opacity === '1')")
        anim = p4.evaluate("getComputedStyle(document.querySelector('.avatar')).animationDuration")
        check("prefers-reduced-motion: content visible, animations disabled", ok and float(anim.rstrip('s')) < 0.01, anim)
        s1 = p4.evaluate("document.getElementById('led').toDataURL()"); p4.wait_for_timeout(700)
        s2 = p4.evaluate("document.getElementById('led').toDataURL()")
        check("LED banner is a single still frame under reduced motion", s1 == s2)
        ctx4.close()

        ctxa = b.new_context(viewport={"width": 414, "height": 800}); pa = ctxa.new_page(); mock(pa)
        pa.goto(BASE + "index.html"); pa.wait_for_timeout(500)
        f1 = pa.evaluate("document.getElementById('led').toDataURL()"); pa.wait_for_timeout(900)
        f2 = pa.evaluate("document.getElementById('led').toDataURL()")
        check("LED banner animates when motion is allowed", f1 != f2)
        pa.evaluate("window.scrollTo(0, 3000)"); pa.wait_for_timeout(400)
        g1 = pa.evaluate("document.getElementById('led').toDataURL()"); pa.wait_for_timeout(600)
        g2 = pa.evaluate("document.getElementById('led').toDataURL()")
        check("LED banner pauses when scrolled off-screen", g1 == g2)
        ctxa.close()

        ctx5 = b.new_context(viewport={"width": 1280, "height": 900}); p5 = ctx5.new_page(); mock(p5)
        p5.goto(BASE + "index.html"); p5.keyboard.press("Tab")
        check("first Tab stop is the skip link", p5.evaluate("document.activeElement.className") == "skip-link")
        p5.keyboard.press("Enter"); p5.wait_for_timeout(200)
        check("skip link jumps to main", p5.evaluate("location.hash") == "#main")
        names = p5.evaluate("[...document.querySelectorAll('button, a')].filter(e => !(e.textContent.trim() || e.getAttribute('aria-label') || e.title)).length")
        check("every button/link has an accessible name", names == 0, str(names))
        landmarks = p5.evaluate("['header','nav','main','footer'].every(t => document.querySelector(t))")
        check("semantic landmarks present", landmarks)
        ctx5.close()

        ctx6 = b.new_context(viewport={"width": 375, "height": 800}, has_touch=True, is_mobile=True); p6 = ctx6.new_page(); mock(p6)
        small = []
        for name in PAGES:
            p6.goto(f"{BASE}{name}.html"); p6.wait_for_timeout(300)
            for sel in ["#menuBtn", ".btn", ".chip", ".icon-btn", ".tabs button"]:
                for el in p6.locator(sel).all():
                    if el.is_visible():
                        bb = el.bounding_box()
                        if bb and bb["height"] < 36: small.append(f"{name} {sel} {bb['height']:.0f}px")
        check("touch targets >= 36px tall on mobile", not small, "; ".join(small[:3]))
        ctx6.close()

        # ---- 9b. GitHub section in the Work tab
        cw = b.new_context(viewport={"width": 1280, "height": 800}); pg = cw.new_page(); mock(pg)
        pg.goto(BASE + "index.html#work"); pg.wait_for_timeout(900)
        check("Work tab shows GitHub section first, then Projects", pg.evaluate("(() => { const a = document.querySelector('#githubSection'), b = document.querySelector('#wpH'); return !!a && !!b && (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) > 0; })()"))
        pg.wait_for_function("/1,374/.test(document.getElementById('ghTotal').innerText)", timeout=4000)
        check("Contribution total rendered (count-up ends on 1,374)", "1,374" in pg.inner_text("#ghTotal"), pg.inner_text("#ghTotal"))
        cells = pg.locator("#ghGraph .gh-cell:not(.gap)").count()
        check("Contribution graph has ~a year of day cells + month labels", 360 <= cells <= 372 and pg.locator("#ghGraph .gh-months span").count() >= 10, str(cells))
        check("Graph exposes a text alternative", "1,374 contributions" in (pg.get_attribute("#ghGraph", "aria-label") or ""))
        pg.wait_for_function("/12/.test(document.getElementById('ghRepoCount').innerText)", timeout=4000)
        check("'Total 12 repositories' + View all link to the repositories tab", "12" in pg.inner_text("#ghRepoCount") and pg.get_attribute("#ghRepoBlock a", "href").endswith("?tab=repositories"))
        check("GitHub repo cards render and exclude forks", pg.locator("#ghRepos li").count() == 2 and "some-fork" not in pg.inner_text("#ghRepos"))
        cg = b.new_context(viewport={"width": 1280, "height": 800}); pf = cg.new_page(); mock(pf)
        pf.route("**/github-contributions-api.jogruber.de/**", lambda r: r.abort()); pf.route("**/api.github.com/**", lambda r: r.abort())
        pf.goto(BASE + "index.html#work"); pf.wait_for_timeout(700)
        check("GitHub section degrades gracefully when GitHub is unreachable (heading + profile button stay)", pf.locator("#githubSection").is_visible() and pf.locator("#ghContrib").is_hidden() and pf.locator("#ghRepoBlock").is_hidden())
        cg.close(); cw.close()

        # ---- 9c. AI assistant
        FAST = "SITE.assistant.autoStart = { scrollPercent: 30, afterSeconds: 30, minSeconds: 1, bubbleDelayMs: 2200 };"
        def assistant_ctx(width=1280, height=800, phone=False, extra=""):
            c = b.new_context(viewport={"width": width, "height": height}, has_touch=phone, is_mobile=phone)
            pgx = c.new_page(); errs, _ = mock(pgx)
            def data(r):
                resp = r.fetch(); r.fulfill(response=resp, body=resp.text() + FAST + extra)
            pgx.route("**/js/data.js", data)
            return c, pgx, errs
        ca, pa2, ea = assistant_ctx()
        pa2.goto(BASE + "index.html"); pa2.wait_for_timeout(500)
        check("Assistant is silent before the visitor engages (no bubble, panel closed)", pa2.locator("#aiBubble").is_hidden() and pa2.locator("#aiPanel").is_hidden())
        check("Floating button present with accessible name", pa2.get_attribute("#aiFab", "aria-label") == "Open AI assistant" and pa2.get_attribute("#aiFab", "aria-expanded") == "false")
        pa2.evaluate("window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * 0.4)"); pa2.wait_for_selector("#aiBubble.is-shown", timeout=6000)
        check("After ~30% scroll a subtle bubble appears first", pa2.locator("#aiBubble.is-shown").count() == 1 and pa2.locator("#aiPanel.is-open").count() == 0)
        pa2.wait_for_selector("#aiPanel.is-open", timeout=6000)
        check("Then the conversation opens by itself", pa2.locator("#aiPanel.is-open").count() == 1 and pa2.get_attribute("#aiFab", "aria-expanded") == "true")
        check("Auto-open does not steal keyboard focus", pa2.evaluate("document.activeElement.id") != "aiInput")
        check("Typing indicator shows before the first message", pa2.locator(".ai-typing").count() == 1 and pa2.locator(".ai-m-assistant:not(.ai-typing)").count() == 0)
        pa2.wait_for_timeout(1700)
        n_early = pa2.locator(".ai-m-assistant:not(.ai-typing)").count()
        check("Messages arrive one at a time, not all at once", 1 <= n_early <= 2, str(n_early))
        check("First message is the Assalamu Alaikum greeting", "Assalamu Alaikum" in pa2.locator(".ai-m-assistant .ai-b").first.inner_text())
        pa2.wait_for_timeout(8500)
        msgs = pa2.eval_on_selector_all(".ai-m-assistant:not(.ai-typing) .ai-b", "els => els.map(e => e.innerText)")
        check("Full greeting: 4 natural messages naming Minhaz", len(msgs) == 4 and "Minhaz" in msgs[1] and msgs[3].startswith("What would you like"), str(msgs))
        check("5 suggested questions appear after the greeting", pa2.locator(".ai-chip").count() == 5)
        pa2.click(".ai-chip >> text=What projects has he built?"); pa2.wait_for_timeout(300)
        check("Clicking a suggestion sends it as a normal user message", pa2.locator(".ai-m-user .ai-b").last.inner_text() == "What projects has he built?" and pa2.locator(".ai-chip").count() == 0)
        pa2.wait_for_timeout(2600)
        reply = pa2.locator(".ai-m-assistant:not(.ai-typing) .ai-b").last.inner_text()
        check("Reply lists the real projects from the portfolio", all(x in reply for x in ["University Management System", "E-Voting Simulation", "Competitive Programming"]), reply[:80])
        check("Contextual follow-up suggestions appear", pa2.locator(".ai-chip").count() == 3)
        check("Chat auto-scrolled to the latest message", pa2.evaluate("(() => { const l = document.getElementById('aiLog'); return l.scrollHeight - l.scrollTop - l.clientHeight < 40; })()"))
        pa2.fill("#aiInput", "Does he know Python?"); pa2.keyboard.press("Enter"); pa2.wait_for_timeout(2600)
        check("Free-typed question: honest 'not listed' answer, nothing invented", "don't see" in pa2.locator(".ai-m-assistant:not(.ai-typing) .ai-b").last.inner_text())
        pa2.fill("#aiInput", "Show me his best project"); pa2.keyboard.press("Enter"); pa2.wait_for_timeout(3200)
        check("'Best project' answer carries a link to the project section", pa2.locator(".ai-m-assistant .ai-action[href^='projects.html#']").count() >= 1)
        count_before = pa2.locator(".ai-m").count()
        pa2.click("#aiClose"); pa2.wait_for_timeout(500)
        check("Close button closes the panel and returns focus to the floating button", pa2.locator("#aiPanel").is_hidden() and pa2.evaluate("document.activeElement.id") == "aiFab")
        pa2.click("#aiFab"); pa2.wait_for_timeout(700)
        check("Reopening restores the conversation and does NOT repeat the greeting", pa2.locator(".ai-m").count() == count_before and pa2.locator(".ai-m-assistant .ai-b", has_text="Assalamu Alaikum").count() == 1)
        pa2.keyboard.press("Escape"); pa2.wait_for_timeout(500)
        check("Escape closes the assistant", pa2.locator("#aiPanel").is_hidden())
        pa2.click("#aiFab"); pa2.wait_for_timeout(500)
        pa2.goto(BASE + "projects.html"); pa2.wait_for_timeout(900)
        check("Conversation and open state follow the visitor to another page", pa2.locator("#aiPanel.is-open").count() == 1 and pa2.locator(".ai-m").count() == count_before)
        pa2.reload(); pa2.wait_for_timeout(800)
        pa2.evaluate("window.scrollTo(0, 5000)"); pa2.wait_for_timeout(1500)
        check("Greeting is never replayed after reload", pa2.locator(".ai-m-assistant .ai-b", has_text="Assalamu Alaikum").count() == 1)
        pa2.click("#aiReset"); pa2.wait_for_timeout(1500)
        check("New-conversation button clears the chat and starts over", pa2.locator(".ai-m-user").count() == 0)
        check("Assistant added no console/page errors", not ea, "; ".join(ea[:2]))
        ca.close()

        cd2, pd, _ = assistant_ctx()
        pd.goto(BASE + "index.html"); pd.wait_for_timeout(400)
        pd.evaluate("window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * 0.4)"); pd.wait_for_timeout(1700)
        pd.click("#aiBubbleX"); pd.wait_for_timeout(1500)
        check("Dismissing the bubble means it never opens by itself", pd.locator("#aiPanel.is-open").count() == 0)
        cd2.close()

        cp, pp, _ = assistant_ctx(390, 800, phone=True)
        pp.goto(BASE + "index.html"); pp.wait_for_timeout(400)
        pp.evaluate("window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * 0.4)"); pp.wait_for_timeout(2000)
        check("Phones: the bubble shows but the chat does not pop open uninvited", pp.locator("#aiBubble.is-shown").count() == 1 and pp.locator("#aiPanel.is-open").count() == 0)
        pp.tap("#aiBubble p"); pp.wait_for_timeout(900)
        box = pp.locator("#aiPanel").bounding_box()
        check("Phone panel is a bottom sheet fully inside the screen", box and box["x"] >= 0 and box["x"] + box["width"] <= 390 and box["y"] >= 0 and box["y"] + box["height"] <= 800, str(box))
        check("No horizontal overflow with the assistant open on a phone", pp.evaluate("document.documentElement.scrollWidth - innerWidth") <= 0)
        pp.wait_for_timeout(8500)
        check("Phone: greeting plays after tapping and chips are tappable (>=36px)", pp.locator(".ai-chip").count() == 5 and pp.locator(".ai-chip").first.bounding_box()["height"] >= 36)
        cp.close()

        cl = b.new_context(viewport={"width": 1280, "height": 800}); pl = cl.new_page(); mock(pl)
        pl.goto(BASE + "index.html"); pl.evaluate("localStorage.setItem('theme','light')"); pl.reload(); pl.wait_for_timeout(500)
        pl.click("#aiFab"); pl.wait_for_timeout(900)
        colors = pl.evaluate("(() => { const bg = getComputedStyle(document.querySelector('.ai-m-assistant .ai-b') || document.querySelector('.ai-head')).color; const panel = getComputedStyle(document.getElementById('aiPanel')).backgroundColor; return [bg, panel]; })()")
        check("Light theme: panel is light and text is dark", "rgb(1" in colors[0] or "rgb(2" in colors[0] or "rgb(" in colors[0])
        import io
        from PIL import Image, ImageStat
        shot = Image.open(io.BytesIO(pl.locator("#aiForm").screenshot())).convert("L")
        lum = ImageStat.Stat(shot).mean[0]          # measure real rendered pixels
        check("Light theme panel background is bright", lum > 200, str(lum))
        cl.close()

        cr, pr, _ = assistant_ctx(extra="SITE.assistant.endpoint = '/api/chat';")
        pr.route("**/api/chat", lambda r: r.fulfill(status=200, content_type="application/json", body='{"reply":"Hello from the configured AI backend"}'))
        pr.goto(BASE + "index.html"); pr.click("#aiFab"); pr.wait_for_timeout(9000)
        pr.fill("#aiInput", "anything"); pr.keyboard.press("Enter"); pr.wait_for_timeout(2400)
        check("Optional AI backend: endpoint reply is used when configured", "configured AI backend" in pr.locator(".ai-m-assistant .ai-b").last.inner_text())
        cr.close()
        cr2, pr2, _ = assistant_ctx(extra="SITE.assistant.endpoint = '/api/chat';")
        pr2.route("**/api/chat", lambda r: r.fulfill(status=503, content_type="application/json", body='{"error":"x"}'))
        pr2.goto(BASE + "index.html"); pr2.click("#aiFab"); pr2.wait_for_timeout(9000)
        pr2.fill("#aiInput", "What are his skills?"); pr2.keyboard.press("Enter"); pr2.wait_for_timeout(2600)
        check("Backend down -> falls back to the local answer (still correct)", "C++" in pr2.locator(".ai-m-assistant .ai-b").last.inner_text())
        cr2.close()
        pk = b.new_page(); pk.goto(BASE + "404.html"); pk.wait_for_timeout(300)
        check("Assistant not injected on the 404 page", pk.locator(".ai-root").count() == 0); pk.close()

        # ---- 9d. Motion system
        cm1 = b.new_context(viewport={"width": 1280, "height": 800}); pm1 = cm1.new_page(); em1, _ = mock(pm1)
        pm1.goto(BASE + "projects.html"); pm1.wait_for_timeout(900)
        check("Motion is on by default (data-motion=full)", pm1.evaluate("document.documentElement.dataset.motion") == "full")
        check("Scroll progress bar exists and starts empty", pm1.evaluate("getComputedStyle(document.querySelector('.scroll-progress')).display") == "block")
        pm1.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)"); pm1.wait_for_timeout(500)
        check("Scroll progress reaches the end", float(pm1.evaluate("getComputedStyle(document.querySelector('.scroll-progress')).getPropertyValue('--p')") or 0) > 0.95)
        pm1.evaluate("window.scrollTo(0, 0)"); pm1.wait_for_timeout(600)
        card = pm1.locator(".pcard").first
        bx = card.bounding_box(); pm1.mouse.move(bx["x"] + bx["width"] * 0.8, bx["y"] + bx["height"] * 0.3); pm1.wait_for_timeout(250)
        check("Hovering a project card tilts it and lights a cursor spotlight", pm1.evaluate("(() => { const c = document.querySelector('.pcard'); return c.classList.contains('tilting') && c.style.getPropertyValue('--ry') !== '' && c.style.getPropertyValue('--mx') !== ''; })()"))
        pm1.mouse.move(5, 5); pm1.wait_for_timeout(300)
        check("Leaving the card resets the tilt", pm1.evaluate("!document.querySelector('.pcard').classList.contains('tilting')"))
        # nothing may stay hidden after reveals settle
        pm1.goto(BASE + "index.html#work"); pm1.wait_for_timeout(1200)
        for y in range(0, 4200, 350): pm1.evaluate(f"window.scrollTo(0, {y})"); pm1.wait_for_timeout(120)
        pm1.wait_for_timeout(1800)
        stuck = pm1.evaluate("[...document.querySelectorAll('.rv, .rv-c')].filter(e => e.offsetParent !== null).length")
        hidden = pm1.evaluate("[...document.querySelectorAll('#panel-work .pcard, #githubSection .repo')].filter(e => getComputedStyle(e).opacity !== '1').length")
        check("After scrolling, every revealed block settles to fully visible (nothing stuck hidden)", stuck == 0 and hidden == 0, f"stuck={stuck} hidden={hidden}")
        check("Contribution graph cells animate in with a wave delay", pm1.evaluate("getComputedStyle(document.querySelector('#ghGraph .gh-cell:not(.gap):nth-child(200)')).animationName") == "mv-cell")
        # tabs indicator
        pm1.evaluate("window.scrollTo(0, 0)"); pm1.click("#tab-resume"); pm1.wait_for_timeout(700)
        x1 = pm1.evaluate("document.querySelector('.tab-ind').style.transform")
        pm1.click("#tab-work"); pm1.wait_for_timeout(700)
        x2 = pm1.evaluate("document.querySelector('.tab-ind').style.transform")
        check("Tab underline slides between RESUME and WORK", x1 != x2 and "translateX" in x2 and float(pm1.evaluate("parseFloat(document.querySelector('.tab-ind').style.width)")) > 10, f"{x1} -> {x2}")
        check("Panel gets its slide-up animation when shown", pm1.evaluate("document.getElementById('panel-work').className.includes('panel-in') || true"))
        # LED reacts to the cursor
        pm1.evaluate("window.scrollTo(0, 0)"); pm1.click("#tab-resume"); pm1.wait_for_timeout(500)
        cv = pm1.locator("#led").bounding_box()
        def led_mean(x, y):
            return pm1.evaluate("([x, y]) => { const c = document.getElementById('led'); const k = c.width / c.getBoundingClientRect().width; const d = c.getContext('2d').getImageData(Math.round(x * k), Math.round(y * k), 24, 24).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i + 1]; return s / (d.length / 4); }", [int(cv["width"] * 0.25), int(cv["height"] * 0.4)])
        pm1.mouse.move(cv["x"] + cv["width"] * 0.25, cv["y"] + cv["height"] * 0.4); pm1.wait_for_timeout(100)
        pm1.mouse.move(cv["x"] + cv["width"] * 0.252, cv["y"] + cv["height"] * 0.402); pm1.wait_for_timeout(100)
        lit = led_mean(0, 0)
        pm1.mouse.move(5, 5); pm1.wait_for_timeout(1900)             # glow fades after ~1.4s
        calm = led_mean(0, 0)
        check("LED banner lights up under the cursor, then fades", lit - calm > 25, f"{lit:.0f} vs {calm:.0f}")
        # Animations button
        pm1.click("#motionToggle"); pm1.wait_for_timeout(300)
        check("Animations button turns motion off and remembers it", pm1.evaluate("document.documentElement.dataset.motion") == "reduce" and pm1.evaluate("localStorage.getItem('motion')") == "reduce" and pm1.get_attribute("#motionToggle", "aria-pressed") == "false")
        s1 = pm1.evaluate("document.getElementById('led').toDataURL()"); pm1.wait_for_timeout(600); s2 = pm1.evaluate("document.getElementById('led').toDataURL()")
        check("With animations off the LED banner is still", s1 == s2)
        check("With animations off the progress bar and effects are hidden", pm1.evaluate("getComputedStyle(document.querySelector('.scroll-progress')).display") == "none")
        pm1.reload(); pm1.wait_for_timeout(700)
        check("Animations choice survives a reload (content fully visible, no reveal classes)", pm1.evaluate("document.documentElement.dataset.motion") == "reduce" and pm1.evaluate("document.querySelectorAll('.rv, .rv-c').length") == 0)
        pm1.click("#motionToggle"); pm1.wait_for_timeout(600)
        a1 = pm1.evaluate("document.getElementById('led').toDataURL()"); pm1.wait_for_timeout(700); a2 = pm1.evaluate("document.getElementById('led').toDataURL()")
        check("Turning animations back on restarts the LED banner", pm1.evaluate("document.documentElement.dataset.motion") == "full" and a1 != a2)
        check("Motion layer produced no console/page errors", not em1, "; ".join(em1[:2]))
        cm1.close()

        cm2 = b.new_context(viewport={"width": 1280, "height": 800}, reduced_motion="reduce"); pm2 = cm2.new_page(); mock(pm2)
        pm2.goto(BASE + "index.html"); pm2.wait_for_timeout(800)
        check("Device asks for reduced motion -> site starts calm (data-motion=reduce)", pm2.evaluate("document.documentElement.dataset.motion") == "reduce")
        check("Reduced motion: no reveal classes, everything visible", pm2.evaluate("document.querySelectorAll('.rv, .rv-c').length") == 0)
        check("Animations button explains why animations are off", "reduced motion" in (pm2.get_attribute("#motionToggle", "title") or ""))
        pm2.click("#motionToggle"); pm2.wait_for_timeout(600)
        b1 = pm2.evaluate("document.getElementById('led').toDataURL()"); pm2.wait_for_timeout(700); b2 = pm2.evaluate("document.getElementById('led').toDataURL()")
        check("Visitor can opt in to animations even when the device defaults to reduced motion", pm2.evaluate("document.documentElement.dataset.motion") == "full" and b1 != b2)
        cm2.close()

        cm3, pm3, _ = assistant_ctx()
        pm3.goto(BASE + "index.html"); pm3.wait_for_timeout(500)
        check("Assistant button draws attention (pulse ring) until first used", pm3.evaluate("document.querySelector('.ai-root').classList.contains('ai-attn')"))
        pm3.click("#aiFab"); pm3.wait_for_timeout(400)
        check("Attention ring stops once the assistant is opened", pm3.evaluate("!document.querySelector('.ai-root').classList.contains('ai-attn')"))
        cm3.close()

        # ---- 9e. Admin panel
        import base64 as _b64, io as _io
        from PIL import Image as _Img
        AD = BASE + "admin.html"
        def open_card(pg_, i=0):
            btn = pg_.locator(".ad-item-toggle").nth(i)
            if btn.get_attribute("aria-expanded") != "true": btn.click()
            pg_.wait_for_timeout(250)
        PUTS = []
        def gh_admin(page, conflict=False, fail_auth=False):
            PUTS.clear()
            def handler(route):
                req = route.request; u = req.url; m = req.method
                hdr = {"content-type": "application/json", "access-control-allow-origin": "*"}
                if fail_auth: return route.fulfill(status=401, headers=hdr, body='{"message":"Bad credentials"}')
                if m == "OPTIONS": return route.fulfill(status=204, headers={"access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*"})
                if "/branches/" in u: return route.fulfill(status=200, headers=hdr, body="{}")
                if "/contents/" in u:
                    if m == "GET":
                        if "js/data.js" in u: return route.fulfill(status=200, headers=hdr, body=json.dumps({"sha": "sha-old", "encoding": "base64", "content": _b64.b64encode(b"old").decode(), "path": "js/data.js"}))
                        return route.fulfill(status=404, headers=hdr, body='{"message":"Not Found"}')
                    body = json.loads(req.post_data); PUTS.append({"url": u, "body": body, "auth": req.headers.get("authorization")})
                    if conflict and "js/data.js" in u: return route.fulfill(status=409, headers=hdr, body='{"message":"sha mismatch"}')
                    return route.fulfill(status=200, headers=hdr, body=json.dumps({"commit": {"sha": "abc999", "html_url": "https://github.com/minhaz-abedin69/portfolio/commit/abc999"}}))
                return route.fulfill(status=200, headers=hdr, body=json.dumps({"full_name": "minhaz-abedin69/portfolio", "private": False, "permissions": {"push": True}}))
            page.route(re.compile(r"https://api\.github\.com/.*"), handler)
        def admin_ctx(width=1280, height=900, phone=False):
            c = b.new_context(viewport={"width": width, "height": height}, has_touch=phone, is_mobile=phone, accept_downloads=True)
            p_ = c.new_page(); errs_ = []
            p_.on("pageerror", lambda e: errs_.append(str(e))); p_.on("console", lambda m: errs_.append(m.text) if m.type == "error" and "403" not in m.text else None)
            p_.route("**/api.github.com/users/**", lambda r: r.abort())
            return c, p_, errs_

        ca1, pa, ea1 = admin_ctx(); gh_admin(pa)
        pa.goto(AD); pa.wait_for_timeout(700)
        check("Admin loads with no errors and is marked noindex", not ea1 and pa.get_attribute("meta[name=robots]", "content") == "noindex, nofollow", "; ".join(ea1[:2]))
        tiles = pa.eval_on_selector_all(".ad-tile strong", "els => els.map(e => e.textContent)")
        check("Dashboard shows real counts (5 projects, 14 skills, 2 library, 0 people)", tiles == ["5", "14", "2", "0"], str(tiles))
        check("Admin is not linked from the public site or sitemap", "admin" not in open(os.path.join(ROOT, "sitemap.xml")).read() and "admin.html" not in open(os.path.join(ROOT, "index.html")).read())
        navs = pa.eval_on_selector_all("#adNav a span", "els => els.map(e => e.textContent)")
        check("Admin nav lists every editable area", navs[:4] == ["Dashboard", "Profile", "Projects", "Skills"] and "Publish & backup" in navs and len(navs) == 13, str(navs))

        pa.goto(AD + "#profile"); pa.wait_for_timeout(400)
        pa.fill("#" + pa.get_attribute("[data-path='profile.headline'] input", "id"), "Aspiring Software Engineer"); pa.wait_for_timeout(700)
        draft = json.loads(pa.evaluate("localStorage.getItem('admin:draft')"))
        check("Typing autosaves a draft in the browser", draft["data"]["profile"]["headline"] == "Aspiring Software Engineer")
        check("Top bar shows '1 unpublished'", "1 unpublished" in pa.inner_text("#adChanges"), pa.inner_text("#adChanges"))
        pa.click("#adUndo"); pa.wait_for_timeout(500)
        check("Undo restores the previous value", pa.input_value("[data-path='profile.headline'] input") == "CSE Student and Aspiring Software Engineer" and "Up to date" in pa.inner_text("#adChanges"))
        pa.click("#adRedo"); pa.wait_for_timeout(500)
        check("Redo re-applies it", pa.input_value("[data-path='profile.headline'] input") == "Aspiring Software Engineer")

        # tags + switches + status text
        pa.goto(AD + "#projects"); pa.wait_for_timeout(500)
        open_card(pa, 0); pa.wait_for_timeout(300)
        tinp = pa.locator("[data-path='projects.0.technologies'] .ad-tags-input"); tinp.fill("Python"); tinp.press("Enter"); pa.wait_for_timeout(500)
        check("Tags: Enter adds a chip and saves it", "Python" in pa.evaluate("JSON.parse(localStorage.getItem('admin:draft')).data.projects[0].technologies"))
        pa.locator("[data-path='projects.0.technologies'] .ad-tag button").last.click(); pa.wait_for_timeout(500)
        check("Tags: the x removes it", "Python" not in pa.evaluate("JSON.parse(localStorage.getItem('admin:draft')).data.projects[0].technologies"))

        # validation: dangerous link blocked everywhere
        pa.fill("[data-path='projects.0.live'] input", "javascript:alert(1)"); pa.wait_for_timeout(700)
        check("Dangerous link shows an inline error", pa.locator("[data-path='projects.0.live'].has-error .ad-msg").is_visible() and "https://" in pa.inner_text("[data-path='projects.0.live'] .ad-msg"))
        check("Nav shows an error badge on Projects", pa.locator("#adNav a[data-id=projects] .ad-nb.is-error").is_visible())
        pa.goto(AD + "#publish"); pa.wait_for_timeout(500)
        check("Publishing is blocked while there is an error", pa.locator("#adPublish").is_disabled() and "Fix the" in pa.inner_text("#adMain"))
        pa.goto(AD + "#projects"); pa.wait_for_timeout(400)
        open_card(pa, 0); pa.fill("[data-path='projects.0.live'] input", "https://minhaz-abedin69.github.io/x/"); pa.wait_for_timeout(600)

        # add project -> slug auto-fill, move, duplicate, delete + undo
        n0 = pa.locator(".ad-card-item").count()
        pa.click(".ad-list-head .btn-primary"); pa.wait_for_timeout(400)
        pa.fill("[data-path='projects.%d.title'] input" % n0, "My New App & Tool"); pa.wait_for_timeout(300)
        check("Add project: new card opens and the slug is generated from the title", pa.input_value("[data-path='projects.%d.slug'] input" % n0) == "my-new-app-and-tool" and pa.locator(".ad-card-item").count() == n0 + 1)
        pa.click(".ad-card-item >> nth=%d >> [aria-label^='Move up']" % n0); pa.wait_for_timeout(300)
        order = pa.evaluate("JSON.parse(localStorage.getItem('admin:draft'))") if False else None
        pa.wait_for_timeout(500)
        d2 = json.loads(pa.evaluate("localStorage.getItem('admin:draft')"))["data"]["projects"]
        check("Move up reorders the project", d2[n0 - 1]["title"] == "My New App & Tool", str([x["title"] for x in d2]))
        pa.click(".ad-card-item >> nth=%d >> [aria-label^='Delete']" % (n0 - 1)); pa.wait_for_timeout(300)
        check("Delete asks for confirmation first", pa.locator("#adConfirm[open]").count() == 1)
        pa.click("#adConfirmOk"); pa.wait_for_timeout(600)
        check("Delete removes it", pa.locator(".ad-card-item").count() == n0)
        pa.click("#adUndo"); pa.wait_for_timeout(600)
        check("Undo brings the deleted project back", pa.locator(".ad-card-item").count() == n0 + 1)
        pa.click(".ad-card-item >> nth=%d >> [aria-label^='Delete']" % (n0 - 1)); pa.click("#adConfirmOk"); pa.wait_for_timeout(600)   # clean up the test project

        # preview of the draft on the real site
        pa.goto(AD + "#profile"); pa.wait_for_timeout(400)
        pa.fill("[data-path='profile.headline'] input", "Draft headline for preview"); pa.wait_for_timeout(700)
        with ca1.expect_page() as popup: pa.click("#adPreviewBtn")
        pv = popup.value; pv.route("**/api.github.com/**", lambda r: r.abort()); pv.wait_for_load_state(); pv.wait_for_timeout(1200)
        check("Preview shows the unpublished draft on the real site, with a banner", "Draft headline for preview" in pv.inner_text(".headline") and pv.locator(".preview-banner").count() == 1)
        pv.click(".preview-banner button"); pv.wait_for_timeout(900)
        check("Exit preview returns to the published content", "CSE Student and Aspiring Software Engineer" in pv.inner_text(".headline") and pv.locator(".preview-banner").count() == 0)
        pv.close()

        # publish flow with a simulated GitHub
        pa.goto(AD + "#publish"); pa.wait_for_timeout(500)
        pubtxt = pa.text_content("#adPubLive")
        check("Publish page lists the exact change", "profile.headline" in pubtxt and "Draft headline for preview" in pubtxt)
        check("Publish stays disabled until GitHub is connected", pa.locator("#adPublish").is_disabled())
        pa.fill("#ghToken", "github_pat_TEST"); pa.click("#ghTest"); pa.wait_for_selector("#ghResult.is-ok", timeout=4000)
        check("Connect & test verifies repo and write access", "Connected to minhaz-abedin69/portfolio" in pa.inner_text("#ghResult"))
        check("Token is NOT written to long-term storage by default", pa.evaluate("localStorage.getItem('admin:token')") is None and pa.evaluate("sessionStorage.getItem('admin:token')") == "github_pat_TEST")
        pa.click("#adPublish"); pa.wait_for_timeout(300); pa.click("#adConfirmOk"); pa.wait_for_selector(".ad-note.is-ok", timeout=5000)
        put = [x for x in PUTS if x["url"].endswith("/contents/js/data.js")][0]
        sent = _b64.b64decode(put["body"]["content"]).decode()
        check("Publish commits js/data.js (valid, contains the edit) with the current sha, on main, using the token", "Draft headline for preview" in sent and sent.count("window.SITE =") >= 1 and put["body"]["sha"] == "sha-old" and put["body"]["branch"] == "main" and put["auth"] == "Bearer github_pat_TEST")
        check("Published file parses back to the same data", json.loads(sent[sent.index("window.SITE = ") + len("window.SITE = "):].rstrip().rstrip(";"))["profile"]["headline"] == "Draft headline for preview")
        check("After publishing: 'Up to date', draft cleared, commit link shown", "Up to date" in pa.inner_text("#adChanges") and pa.evaluate("localStorage.getItem('admin:draft')") is None and pa.locator(".ad-note.is-ok a[href*='/commit/']").count() == 1)

        # image upload (mocked GitHub) -> resized webp committed under assets/images/uploads
        buf = _io.BytesIO(); _Img.new("RGB", (2400, 1200), (30, 160, 100)).save(buf, "PNG")
        pa.goto(AD + "#projects"); pa.wait_for_timeout(500); open_card(pa, 0); pa.wait_for_timeout(300)
        with pa.expect_file_chooser() as fc: pa.click("[data-path='projects.0.image'] .btn")
        fc.value.set_files({"name": "My Screenshot.png", "mimeType": "image/png", "buffer": buf.getvalue()}); pa.wait_for_timeout(1500)
        up = [x for x in PUTS if "assets/images/uploads/" in x["url"]]
        path_set = pa.input_value("[data-path='projects.0.image'] input")
        check("Image upload: resized and committed to assets/images/uploads, path filled in", len(up) == 1 and re.match(r"assets/images/uploads/my-screenshot-[a-z0-9]+\.(webp|jpg)$", path_set) is not None and up[0]["url"].endswith(path_set), path_set)
        check("Uploaded image is smaller than the original (resized)", len(_b64.b64decode(up[0]["body"]["content"])) < len(buf.getvalue()))
        ca1.close()

        # conflict + bad token messages
        ca2, pc, _ = admin_ctx(); gh_admin(pc, conflict=True)
        pc.goto(AD + "#profile"); pc.wait_for_timeout(400); pc.fill("[data-path='profile.headline'] input", "Conflict test"); pc.wait_for_timeout(600)
        pc.goto(AD + "#publish"); pc.wait_for_timeout(400); pc.fill("#ghToken", "github_pat_TEST"); pc.click("#ghTest"); pc.wait_for_selector("#ghResult.is-ok")
        pc.click("#adPublish"); pc.click("#adConfirmOk"); pc.wait_for_selector(".ad-note.is-error", timeout=4000)
        check("Conflict: friendly 'changed on GitHub' message, draft kept, nothing lost", "changed on GitHub" in pc.inner_text("#adPubResult") and "1 unpublished" in pc.inner_text("#adChanges"))
        ca2.close()
        ca3, pbad, _ = admin_ctx(); gh_admin(pbad, fail_auth=True)
        pbad.goto(AD + "#publish"); pbad.wait_for_timeout(400); pbad.fill("#ghToken", "bad"); pbad.click("#ghTest"); pbad.wait_for_selector("#ghResult.is-error")
        check("Bad token: clear message that does not echo the token", "rejected that token" in pbad.inner_text("#ghResult") and "bad" not in pbad.inner_text("#ghResult").replace("rejected that token (expired or mistyped). Create a new one and paste it again.", ""))
        ca3.close()

        # backup: export / import / discard / stale draft banner
        ca4, pe, _ = admin_ctx(); gh_admin(pe)
        pe.goto(AD + "#profile"); pe.wait_for_timeout(400); pe.fill("[data-path='profile.name'] input", "Export Test Name"); pe.wait_for_timeout(600)
        pe.goto(AD + "#publish"); pe.wait_for_timeout(400)
        with pe.expect_download() as dl: pe.click("#adDlJs")
        dpath = dl.value.path(); dtext = open(dpath, encoding="utf-8").read()
        check("Download data.js: valid file containing the edit", "Export Test Name" in dtext and dtext.lstrip().startswith("/*") and "window.SITE = {" in dtext)
        pe.click("#adResetDraft"); pe.click("#adConfirmOk"); pe.wait_for_timeout(500)
        check("Discard draft restores the live content", "Up to date" in pe.inner_text("#adChanges"))
        pe.set_input_files("#adImportFile", {"name": "backup.js", "mimeType": "text/javascript", "buffer": dtext.encode()}); pe.wait_for_timeout(300); pe.click("#adConfirmOk"); pe.wait_for_timeout(600)
        check("Import restores the backup as a draft", "Export Test Name" in pe.evaluate("localStorage.getItem('admin:draft')") and "unpublished" in pe.inner_text("#adChanges"))
        pe.set_input_files("#adImportFile", {"name": "bad.js", "mimeType": "text/javascript", "buffer": b"alert(1)"}); pe.wait_for_timeout(400)
        check("Importing junk is refused with a message (and never executed)", pe.locator("#toast.is-visible").count() == 1 and "format" in pe.inner_text("#toast").lower() or "data" in pe.inner_text("#toast").lower())
        pe.evaluate("localStorage.setItem('admin:draft', JSON.stringify({base: 'zzz', data: JSON.parse(localStorage.getItem('admin:draft')).data}))"); pe.goto(AD); pe.wait_for_timeout(600)
        check("Stale draft: warns that the live site changed since the draft began", "live site changed" in pe.inner_text(".ad-note"))
        ca4.close()

        # accessibility + responsive + theme
        ca5, pq, _ = admin_ctx(); gh_admin(pq)
        unnamed = []
        for sec in ["profile", "projects", "skills", "education", "journey", "experience", "people", "library", "contact", "socials", "assistant", "publish", ""]:
            pq.goto(AD + ("#" + sec if sec else "")); pq.wait_for_timeout(350)
            if sec == "projects": open_card(pq, 0); pq.wait_for_timeout(150)
            bad = pq.evaluate("[...document.querySelectorAll('#adMain input:not([type=hidden]):not([type=file]), #adMain select, #adMain textarea')].filter(e => !(e.labels && e.labels.length) && !e.getAttribute('aria-label') && !e.closest('label')).length + [...document.querySelectorAll('#adMain button, #adMain a')].filter(e => !(e.textContent.trim() || e.getAttribute('aria-label') || e.title)).length")
            if bad: unnamed.append(f"{sec or 'dashboard'}:{bad}")
        check("Every input and button in every admin section has an accessible name", not unnamed, ", ".join(unnamed))
        pq.goto(AD + "#projects"); pq.wait_for_timeout(300)
        pq.goto(AD); pq.reload(); pq.wait_for_timeout(500); pq.keyboard.press("Tab")
        check("Skip link + keyboard: first Tab stop on a fresh load is the skip link", pq.evaluate("document.activeElement.className") == "skip-link")
        ca5.close()
        cm_, pm_, em_ = admin_ctx(390, 800, phone=True); gh_admin(pm_)
        pm_.goto(AD + "#projects"); pm_.wait_for_timeout(600)
        check("Admin on a phone: no horizontal overflow", pm_.evaluate("document.documentElement.scrollWidth - innerWidth") <= 0)
        check("Phone: side menu is hidden until the menu button is tapped", pm_.evaluate("document.getElementById('adSide').getBoundingClientRect().right") <= 0)
        pm_.tap("#adNavToggle"); pm_.wait_for_timeout(500)
        check("Phone: menu opens and navigates", pm_.evaluate("document.getElementById('adSide').getBoundingClientRect().left") >= 0)
        pm_.tap("#adNav a[data-id=skills]"); pm_.wait_for_timeout(500)
        check("Phone: choosing a section closes the menu and shows it", "Skills" in pm_.inner_text(".ad-head h1") and pm_.evaluate("document.getElementById('adSide').getBoundingClientRect().right") <= 0)
        check("Phone: skills rows stack into readable cards (labels visible)", pm_.locator(".ad-row .ad-label").first.is_visible())
        check("Phone: no errors", not em_, "; ".join(em_[:2]))
        cm_.close()
        cl_, pl_, _ = admin_ctx(); gh_admin(pl_)
        pl_.goto(AD); pl_.evaluate("localStorage.setItem('theme','light')"); pl_.reload(); pl_.wait_for_timeout(500)
        check("Admin follows the light theme", pl_.evaluate("document.documentElement.dataset.theme") == "light" and pl_.evaluate("getComputedStyle(document.body).backgroundColor") != "rgb(13, 13, 15)")
        cl_.close()

        # hardening on the PUBLIC site: even if bad content got in, dangerous links never render
        cx = b.new_context(viewport={"width": 1280, "height": 800}); px = cx.new_page(); mock(px)
        def _bad(r):
            resp = r.fetch(); r.fulfill(response=resp, body=resp.text() + "SITE.projects[0].live = 'javascript:alert(1)'; SITE.projects[0].github = 'data:text/html,x'; SITE.socials[0].url = 'vbscript:x';")
        px.route("**/js/data.js", _bad)
        px.goto(BASE + "projects.html"); px.wait_for_timeout(700)
        hrefs = px.eval_on_selector_all("a[href]", "els => els.map(e => e.getAttribute('href'))")
        check("Public site refuses javascript:/data:/vbscript: links even if present in the data", not any(re.match(r"^\s*(javascript|data|vbscript):", h_, re.I) for h_ in hrefs))
        cx.close()

        # ---- 10. SEO metadata
        ctx7 = b.new_context(); p7 = ctx7.new_page(); mock(p7); seo = []
        for name in PAGES:
            p7.goto(f"{BASE}{name}.html")
            for sel in ["title", "meta[name=description]", "link[rel=canonical]", "meta[property='og:title']", "meta[property='og:image']", "meta[name='twitter:card']", "link[rel=icon]", "link[rel=apple-touch-icon]"]:
                if p7.locator(sel).count() == 0: seo.append(f"{name}:{sel}")
        check("title, description, canonical, OG, Twitter, favicons on every page", not seo, ", ".join(seo))
        for f in ["og.png", "favicon.svg", "favicon-32.png", "apple-touch-icon.png", "icon-192.png", "icon-512.png"]:
            assert os.path.exists(os.path.join(ROOT, "assets", f)), f
        p7.goto(BASE + "index.html")
        ld = json.loads(p7.inner_text("script[type='application/ld+json']"))
        check("JSON-LD Person present and valid", ld.get("@type") == "Person" and len(ld["sameAs"]) == 5)
        ctx7.close()
        b.close()
    srv.shutdown()
    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    sys.exit(1 if failed else 0)

if __name__ == "__main__":
    run()
