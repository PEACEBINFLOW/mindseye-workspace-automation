/**
 * DocsFlows.gs
 *
 * Google Docs review automation for MindsEye:
 * - Adds a custom menu "MindsEye"
 * - Action: "Review with MindsEye"
 * - Sends doc text to Gemini and inserts suggestions as a single comment
 *   (simple v0 implementation).
 */

/** CONFIG **/

var LEDGER_SHEET_ID_DOCS   = 'PASTE_LEDGER_SHEET_ID_HERE';
var RUNS_SHEET_NAME_DOCS   = 'runs';

var GEMINI_API_KEY_DOCS    = 'PASTE_GEMINI_API_KEY_HERE';
var GEMINI_MODEL_ID_DOCS   = 'gemini-1.5-pro';

/** MENU **/

function onOpen() {
  var ui = DocumentApp.getUi();
  ui.createMenu('MindsEye')
    .addItem('Review with MindsEye', 'reviewCurrentDoc')
    .addToUi();
}

/**
 * Menu action: review the current document.
 */
function reviewCurrentDoc() {
  var doc = DocumentApp.getActiveDocument();
  var body = doc.getBody().getText();
  var docId = doc.getId();
  var docUrl = doc.getUrl();
  var title = doc.getName();

  var prompt = buildDocReviewPrompt_(title, body);
  var reviewText = callGeminiDocs_(prompt);

  if (!reviewText) {
    DocumentApp.getUi().alert('MindsEye: No review text returned from Gemini.');
    return;
  }

  // Simple implementation: insert one comment at the top of the doc
  var firstParagraph = doc.getBody().getParagraphs()[0];
  doc.getBody().insertParagraph(0, 'MindsEye Review:').setBold(true);
  doc.getBody().insertParagraph(1, reviewText);

  // Or, to use Docs comments API, you'd need Advanced Docs or REST.
  // Here we keep it simple and just insert text.

  // Log run in ledger
  try {
    logDocRunToLedger_({
      input_ref: 'DOC:' + docId,
      output_ref: reviewText.slice(0, 120) + (reviewText.length > 120 ? '...' : ''),
      notes: 'Doc review for ' + title
    });
  } catch (err) {
    Logger.log('Failed to log docs run: ' + err);
  }

  DocumentApp.getUi().alert('MindsEye review added to the top of the doc.');
}

/** HELPERS **/

function buildDocReviewPrompt_(title, bodyText) {
  return [
    'You are MindsEye, an assistant reviewing the following document.',
    '',
    'Title: ' + title,
    '',
    'Document content:',
    bodyText,
    '',
    'Task:',
    'Provide a structured review focusing on clarity, structure, and tone.',
    'Suggest improvements and highlight any unclear sections.',
    '',
    'Return your review as plain text with short sections and bullet points if helpful.'
  ].join('\n');
}

function callGeminiDocs_(prompt) {
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/'
    + encodeURIComponent(GEMINI_MODEL_ID_DOCS)
    + ':generateContent?key=' + encodeURIComponent(GEMINI_API_KEY_DOCS);

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
    Logger.log('Gemini Docs API error ' + code + ': ' + response.getContentText());
    return '';
  }

  var data = JSON.parse(response.getContentText());
  var text = '';

  try {
    text = data.candidates[0].content.parts[0].text || '';
  } catch (e) {
    Logger.log('Error extracting Gemini Docs response text: ' + e);
  }

  return text;
}

function logDocRunToLedger_(opts) {
  if (!LEDGER_SHEET_ID_DOCS) {
    Logger.log('LEDGER_SHEET_ID_DOCS not configured; skipping docs run log.');
    return;
  }

  var ss = SpreadsheetApp.openById(LEDGER_SHEET_ID_DOCS);
  var sheet = ss.getSheetByName(RUNS_SHEET_NAME_DOCS);
  if (!sheet) {
    Logger.log('Runs sheet not found: ' + RUNS_SHEET_NAME_DOCS);
    return;
  }

  var runId = 'RUN-' + Utilities.formatDate(new Date(), 'UTC', 'yyyyMMddHHmmss');
  var nowIso = new Date().toISOString();

  var row = [
    runId,                 // run_id
    '',                    // node_id (link later if needed)
    GEMINI_MODEL_ID_DOCS,  // model
    'docs',                // run_context
    opts.input_ref || '',
    opts.output_ref || '',
    '',                    // score
    opts.notes || '',
    nowIso                 // run_time
  ];

  sheet.appendRow(row);
}
