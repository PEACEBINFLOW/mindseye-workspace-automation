# MindsEye Workspace Automation

Google Workspace automations (Gmail, Docs, Drive) powered by the **MindsEye ledger** and **Gemini**.

This repo defines:

- High-level **flow specs** (`flows/*.yaml`) describing how Workspace events should react.
- **Apps Script implementations** (`apps-script/*.gs`) you attach to Gmail/Docs/Drive via a bound or standalone Apps Script project.
- Integration points with the **MindsEye ledger** (`mindseye-google-ledger`) via Google Sheets.

The idea:

- Gmail / Docs / Drive events → trigger Apps Script
- Script reads config + (optionally) the ledger
- Script calls Gemini (directly) to generate responses, suggestions, or summaries
- Script writes results back into Workspace and/or the **runs** tab in the ledger

---

## 🔗 Dependencies

- A live **ledger sheet** from `mindseye-google-ledger`
  - `nodes` + `runs` tabs
- A **Gemini API key**
- A **Google Workspace account** where:
  - Apps Script has access to Gmail, Docs, Drive, and Sheets.

This repo doesn’t run on Node — it lives in **Apps Script** and **YAML specs**.

---

## 📁 Files

### `flows/`

These files are **declarative specs** that describe what each automation is supposed to do:

- `gmail_autoreply.yaml` — reply to tagged threads using a specific prompt node.
- `docs_reviewer.yaml` — review Google Docs and leave AI comments.
- `drive_summarizer.yaml` — summarize or catalog files in a Drive folder.

They are documentation and contract — you don’t “import” them into Apps Script; you **follow them** when implementing flows.

### `apps-script/`

These files contain Apps Script code:

- `GmailFlows.gs` — implements Gmail auto-reply flow.
- `DocsFlows.gs` — implements Docs review flow (insert comments).
- `DriveFlows.gs` — implements Drive summarizer + optional ledger logging.

You’ll copy each file into an Apps Script project and adjust:

- `LEDGER_SHEET_ID`
- `NODES_SHEET_NAME`
- `RUNS_SHEET_NAME`
- `GEMINI_API_KEY`
- `GEMINI_MODEL_ID`

### `docs/FLOW_DESIGN.md`

This explains how flows connect:

- Which **node types** / `prompt_type` they care about.
- How they derive context (email body, doc text, file list).
- What they write back (replies, comments, summaries, ledger runs).

---

## ⚙️ Configuration

In each `*.gs` file, you’ll configure:

```js
var LEDGER_SHEET_ID   = 'YOUR_LEDGER_SHEET_ID';
var NODES_SHEET_NAME  = 'nodes';
var RUNS_SHEET_NAME   = 'runs';
var GEMINI_API_KEY    = 'YOUR_GEMINI_API_KEY';
var GEMINI_MODEL_ID   = 'gemini-1.5-pro';
