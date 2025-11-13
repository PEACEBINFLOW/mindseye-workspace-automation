/**
 * DriveFlows.gs
 *
 * Drive-based automations for MindsEye:
 * - Time-driven trigger to summarize files in a folder
 * - Writes summary into a Google Doc
 * - Optionally logs a run in the ledger
 */

/** CONFIG **/

var LEDGER_SHEET_ID_DRIVE   = 'PASTE_LEDGER_SHEET_ID_HERE';
var RUNS_SHEET_NAME_DRIVE   = 'runs';

var GEMINI_API_KEY_DRIVE    = 'PASTE_GEMINI_API_KEY_HERE';
var GEMINI_MODEL_ID_DRIVE   = 'gemini-1.5-pro';

// Folder ID to summarize
var DRIVE_SUMMARY_FOLDER_ID = 'PASTE_DRIVE_FOLDER_ID_HERE';

// Optional: target doc ID for summary (if empty, a new doc is created)
var DRIVE_SUMMARY_DOC_ID    = '';

/**
 * Time-driven trigger:
 * e.g. daily at 8am
 *
 * Set via Triggers:
 *   - Function: runDriveSummary
 *   - Source: Time-driven
 *   - Type: Day timer
 */
function runDriveSummary() {
  if (!DRIVE_SUMMARY_FOLDER_ID) {
    Logger.log('DRIVE_SUMMARY_FOLDER_ID not configured.');
    return;
  }

  var folder = DriveApp.getFolderById(DRIVE_SUMMARY_FOLDER_ID);
  var files = folder.getFiles();

  var fileInfos = [];
  var limit = 50; // max files to consider
  var count = 0;

  while (files.hasNext() && count < limit) {
    var file = files.next();
    fileInfos.push({
      name: file.getName(),
      url: file.getUrl(),
      lastUpdated: file.getLastUpdated()
    });
    count++;
  }

  if (fileInfos.length === 0) {
    Logger.log('No files found in folder: ' + DRIVE_SUMMARY_FOLDER_ID);
    return;
  }

  var prompt = buildDriveSummaryPrompt_(fileInfos);
  var summaryText = callGeminiDrive_(prompt);

  if (!summaryText) {
    Logger.log('Gemini returned empty drive summary.');
    return;
  }

  var summaryDocId = writeSummaryToDoc_(summaryText, fileInfos);

  // Log run
  try {
    logDriveRunToLedger_({
      input_ref: 'FOLDER:' + DRIVE_SUMMARY_FOLDER_ID,
      output_ref: 'DOC:' + summaryDocId,
      notes: 'Drive folder daily summary'
    });
  } catch (err) {
    Logger.log('Failed to log drive run: ' + err);
  }
}

/** HELPERS **/

function buildDriveSummaryPrompt_(fileInfos) {
  var lines = [
    'You are MindsEye, summarizing recent activity in a Google Drive folder.',
    '',
    'Here is a list of files:'
  ];

  fileInfos.forEach(function(info) {
    lines.push(
      '- ' + info.name +
      ' (URL: ' + info.url + ', lastUpdated: ' + info.lastUpdated.toISOString() + ')'
    );
  });

  lines.push('');
  lines.push('Task: Provide a concise summary of this folder\'s contents and activity.');
  lines.push('Highlight any patterns, changes, or likely priorities for the user.');
  lines.push('Return plain text, 2–4 short paragraphs.');

  return lines.join('\n');
}

function callGeminiDrive_(prompt) {
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/'
    + encodeURIComponent(GEMINI_MODEL_ID_DRIVE)
    + ':generateContent?key=' + encodeURIComponent(GEMINI_API_KEY_DRIVE);

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
    Logger.log('Gemini Drive API error ' + code + ': ' + response.getContentText());
    return '';
  }

  var data = JSON.parse(response.getContentText());
  var text = '';

  try {
    text = data.candidates[0].content.parts[0].text || '';
  } catch (e) {
    Logger.log('Error extracting Gemini Drive response text: ' + e);
  }

  return text;
}

function writeSummaryToDoc_(summaryText, fileInfos) {
  var doc;
  if (DRIVE_SUMMARY_DOC_ID) {
    doc = DocumentApp.openById(DRIVE_SUMMARY_DOC_ID);
  } else {
    doc = DocumentApp.create('MindsEye Drive Summary');
  }

  var body = doc.getBody();
  body.clear();

  body.appendParagraph('MindsEye Drive Summary').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph('Generated at: ' + new Date().toISOString());
  body.appendParagraph('');
  body.appendParagraph(summaryText);
  body.appendParagraph('');
  body.appendParagraph('Files considered:').setHeading(DocumentApp.ParagraphHeading.HEADING2);

  fileInfos.forEach(function(info) {
    body.appendParagraph(
      '- ' + info.name + ' (' + info.url + ')'
    );
  });

  return doc.getId();
}

function logDriveRunToLedger_(opts) {
  if (!LEDGER_SHEET_ID_DRIVE) {
    Logger.log('LEDGER_SHEET_ID_DRIVE not configured; skipping drive run log.');
    return;
  }

  var ss = SpreadsheetApp.openById(LEDGER_SHEET_ID_DRIVE);
  var sheet = ss.getSheetByName(RUNS_SHEET_NAME_DRIVE);
  if (!sheet) {
    Logger.log('Runs sheet not found: ' + RUNS_SHEET_NAME_DRIVE);
    return;
  }

  var runId = 'RUN-' + Utilities.formatDate(new Date(), 'UTC', 'yyyyMMddHHmmss');
  var nowIso = new Date().toISOString();

  var row = [
    runId,                    // run_id
    '',                       // node_id
    GEMINI_MODEL_ID_DRIVE,    // model
    'drive',                  // run_context
    opts.input_ref || '',
    opts.output_ref || '',
    '',                       // score
    opts.notes || '',
    nowIso                    // run_time
  ];

  sheet.appendRow(row);
}
