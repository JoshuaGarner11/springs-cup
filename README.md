# Springs Cup · springscup.com

Cross-church dodgeball tournament signup site for middle and high school students.
Single-file site, GitHub Pages deploy, Google Sheet backend, CCB payment handoff.

```
springs-cup/
├── index.html      ← the entire website (1 file)
├── backend.gs      ← Google Apps Script code for the backend
├── CNAME           ← tells GitHub Pages to use springscup.com
└── README.md       ← you are here
```

---

## Phase 1 · Get the site live (10 min)

Deploy to GitHub Pages with browser-only storage. Fully playable, but data only
persists in the visitor's browser until Phase 2.

1. **Create the repo.** Go to <https://github.com/new>:
   - Name: `springs-cup`
   - Public
   - Don't add a README (we already have one)
   - Create repository

2. **Upload these files.** From this folder:
   - `index.html`
   - `backend.gs`
   - `CNAME`
   - `README.md`

   Drop them into the repo via `Upload files` on the GitHub web UI, or:

   ```bash
   cd ~/Desktop/springs-cup
   git init -b main
   git remote add origin git@github.com:joshuagarner11/springs-cup.git
   git add .
   git commit -m "Initial Springs Cup site"
   git push -u origin main
   ```

3. **Turn on Pages.** Repo → Settings → Pages:
   - Source: `Deploy from a branch`
   - Branch: `main` / root (`/`)
   - Save

4. **Wait ~1 minute,** then visit `https://joshuagarner11.github.io/springs-cup/`.
   You should see the site. The custom domain comes online in Phase 4.

---

## Phase 2 · Wire up the real backend (20 min)

Connect a Google Sheet so registrations from any device show up for everyone.

1. **Create a Google Sheet** named `Springs Cup Registrations`.
2. In that Sheet: **Extensions → Apps Script**.
3. Delete the default code. Paste the entire contents of `backend.gs`.
4. At the top of the script, edit these:
   - `PAID_SECRET` — invent a random string like `springs-cup-2026-Kx9q`. Save it; you'll paste it into CCB later.
   - `SITE_URL` — leave as `https://springscup.com/` (or set to your `*.github.io` URL if the custom domain isn't live yet).
   - `SHEET_NAME` — only change if you want a different tab name.
5. Click **Save**, then **Run → setupSheet → Authorize**. This creates the header row.
6. Click **Deploy → New deployment**:
   - Gear icon → **Web app**
   - Description: `Springs Cup backend`
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Click **Deploy**, then copy the **Web app URL**.
7. In `index.html`, find:
   ```js
   BACKEND_URL: '',
   ```
   Paste your Web app URL between the quotes.
8. Commit and push. Wait ~1 min for Pages to rebuild.

**Verify:** Open your site, register a test squad, then check the Sheet — the row should appear.
Open the site in a different browser; the squad should show on the **Squads** page.

---

## Phase 3 · Wire up CCB payment (30–60 min, depends on CCB perms)

This is the only part you can't do from code — someone with CCB admin at Springs
clicks through the setup.

1. **In CCB:** create an Event titled `Springs Cup`.
2. Attach a **Registration Form** to the event with:
   - Fee: **$25** (per registration, not per person)
   - Hidden / pre-filled fields: `teamId`, `teamName`, `email`, `captain`
     (so the URL pre-fill from the website works)
   - Payment: your usual gateway
3. Under the form's **success / redirect URL** setting, paste:

    ```
    https://script.google.com/macros/s/YOUR_APPS_SCRIPT_ID/exec?action=paid&secret=YOUR_PAID_SECRET&teamId={{teamId}}
    ```

    Replace:
    - `YOUR_APPS_SCRIPT_ID` — from the Apps Script Web app URL (Phase 2 step 6)
    - `YOUR_PAID_SECRET` — the random string from Phase 2 step 4
    - `{{teamId}}` — CCB's templating syntax for the hidden `teamId` field. Exact syntax depends on your CCB version (`{{teamId}}`, `%%teamId%%`, etc — check CCB docs for "form field token in redirect URL").

4. Copy the public **CCB form URL**. In `index.html`, find:
   ```js
   CCB_FORM_URL: '',
   ```
   Paste the URL between the quotes. Commit and push.

**Flow end-to-end after Phase 3:**

1. Student fills out the squad roster on springscup.com
2. Site saves squad as `PENDING` via Apps Script. Squad shows on **Squads** as PENDING.
3. Site opens the CCB form in a new tab with `?teamId=...&teamName=...&email=...` pre-filled.
4. Student pays $25 via CCB.
5. CCB redirects to Apps Script `?action=paid&secret=...&teamId=...`.
6. Apps Script flips the squad's status to `LOCKED_IN`, then redirects to springscup.com with `?paid=...`.
7. Site shows the "SQUAD LOCKED IN" success page.

**Fallback if CCB can't template the redirect URL:** skip step 3 above. Just open
the Google Sheet manually after each CCB payment and change the `status` cell
from `PENDING` to `LOCKED_IN`. Or run `debug_manualMarkPaid()` in Apps Script.
30 seconds per squad — totally fine for a single tournament.

---

## Phase 4 · Point springscup.com at the site (10 min)

You bought the domain through Namecheap. Here's how to wire DNS to GitHub Pages.

### A · Set Namecheap DNS records

1. Log into <https://ap.www.namecheap.com> → **Domain List** → click **Manage** next to `springscup.com`.
2. Tab: **Advanced DNS**.
3. **Delete any existing records** that point the apex (`@`) or `www` somewhere
   (Namecheap default parking page, URL redirects, etc).
4. **Add these 5 records:**

   | Type      | Host  | Value                  | TTL       |
   | --------- | ----- | ---------------------- | --------- |
   | A Record  | `@`   | `185.199.108.153`      | Automatic |
   | A Record  | `@`   | `185.199.109.153`      | Automatic |
   | A Record  | `@`   | `185.199.110.153`      | Automatic |
   | A Record  | `@`   | `185.199.111.153`      | Automatic |
   | CNAME     | `www` | `joshuagarner11.github.io.` | Automatic |

   > Those four IPs are GitHub's official Pages anycast addresses. Don't substitute.
   > The CNAME value must end with the trailing dot if Namecheap shows one.

5. Save. DNS usually propagates in 5–30 minutes.

### B · Tell GitHub about the domain

1. Repo → **Settings → Pages**.
2. Under **Custom domain**, enter `springscup.com` → **Save**.
   (The `CNAME` file in the repo also does this automatically — but it doesn't hurt to set it explicitly.)
3. Wait until GitHub shows a green ✓ next to the domain. This can take a few minutes
   while it confirms DNS.
4. Tick **Enforce HTTPS** once it's available (can take up to 24 hours for Let's Encrypt
   to issue the certificate after DNS is fully propagated).

### C · Verify

- `dig +short springscup.com` from your terminal should return the four `185.199.*` IPs.
- `https://springscup.com/` should load the site.
- `https://www.springscup.com/` should redirect to the apex.

If something doesn't work, the most common cause is leftover Namecheap "URL redirect"
records that need to be deleted before the A records will resolve.

---

## Customizing

All copy and config lives in `index.html`. Quick spots:

- **Contact email:** search `CONTACT_EMAIL` near the top of the script.
- **Max squads / fee / roster size:** the `CONFIG` object near the top of `<script>`.
- **Tournament dates:** there isn't a dedicated date field yet — add it in the Hero
  section or Playbook page. Search for `THE CUP AWAITS` to find the hero.
- **Church list:** auto-populates as squads register (the `<datalist>` on the form).
  No pre-seeding needed.

---

## Ops notes

- **Before each tournament:** clear old squads. Open the Sheet → delete data rows,
  or in Apps Script: Run → `debug_deleteAllTeams`.
- **Day of the tournament:** the Sheet is your roster. Sort by status, print, hand to the check-in volunteer.
- **After:** archive (File → Make a copy → rename with year). Clear rows for the next run.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| **"Could not load squads"** toast | `CONFIG.BACKEND_URL` wrong. Open it directly in a browser — should return `{"teams":[]}`. |
| **Squads register but don't show in other browsers** | `CONFIG.BACKEND_URL` is empty — site falls back to localStorage. |
| **CCB redirect doesn't mark paid** | `PAID_SECRET` mismatch between `backend.gs` and the CCB redirect URL. Check both. |
| **springscup.com loads to "404 Not Found"** | DNS hasn't propagated yet, or GitHub Pages hasn't picked up the CNAME yet. Wait, then re-save the custom domain in repo settings. |
| **springscup.com loads but no HTTPS** | Cert issuing in progress (up to 24h after DNS resolves). After it's available, tick "Enforce HTTPS". |
| **Tailwind warning in console about CDN** | Expected — we use the Tailwind CDN to keep this a single-file site. Fine for this scale. |

---

Built with the Stitch UI design system. Hosted by Springs Church. No mercy promised.
