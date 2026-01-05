import express from "express";
import cors from "cors";
import pg from "pg";
import jwt from "jsonwebtoken";
import { Resend } from "resend";
import rateLimit from "express-rate-limit";

const app = express();
const PORT = process.env.PORT || 3007;

// Trust proxy (Nginx) pour que express-rate-limit identifie correctement les IPs
app.set("trust proxy", 2);

app.use(cors());
app.use(express.json());

// Rate limiting - general (100 requests per 15 min)
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: "Trop de requêtes, veuillez réessayer plus tard" },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting - strict for registration (5 per 15 min per IP)
const registrationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    error: "Trop de tentatives d'inscription, veuillez réessayer plus tard",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting - for results submission (10 per 15 min per IP)
const resultsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Trop de soumissions, veuillez réessayer plus tard" },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(generalLimiter);

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // Max connections per backend instance
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

const resend = new Resend(process.env.RESEND_API_KEY);

// Admin config
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const JWT_SECRET = process.env.JWT_SECRET || "change-this-secret";

// Auth middleware for admin routes
function authenticateAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token required" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded.isAdmin) {
      return res.status(403).json({ error: "Admin access required" });
    }
    req.admin = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// Admin login
app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body;

  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = jwt.sign({ isAdmin: true, username }, JWT_SECRET, {
    expiresIn: "24h",
  });

  res.json({ token });
});

// Get all results (admin) - grouped by email
app.get("/api/admin/results", authenticateAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const countResult = await pool.query(
      "SELECT COUNT(DISTINCT u.email) FROM quiz_results qr JOIN users u ON qr.user_id = u.id"
    );
    const total = parseInt(countResult.rows[0].count);

    const results = await pool.query(
      `SELECT
        u.email,
        MAX(u.firstname) as firstname,
        COUNT(*) as attempts,
        MAX(qr.score) as best_score,
        MAX(qr.total_questions) as total_questions,
        ROUND(AVG(qr.score)::numeric, 1) as avg_score,
        MAX(qr.completed_at) as last_attempt
      FROM quiz_results qr
      JOIN users u ON qr.user_id = u.id
      GROUP BY u.email
      ORDER BY last_attempt DESC
      LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    res.json({
      results: results.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching results:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Export results as CSV (admin) - grouped by email
app.get("/api/admin/results/export", authenticateAdmin, async (req, res) => {
  try {
    const results = await pool.query(
      `SELECT
        u.email,
        MAX(u.firstname) as firstname,
        COUNT(*) as attempts,
        MAX(qr.score) as best_score,
        MAX(qr.total_questions) as total_questions,
        ROUND(AVG(qr.score)::numeric, 1) as avg_score,
        ROUND((MAX(qr.score)::numeric / MAX(qr.total_questions)) * 100, 1) as best_percentage,
        MAX(qr.completed_at) as last_attempt
      FROM quiz_results qr
      JOIN users u ON qr.user_id = u.id
      GROUP BY u.email
      ORDER BY last_attempt DESC`
    );

    const csv = [
      "Prénom,Email,Tentatives,Meilleur Score,Total Questions,Score Moyen,Meilleur %,Dernière Tentative",
      ...results.rows.map(
        (r) =>
          `"${r.firstname}","${r.email}",${r.attempts},${r.best_score},${r.total_questions},${r.avg_score},${r.best_percentage}%,"${r.last_attempt}"`
      ),
    ].join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=quiz-results.csv"
    );
    res.send("\uFEFF" + csv); // BOM for Excel UTF-8
  } catch (error) {
    console.error("Error exporting results:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete old results (admin)
app.delete("/api/admin/results/old", authenticateAdmin, async (req, res) => {
  const client = await pool.connect();

  try {
    const days = parseInt(req.query.days) || 30;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    await client.query("BEGIN");

    // Get quiz_result IDs to delete
    const resultsToDelete = await client.query(
      "SELECT id FROM quiz_results WHERE completed_at < $1",
      [cutoffDate]
    );
    const ids = resultsToDelete.rows.map((r) => r.id);

    if (ids.length === 0) {
      await client.query("ROLLBACK");
      return res.json({ deleted: 0, message: "No old results to delete" });
    }

    // Delete answers first (foreign key)
    await client.query("DELETE FROM answers WHERE quiz_result_id = ANY($1)", [
      ids,
    ]);

    // Delete quiz results
    const deleteResult = await client.query(
      "DELETE FROM quiz_results WHERE id = ANY($1)",
      [ids]
    );

    // Delete orphan users (users with no quiz results)
    await client.query(
      `DELETE FROM users WHERE id NOT IN (SELECT DISTINCT user_id FROM quiz_results)`
    );

    await client.query("COMMIT");

    res.json({
      deleted: deleteResult.rowCount,
      message: `Deleted ${deleteResult.rowCount} results older than ${days} days`,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error deleting old results:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
});

// Delete ALL results (admin)
app.delete("/api/admin/results/all", authenticateAdmin, async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Delete all answers
    await client.query("DELETE FROM answers");

    // Delete all quiz results
    const deleteResult = await client.query("DELETE FROM quiz_results");

    // Delete all users
    await client.query("DELETE FROM users");

    await client.query("COMMIT");

    res.json({
      deleted: deleteResult.rowCount,
      message: `${deleteResult.rowCount} résultat(s) supprimé(s)`,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error deleting all results:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
});

// Create user (with honeypot check and rate limiting)
app.post("/api/users", registrationLimiter, async (req, res) => {
  try {
    const { firstname, email, website } = req.body;

    // Honeypot check - if 'website' field is filled, it's a bot
    if (website) {
      // Silently reject but return success to confuse bots
      return res.status(201).json({ id: 0, firstname, email });
    }

    if (!firstname || !email) {
      return res
        .status(400)
        .json({ error: "Firstname and email are required" });
    }

    const result = await pool.query(
      "INSERT INTO users (firstname, email) VALUES ($1, $2) RETURNING id, firstname, email",
      [firstname, email]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error creating user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Save quiz results and send email (with rate limiting)
app.post("/api/results", resultsLimiter, async (req, res) => {
  const client = await pool.connect();

  try {
    const { userId, score, totalQuestions, answers } = req.body;

    if (!userId || score === undefined || !totalQuestions || !answers) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    await client.query("BEGIN");

    // Insert quiz result
    const resultQuery = await client.query(
      "INSERT INTO quiz_results (user_id, score, total_questions) VALUES ($1, $2, $3) RETURNING id",
      [userId, score, totalQuestions]
    );
    const quizResultId = resultQuery.rows[0].id;

    // Insert each answer
    for (const answer of answers) {
      await client.query(
        `INSERT INTO answers (quiz_result_id, question_index, question_text, user_answer, correct_answer, is_correct, time_spent_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          quizResultId,
          answer.questionIndex,
          answer.questionText,
          answer.userAnswer,
          answer.correctAnswer,
          answer.isCorrect,
          answer.timeSpentMs,
        ]
      );
    }

    await client.query("COMMIT");

    // Get user info for email
    const userQuery = await pool.query(
      "SELECT firstname, email FROM users WHERE id = $1",
      [userId]
    );
    const user = userQuery.rows[0];

    // Send email with results
    await sendResultEmail(user, score, totalQuestions, answers);

    res.status(201).json({
      message: "Results saved and email sent",
      quizResultId,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error saving results:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
});

async function sendResultEmail(user, score, totalQuestions, answers) {
  const percentage = Math.round((score / totalQuestions) * 100);

  const answersHtml = answers
    .map(
      (a, i) => `
      <tr style="background-color: ${a.isCorrect ? "#d4edda" : "#f8d7da"}">
        <td style="padding: 8px; border: 1px solid #ddd;">${i + 1}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${a.questionText}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${a.userAnswer}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${
          a.correctAnswer
        }</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${
          a.isCorrect ? "Correct" : "Incorrect"
        }</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${(
          a.timeSpentMs / 1000
        ).toFixed(1)}s</td>
      </tr>
    `
    )
    .join("");

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
      <h1 style="color: #1d63ed;">Résultats du Quiz App</h1>
      <p>Bonjour ${user.firstname},</p>
      <p>Voici vos résultats au quiz Docker :</p>

      <div style="background-color: #e5f2fc; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h2 style="margin: 0; color: #1d63ed;">Score : ${score}/${totalQuestions} (${percentage}%)</h2>
      </div>

      <h3>Détail des réponses :</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="background-color: #1d63ed; color: white;">
            <th style="padding: 8px; border: 1px solid #ddd;">#</th>
            <th style="padding: 8px; border: 1px solid #ddd;">Question</th>
            <th style="padding: 8px; border: 1px solid #ddd;">Votre réponse</th>
            <th style="padding: 8px; border: 1px solid #ddd;">Bonne réponse</th>
            <th style="padding: 8px; border: 1px solid #ddd;">Résultat</th>
            <th style="padding: 8px; border: 1px solid #ddd;">Temps</th>
          </tr>
        </thead>
        <tbody>
          ${answersHtml}
        </tbody>
      </table>

      <p style="margin-top: 20px; color: #666;">
        Merci d'avoir participé au quiz !
      </p>
    </div>
  `;

  await resend.emails.send({
    from: "Quiz App <onboarding@resend.dev>",
    to: user.email,
    subject: `Résultats Quiz App - ${score}/${totalQuestions}`,
    html,
  });
}

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
