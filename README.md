# IndeedHarvest 🌾

IndeedHarvest is a Chrome Extension (Manifest V3) designed to extract job listing data directly from the DOM of Indeed search result pages and export it to CSV, XLSX, or JSON. It has a real, useful Free tier and a one-time-payment Pro unlock.

> **Disclaimer:** IndeedHarvest is an independent, unofficial tool. It is not created, endorsed, or supported by Indeed, Inc. "Indeed" is a trademark of its respective owner, referenced here only to describe compatibility.

---

## 🚀 Key Features

### 🆓 Free Tier
- **Automatic Detection:** Scrapes job cards currently visible on the Indeed search result page.
- **Data Extracted:** Job title, Company name, Location, Salary (if listed), Posted date, and Direct Indeed job link.
- **Export Limit:** Up to 25 jobs per session.
- **Export Format:** CSV only.
- **Auto-Deduplication:** Automatically deduplicates listing entries on export.
- **Column Customization:** Exclude/include optional basic fields.

### ⚡ Pro Tier (One-time Unlock)
- **Unlimited Exports:** No job cap on exports.
- **Auto-Scroll & Multi-Page Pagination:** Automatically scroll and click to next pages to scrape hundreds of jobs in one session.
- **Full Field Set:** Scrapes full text job descriptions, company size details, workplace badges (Remote/Hybrid/On-site), and direct apply links.
- **Advanced Formats:** Export to CSV, XLSX (Excel via SheetJS), or JSON.
- **Keyword Filters:** Refine lists by specifying required keywords (include) or forbidden keywords (exclude).
- **Session Cache History:** Caches the last 5 scrape sessions locally in the browser to enable easy re-exports.

---

## 🛠️ Installation

IndeedHarvest is currently distributed as source-available unpackaged code:

1. **Download/Clone** this repository to your local computer.
2. Open Google Chrome (or any Chromium browser).
3. Navigate to `chrome://extensions/`.
4. Enable **Developer mode** (toggle in the top-right corner).
5. Click **Load unpacked** (top-left button).
6. Select the `IndeedHarvest` project folder containing `manifest.json`.

---

## 🧪 Developer Testing & Verification

For testing the Pro functionality locally without needing a live Gumroad environment, you can use the following local license bypass keys in the **Pro Key** tab:

- `DEV-UNLOCK-HARVEST`
- `TEST-PRO-KEY`

Pasting either of these keys and clicking **Activate License** will immediately activate the Pro tier permanently on your browser install.

---

## 🔒 Privacy & Terms
- **Zero Data Collection:** IndeedHarvest operates fully client-side. We do not collect, transmit, or store your personal data or scraped job details on any remote server.
- **Gumroad License Verification:** The only network request made is a single, user-initiated API call to Gumroad to verify your license key.
- Read full details in [PRIVACY.md](PRIVACY.md) and [TERMS.md](TERMS.md).

---

## ⚖️ License
IndeedHarvest source code is published under a source-available license. You may inspect, download, and modify the code for **personal, non-commercial use only**. Rebranding, reselling, repackaging, or redistributing the extension commercially on the Chrome Web Store or other distribution platforms is strictly prohibited.
See [LICENSE](LICENSE) for details.

---
Created by [NovaStrikes](https://github.com/NvxStrikes).
For commercial licensing requests, contact: contact@novastrikes.com
