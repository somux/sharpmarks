// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors({
  origin: 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true,
}));

const pool = require('./db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
app.use(express.json());

// Auth middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Access forbidden: insufficient rights' });
    }
    next();
  };
}

// Routes for user account
app.post('/register', async (req, res) => {
  const { email, password, role } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO users (email, password, role) VALUES ($1, $2, $3)',
      [email, hashedPassword, role]
    );
    res.status(201).json({ message: 'User registered!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: 'Invalid credentials' });
    const token = jwt.sign(
      { userId: user.id, role: user.role, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    res.json({ message: 'Login successful', role: user.role, userId: user.id, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Students ---
app.post('/students', authenticateToken, authorizeRoles('teacher', 'admin'), async (req, res) => {
  const { first_name, last_name, pronouns } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO students (first_name, last_name, pronouns) VALUES ($1, $2, $3) RETURNING *',
      [first_name, last_name, pronouns]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get('/students', authenticateToken, authorizeRoles('teacher', 'admin'), async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM students');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Classes ---
app.get('/classes', authenticateToken, async (req, res) => {
  try {
    const { role, userId } = req.user;
    let query, params;
    if (role === 'admin') {
      query = 'SELECT * FROM classes'; params = [];
    } else if (role === 'teacher') {
      query = 'SELECT * FROM classes WHERE teacher_id = $1'; params = [userId];
    } else {
      return res.status(403).json({ message: 'Role does not have access to classes' });
    }
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post('/classes', authenticateToken, authorizeRoles('teacher', 'admin'), async (req, res) => {
  const { name, description } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO classes (name, description, teacher_id) VALUES ($1, $2, $3) RETURNING *',
      [name, description, req.user.userId]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Assessments ---
app.get('/classes/:classId/assessments', authenticateToken, async (req, res) => {
  const { role, userId } = req.user;
  const { classId } = req.params;
  try {
    if (role === 'teacher') {
      const classCheck = await pool.query(
        'SELECT * FROM classes WHERE id = $1 AND teacher_id = $2',
        [classId, userId]
      );
      if (classCheck.rows.length === 0) {
        return res.status(403).json({ message: "Access denied to this class's assessments" });
      }
    }
    const assessments = await pool.query('SELECT * FROM assessments WHERE class_id = $1', [classId]);
    res.json(assessments.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post('/classes/:classId/assessments', authenticateToken, authorizeRoles('teacher', 'admin'), async (req, res) => {
  const { classId } = req.params;
  const { name, weight } = req.body;
  const { role, userId } = req.user;
  try {
    if (role === 'teacher') {
      const classCheck = await pool.query('SELECT * FROM classes WHERE id = $1 AND teacher_id = $2', [classId, userId]);
      if (classCheck.rows.length === 0) {
        return res.status(403).json({ message: 'You do not have access to add assessments to this class' });
      }
    }
    const result = await pool.query(
      'INSERT INTO assessments (class_id, name, weight) VALUES ($1, $2, $3) RETURNING *',
      [classId, name, weight]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Marks ---
app.post('/assessments/:assessmentId/marks', authenticateToken, authorizeRoles('teacher', 'admin'), async (req, res) => {
  const { assessmentId } = req.params;
  const {
    student_id,
    knowledge_and_understanding_received, knowledge_and_understanding_out_of,
    thinking_and_inquiry_received, thinking_and_inquiry_out_of,
    application_received, application_out_of,
    communication_received, communication_out_of
  } = req.body;
  const { role, userId } = req.user;

  try {
    if (role === 'teacher') {
      const assessmentCheck = await pool.query(`
        SELECT a.* FROM assessments a
        JOIN classes c ON a.class_id = c.id
        WHERE a.id = $1 AND c.teacher_id = $2
      `, [assessmentId, userId]);
      if (assessmentCheck.rows.length === 0) {
        return res.status(403).json({ message: 'You do not have access to add marks for this assessment' });
      }
    }
    // Upsert marks
    const upsertQuery = `
      INSERT INTO marks (
        assessment_id, student_id,
        knowledge_and_understanding_received, knowledge_and_understanding_out_of,
        thinking_and_inquiry_received, thinking_and_inquiry_out_of,
        application_received, application_out_of,
        communication_received, communication_out_of
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (assessment_id, student_id)
      DO UPDATE SET
        knowledge_and_understanding_received = EXCLUDED.knowledge_and_understanding_received,
        knowledge_and_understanding_out_of = EXCLUDED.knowledge_and_understanding_out_of,
        thinking_and_inquiry_received = EXCLUDED.thinking_and_inquiry_received,
        thinking_and_inquiry_out_of = EXCLUDED.thinking_and_inquiry_out_of,
        application_received = EXCLUDED.application_received,
        application_out_of = EXCLUDED.application_out_of,
        communication_received = EXCLUDED.communication_received,
        communication_out_of = EXCLUDED.communication_out_of
      RETURNING *;
    `;
    const result = await pool.query(upsertQuery, [
      assessmentId, student_id,
      knowledge_and_understanding_received, knowledge_and_understanding_out_of,
      thinking_and_inquiry_received, thinking_and_inquiry_out_of,
      application_received, application_out_of,
      communication_received, communication_out_of
    ]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get('/assessments/:assessmentId/marks', authenticateToken, async (req, res) => {
  const { assessmentId } = req.params;
  const { role, userId } = req.user;
  try {
    let result;
    if (role === 'teacher') {
      const assessmentCheck = await pool.query(`
        SELECT a.* FROM assessments a
        JOIN classes c ON a.class_id = c.id
        WHERE a.id = $1 AND c.teacher_id = $2
      `, [assessmentId, userId]);
      if (assessmentCheck.rows.length === 0) {
        return res.status(403).json({ message: 'You do not have access to view marks for this assessment' });
      }
      result = await pool.query('SELECT * FROM marks WHERE assessment_id=$1', [assessmentId]);
    } else if (role === 'admin') {
      result = await pool.query('SELECT * FROM marks WHERE assessment_id=$1', [assessmentId]);
    } else {
      return res.status(403).json({ message: 'Access denied' });
    }
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
