/**
 * GmailFlows.gs
 *
 * Gmail-based automations for MindsEye:
 * - Process threads labeled "MindsEye-Autoreply"
 * - Use Gemini to draft responses
 * - Optionally log runs to the MindsEye ledger (runs sheet)
 */

/** CONFIG - EDIT THESE VALUES **/

var LEDGER_SHEET_ID   = 'PASTE_LEDGER_SHEET_ID_HERE';
var NODES_SHEET_NAME  = 'nodes';
var RUNS_SHEET_NAME   = 'runs';

var GEMINI_API_KEY    = 'PASTE_GEMINI_API_KEY_HERE';
var GEMINI_MODEL_ID   = 'gemini-1.5-pro';

// Gmail label for threads to process
var AUTOREPLY_LABEL   = 'MindsEye-Autoreply';

// Optional: default prompt type hint
var AUTOREPLY_NODE_HINT = 'email_autoreply';

/** ENTRYPOINTS **/

/**
 * Time-driven trigger:
 * e.g. every 5 minutes, or every 15 minutes.
 *
 * Set via Triggers in Apps Script UI:
 *   - Function: processLabeledThreads
 *   - Event source: Time-driven
 *   - Type: Every 5 minutes (etc.)
 */
function processLabeledThreads() {
  var label = GmailApp.getUserLabelByName(AUTOREPLY_LABEL);
  if (!label) {
    Logger.log('Label not found: ' + AUTOREPLY_LABEL);
    return;
  }

  var threads = label.getThreads(0, 20); // process up to 20 at a time
  Logger.log('Found ' + threads.length + ' threads with label ' + AUTOREPLY_LABEL);

  threads.forEach(function(thread) {
    try {
      processSingleThread_(thread);
      // Remove label after processing to avoid duplicates
      thread.removeLabel(label);
    } catch (err) {
      Logger.log('Error processing thread: ' + err);
    }
  });
}

/** CORE LOGIC **/

function processSingleThread_(thread) {
  var messages = thread.getMessages();
  if (!messages || messages.length === 0) {
    return;
  }

  var lastMessage = messages[messages.length - 1];
  var from = lastMessage.getFrom();
  var subject = thread.getFirstMessageSubject();
  var body = stripHtml_(lastMessage.getBody());

  var prompt = buildAutoreplyPrompt_(from, subject, body);

  var replyText = callGemini_(prompt);
  if (!replyText) {
    Logger.log('Gemini returned empty reply.');
    return;
  }

  // Send reply
  thread.reply(replyText);

  // Log run to ledger (optional)
  try {
    logRunToLedger_({
      run_context: 'gmail',
      input_ref: 'THREAD:' + thread.getId(),
      output_ref: replyText.slice(0, 120) + (replyText.length > 120 ? '...' : ''),
      notes: 'Autoreply to ' + from
    });
  } catch (err) {
    Logger.log('Failed to log run to ledger: ' + err);
  }
}

/** HELPERS **/

function buildAutoreplyPrompt_(from, subject, bodyText) {
  return [
    'You are MindsEye, an assistant helping reply to email threads.',
    '',
    'Sender: ' + from,
    'Subject: ' + subject,
    '',
    'Email body:',
    bodyText,
    '',
    'Task:',
    'Draft a clear, polite, human-like reply to this email.',
    'Be concise, respond to the sender\'s main points, and avoid sounding like an AI.',
    '',
    'Return only the reply text.'
  ].join('\n');
}

function stripHtml_(html) {
  // Very naive HTML → text conversion
  var text = html.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<[^>]+>/g, '');
  return text;
}

/**
 * Call Gemini via the REST API.
 */
function callGemini_(prompt) {
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/'
    + encodeURIComponent(GEMINI_MODEL_ID)
    + ':generateContent?key=' + encodeURIComponent(GEMINI_API_KEY);

  var payload = {
    contents: [
      {
        parts: [{ text: prompt }]
      }
    ]
  };

  var options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(url, options);
  var code = response.getResponseCode();
  if (code !== 200) {
    Logger.log('Gemini API error ' + code + ': ' + response.getContentText());
    return '';
  }

  var data = JSON.parse(response.getContentText());
  var text = '';

  try {
    text = data.candidates[0].content.parts[0].text || '';
  } catch (e) {
    Logger.log('Error extracting Gemini response text: ' + e);
  }

  return text;
}

/**
 * Append a row to the runs sheet in the ledger.
 * Uses a simple generated run_id based on timestamp.
 */
function logRunToLedger_(opts) {
  if (!LEDGER_SHEET_ID) {
    Logger.log('LEDGER_SHEET_ID not configured; skipping run log.');
    return;
  }

  var ss = SpreadsheetApp.openById(LEDGER_SHEET_ID);
  var sheet = ss.getSheetByName(RUNS_SHEET_NAME);
  if (!sheet) {
    Logger.log('Runs sheet not found: ' + RUNS_SHEET_NAME);
    return;
  }

  var runId = 'RUN-' + Utilities.formatDate(new Date(), 'UTC', 'yyyyMMddHHmmss');
  var nowIso = new Date().toISOString();

  var row = [
    runId,                // run_id
    '',                   // node_id (can be linked later if desired)
    GEMINI_MODEL_ID,      // model
    opts.run_context || 'gmail',
    opts.input_ref || '',
    opts.output_ref || '',
    '',                   // score
    opts.notes || '',
    nowIso                // run_time
  ];

  sheet.appendRow(row);
}
