// ============================================================
//  vector.io Hackathon 2026 — Google Apps Script Backend
//  Saves registration data → Google Sheets
//  Saves receipt file     → Google Drive folder
// ============================================================
//
//  SETUP INSTRUCTIONS (do this once):
//  1. Go to https://script.google.com  → New Project
//  2. Paste this entire file, replacing the default code
//  3. Fill in YOUR_SHEET_ID and YOUR_FOLDER_ID below
//  4. Click Deploy → New Deployment → Web App
//     · Execute as: Me
//     · Who has access: Anyone
//  5. Copy the Web App URL → paste into your HTML file
//     (replace GOOGLE_SCRIPT_URL value at the top)
// ============================================================

// ── CONFIG ────────────────────────────────────────────────────
// Step A: Create a Google Sheet at sheets.google.com
//         Copy the ID from its URL:
//         https://docs.google.com/spreadsheets/d/ ←THIS→ /edit
const SHEET_ID   = 'YOUR_SHEET_ID_HERE';

// Step B: Create a folder in Google Drive for receipts
//         Right-click folder → Get link
//         ID is the part after /folders/
const FOLDER_ID  = 'YOUR_DRIVE_FOLDER_ID_HERE';

// Sheet tab name (auto-created with headers if missing)
const SHEET_NAME = 'Registrations';

// ── CORS HEADERS ──────────────────────────────────────────────
function corsOutput(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── HANDLE OPTIONS PREFLIGHT ──────────────────────────────────
function doOptions(e) {
  return corsOutput({ ok: true });
}

// ── MAIN ENTRY POINT ──────────────────────────────────────────
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);

    // 1. Get / create the sheet
    const sheet = getOrCreateSheet();

    // 2. Upload receipt to Google Drive
    const receiptUrl = saveReceiptFile(payload);

    // 3. Timestamp
    const timestamp = new Date().toLocaleString('en-IN', {
      timeZone:  'Asia/Kolkata',
      dateStyle: 'medium',
      timeStyle: 'short'
    });

    // 4. Append row to sheet
    sheet.appendRow([
      timestamp,                          // A: Submitted At
      payload.team_name    || '',         // B: Team Name
      payload.leader_name  || '',         // C: Leader Name
      payload.team_size    || '',         // D: Team Size
      payload.email        || '',         // E: Email
      payload.phone        || '',         // F: Phone
      payload.college      || '',         // G: College
      payload.project_idea || '',         // H: Project Idea
      payload.utr_txn_id   || '',         // I: UTR / Transaction ID
      payload.payment_app  || '',         // J: Payment App
      payload.payment_time || '',         // K: Payment Time
      '₹349',                             // L: Amount
      receiptUrl,                         // M: Receipt File (Drive link)
      'Pending Review',                   // N: Status
    ]);

    // 5. Send confirmation email to participant
    if (payload.email) {
      sendConfirmationEmail(payload, receiptUrl, timestamp);
    }

    // 6. Notify organizer
    sendOrganizerAlert(payload, receiptUrl, timestamp);

    return corsOutput({
      success:      true,
      message:      'Registration saved!',
      receiptSaved: receiptUrl !== 'Not uploaded',
    });

  } catch (err) {
    console.error('doPost error:', err);
    return corsOutput({ success: false, error: err.message });
  }
}

// ── GET OR CREATE SHEET WITH STYLED HEADERS ───────────────────
function getOrCreateSheet() {
  const ss    = SpreadsheetApp.openById(SHEET_ID);
  let   sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);

    const headers = [
      'Submitted At', 'Team Name', 'Leader Name', 'Team Size',
      'Email', 'Phone', 'College', 'Project Idea',
      'UTR / Txn ID', 'Payment App', 'Payment Time', 'Amount',
      'Receipt File', 'Status'
    ];
    sheet.appendRow(headers);

    // Style header row
    const hdr = sheet.getRange(1, 1, 1, headers.length);
    hdr.setBackground('#1a237e');
    hdr.setFontColor('#ffffff');
    hdr.setFontWeight('bold');
    hdr.setFontSize(11);
    sheet.setFrozenRows(1);

    // Column widths
    const widths = [160,160,160,100,200,130,220,280,160,120,150,80,300,130];
    widths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));
  }

  return sheet;
}

// ── SAVE RECEIPT FILE TO GOOGLE DRIVE ─────────────────────────
function saveReceiptFile(payload) {
  if (!payload.receipt_data || !payload.receipt_name) {
    return 'Not uploaded';
  }

  try {
    const folder   = DriveApp.getFolderById(FOLDER_ID);
    const mimeType = payload.receipt_mime || 'application/octet-stream';
    const decoded  = Utilities.base64Decode(payload.receipt_data);
    const blob     = Utilities.newBlob(decoded, mimeType, payload.receipt_name);

    // Prefix filename with team name + UTR for easy identification
    const safeName = (payload.team_name || 'team').replace(/[^a-zA-Z0-9]/g, '_');
    const utr      = (payload.utr_txn_id || 'receipt').replace(/[^a-zA-Z0-9]/g, '_');
    blob.setName(`${safeName}_${utr}_${payload.receipt_name}`);

    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return file.getUrl();
  } catch (err) {
    console.error('Receipt upload error:', err);
    return `Upload failed: ${err.message}`;
  }
}

// ── CONFIRMATION EMAIL → PARTICIPANT ──────────────────────────
function sendConfirmationEmail(payload, receiptUrl, timestamp) {
  try {
    GmailApp.sendEmail(
      payload.email,
      `✅ Registration Confirmed — vector.io Hackathon 2026 | Team: ${payload.team_name}`,
      `Hi ${payload.leader_name},

Your registration for vector.io Hackathon 2026 has been received!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGISTRATION DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Team Name    : ${payload.team_name}
Team Size    : ${payload.team_size}
Leader       : ${payload.leader_name}
Email        : ${payload.email}
Phone        : ${payload.phone}
College      : ${payload.college}

Project Idea :
${payload.project_idea}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PAYMENT DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Amount Paid  : ₹349
UTR / Txn ID : ${payload.utr_txn_id}
Payment App  : ${payload.payment_app}
Payment Time : ${payload.payment_time}
Receipt File : ${receiptUrl}

Submitted At : ${timestamp}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EVENT SCHEDULE
• Prototype Submission : March 30 – April 8, 2026
• Round 1 Results      : April 10, 2026
• Online Sprint        : April 9–11, 2026
• Round 2 Results      : April 14, 2026
• Grand Finale (On-site): April 25, 2026 @ NMIET Auditorium

For queries:
• Sandesh Shingankar : 8668916936
• Tejas Naiknaware   : 80079 53204

Best of luck!
— Team vector.io Hackathon 2026
PCET-NMVPM's NMIET Talegaon Dabhade`
    );
  } catch (err) {
    console.error('Confirmation email error:', err);
  }
}

// ── ALERT EMAIL → ORGANIZER ───────────────────────────────────
function sendOrganizerAlert(payload, receiptUrl, timestamp) {
  try {
    const to = Session.getActiveUser().getEmail(); // your Gmail
    GmailApp.sendEmail(
      to,
      `🆕 New Registration — ${payload.team_name} | vector.io Hackathon 2026`,
      `New registration received!

Team     : ${payload.team_name}  (${payload.team_size})
Leader   : ${payload.leader_name}
Email    : ${payload.email}
Phone    : ${payload.phone}
College  : ${payload.college}
UTR      : ${payload.utr_txn_id}  via ${payload.payment_app}
Receipt  : ${receiptUrl}
Time     : ${timestamp}

Idea:
${payload.project_idea}`
    );
  } catch (err) {
    console.error('Organizer alert error:', err);
  }
}

// ── TEST FUNCTION — Run this manually to verify setup ─────────
function testSetup() {
  try {
    const sheet = getOrCreateSheet();
    Logger.log('✅ Sheet OK: ' + sheet.getName());

    const folder = DriveApp.getFolderById(FOLDER_ID);
    Logger.log('✅ Drive folder OK: ' + folder.getName());

    Logger.log('✅ Setup looks good! Deploy as Web App now.');
  } catch (err) {
    Logger.log('❌ Error: ' + err.message);
    Logger.log('→ Double-check SHEET_ID and FOLDER_ID values.');
  }
}
