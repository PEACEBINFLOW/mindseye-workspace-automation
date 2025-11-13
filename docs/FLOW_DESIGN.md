# MindsEye Workspace Automation – Flow Design

This document explains how the Workspace automations in this repo connect:

- Gmail → Gemini → Ledger
- Docs → Gemini → Ledger
- Drive → Gemini → Ledger

and how they fit into the wider MindsEye ecosystem.

---

## 🔗 Shared Concepts

### MindsEye Ledger

All flows assume a live ledger from `mindseye-google-ledger`, with:

- `nodes` sheet (Prompt Evolution Tree)
- `runs` sheet (experiment executions)

Workspace flows in this repo **log runs** directly into `runs`, but do not strictly require node IDs yet (that can be added later when you map flows to specific nodes).

### Gemini

All flows use **Gemini** via the REST API:

- Base URL (v1beta):  
  `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}`

Each script has:

- `GEMINI_API_KEY`
- `GEMINI_MODEL_ID`

set at the top of the file.

---

## 📧 Flow: Gmail Autoreply

**Spec:** `flows/gmail_autoreply.yaml`  
**Implementation:** `apps-script/GmailFlows.gs`

**Trigger:**

- Time-driven Apps Script trigger calling `processLabeledThreads()`.
- Threads tagged with label `MindsEye-Autoreply`.

**Steps:**

1. Find all threads with label `MindsEye-Autoreply`.
2. For each thread:
   - Get last message’s HTML body and convert to plain text.
   - Build an autoreply prompt:
     - includes sender, subject, and email body.
   - Call Gemini with this prompt.
   - Send reply using `thread.reply(replyText)`.
   - Remove `MindsEye-Autoreply` label.
   - Append row to `runs` sheet with:
     - `run_context = gmail`
     - `input_ref = THREAD:<threadId>`
     - `output_ref` = first ~120 chars of reply.

**Future extension:**

- Add a column `node_id` pointing to a specific `email_autoreply` PET node.
- Lookup prompt patterns from the ledger instead of hardcoded strings.

---

## 📄 Flow: Docs Reviewer

**Spec:** `flows/docs_reviewer.yaml`  
**Implementation:** `apps-script/DocsFlows.gs`

**Trigger:**

- `onOpen()` adds a custom menu **MindsEye → Review with MindsEye**.
- User manually triggers `reviewCurrentDoc()` from the menu.

**Steps:**

1. Get current document:
   - `title`, `docId`, `docUrl`, full body text.
2. Build review prompt:
   - instructs Gemini to review for clarity, structure, tone.
3. Call Gemini and receive review text.
4. Insert "MindsEye Review" heading + review text at the top of the doc.
   - (v0: uses body text insertion; v1 could use real comments.)
5. Append to `runs`:
   - `run_context = docs`
   - `input_ref = DOC:<docId>`
   - `output_ref = first ~120 chars of review`.

**Future extension:**

- Map doc review flows to PET nodes in ledger via `prompt_type = doc_review`.
- Use node metadata (tags, etc.) to adapt review style.

---

## 📂 Flow: Drive Folder Summarizer

**Spec:** `flows/drive_summarizer.yaml`  
**Implementation:** `apps-script/DriveFlows.gs`

**Trigger:**

- Time-driven trigger calling `runDriveSummary()`.
- Typically daily at a chosen hour.

**Steps:**

1. List up to `limit` files in `DRIVE_SUMMARY_FOLDER_ID`.
2. Build prompt summarizing:
   - file names
   - URLs
   - last updated times
3. Call Gemini to generate a summary of the folder’s activity.
4. Write summary into a Google Doc:
   - Create a new doc if `DRIVE_SUMMARY_DOC_ID` is empty.
   - Otherwise, overwrite the existing summary doc.
5. Append to `runs`:
   - `run_context = drive`
   - `input_ref = FOLDER:<folderId>`
   - `output_ref = DOC:<summaryDocId>`.

**Future extension:**

- Track multiple folders and log them as separate nodes in PET.
- Auto-email the summary using a Gmail flow.

---

## 🧬 Relationship to Other MindsEye Repos

- **`mindseye-google-ledger`**  
  This repo writes runs directly into the ledger’s `runs` sheet. Eventually, each flow can be bound to a specific `node_id` so that all Workspace activity contributes back to the Prompt Evolution Tree.

- **`mindseye-gemini-orchestrator`**  
  That repo orchestrates prompt runs from the ledger side (Node.js environment).  
  This repo operates inside Workspace (Apps Script). Both can:
  - share the same `LEDGER_SHEET_ID`
  - log runs to the same `runs` sheet
  - differ only in context (`cli` vs `gmail` / `docs` / `drive`).

- **`mindseye-google-devlog`** (future)  
  Could read entries from the `runs` sheet with `run_context IN ('gmail','docs','drive')` and auto-generate devlogs summarizing what MindsEye did.

- **`mindseye-google-workflows`** (future)  
  Will hold higher-level workflow definitions that describe *when* to use:
  - Gmail flows
  - Docs flows
  - Drive flows
  in coordination with ledger + orchestrator.

---

## ✅ Minimal Setup Steps

1. Set up the **ledger** repo and Google Sheet (`nodes` + `runs`).
2. In this repo:
   - Copy `GmailFlows.gs`, `DocsFlows.gs`, `DriveFlows.gs` into Apps Script projects.
   - Fill in:
     - `LEDGER_SHEET_ID*`
     - `GEMINI_API_KEY*`
     - `DRIVE_SUMMARY_FOLDER_ID`
3. In Apps Script:
   - Add Triggers for:
     - `processLabeledThreads` (time-driven)
     - `runDriveSummary` (time-driven)
   - `DocsFlows.gs` will auto-add the **MindsEye** menu on `onOpen`.

After that, you have a **live Web4-ish loop**:
Google Workspace events → MindsEye (Gemini) → Ledger → back into your ecosystem.
