// ============================================================
//  vector.io Hackathon 2026 — Google Apps Script Backend
//  Saves registration data → Google Sheets
//  Saves receipt file     → Google Drive folder
// ============================================================
//
//  SETUP INSTRUCTIONS (do this once):
//  1. Go to https://script.google.com → New Project
//  2. Paste this entire file, replacing the default code
//  3. Fill in YOUR_SHEET_ID and YOUR_FOLDER_ID below
//  4. Click Deploy → New Deployment → Web App
//     · Execute as: Me
//     · Who has access: Anyone
//  5. Copy the Web App URL → paste into index.html
//     (replace GOOGLE_SCRIPT_URL at the top of the script)
//
//  ⚠ IMPORTANT: Every time you edit this file you must make
//    a NEW deployment (not update existing) to get the changes live.
// ============================================================

// ── CONFIG ────────────────────────────────────────────────────────
// A) Open sheets.google.com → create blank sheet → copy ID from URL:
//    https://docs.google.com/spreadsheets/d/ ← THIS → /edit
const SHEET_ID   = 'YOUR_SHEET_ID_HERE';

// B) Open drive.google.com → New → Folder (name: vectorio-receipts)
//    Right-click → Get link → copy ID from URL after /folders/
const FOLDER_ID  = 'YOUR_DRIVE_FOLDER_ID_HERE';

const SHEET_NAME = 'Registrations';

// ── OUTPUT HELPER (no CORS headers needed for no-cors fetch) ──────
function output(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── GET REQUEST (health check / CORS preflight workaround) ────────
function doGet(e) {
  return output({ ok: true, service: 'vector.io registration backend' });
}

// ── MAIN POST HANDLER ─────────────────────────────────────────────
function doPost(e) {
  try {
    // Supports both JSON body AND form-encoded POST (no-cors mode sends form)
    let payload = {};

    if (e.postData && e.postData.type === 'application/x-www-form-urlencoded') {
      // Form-encoded (sent from frontend with no-cors)
      payload = e.parameter;
    } else if (e.postData && e.postData.contents) {
      // JSON body (fallback / testing)
      payload = JSON.parse(e.postData.contents);
    } else {
      payload = e.parameter || {};
    }

    const sheet     = getOrCreateSheet();
    const receiptUrl = saveReceiptFile(payload);
    const timestamp  = new Date().toLocaleString('en-IN', {
      timeZone:  'Asia/Kolkata',
      dateStyle: 'medium',
      timeStyle: 'short'
    });

    sheet.appendRow([
      timestamp,
      payload.team_name    || '',
      payload.leader_name  || '',
      payload.team_size    || '',
      payload.email        || '',
      payload.phone        || '',
      payload.college      || '',
      payload.project_idea || '',
      payload.utr_txn_id   || '',
      payload.payment_app  || '',
      payload.payment_time || '',
      '₹349',
      receiptUrl,
      'Pending Review',
    ]);

    if (payload.email) sendConfirmationEmail(payload, receiptUrl, timestamp);
    sendOrganizerAlert(payload, receiptUrl, timestamp);

    return output({ success: true, receiptSaved: receiptUrl !== 'Not uploaded' });

  } catch (err) {
    Logger.log('doPost error: ' + err.message);
    return output({ success: false, error: err.message });
  }
}

// ── SHEET SETUP ───────────────────────────────────────────────────
function getOrCreateSheet() {
  const ss    = SpreadsheetApp.openById(SHEET_ID);
  let   sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    const headers = [
      'Submitted At','Team Name','Leader Name','Team Size',
      'Email','Phone','College','Project Idea',
      'UTR / Txn ID','Payment App','Payment Time','Amount',
      'Receipt File','Status'
    ];
    sheet.appendRow(headers);
    const hdr = sheet.getRange(1, 1, 1, headers.length);
    hdr.setBackground('#1a237e');
    hdr.setFontColor('#ffffff');
    hdr.setFontWeight('bold');
    hdr.setFontSize(11);
    sheet.setFrozenRows(1);
    [160,160,160,100,200,130,220,280,160,120,150,80,300,130]
      .forEach((w, i) => sheet.setColumnWidth(i + 1, w));
  }
  return sheet;
}

// ── SAVE RECEIPT TO GOOGLE DRIVE ──────────────────────────────────
function saveReceiptFile(payload) {
  if (!payload.receipt_data || payload.receipt_data === 'null' || payload.receipt_data === '') {
    return 'Not uploaded';
  }
  try {
    const folder   = DriveApp.getFolderById(FOLDER_ID);
    const mimeType = payload.receipt_mime || 'application/octet-stream';
    const decoded  = Utilities.base64Decode(payload.receipt_data);
    const blob     = Utilities.newBlob(decoded, mimeType, payload.receipt_name || 'receipt');
    const safeName = (payload.team_name  || 'team').replace(/[^a-zA-Z0-9]/g, '_');
    const safeUtr  = (payload.utr_txn_id || 'utr' ).replace(/[^a-zA-Z0-9]/g, '_');
    blob.setName(safeName + '_' + safeUtr + '_' + (payload.receipt_name || 'receipt'));
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getUrl();
  } catch (err) {
    Logger.log('Receipt upload error: ' + err.message);
    return 'Upload failed: ' + err.message;
  }
}

// ── CONFIRMATION EMAIL → PARTICIPANT ──────────────────────────────
function sendConfirmationEmail(payload, receiptUrl, timestamp) {
  try {
    GmailApp.sendEmail(
      payload.email,
      '✅ Registration Confirmed — vector.io Hackathon 2026 | Team: ' + payload.team_name,
      'Hi ' + payload.leader_name + ',\n\n' +
      'Your registration for vector.io Hackathon 2026 has been received!\n\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      'REGISTRATION DETAILS\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      'Team Name    : ' + payload.team_name    + '\n' +
      'Team Size    : ' + payload.team_size    + '\n' +
      'Leader       : ' + payload.leader_name  + '\n' +
      'Email        : ' + payload.email        + '\n' +
      'Phone        : ' + payload.phone        + '\n' +
      'College      : ' + payload.college      + '\n\n' +
      'Project Idea :\n' + payload.project_idea + '\n\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      'PAYMENT DETAILS\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      'Amount Paid  : ₹349\n' +
      'UTR / Txn ID : ' + payload.utr_txn_id  + '\n' +
      'Payment App  : ' + payload.payment_app  + '\n' +
      'Payment Time : ' + payload.payment_time + '\n' +
      'Receipt File : ' + receiptUrl + '\n' +
      'Submitted At : ' + timestamp  + '\n\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      'EVENT SCHEDULE\n' +
      '• Prototype Submission  : March 30 – April 8, 2026\n' +
      '• Round 1 Results       : April 10, 2026\n' +
      '• Online Sprint         : April 9–11, 2026\n' +
      '• Round 2 Results       : April 14, 2026\n' +
      '• Grand Finale (On-site): April 25, 2026 @ NMIET Auditorium\n\n' +
      'For queries:\n' +
      '• Sandesh Shingankar : 8668916936\n' +
      '• Tejas Naiknaware   : 80079 53204\n\n' +
      'Best of luck!\n' +
      '— Team vector.io Hackathon 2026\n' +
      'PCET-NMVPM\'s NMIET Talegaon Dabhade'
    );
  } catch (err) {
    Logger.log('Confirmation email error: ' + err.message);
  }
}

// ── ALERT EMAIL → ORGANIZER ───────────────────────────────────────
function sendOrganizerAlert(payload, receiptUrl, timestamp) {
  try {
    const to = Session.getActiveUser().getEmail();
    GmailApp.sendEmail(
      to,
      '🆕 New Registration — ' + payload.team_name + ' | vector.io Hackathon 2026',
      'New registration received!\n\n' +
      'Team     : ' + payload.team_name    + '  (' + payload.team_size + ')\n' +
      'Leader   : ' + payload.leader_name  + '\n' +
      'Email    : ' + payload.email        + '\n' +
      'Phone    : ' + payload.phone        + '\n' +
      'College  : ' + payload.college      + '\n' +
      'UTR      : ' + payload.utr_txn_id   + '  via ' + payload.payment_app + '\n' +
      'Receipt  : ' + receiptUrl           + '\n' +
      'Time     : ' + timestamp            + '\n\n' +
      'Idea:\n'    + payload.project_idea
    );
  } catch (err) {
    Logger.log('Organizer alert error: ' + err.message);
  }
}

// ── TEST FUNCTION — Run manually in Apps Script editor ────────────
function testSetup() {
  try {
    const sheet = getOrCreateSheet();
    Logger.log('✅ Sheet OK: ' + sheet.getName());
    const folder = DriveApp.getFolderById(FOLDER_ID);
    Logger.log('✅ Drive folder OK: ' + folder.getName());
    Logger.log('✅ All good! Deploy as Web App now.');
  } catch (err) {
    Logger.log('❌ Error: ' + err.message);
    Logger.log('→ Double-check SHEET_ID and FOLDER_ID values.');
  }
}
