# Translations — guide for translators

AdorWorks is available in **English**, **Arabic** (العربية) and **Swahili** (Kiswahili).
All the words are kept in two spreadsheets:

| File | What it covers |
|---|---|
| `website.csv` | The public website (adorworks.pages.dev) |
| `app.csv` | The AdorWorks app (sign-in, dashboard, jobs, applications…) |

Open them in **Excel** or **Google Sheets** (File → Import). They are saved as UTF-8,
so Arabic displays correctly.

## The columns

| Column | What to do |
|---|---|
| `english` | The original text. **Don't change it** — it is how the site finds the sentence. |
| `arabic`, `swahili` | Your translation. |
| `arabic_status`, `swahili_status` | `draft` = written by a machine, **please check it**. Change it to `reviewed` once you're happy. Write `hold` to hide a translation (the English shows instead) until it's fixed. |
| `where` | Which page(s) the text is on, to help with context. |
| `notes` | Instructions for special rows. |

## Rules

1. **Keep the little markers** like `<a>…</a>`, `<strong>…</strong>`, `<span>…</span>` and `<br>`,
   in the same order. They are links and bold text. Translate the words *inside* them.
   You may move them to where they fit in your sentence.
   - English: `New here? <a>Create your account</a>.`
   - Arabic: `جديد هنا؟ <a>أنشئ حسابك</a>.`
2. **Keep `{n}`** — it is replaced by a number (for example `{n} open opportunities` → “3 open opportunities”).
3. **Don't translate** the names AdorWorks, Adormedia, AdorVerified and AdorCertified, or email and web addresses.
4. Leave a cell **empty** to keep showing English for that sentence.
5. Arabic: Modern Standard Arabic. Arrows pointing “forward” are written `←` in Arabic (reading right-to-left).
6. The legal pages (Terms, Privacy, Refunds, Community Standards) are shown in English only, with a note.
   Translating them needs a legal review first — ask before starting.

## Sending your changes back

Save the file (keep the `.csv` format and the same name) and send it to the AdorWorks team,
or commit it if you have access. The website picks up changes to `website.csv` automatically
on its next update. For `app.csv`, a developer runs `node tools/i18n/build-dictionaries.mjs`
and publishes the app.

## For developers

- New or changed website text: run `node tools/i18n/extract-website-strings.mjs` — it adds new
  English rows and keeps every existing translation.
- Website text a visitor must never see translated (names, employer-written content) gets
  `class="no-i18n"` or `data-no-i18n`.
- The app uses `t("English text")` / `<T>English text</T>` — see `platform/src/i18n/`.
