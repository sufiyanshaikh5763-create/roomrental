const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
const path = require("path");
const crypto = require("crypto");

function hashPassword(password, salt) {
  return crypto.createHmac("sha256", salt).update(password).digest("hex");
}
function generateSalt() { return crypto.randomBytes(16).toString("hex"); }
function genRoomId() { return "_" + Math.random().toString(36).slice(2, 11); }

const sessions = new Map();
const app = express();
const PORT = process.env.PORT || 4000;

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "rentflow",
  password: process.env.DB_PASS || "rentflow123",
  database: process.env.DB_NAME || "rentflow",
  waitForConnections: true, connectionLimit: 10, queueLimit: 0
});

async function initDb() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`CREATE TABLE IF NOT EXISTS users (id INT AUTO_INCREMENT PRIMARY KEY, username VARCHAR(50) NOT NULL UNIQUE, hostel_name VARCHAR(100) NOT NULL DEFAULT "My Hostel", password_hash VARCHAR(64) NOT NULL, salt VARCHAR(32) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await conn.query(`CREATE TABLE IF NOT EXISTS rooms (id VARCHAR(10) NOT NULL, owner_id INT NOT NULL, number VARCHAR(10) NOT NULL, capacity INT NOT NULL, occupancy INT NOT NULL, rent INT NOT NULL, status VARCHAR(20) NOT NULL, PRIMARY KEY (id), UNIQUE KEY uq_room_owner (owner_id, number), FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE)`);
    await conn.query(`CREATE TABLE IF NOT EXISTS tenants (id INT AUTO_INCREMENT PRIMARY KEY, owner_id INT NOT NULL, name VARCHAR(100) NOT NULL, phone VARCHAR(30) NOT NULL, roomId VARCHAR(10) NOT NULL, joinDate DATE NOT NULL, rent DECIMAL(10,2) NOT NULL, FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (roomId) REFERENCES rooms(id) ON DELETE RESTRICT)`);
    await conn.query(`CREATE TABLE IF NOT EXISTS payments (id INT AUTO_INCREMENT PRIMARY KEY, owner_id INT NOT NULL, tenantId INT NOT NULL, amount DECIMAL(10,2) NOT NULL, paymentDate DATE NOT NULL, nextDate DATE NOT NULL, method VARCHAR(50) NOT NULL, status VARCHAR(20) NOT NULL, FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE)`);
  } finally { conn.release(); }
}

function roomStatus(room) { return room.occupancy >= room.capacity ? "Full" : "Available"; }

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

function requireAuth(req, res, next) {
  const token = req.headers["x-session-token"];
  const session = sessions.get(token);
  if (!session) return res.status(401).json({ message: "Not authenticated" });
  req.user = session;
  next();
}

// REGISTER
app.post("/api/register", async (req, res) => {
  const { username, password, hostel_name } = req.body;
  if (!username || !password) return res.status(400).json({ success: false, message: "Username and password required" });
  try {
    const [existing] = await pool.query("SELECT id FROM users WHERE username = ?", [username]);
    if (existing.length) return res.status(400).json({ success: false, message: "Username already taken" });
    const salt = generateSalt();
    const hash = hashPassword(password, salt);
    const name = hostel_name || (username + "'s Hostel");
    const [result] = await pool.query("INSERT INTO users (username, hostel_name, password_hash, salt) VALUES (?, ?, ?, ?)", [username, name, hash, salt]);
    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(token, { id: result.insertId, username, hostel_name: name });
    res.status(201).json({ success: true, token, username, hostel_name: name });
  } catch (e) { console.error(e); res.status(500).json({ success: false, message: "Registration failed" }); }
});

// LOGIN
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ success: false, message: "Missing credentials" });
  try {
    const [rows] = await pool.query("SELECT * FROM users WHERE username = ?", [username]);
    if (!rows.length) return res.status(401).json({ success: false, message: "Invalid credentials" });
    const user = rows[0];
    if (hashPassword(password, user.salt) !== user.password_hash) return res.status(401).json({ success: false, message: "Invalid credentials" });
    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(token, { id: user.id, username: user.username, hostel_name: user.hostel_name });
    res.json({ success: true, token, username: user.username, hostel_name: user.hostel_name });
  } catch (e) { console.error(e); res.status(500).json({ success: false, message: "Login failed" }); }
});

app.post("/api/logout", (req, res) => {
  const token = req.headers["x-session-token"];
  if (token) sessions.delete(token);
  res.json({ success: true });
});

app.get("/api/me", requireAuth, (req, res) => {
  res.json({ username: req.user.username, hostel_name: req.user.hostel_name });
});

// ROOMS
app.get("/api/rooms", requireAuth, async (req, res) => {
  try { const [rows] = await pool.query("SELECT * FROM rooms WHERE owner_id = ?", [req.user.id]); res.json(rows); }
  catch (e) { res.status(500).json({ message: "Failed to fetch rooms" }); }
});

app.post("/api/rooms", requireAuth, async (req, res) => {
  const { number, capacity, occupancy, rent } = req.body;
  if (!number || capacity == null || occupancy == null || rent == null) return res.status(400).json({ message: "Missing fields" });
  try {
    const [existing] = await pool.query("SELECT id FROM rooms WHERE owner_id = ? AND number = ?", [req.user.id, number]);
    if (existing.length) return res.status(400).json({ message: "Room number already exists" });
    const status = occupancy >= capacity ? "Full" : "Available";
    const id = genRoomId();
    await pool.query("INSERT INTO rooms (id, owner_id, number, capacity, occupancy, rent, status) VALUES (?, ?, ?, ?, ?, ?, ?)", [id, req.user.id, number, capacity, occupancy, rent, status]);
    res.status(201).json({ id, number, capacity, occupancy, rent, status });
  } catch (e) { console.error(e); res.status(500).json({ message: "Failed to create room" }); }
});

app.put("/api/rooms/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  const { number, capacity, occupancy, rent } = req.body;
  try {
    const [rows] = await pool.query("SELECT * FROM rooms WHERE id = ? AND owner_id = ?", [id, req.user.id]);
    if (!rows.length) return res.status(404).json({ message: "Room not found" });
    const r = rows[0];
    const nc = capacity ?? r.capacity, no = occupancy ?? r.occupancy, nr = rent ?? r.rent, nn = number ?? r.number;
    const status = roomStatus({ capacity: nc, occupancy: no });
    await pool.query("UPDATE rooms SET number=?, capacity=?, occupancy=?, rent=?, status=? WHERE id=? AND owner_id=?", [nn, nc, no, nr, status, id, req.user.id]);
    res.json({ id, number: nn, capacity: nc, occupancy: no, rent: nr, status });
  } catch (e) { res.status(500).json({ message: "Failed to update room" }); }
});

app.delete("/api/rooms/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const [t] = await pool.query("SELECT COUNT(*) AS cnt FROM tenants WHERE roomId = ? AND owner_id = ?", [id, req.user.id]);
    if (t[0].cnt > 0) return res.status(400).json({ message: "Remove tenants from this room first" });
    await pool.query("DELETE FROM rooms WHERE id = ? AND owner_id = ?", [id, req.user.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ message: "Failed to delete room" }); }
});

// TENANTS
app.get("/api/tenants", requireAuth, async (req, res) => {
  try { const [rows] = await pool.query("SELECT * FROM tenants WHERE owner_id = ?", [req.user.id]); res.json(rows); }
  catch (e) { res.status(500).json({ message: "Failed to fetch tenants" }); }
});

app.post("/api/tenants", requireAuth, async (req, res) => {
  const { name, phone, roomId, joinDate, rent } = req.body;
  if (!name || !phone || !roomId || !joinDate || rent == null) return res.status(400).json({ message: "Missing fields" });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rr] = await conn.query("SELECT * FROM rooms WHERE id = ? AND owner_id = ?", [roomId, req.user.id]);
    if (!rr.length) { await conn.rollback(); conn.release(); return res.status(400).json({ message: "Room not found" }); }
    if (rr[0].occupancy >= rr[0].capacity) { await conn.rollback(); conn.release(); return res.status(400).json({ message: "Room is already full" }); }
    const [result] = await conn.query("INSERT INTO tenants (owner_id, name, phone, roomId, joinDate, rent) VALUES (?, ?, ?, ?, ?, ?)", [req.user.id, name, phone, roomId, joinDate, rent]);
    const occ = rr[0].occupancy + 1;
    await conn.query("UPDATE rooms SET occupancy=?, status=? WHERE id=?", [occ, roomStatus({ capacity: rr[0].capacity, occupancy: occ }), roomId]);
    await conn.commit(); conn.release();
    res.status(201).json({ id: result.insertId, name, phone, roomId, joinDate, rent });
  } catch (e) { await conn.rollback(); conn.release(); res.status(500).json({ message: "Failed to create tenant" }); }
});

app.put("/api/tenants/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  const { name, phone, roomId, joinDate, rent } = req.body;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query("SELECT * FROM tenants WHERE id=? AND owner_id=?", [id, req.user.id]);
    if (!rows.length) { await conn.rollback(); conn.release(); return res.status(404).json({ message: "Tenant not found" }); }
    const ex = rows[0];
    let newRoomId = roomId ?? ex.roomId;
    if (roomId != null && String(roomId) !== String(ex.roomId)) {
      const [or] = await conn.query("SELECT * FROM rooms WHERE id=? AND owner_id=?", [ex.roomId, req.user.id]);
      if (or.length) { const o = Math.max(0, or[0].occupancy - 1); await conn.query("UPDATE rooms SET occupancy=?, status=? WHERE id=?", [o, roomStatus({ capacity: or[0].capacity, occupancy: o }), ex.roomId]); }
      const [nr] = await conn.query("SELECT * FROM rooms WHERE id=? AND owner_id=?", [roomId, req.user.id]);
      if (!nr.length) { await conn.rollback(); conn.release(); return res.status(400).json({ message: "New room not found" }); }
      if (nr[0].occupancy >= nr[0].capacity) { await conn.rollback(); conn.release(); return res.status(400).json({ message: "New room is already full" }); }
      const o2 = nr[0].occupancy + 1;
      await conn.query("UPDATE rooms SET occupancy=?, status=? WHERE id=?", [o2, roomStatus({ capacity: nr[0].capacity, occupancy: o2 }), roomId]);
    }
    await conn.query("UPDATE tenants SET name=?, phone=?, roomId=?, joinDate=?, rent=? WHERE id=? AND owner_id=?", [name ?? ex.name, phone ?? ex.phone, newRoomId, joinDate ?? ex.joinDate, rent ?? ex.rent, id, req.user.id]);
    await conn.commit(); conn.release();
    res.json({ id: Number(id), name: name ?? ex.name, phone: phone ?? ex.phone, roomId: newRoomId, joinDate: joinDate ?? ex.joinDate, rent: rent ?? ex.rent });
  } catch (e) { await conn.rollback(); conn.release(); res.status(500).json({ message: "Failed to update tenant" }); }
});

app.delete("/api/tenants/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query("SELECT * FROM tenants WHERE id=? AND owner_id=?", [id, req.user.id]);
    if (!rows.length) { await conn.rollback(); conn.release(); return res.status(404).json({ message: "Tenant not found" }); }
    const t = rows[0];
    const [rr] = await conn.query("SELECT * FROM rooms WHERE id=?", [t.roomId]);
    if (rr.length) { const o = Math.max(0, rr[0].occupancy - 1); await conn.query("UPDATE rooms SET occupancy=?, status=? WHERE id=?", [o, roomStatus({ capacity: rr[0].capacity, occupancy: o }), t.roomId]); }
    await conn.query("DELETE FROM payments WHERE tenantId=? AND owner_id=?", [id, req.user.id]);
    await conn.query("DELETE FROM tenants WHERE id=? AND owner_id=?", [id, req.user.id]);
    await conn.commit(); conn.release();
    res.json({ success: true });
  } catch (e) { await conn.rollback(); conn.release(); res.status(500).json({ message: "Failed to delete tenant" }); }
});

// PAYMENTS
app.get("/api/payments", requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT id, tenantId, amount, paymentDate AS date, nextDate AS nextDue, method, status FROM payments WHERE owner_id = ?", [req.user.id]);
    res.json(rows.map(p => ({ ...p, method: p.method ?? "—", status: p.status ?? "Pending" })));
  } catch (e) { res.status(500).json({ message: "Failed to fetch payments" }); }
});

app.post("/api/payments", requireAuth, async (req, res) => {
  const { tenantId, amount, date, method, status, nextDue: bodyNextDue } = req.body;
  if (!tenantId || amount == null || !date || !method) return res.status(400).json({ message: "Missing fields" });
  const [tRows] = await pool.query("SELECT id FROM tenants WHERE id=? AND owner_id=?", [tenantId, req.user.id]);
  if (!tRows.length) return res.status(403).json({ message: "Tenant not found" });
  const payStatus = ["Paid","Pending","Late"].includes(status) ? status : "Paid";
  try {
    let fmtNext = bodyNextDue;
    if (!fmtNext) { const d = new Date(date); d.setMonth(d.getMonth() + 1); fmtNext = d.toISOString().split("T")[0]; }
    const [result] = await pool.query("INSERT INTO payments (owner_id, tenantId, amount, paymentDate, nextDate, method, status) VALUES (?,?,?,?,?,?,?)", [req.user.id, tenantId, amount, date, fmtNext, method, payStatus]);
    res.status(201).json({ id: result.insertId, tenantId, amount, date, nextDue: fmtNext, method, status: payStatus });
  } catch (e) { res.status(500).json({ message: "Failed to create payment" }); }
});

app.put("/api/payments/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  const { tenantId, amount, date, method, status, nextDue: bodyNextDue } = req.body;
  try {
    const [rows] = await pool.query("SELECT * FROM payments WHERE id=? AND owner_id=?", [id, req.user.id]);
    if (!rows.length) return res.status(404).json({ message: "Payment not found" });
    const cur = rows[0];
    const nt = tenantId != null ? Number(tenantId) : cur.tenantId;
    const na = amount ?? cur.amount, nd = date ?? cur.paymentDate, nm = method ?? cur.method;
    const ns = ["Paid","Pending","Late"].includes(status) ? status : cur.status;
    let nn = bodyNextDue;
    if (!nn) { const b = new Date(nd); b.setMonth(b.getMonth() + 1); nn = b.toISOString().split("T")[0]; }
    await pool.query("UPDATE payments SET tenantId=?, amount=?, paymentDate=?, nextDate=?, method=?, status=? WHERE id=? AND owner_id=?", [nt, na, nd, nn, nm, ns, id, req.user.id]);
    res.json({ id: Number(id), tenantId: nt, amount: na, date: nd, nextDue: nn, method: nm, status: ns });
  } catch (e) { res.status(500).json({ message: "Failed to update payment" }); }
});

app.delete("/api/payments/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("DELETE FROM payments WHERE id=? AND owner_id=?", [id, req.user.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ message: "Failed to delete payment" }); }
});

app.get("*", (req, res) => { res.sendFile(path.join(__dirname, "roomrental.html")); });

initDb().then(() => {
  app.listen(PORT, () => console.log("RentFlow running on http://localhost:" + PORT));
}).catch(err => { console.error("Failed to initialize database:", err); process.exit(1); });
