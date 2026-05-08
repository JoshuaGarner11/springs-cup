/**
 * SPRINGS CUP — Backend (Google Apps Script)
 * =====================================================================
 *
 * WHAT THIS IS:
 *   A tiny web-app backend that stores tournament registrations in a
 *   Google Sheet, and flips them from PENDING to LOCKED_IN after CCB
 *   payment completes.
 *
 * HOW TO DEPLOY (do this once per Sheet):
 *   1. Create a new Google Sheet named "Springs Cup Registrations"
 *   2. In that Sheet: Extensions → Apps Script
 *   3. Delete the default code, paste THIS entire file in
 *   4. Edit the three values under "EDIT THESE" below
 *   5. Save → Run → setupSheet → authorize when prompted
 *   6. Click "Deploy" → "New deployment"
 *        Type: Web app
 *        Description: Springs Cup backend
 *        Execute as: Me (your Google account)
 *        Who has access: Anyone
 *   7. Click Deploy. Copy the "Web app URL" it gives you —
 *      it looks like: https://script.google.com/macros/s/XXXX/exec
 *   8. Paste that URL into index.html as CONFIG.BACKEND_URL
 *
 * HOW IT WORKS:
 *   GET  ?action=list                                 →  returns all teams as JSON
 *   POST { action: "register", team: {...} }          →  appends a PENDING row
 *   POST { action: "markPaid", teamId: "..." }        →  flips that row to LOCKED_IN
 *   GET  ?action=paid&teamId=...&secret=...           →  CCB redirect target
 *     (marks paid, then redirects back to the site)
 *
 * =====================================================================
 */

// =================== EDIT THESE ===================

// Random string. Required for the CCB redirect to count as a real payment.
// Pick anything (e.g. 'springs-cup-2026-Kx9q'). Save this exact string —
// you'll paste it into the CCB redirect URL.
const PAID_SECRET = 'CHANGE_ME_TO_SOMETHING_RANDOM';

// Where to send the user after CCB payment completes.
// This is your live site URL.
const SITE_URL = 'https://springscup.com/';

// Sheet tab name. Only change if you want a different tab.
const SHEET_NAME = 'Registrations';

// =================== END EDIT ===================


// Column indices (0-based) within the sheet.
const COL = {
  ID: 0,
  TEAM_NAME: 1,
  CHURCH: 2,
  CAPTAIN_NAME: 3,
  CAPTAIN_EMAIL: 4,
  CAPTAIN_PHONE: 5,
  ADULT_LEADER: 6,
  PLAYERS: 7,
  STATUS: 8,
  CREATED_AT: 9,
};

const HEADERS = [
  'id', 'teamName', 'church', 'captainName', 'captainEmail', 'captainPhone',
  'adultLeader', 'players', 'status', 'createdAt',
];


// -------------------------- HANDLERS --------------------------

function doGet(e) {
  const action = (e.parameter && e.parameter.action) || 'list';

  if (action === 'list') {
    return jsonResponse({ teams: listTeams() });
  }

  if (action === 'paid') {
    // CCB form redirect lands here after successful payment
    const teamId = e.parameter.teamId;
    const secret = e.parameter.secret;
    if (!teamId) return htmlText('Missing teamId');
    if (secret !== PAID_SECRET) return htmlText('Invalid secret');
    markPaid(teamId);
    // Redirect back to the site with a success flag so it can show the "locked in" page
    return HtmlService.createHtmlOutput(
      '<!doctype html><meta http-equiv="refresh" content="0;url=' +
      SITE_URL + '?paid=' + encodeURIComponent(teamId) + '">' +
      '<p>Redirecting to Springs Cup...</p>'
    );
  }

  return jsonResponse({ error: 'Unknown action' });
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse({ error: 'Invalid JSON' });
  }

  if (body.action === 'register') {
    const team = body.team;
    if (!team || !team.id) return jsonResponse({ error: 'Missing team' });
    try {
      const saved = registerTeam(team);
      return jsonResponse({ team: saved });
    } catch (err) {
      return jsonResponse({ error: err.message || 'Registration failed' });
    }
  }

  if (body.action === 'markPaid') {
    if (!body.teamId) return jsonResponse({ error: 'Missing teamId' });
    const ok = markPaid(body.teamId);
    return jsonResponse({ success: ok });
  }

  return jsonResponse({ error: 'Unknown action' });
}


// -------------------------- SHEET OPERATIONS --------------------------

/**
 * Run this ONCE from the Apps Script editor (Run → setupSheet) to create
 * the header row. After that, the Sheet is ready to use.
 */
function setupSheet() {
  const sheet = getOrCreateSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  } else {
    // If headers exist but are stale, overwrite them
    const existing = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
    const matches = HEADERS.every((h, i) => existing[i] === h);
    if (!matches) {
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    }
  }
  Logger.log('Sheet is ready: ' + sheet.getName());
}

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function listTeams() {
  const sheet = getOrCreateSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  return values
    .filter(row => row[COL.ID])
    .map(row => ({
      id: row[COL.ID],
      teamName: row[COL.TEAM_NAME],
      church: row[COL.CHURCH],
      captainName: row[COL.CAPTAIN_NAME],
      captainEmail: row[COL.CAPTAIN_EMAIL],
      captainPhone: row[COL.CAPTAIN_PHONE],
      adultLeader: row[COL.ADULT_LEADER] || '',
      players: parseJSONSafe(row[COL.PLAYERS], []),
      status: row[COL.STATUS] || 'PENDING',
      createdAt: Number(row[COL.CREATED_AT]) || 0,
    }));
}

function registerTeam(team) {
  const sheet = getOrCreateSheet();
  // Check for duplicate team name (case-insensitive)
  const existing = listTeams();
  const normalized = String(team.teamName || '').trim().toUpperCase();
  const dup = existing.some(t => String(t.teamName).trim().toUpperCase() === normalized);
  if (dup) {
    throw new Error('A squad with that name is already registered');
  }

  const row = [
    team.id,
    team.teamName,
    team.church,
    team.captainName,
    team.captainEmail,
    team.captainPhone || '',
    team.adultLeader || '',
    JSON.stringify(team.players || []),
    team.status || 'PENDING',
    team.createdAt || Date.now(),
  ];
  sheet.appendRow(row);
  return team;
}

function markPaid(teamId) {
  const sheet = getOrCreateSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  const ids = sheet.getRange(2, COL.ID + 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (ids[i][0] === teamId) {
      sheet.getRange(i + 2, COL.STATUS + 1).setValue('LOCKED_IN');
      return true;
    }
  }
  return false;
}


// -------------------------- HELPERS --------------------------

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function htmlText(text) {
  return ContentService.createTextOutput(text);
}

function parseJSONSafe(val, fallback) {
  if (Array.isArray(val)) return val;
  if (!val) return fallback;
  try { return JSON.parse(val); } catch (e) { return fallback; }
}


// -------------------------- UTILITIES (for debugging) --------------------------

function debug_listAllTeams() {
  Logger.log(JSON.stringify(listTeams(), null, 2));
}

/**
 * Clear all team rows. Use BEFORE a tournament to reset.
 * Run from the Apps Script editor: Run → debug_deleteAllTeams
 */
function debug_deleteAllTeams() {
  const sheet = getOrCreateSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.deleteRows(2, lastRow - 1);
  }
  Logger.log('Cleared all team rows.');
}

/**
 * Manually mark a team as LOCKED_IN by team ID.
 * Useful if a payment came in but the CCB redirect didn't fire.
 * Edit the teamId in the Apps Script editor before running.
 */
function debug_manualMarkPaid() {
  const teamId = 'PASTE_TEAM_ID_HERE';
  const ok = markPaid(teamId);
  Logger.log(ok ? 'Marked paid: ' + teamId : 'Team not found: ' + teamId);
}
