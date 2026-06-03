# Ambridge University MCP — Setup Guide

## What you're deploying

```
ChatGPT ──OAuth──► MCP Server (Railway)
                        │
                        ▼
                  Google Sheets ◄──── Dashboard (your website)
```

---

## Step 1 — Google Sheets setup (15 mins)

### 1a. Create the Sheet

1. Go to https://sheets.google.com and create a new sheet
2. Name it: **Ambridge University — Hardship Cases**
3. Rename the first tab (bottom) to: **Cases**
4. In row 1, add these headers exactly (one per column, A through Q):

```
Reference | Submitted | Student ID | Name | Email | Course | Year | Type | Circumstances | Monthly Income | Monthly Outgoings | Shortfall | Amount Requested | Supporting Details | Has Evidence | Status | Tutor
```

5. Note your Sheet ID from the URL:
   `https://docs.google.com/spreadsheets/d/THIS_IS_YOUR_SHEET_ID/edit`

### 1b. Create a Service Account (for the MCP server to write)

1. Go to https://console.cloud.google.com
2. Create a new project (e.g. "Ambridge MCP")
3. Search for **Google Sheets API** → Enable it
4. Go to **APIs & Services → Credentials**
5. Click **Create Credentials → Service Account**
6. Name it anything (e.g. "ambridge-writer"), click Done
7. Click the service account → **Keys tab → Add Key → JSON**
8. Download the JSON file — keep this safe, it's your secret key

### 1c. Share the Sheet with the service account

1. Open the JSON file, find `"client_email"` — it looks like:
   `ambridge-writer@your-project.iam.gserviceaccount.com`
2. Go back to your Google Sheet → Share → paste that email → Editor → Done

### 1d. Create an API Key (for the dashboard to read)

1. In Google Cloud Console → Credentials → Create Credentials → API Key
2. Click **Restrict Key** → API restrictions → Google Sheets API
3. Copy this key — you'll need it for the dashboard HTML

---

## Step 2 — Deploy to Railway (10 mins)

### 2a. Push to GitHub

```bash
cd ambridge-mcp
git init
git add .
git commit -m "Initial Ambridge MCP"
# Create a new repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/ambridge-mcp.git
git push -u origin main
```

### 2b. Deploy on Railway

1. Go to https://railway.app and sign up/in with GitHub
2. Click **New Project → Deploy from GitHub repo**
3. Select your `ambridge-mcp` repo
4. Railway will detect Node.js and deploy automatically

### 2c. Set environment variables on Railway

In your Railway project → **Variables** tab, add:

| Variable | Value |
|---|---|
| `BASE_URL` | `https://your-app-name.up.railway.app` (Railway gives you this) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Paste the entire contents of your service account JSON file |
| `GOOGLE_SHEET_ID` | Your sheet ID from Step 1a |
| `PORT` | `3000` |

After saving variables, Railway will redeploy. Wait ~1 minute.

### 2d. Test your deployment

Visit: `https://your-app.up.railway.app/`
You should see: `{"service":"Ambridge University MCP","status":"ok"}`

Visit: `https://your-app.up.railway.app/.well-known/ai-plugin.json`
You should see the plugin manifest JSON.

---

## Step 3 — Connect to ChatGPT (5 mins)

1. Go to https://chatgpt.com
2. Click your profile → **My GPTs → Create a GPT** (or use a custom GPT you already have)
3. Go to the **Configure** tab → scroll to **Actions**
4. Click **Add Action**
5. In the schema URL field, enter:
   `https://your-app.up.railway.app/.well-known/openapi.yaml`
6. ChatGPT will load the schema automatically
7. Under **Authentication**, select **OAuth**:
   - Client ID: `ambridge` (any string — we don't validate it)
   - Client Secret: `secret` (any string)
   - Authorization URL: `https://your-app.up.railway.app/oauth/authorize`
   - Token URL: `https://your-app.up.railway.app/oauth/token`
   - Scope: `student`
8. Save the GPT

Alternatively, if using ChatGPT's connector/plugin store flow, the `ai-plugin.json` manifest handles all of this automatically.

---

## Step 4 — Add the dashboard to your website (5 mins)

1. Open `public/dashboard.html`
2. Find these two lines near the bottom of the `<script>` section:
   ```javascript
   const SHEET_ID = "YOUR_GOOGLE_SHEET_ID_HERE";
   const API_KEY  = "YOUR_GOOGLE_API_KEY_HERE";
   ```
3. Replace with your actual values from Steps 1a and 1d
4. Upload `dashboard.html` to your website (e.g. as `/student-services/cases.html`)
5. Keep the URL unlisted — share it only when demoing

---

## Step 5 — Test the full flow

In your ChatGPT GPT, try:

> *"I'm really struggling to pay my bills this month, things have got really hard since my hours were cut at work. Is there anything the university can help with?"*

ChatGPT should:
1. Prompt you to sign in (opens the Ambridge login page)
2. Ask you to use one of the demo accounts: `s.archer@ambridge.ac.uk` / `ambridge2024`
3. Retrieve your student profile
4. Have a natural conversation gathering hardship details
5. Submit the application
6. The case appears in your Google Sheet and on the dashboard within seconds

---

## Demo student accounts

| Email | Password | Student | Course |
|---|---|---|---|
| s.archer@ambridge.ac.uk | ambridge2024 | Sam Archer | BSc Agricultural Science, Year 2 |
| p.grundy@ambridge.ac.uk | ambridge2024 | Pip Grundy | MA Rural Business Management, Year 1 |
| e.pargetter@ambridge.ac.uk | ambridge2024 | Elizabeth Pargetter | LLB Law, Year 3 |

---

## Troubleshooting

**"Unable to load data" on dashboard** — Check your API key is restricted to Sheets API only, and the Sheet is shared with your service account email.

**OAuth not working** — Make sure BASE_URL in Railway env vars exactly matches your Railway deployment URL (no trailing slash).

**Cases not writing to Sheet** — Check `GOOGLE_SERVICE_ACCOUNT_JSON` is the full JSON content (not the file path). Check the sheet tab is named exactly `Cases`.

**Railway build failing** — Ensure `package.json` has `"type": "module"` and Node version is ≥18.
