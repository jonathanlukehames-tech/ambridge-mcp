import express from "express";
import crypto from "crypto";
import { google } from "googleapis";
import dotenv from "dotenv";
dotenv.config();

const app = express();

// ── Middleware — ALL must come before routes ──────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// ── Student profiles ──────────────────────────────────────────────────────────
const STUDENTS = {
  "s.archer@ambridge.ac.uk": {
    password: "ambridge2024",
    id: "STU-2024-0042",
    name: "Sam Archer",
    course: "BSc Agricultural Science",
    year: 2,
    email: "s.archer@ambridge.ac.uk",
    phone: "07700 900142",
    tutor: "Dr Helen Aldridge",
    previousApplications: 0,
  },
  "p.grundy@ambridge.ac.uk": {
    password: "ambridge2024",
    id: "STU-2023-0118",
    name: "Pip Grundy",
    course: "MA Rural Business Management",
    year: 1,
    email: "p.grundy@ambridge.ac.uk",
    phone: "07700 900281",
    tutor: "Prof Brian Aldridge",
    previousApplications: 1,
  },
  "e.pargetter@ambridge.ac.uk": {
    password: "ambridge2024",
    id: "STU-2022-0307",
    name: "Elizabeth Pargetter",
    course: "LLB Law",
    year: 3,
    email: "e.pargetter@ambridge.ac.uk",
    phone: "07700 900395",
    tutor: "Dr Shula Hebden",
    previousApplications: 0,
  },
};

// Active sessions
const sessions = new Map();

// ── Google Sheets helper ──────────────────────────────────────────────────────
async function appendToSheet(rowData) {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const sheets = google.sheets({ version: "v4", auth });
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Cases!A:Q",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [rowData] },
    });
    return true;
  } catch (err) {
    console.error("Sheets error:", err.message);
    return false;
  }
}

// ── Auth middleware ───────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.replace("Bearer ", "").trim();
  const email = sessions.get(token);
  if (!email) return res.status(401).json({ error: "Unauthorized. Please sign in." });
  req.student = STUDENTS[email];
  next();
}

// ── OAuth login page ──────────────────────────────────────────────────────────
app.get("/oauth/authorize", (req, res) => {
  const { redirect_uri, state } = req.query;
  res.send(`<!DOCTYPE html>
<html>
<head>
  <title>Ambridge University — Sign In</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Georgia, serif; background: #0f1f0f; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .card { background: #fff; border-radius: 8px; padding: 40px; width: 380px; box-shadow: 0 20px 60px rgba(0,0,0,0.4); }
    .logo { text-align: center; margin-bottom: 28px; }
    .logo h1 { font-size: 22px; color: #1a3a1a; }
    .logo p { font-size: 13px; color: #666; margin-top: 4px; font-family: sans-serif; }
    .crest { font-size: 36px; margin-bottom: 8px; }
    label { display: block; font-size: 12px; color: #444; margin-bottom: 4px; font-family: sans-serif; text-transform: uppercase; letter-spacing: 0.3px; }
    input { width: 100%; padding: 10px 12px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; margin-bottom: 16px; font-family: sans-serif; }
    input:focus { outline: none; border-color: #2d5a2d; }
    button { width: 100%; background: #2d5a2d; color: white; border: none; padding: 12px; border-radius: 4px; font-size: 14px; cursor: pointer; font-family: sans-serif; }
    button:hover { background: #1a3a1a; }
    .hint { font-size: 11px; color: #999; text-align: center; margin-top: 16px; font-family: sans-serif; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <div class="crest">🎓</div>
      <h1>Ambridge University</h1>
      <p>Student Services Portal</p>
    </div>
    <form method="POST" action="/oauth/login">
      <input type="hidden" name="redirect_uri" value="${redirect_uri || ""}" />
      <input type="hidden" name="state" value="${state || ""}" />
      <label>University Email</label>
      <input type="email" name="email" placeholder="yourname@ambridge.ac.uk" required />
      <label>Password</label>
      <input type="password" name="password" placeholder="••••••••••" required />
      <button type="submit">Sign in to Student Services</button>
    </form>
    <p class="hint">Demo: s.archer@ambridge.ac.uk / ambridge2024</p>
  </div>
</body>
</html>`);
});

app.post("/oauth/login", (req, res) => {
  const { email, password, redirect_uri, state } = req.body;
  const student = STUDENTS[email?.toLowerCase()];
  if (!student || student.password !== password) {
    return res.status(401).send("Invalid credentials");
  }
  const code = crypto.randomBytes(16).toString("hex");
  sessions.set("code:" + code, email.toLowerCase());
  const redirect = new URL(redirect_uri);
  redirect.searchParams.set("code", code);
  if (state) redirect.searchParams.set("state", state);
  res.redirect(redirect.toString());
});

app.post("/oauth/token", (req, res) => {
  const { code, grant_type } = req.body;
  if (grant_type === "authorization_code") {
    const email = sessions.get("code:" + code);
    if (!email) return res.status(400).json({ error: "invalid_code" });
    sessions.delete("code:" + code);
    const token = crypto.randomBytes(24).toString("hex");
    sessions.set(token, email);
    return res.json({ access_token: token, token_type: "bearer", expires_in: 86400 });
  }
  res.status(400).json({ error: "unsupported_grant_type" });
});

// ── OpenAPI schema ────────────────────────────────────────────────────────────
app.get("/.well-known/openapi.yaml", (req, res) => {
  const base = process.env.BASE_URL || `https://${req.headers.host}`;
  res.type("text/yaml").send(`openapi: "3.1.0"
info:
  title: Ambridge University Student Services
  description: Raises and manages student support cases including financial hardship applications.
  version: "1.0.0"
servers:
  - url: ${base}
paths:
  /tools/get_student_profile:
    post:
      operationId: get_student_profile
      summary: Get the authenticated student's profile and enrolment details
      responses:
        "200":
          description: Student profile data
  /tools/check_hardship_eligibility:
    post:
      operationId: check_hardship_eligibility
      summary: Check if student is eligible for financial hardship support
      responses:
        "200":
          description: Eligibility result
  /tools/submit_hardship_application:
    post:
      operationId: submit_hardship_application
      summary: Submit a financial hardship application on behalf of the student
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - hardship_type
                - circumstances
                - monthly_income
                - monthly_essential_outgoings
                - amount_requested
                - supporting_details
              properties:
                hardship_type:
                  type: string
                  enum: [Unexpected expense, Income loss, Ongoing shortfall, Housing crisis, Food insecurity, Other]
                circumstances:
                  type: string
                monthly_income:
                  type: number
                monthly_essential_outgoings:
                  type: number
                amount_requested:
                  type: number
                supporting_details:
                  type: string
                has_supporting_evidence:
                  type: boolean
      responses:
        "200":
          description: Application submitted
  /tools/get_case_status:
    post:
      operationId: get_case_status
      summary: Look up the status of a previously submitted case
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [case_reference]
              properties:
                case_reference:
                  type: string
      responses:
        "200":
          description: Case status
`);
});

app.get("/.well-known/ai-plugin.json", (req, res) => {
  const base = process.env.BASE_URL || `https://${req.headers.host}`;
  res.json({
    schema_version: "v1",
    name_for_human: "Ambridge University Student Services",
    name_for_model: "ambridge_student_services",
    description_for_human: "Access Ambridge University student services — financial hardship applications and case tracking.",
    description_for_model: "Tools for Ambridge University students. Use get_student_profile first. Then use check_hardship_eligibility and submit_hardship_application to raise a financial hardship case.",
    auth: {
      type: "oauth",
      client_url: `${base}/oauth/authorize`,
      scope: "student",
      authorization_url: `${base}/oauth/token`,
      authorization_content_type: "application/x-www-form-urlencoded",
      verification_tokens: {},
    },
    api: { type: "openapi", url: `${base}/.well-known/openapi.yaml` },
    contact_email: "info@voxura.co.uk",
  });
});

// ── Tool endpoints ────────────────────────────────────────────────────────────
app.post("/tools/get_student_profile", requireAuth, (req, res) => {
  const s = req.student;
  res.json({
    student_id: s.id, full_name: s.name, email: s.email,
    course: s.course, year_of_study: s.year, personal_tutor: s.tutor,
    previous_hardship_applications: s.previousApplications,
    enrolled: true, hardship_fund_available: true, max_emergency_award: 1500,
  });
});

app.post("/tools/check_hardship_eligibility", requireAuth, (req, res) => {
  const s = req.student;
  res.json({
    eligible: true,
    fund_name: "Ambridge University Hardship Fund",
    notes: s.previousApplications > 0
      ? "Student has one previous application. Additional evidence strongly recommended."
      : "No previous applications. Standard assessment applies.",
    typical_turnaround_days: 5,
    max_award_gbp: 1500,
    evidence_that_helps: ["Bank statements (last 3 months)", "Tenancy agreement", "Letter from employer", "Screenshot of outstanding bills"],
  });
});

app.post("/tools/submit_hardship_application", requireAuth, async (req, res) => {
  const s = req.student;
  const body = req.body;
  const caseRef = `AHF-2026-${String(Math.floor(Math.random() * 9000) + 1000)}`;
  const submittedAt = new Date().toISOString();
  const shortfall = (body.monthly_essential_outgoings || 0) - (body.monthly_income || 0);

  const row = [
    caseRef, submittedAt, s.id, s.name, s.email, s.course, `Year ${s.year}`,
    body.hardship_type || "", body.circumstances || "",
    `£${body.monthly_income || 0}`, `£${body.monthly_essential_outgoings || 0}`,
    shortfall > 0 ? `£${shortfall} shortfall` : "Balanced",
    `£${body.amount_requested || 0}`, body.supporting_details || "",
    body.has_supporting_evidence ? "Yes" : "No", "Pending Review", s.tutor,
  ];

  const written = await appendToSheet(row);

  res.json({
    success: true, case_reference: caseRef, submitted_at: submittedAt,
    student_name: s.name, amount_requested: `£${body.amount_requested}`,
    next_steps: [
      `Your application (${caseRef}) has been received by the Student Wellbeing team.`,
      "You will receive a confirmation email within 1 hour.",
      `A decision will be made within 5 working days.`,
    ],
    written_to_system: written,
  });
});

app.post("/tools/get_case_status", requireAuth, (req, res) => {
  res.json({
    case_reference: req.body.case_reference,
    status: "Pending Review",
    message: "Your application is being reviewed. You will be contacted within 5 working days.",
  });
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/", (req, res) => res.json({ service: "Ambridge University MCP", status: "ok" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`Ambridge MCP running on port ${PORT}`));
