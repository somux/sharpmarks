import React, { useState, useEffect } from "react";
import axios from "axios";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Link,
  Navigate,
  useNavigate,
  useParams,
} from "react-router-dom";

const API_BASE = "http://localhost:8080";

function pronounLabel(p) {
  return p === 1 ? "he/him" : p === 2 ? "she/her" : "they/them";
}

function App() {
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [role, setRole] = useState(localStorage.getItem("role") || "");

  const logout = () => {
    setToken("");
    setRole("");
    localStorage.clear();
  };

  if (!token) return <Login setToken={setToken} setRole={setRole} />;

  return (
    <Router>
      <nav>
        <Link to="/">Classes</Link> |{" "}
        <Link to="/students">Students</Link> |{" "}
        <button onClick={logout}>Logout</button>
      </nav>
      <Routes>
        <Route path="/" element={<Classes token={token} />} />
        <Route path="/classes/:id/assessments" element={<Assessments token={token} />} />
        <Route path="/students" element={<Students token={token} />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
}

function Login({ setToken, setRole }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post(`${API_BASE}/login`, { email, password });
      setToken(res.data.token);
      setRole(res.data.role);
      localStorage.setItem("token", res.data.token);
      localStorage.setItem("role", res.data.role);
    } catch {
      setError("Login failed. Check your credentials.");
    }
  };

  return (
    <div>
      <h2>Login</h2>
      {error && <p style={{ color: "red" }}>{error}</p>}
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        /><br />
        <input
          type="password"
          required
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        /><br />
        <button type="submit">Log In</button>
      </form>
    </div>
  );
}

function Classes({ token }) {
  const [classes, setClasses] = useState([]);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  useEffect(() => {
    axios.get(`${API_BASE}/classes`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => setClasses(res.data))
      .catch(console.error);
  }, [token]);

  const handleAddClass = async (e) => {
    e.preventDefault();
    await axios.post(`${API_BASE}/classes`,
      { name, description: desc },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    setName("");
    setDesc("");
    // Refetch classes
    axios.get(`${API_BASE}/classes`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => setClasses(res.data));
  };

  return (
    <div>
      <h2>Your Classes</h2>
      <form onSubmit={handleAddClass}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Class name" required />
        <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Description" required />
        <button type="submit">Add Class</button>
      </form>
      <ul>
        {classes.map((cls) => (
          <li key={cls.id}>
            {cls.name}{" "}
            <Link to={`/classes/${cls.id}/assessments`}>Assessments</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Students({ token }) {
  const [students, setStudents] = useState([]);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [pronouns, setPronouns] = useState(1);

  useEffect(() => {
    axios.get(`${API_BASE}/students`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => setStudents(res.data)).catch(console.error);
  }, [token]);

  const handleAddStudent = async (e) => {
    e.preventDefault();
    await axios.post(`${API_BASE}/students`,
      { first_name: firstName, last_name: lastName, pronouns: pronouns },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    setFirstName(""); setLastName(""); setPronouns(1);
    // Refetch students
    axios.get(`${API_BASE}/students`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => setStudents(res.data));
  };

  return (
    <div>
      <h2>Students</h2>
      <form onSubmit={handleAddStudent}>
        <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First Name" required />
        <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last Name" required />
        <select value={pronouns} onChange={e => setPronouns(Number(e.target.value))}>
          <option value={1}>he/him</option>
          <option value={2}>she/her</option>
          <option value={3}>they/them</option>
        </select>
        <button type="submit">Add Student</button>
      </form>
      <ul>
        {students.map(s => (
          <li key={s.id}>
            {s.first_name} {s.last_name} ({pronounLabel(s.pronouns)})
          </li>
        ))}
      </ul>
    </div>
  );
}

function Assessments({ token }) {
  const { id } = useParams();
  const [assessments, setAssessments] = useState([]);
  const [name, setName] = useState("");
  const [weight, setWeight] = useState("");

  const navigate = useNavigate();
  useEffect(() => {
    axios.get(`${API_BASE}/classes/${id}/assessments`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => setAssessments(res.data))
      .catch(() => { alert("Access denied"); navigate("/"); });
  }, [id, token, navigate]);

  const handleAddAssessment = async (e) => {
    e.preventDefault();
    await axios.post(`${API_BASE}/classes/${id}/assessments`,
      { name, weight: Number(weight) },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    setName("");
    setWeight("");
    axios.get(`${API_BASE}/classes/${id}/assessments`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => setAssessments(res.data));
  };

  return (
    <div>
      <h2>Assessments for Class {id}</h2>
      <form onSubmit={handleAddAssessment}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Assignment name" required />
        <input value={weight} onChange={e => setWeight(e.target.value)} placeholder="Weight" required type="number" min={1} />
        <button type="submit">Add Assessment</button>
      </form>
      <ul>
        {assessments.map(a => (
          <li key={a.id}>
            {a.name} - Weight: {a.weight}
          </li>
        ))}
      </ul>
      <button onClick={() => navigate("/")}>Back to Classes</button>
    </div>
  );
}

export default App;
