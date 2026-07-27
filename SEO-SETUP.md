# Bubbly Pup — Search setup & remaining tasks

A step-by-step checklist. Work top to bottom; each task is independent, so a
blocked step doesn't stop the next one.

Everything in "Already done" is live and verified — you don't need to redo it.

---

## Already done (no action needed)

- `robots.txt` — live at https://bubblypup.lk/robots.txt
- `sitemap.xml` — live at https://bubblypup.lk/sitemap.xml
- Page title: "Bubbly Pup Pet Grooming | Dog Grooming Salon in Kadawatha"
- Description + keywords targeting **Kadawatha** (not just "Sri Lanka")
- `canonical` tag → tells Google `bubblypup.lk` is the real site, so the
  `bubbly-pup-app.vercel.app` copy stops competing with it
- `og:image` → WhatsApp/Facebook link previews now show the logo
- `/admin` marked `noindex` → the booking system will never appear in search
- LocalBusiness structured data (address, phone, opening hours, map link)

---

## TASK 1 — Add the `www` DNS record

**Why:** `www.bubblypup.lk` currently does not exist. Anyone typing `www.`
gets a dead page. Vercel is already configured and waiting for this record.

**Where:** the control panel of whoever you registered `bubblypup.lk` with
(LK Domain Registry / nic.lk, or the reseller you bought it from).
Look for **DNS Management**, **DNS Records**, or **Zone Editor**.

You'll know you're in the right place because you'll see an existing record
pointing to `216.198.79.1`. **Do not change or delete that one.**

**Add a new record:**

    Type:  CNAME
    Name:  www
    Value: cname.vercel-dns.com
    TTL:   leave default (or 3600)

If the panel refuses CNAME records, use this instead:

    Type:  A
    Name:  www
    Value: 76.76.21.21

**Common mistake:** in the Name field type only `www`, NOT
`www.bubblypup.lk`. Most panels add the domain automatically, and typing the
full name creates a broken `www.bubblypup.lk.bubblypup.lk`.
(If the existing records in your panel DO show full names, then match that style.)

Save. Vercel verifies automatically and issues the HTTPS certificate itself —
you don't need to click anything on Vercel. Usually 5–30 minutes, occasionally
a few hours on `.lk` domains.

---

## TASK 2 — Google Search Console

Without this you're blind: no idea what people search, whether Google has
indexed you, or if something is broken.

Go to **https://search.google.com/search-console** and sign in with the Google
account that owns the business.

Then pick ONE of the two options below.

### Option A — HTML tag (easiest; I finish it for you)

1. Click **Add property**
2. Choose the **URL prefix** box (the right-hand one)
3. Enter exactly: `https://bubblypup.lk`
4. Click **Continue**
5. Expand **HTML tag** under "Other verification methods"
6. You'll see a line like:

       <meta name="google-site-verification" content="AbC123xyz_example" />

7. **Copy the `content` value** (the `AbC123xyz_example` part) and send it to me
8. I'll add it to the site and deploy — takes about a minute
9. Come back to Search Console and click **Verify**

### Option B — DNS TXT record (do it yourself, covers www too)

1. Click **Add property**
2. Choose the **Domain** box (the left-hand one)
3. Enter exactly: `bubblypup.lk`
4. Google shows a TXT record value like
   `google-site-verification=AbC123xyz_example`
5. In the SAME registrar panel as Task 1, add:

       Type:  TXT
       Name:  @        (or leave blank, or "bubblypup.lk" — match your panel's style)
       Value: google-site-verification=AbC123xyz_example

6. Wait 15–30 minutes, then click **Verify** in Search Console

**If verification fails:** it's almost always (a) clicked Verify too soon —
wait longer and retry, or (b) the Name field has the full domain typed into it
when the panel already appends it.

### After verifying (either option)

1. Left menu → **Sitemaps**
2. Enter `sitemap.xml` in the box → **Submit**
3. Left menu → **URL Inspection** → paste `https://bubblypup.lk` →
   **Request Indexing**. This jumps the queue instead of waiting for Google
   to find you on its own.

---

## TASK 3 — Google Business Profile (biggest impact)

**This matters more than everything else in this file.** For "dog grooming
near me" searches, the map listing outranks the website itself.

You already have a listing showing **5.0 stars from 30 reviews** — that is a
genuinely strong asset and it currently isn't working as hard as it could.

1. Go to **https://business.google.com**
2. Search for "Bubbly Pup Pet Grooming Salon" and claim it if not already yours
3. Verify (Google sends a postcard, phone call, or video call)
4. Then fill in **everything**:
   - Website: `https://bubblypup.lk`
   - Phone: `+94 76 668 4586`
   - Address: 327, 43 Sethsiri Gardens Road, Kadawatha 11850
   - Opening hours (must match the site: currently 09:00–18:00, all 7 days —
     these come from Settings in the admin portal)
   - Category: "Pet Groomer"
   - Services: your packages (spa bath, full grooming, haircut, nail care…)
   - **Photos** — before/after shots matter enormously here. Add regularly.
5. Keep asking happy customers for reviews. The admin portal's thank-you
   WhatsApp message already includes your review link.

**Keep the name, address and phone identical** everywhere — website, Google,
Facebook, directories. Google cross-checks these, and mismatches hurt.

---

## TASK 4 — Rotate the database password (security)

The Neon database password was shared in a chat session, so treat it as
compromised.

1. Go to **https://console.neon.tech** → your project
2. **Roles** → `neondb_owner` → **Reset password**
3. Copy the new connection string
4. Update it on Vercel:

       npx vercel env rm DATABASE_URL production --scope janithas-projects-dbf5b4aa
       npx vercel env add DATABASE_URL production --scope janithas-projects-dbf5b4aa
       # paste the new connection string when prompted

5. Redeploy so the change takes effect:

       npx vercel --prod --yes --scope janithas-projects-dbf5b4aa

---

## TASK 5 — Put the code in version control

Right now this project is **not a git repository**. There is no history, no
backup, and no way to undo a bad edit. The only copy is the folder on your
machine. Before handing anything to a client this is worth fixing.

    git init
    git add .
    git commit -m "Bubbly Pup pet grooming site"

`.gitignore` already excludes `.env`, so your secrets stay out of the repo —
but check that before pushing anywhere public.

Then create a **private** repo on GitHub and push to it.

---

## Realistic expectations

`bubblypup.lk` is a brand-new domain. Nobody reaches the top of search in days.

- **Indexed by Google:** a few days to ~2 weeks after Search Console submission
- **Ranking for "dog grooming Kadawatha":** weeks to a few months
- **Fastest real wins:** the Google Business Profile and continued reviews —
  not the website

Anyone who promises faster than this is selling something.

---

## Admin portal

    https://bubblypup.lk/admin
    Email: admin@bubblypup.lk

The password is not written in this file on purpose — it's in your chat
history. Change it any time from **My Account** inside the portal.

If you ever lose access completely, the escape hatch (needs the database
connection string) is:

    npm run admin:password -- admin@bubblypup.lk "a-new-password"
