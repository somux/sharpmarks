import React, { useState, useEffect } from "react";
import axios from "axios";
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useParams } from "react-router-dom";

const API_BASE = "http://localhost:8080";

function pronounLabel(p) {
  return p === 1 ? "he/him" : p === 2 ? "she/her" : "they/them";
}

function App() {
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  if (!token) return <Login setToken={setToken} />;
  const logout = () => { setToken(""); localStorage.clear(); };

  return (
    <Router>
      <nav>
        <Link to="/">Classes</Link> | <Link to="/students">Students</Link> | <button onClick={logout}>Logout</button>
      </nav>
      <Routes>
        <Route path="/" element={<Classes token={token} />} />
        <Route path="/students" element={<Students token={token} />} />
        <Route path="/class/:id" element={<ClassDetail token={token} />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
}

function Login({ setToken }) {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState("");
  const onSubmit = async e => {
    e.preventDefault();
    try {
      const res = await axios.post(`${API_BASE}/login`, { email, password });
      setToken(res.data.token); localStorage.setItem("token", res.data.token);
    } catch { setError("Login failed"); }
  };
  return (
    <div>
      <h2>Login</h2>{error && <p style={{ color: 'red' }}>{error}</p>}
      <form onSubmit={onSubmit}>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" required /><br />
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" required /><br />
        <button type="submit">Log In</button>
      </form>
    </div>
  );
}

function Classes({ token }) {
  const [classes, setClasses] = useState([]); const [name, setName] = useState(""); const [desc, setDesc] = useState("");
  useEffect(() => { if (!token) return;
    axios.get(`${API_BASE}/classes`, { headers: { Authorization: `Bearer ${token}` } }).then(res => setClasses(res.data)); }, [token]);
  const addClass = async e => {
    e.preventDefault(); await axios.post(`${API_BASE}/classes`, { name, description: desc }, { headers: { Authorization: `Bearer ${token}` } });
    setName(""); setDesc(""); const res = await axios.get(`${API_BASE}/classes`, { headers: { Authorization: `Bearer ${token}` } }); setClasses(res.data);
  };
  return (
    <div>
      <h2>Classes</h2>
      <form onSubmit={addClass}>
        <input placeholder="Class name" value={name} onChange={e => setName(e.target.value)} required />
        <input placeholder="Description" value={desc} onChange={e => setDesc(e.target.value)} required />
        <button type="submit">Add Class</button>
      </form>
      <ul>{classes.map(c => <li key={c.id}>{c.name} <Link to={`/class/${c.id}`}>Manage</Link></li>)}</ul>
    </div>
  );
}

function Students({ token }) {
  const [students, setStudents] = useState([]);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [pronoun, setPronoun] = useState(1);
  useEffect(() => { if (!token) return;
    axios.get(`${API_BASE}/students`, { headers: { Authorization: `Bearer ${token}` } }).then(res => setStudents(res.data)); }, [token]);
  const addStudent = async e => {
    e.preventDefault(); await axios.post(`${API_BASE}/students`, { first_name: firstName, last_name: lastName, pronouns: pronoun }, { headers: { Authorization: `Bearer ${token}` } });
    setFirstName(""); setLastName(""); setPronoun(1);
    const res = await axios.get(`${API_BASE}/students`, { headers: { Authorization: `Bearer ${token}` } }); setStudents(res.data);
  };
  return (
    <div>
      <h2>Students</h2>
      <form onSubmit={addStudent}>
        <input placeholder="First Name" value={firstName} onChange={e => setFirstName(e.target.value)} required />
        <input placeholder="Last Name" value={lastName} onChange={e => setLastName(e.target.value)} required />
        <select value={pronoun} onChange={e => setPronoun(Number(e.target.value))}>
          <option value={1}>he/him</option> <option value={2}>she/her</option> <option value={3}>they/them</option>
        </select>
        <button type="submit">Add Student</button>
      </form>
      <ul>{students.map(s => <li key={s.id}>{s.first_name} {s.last_name} ({pronounLabel(s.pronouns)})</li>)}</ul>
    </div>
  );
}

function ClassDetail({ token }) {
  const { id } = useParams();
  const [enrolled, setEnrolled] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [assessments, setAssessments] = useState([]);
  const [editingAssessment, setEditingAssessment] = useState(null);
  const [assessmentForm, setAssessmentForm] = useState({ name: "", weight: 1 });
  const [selectedAssessmentId, setSelectedAssessmentId] = useState(null);
  const [marks, setMarks] = useState({});

  useEffect(() => {
    if (!token) return;
    axios.get(`${API_BASE}/classes/${id}/students`, { headers: { Authorization: `Bearer ${token}` } }).then(res => setEnrolled(res.data));
    axios.get(`${API_BASE}/students`, { headers: { Authorization: `Bearer ${token}` } }).then(res => setAllStudents(res.data));
    axios.get(`${API_BASE}/classes/${id}/assessments`, { headers: { Authorization: `Bearer ${token}` } }).then(res => setAssessments(res.data));
  }, [id, token]);

  // Load marks and select first student when assessment selected
  useEffect(() => {
    if (selectedAssessmentId) {
      axios.get(`${API_BASE}/assessments/${selectedAssessmentId}/marks`, { headers: { Authorization: `Bearer ${token}` } }).then(res => {
        const marksMap = {};
        res.data.forEach(mark => marksMap[mark.student_id] = mark);
        setMarks(marksMap);
      });
      setSelectedStudent(enrolled[0]?.id || null);
    } else {
      setMarks({});
      setSelectedStudent(null);
    }
    // eslint-disable-next-line
  }, [selectedAssessmentId, token, enrolled.length]);

  const addStudentToClass = async () => {
    if (!selectedStudent) return;
    await axios.post(`${API_BASE}/classes/${id}/students`, { student_id: selectedStudent }, { headers: { Authorization: `Bearer ${token}` } });
    const res = await axios.get(`${API_BASE}/classes/${id}/students`, { headers: { Authorization: `Bearer ${token}` } });
    setEnrolled(res.data);
  };

  const updateAssessmentForm = (field, value) => {
    setAssessmentForm(prev => ({ ...prev, [field]: value }));
  };

  const addOrUpdateAssessment = async e => {
    e.preventDefault();
    if (editingAssessment) {
      await axios.put(`${API_BASE}/assessments/${editingAssessment.id}`, assessmentForm, { headers: { Authorization: `Bearer ${token}` } });
      setEditingAssessment(null);
    } else {
      await axios.post(`${API_BASE}/classes/${id}/assessments`, assessmentForm, { headers: { Authorization: `Bearer ${token}` } });
    }
    setAssessmentForm({ name: "", weight: 1 });
    const res = await axios.get(`${API_BASE}/classes/${id}/assessments`, { headers: { Authorization: `Bearer ${token}` } });
    setAssessments(res.data);
  };

  const editAssessmentClick = a => {
    setEditingAssessment(a);
    setAssessmentForm({ name: a.name, weight: a.weight });
  };

  const deleteAssessment = async (a) => {
    if(window.confirm("Delete this assessment (all marks for it will be deleted)?")) {
      await axios.delete(`${API_BASE}/assessments/${a.id}`, { headers: { Authorization: `Bearer ${token}` } });
      setSelectedAssessmentId(null); setSelectedStudent(null);
      const res = await axios.get(`${API_BASE}/classes/${id}/assessments`, { headers: { Authorization: `Bearer ${token}` } }); setAssessments(res.data);
    }
  };

  const updateMarkField = (studentId, field, value) => {
    setMarks(prev => ({
      ...prev,
      [studentId]: { ...prev[studentId], [field]: value }
    }));
  };

  const saveMark = async (studentId) => {
    if (!selectedAssessmentId || !marks[studentId]) return alert("Please select a student and enter marks");
    const m = marks[studentId];
    try {
      await axios.post(`${API_BASE}/assessments/${selectedAssessmentId}/marks`, {
        student_id: studentId,
        knowledge_and_understanding_received: Number(m.knowledge_and_understanding_received) || 0,
        knowledge_and_understanding_out_of: Number(m.knowledge_and_understanding_out_of) || 0,
        thinking_and_inquiry_received: Number(m.thinking_and_inquiry_received) || 0,
        thinking_and_inquiry_out_of: Number(m.thinking_and_inquiry_out_of) || 0,
        application_received: Number(m.application_received) || 0,
        application_out_of: Number(m.application_out_of) || 0,
        communication_received: Number(m.communication_received) || 0,
        communication_out_of: Number(m.communication_out_of) || 0,
      }, { headers: { Authorization: `Bearer ${token}` } });
      alert("Marks saved");
    } catch {
      alert("Error saving marks");
    }
  };

  return (
    <div>
      <h2>Manage Class</h2>
      <section>
        <h3>Students Enrolled</h3>
        <ul style={{maxHeight: 150, overflowY: 'auto', border: '1px solid #ccc', padding: 5}}>
          {enrolled.map(s => (
            <li key={s.id} onClick={() => setSelectedStudent(s.id)}
                style={{
                  cursor: 'pointer', 
                  backgroundColor: selectedStudent === s.id ? '#cce5ff' : 'transparent',
                  padding: '4px 8px',
                  margin: '2px 0',
                }}>
              {s.first_name} {s.last_name} ({pronounLabel(s.pronouns)})
            </li>
          ))}
        </ul>
        <select value={selectedStudent || ""} onChange={e => setSelectedStudent(Number(e.target.value))} hidden />
        <select value="" onChange={e => setSelectedStudent(Number(e.target.value))} style={{marginTop: 10}}>
          <option value="">Add student to class</option>
          {allStudents.filter(s => !enrolled.some(es => es.id === s.id)).map(s => (
            <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
          ))}
        </select>
        <button onClick={addStudentToClass} disabled={!selectedStudent} style={{marginLeft: 8}}>Add Student</button>
      </section>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24 }}>
        {/* Assessments list (Left) */}
        <div style={{ minWidth: 350 }}>
          <h3>Assessments</h3>
          <form onSubmit={addOrUpdateAssessment}>
            <input placeholder="Name" value={assessmentForm.name} onChange={e => updateAssessmentForm("name", e.target.value)} required />
            <input type="number" min={1} placeholder="Weight" value={assessmentForm.weight} onChange={e => updateAssessmentForm("weight", e.target.value)} required />
            <button type="submit">{editingAssessment ? "Save" : "Add"}</button>
            {editingAssessment && <button type="button" onClick={() => { setEditingAssessment(null); setAssessmentForm({ name: "", weight: 1 }); }}>Cancel</button>}
          </form>
          <ul>
            {assessments.map(a => (
              <li key={a.id} style={{ margin: "8px 0" }}>
                <span>{a.name} (Weight: {a.weight})</span>
                <button onClick={() => editAssessmentClick(a)} style={{ marginLeft: 10 }}>Edit</button>
                <button onClick={() => setSelectedAssessmentId(selectedAssessmentId === a.id ? null : a.id)} style={{ marginLeft: 10 }}>
                  {selectedAssessmentId === a.id ? "Deselect" : "Select"}
                </button>
                <button onClick={() => deleteAssessment(a)} style={{ marginLeft: 10, color: "red" }}>Delete</button>
              </li>
            ))}
          </ul>
        </div>
        {/* Marks entry panel (Right) */}
        {selectedAssessmentId && (
          <div style={{ border: "1px solid #ccc", padding: 18, minWidth: 400 }}>
            <h3>Enter/Edit Marks</h3>
            <div style={{ display: "flex" }}>
              <div style={{ maxHeight: 220, overflowY: "auto", minWidth: 200, borderRight: "1px solid #eee", paddingRight: 8 }}>
                <h4>Students</h4>
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {enrolled.map(s => (
                    <li key={s.id} style={{
                          cursor: "pointer",
                          background: selectedStudent === s.id ? "#cce5ff" : 'transparent',
                          padding: "4px 8px",
                          margin: "2px 0",
                        }}
                        onClick={() => setSelectedStudent(s.id)}>
                      {s.first_name} {s.last_name}
                    </li>
                  ))}
                </ul>
              </div>
              <div style={{ flexGrow: 1, paddingLeft: 18 }}>
                {selectedStudent ? (
                  <table>
                    <tbody>
                      {[
                        ["Knowledge & Understanding Received", "knowledge_and_understanding_received"],
                        ["Knowledge & Understanding Out Of", "knowledge_and_understanding_out_of"],
                        ["Thinking & Inquiry Received", "thinking_and_inquiry_received"],
                        ["Thinking & Inquiry Out Of", "thinking_and_inquiry_out_of"],
                        ["Application Received", "application_received"],
                        ["Application Out Of", "application_out_of"],
                        ["Communication Received", "communication_received"],
                        ["Communication Out Of", "communication_out_of"],
                      ].map(([label, field]) => (
                        <tr key={field}>
                          <td style={{padding:2}}>{label}:</td>
                          <td style={{padding:2}}>
                            <input
                              type="number"
                              value={marks[selectedStudent]?.[field] ?? ''}
                              onChange={e =>
                                setMarks(m => ({
                                  ...m,
                                  [selectedStudent]: { ...m[selectedStudent], [field]: e.target.value },
                                }))
                              }
                            />
                          </td>
                        </tr>
                      ))}
                      <tr>
                        <td colSpan={2}>
                          <button onClick={() => saveMark(selectedStudent)}>Save Marks</button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                ) : (
                  <div style={{marginLeft:10}}>Select a student to enter marks.</div>
                )}
                <div style={{marginTop:18}}>
                  <button style={{color: "red"}} onClick={() => { setSelectedAssessmentId(null); setSelectedStudent(null); }}>Close Assessment</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
export default App;
