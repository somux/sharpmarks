// server.js
require('dotenv').config();

const express = require('express');
const app = express();

const pool = require('./db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

app.use(express.json());

// Middleware to authenticate JWT token for protected routes
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Format: "Bearer TOKEN"

  if (!token) {
    console.error("No token received.");
    return res.sendStatus(401); // Unauthorized if no token
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      console.error("JWT verify error:", err.message);
      return res.sendStatus(403); // Forbidden if invalid token
    }
    req.user = user;
    next();
  });
}

// Middleware to authorize roles for access control
function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Access forbidden: insufficient rights' });
    }
    next();
  };
}

// Root route
app.get('/', (req, res) => {
  res.send('Sharpmarks backend is running!');
});

// Test DB connection
app.get('/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.send(result.rows[0]);
  } catch (err) {
    res.status(500).send('DB Error: ' + err.message);
  }
});

// User registration route (you may want to restrict this in production)
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

// Login route - issues JWT
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

    res.json({
      message: 'Login successful',
      role: user.role,
      userId: user.id,
      token: token
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get profile (example protected route)
app.get('/profile', authenticateToken, (req, res) => {
  res.json({ message: 'This is a protected route!', user: req.user });
});


// --- Classes Routes --- //

// Get classes accessible to the user based on role
app.get('/classes', authenticateToken, async (req, res) => {
  try {
    const { role, userId } = req.user;
    let query, params;

    if (role === 'admin') {
      // Admin sees all classes
      query = 'SELECT * FROM classes';
      params = [];
    } else if (role === 'teacher') {
      // Teacher sees only their classes
      query = 'SELECT * FROM classes WHERE teacher_id = $1';
      params = [userId];
    } else if (role === 'student') {
      // Student sees classes they are enrolled in via enrollment table
      // Assuming you have an 'enrollments' table: student_id, class_id
      query = `
        SELECT c.* 
        FROM classes c
        INNER JOIN enrollments e ON c.id = e.class_id
        WHERE e.student_id = $1
      `;
      params = [userId];
    } else {
      return res.status(403).json({ message: 'Role does not have access to classes' });
    }

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create class (teacher/admin only)
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

// --- Assessments Routes --- //

// Get assessments for a class (if user has access)
app.get('/classes/:classId/assessments', authenticateToken, async (req, res) => {
  const { role, userId } = req.user;
  const { classId } = req.params;

  try {
    // Access check:
    if (role === 'teacher') {
      const classCheck = await pool.query(
        'SELECT * FROM classes WHERE id = $1 AND teacher_id = $2',
        [classId, userId]
      );
      if (classCheck.rows.length === 0) {
        return res.status(403).json({ message: "Access denied to this class's assessments" });
      }
    } else if (role === 'student') {
      const enrollmentCheck = await pool.query(
        'SELECT * FROM enrollments WHERE class_id = $1 AND student_id = $2',
        [classId, userId]
      );
      if (enrollmentCheck.rows.length === 0) {
        return res.status(403).json({ message: "Access denied to this class's assessments" });
      }
    }
    // Admin has access to all, no check needed

    const assessments = await pool.query('SELECT * FROM assessments WHERE class_id = $1', [classId]);
    res.json(assessments.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create assessment (teacher/admin only)
app.post('/classes/:classId/assessments', authenticateToken, authorizeRoles('teacher', 'admin'), async (req, res) => {
  const { classId } = req.params;
  const { name, weight } = req.body;
  const { role, userId } = req.user;

  try {
    // Teacher can only add assessment to their own classes
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


// --- Marks Routes --- //

// Add marks for a student assessment (teacher/admin only)
app.post('/assessments/:assessmentId/marks', authenticateToken, authorizeRoles('teacher', 'admin'), async (req, res) => {
  const { assessmentId } = req.params;
  const { student_id, knowledge_and_understanding_received, knowledge_and_understanding_out_of,
          thinking_and_inquiry_received, thinking_and_inquiry_out_of,
          application_received, application_out_of,
          communication_received, communication_out_of } = req.body;
  const { role, userId } = req.user;

  try {
    // Teacher can only add marks if assessment belongs to their class
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

    // Insert or update marks: here simplified as insert only (you may want UPSERT)
    const result = await pool.query(`
      INSERT INTO marks (
        assessment_id, student_id,
        knowledge_and_understanding_received, knowledge_and_understanding_out_of,
        thinking_and_inquiry_received, thinking_and_inquiry_out_of,
        application_received, application_out_of,
        communication_received, communication_out_of
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
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

// Get marks for a student in an assessment (student can see their own marks, teacher/admin can see all)
app.get('/assessments/:assessmentId/marks', authenticateToken, async (req, res) => {
  const { assessmentId } = req.params;
  const { role, userId } = req.user;

  try {
    let result;

    if (role === 'student') {
      // Student can see only their marks
      result = await pool.query(`
        SELECT * FROM marks WHERE assessment_id = $1 AND student_id = $2
      `, [assessmentId, userId]);
    } else if (role === 'teacher') {
      // Teacher can see marks only if assessment belongs to their class
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
      // Admin can see all marks
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
