import express from "express";
import crypto from "crypto";
import { google } from "googleapis";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// ── Demo student (always Sam Archer for demo purposes) ────────────────────────
const DEMO_STUDENT = {
  id: "STU-2024-0042",
  name: "Sam Archer",
  course: "BSc Agricultural Science",
  year: 2,
  email: "s.archer@ambridge.ac.uk",
  phone: "07700 900142",
  tutor: "Dr Helen Aldridge",
  previousApplications: 0,
};

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

// ── OpenAPI schema ─────────────────────────────────────────────────────────────
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
      summary: Get the current student's profile and enrolment details
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

// ── Tool endpoints (no auth required for demo) ─────────────────────────────────
app.post("/tools/get_student_profile", (req, res) => {
  const s = DEMO_STUDENT;
  res.json({
    student_id: s.id,
    full_name: s.name,
    email: s.email,
    course: s.course,
    year_of_study: s.year,
    personal_tutor: s.tutor,
    previous_hardship_applications: s.previousApplications,
    enrolled: true,
    hardship_fund_available: true,
    max_emergency_award: 1500,
  });
});

app.post("/tools/check_hardship_eligibility", (req, res) => {
  res.json({
    eligible: true,
    fund_name: "Ambridge University Hardship Fund",
    notes: "No previous applications. Standard assessment applies.",
    typical_turnaround_days: 5,
    max_award_gbp: 1500,
    evidence_that_helps: [
      "Bank statements (last 3 months)",
      "Tenancy agreement or rent demand",
      "Letter from employer confirming income change",
      "Screenshot of outstanding bills",
    ],
  });
});

app.post("/tools/submit_hardship_application", async (req, res) => {
  const s = DEMO_STUDENT;
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
  console.log("Case submitted:", caseRef, "written to sheet:", written);

  res.json({
    success: true,
    case_reference: caseRef,
    submitted_at: submittedAt,
    student_name: s.name,
    amount_requested: `£${body.amount_requested}`,
    next_steps: [
      `Your application (${caseRef}) has been received by the Student Wellbeing team.`,
      "You will receive a confirmation email within 1 hour.",
      "A decision will be made within 5 working days.",
    ],
    written_to_system: written,
  });
});

app.post("/tools/get_case_status", (req, res) => {
  res.json({
    case_reference: req.body.case_reference,
    status: "Pending Review",
    message: "Your application is being reviewed. You will be contacted within 5 working days.",
  });
});

// ── Health check ───────────────────────────────────────────────────────────────
app.get("/", (req, res) => res.json({ service: "Ambridge University MCP", status: "ok" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`Ambridge MCP running on port ${PORT}`));
