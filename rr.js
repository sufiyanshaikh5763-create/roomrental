// ============ CONFIG ============
const API_BASE = '';

// ============ AUTH ============
let currentUser = null; // { username, hostel_name, token }

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    ...(currentUser ? { 'x-session-token': currentUser.token } : {})
  };
}

function switchTab(tab) {
  document.getElementById('form-login').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('form-register').style.display = tab === 'register' ? 'block' : 'none';
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
}

async function doLogin() {
  const u = document.getElementById('login-user').value.trim();
  const p = document.getElementById('login-pass').value;
  try {
    const res = await fetch(`${API_BASE}/api/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u, password: p })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      currentUser = { username: data.username, hostel_name: data.hostel_name, token: data.token };
      applyUserUI();
      document.getElementById('login-page').style.display = 'none';
      document.getElementById('main-content').style.display = 'block';
      await refreshAllData();
      showToast(`Welcome, ${data.username}!`, 'success');
    } else {
      showToast(data.message || 'Invalid credentials', 'error');
    }
  } catch {
    showToast('Login failed. Is the server running?', 'error');
  }
}

async function doRegister() {
  const hostel = document.getElementById('reg-hostel').value.trim();
  const u = document.getElementById('reg-user').value.trim();
  const p = document.getElementById('reg-pass').value;
  if (!u || !p) { showToast('Username and password are required', 'error'); return; }
  try {
    const res = await fetch(`${API_BASE}/api/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u, password: p, hostel_name: hostel })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      currentUser = { username: data.username, hostel_name: data.hostel_name, token: data.token };
      applyUserUI();
      document.getElementById('login-page').style.display = 'none';
      document.getElementById('main-content').style.display = 'block';
      await refreshAllData();
      showToast(`Account created! Welcome, ${data.username}!`, 'success');
    } else {
      showToast(data.message || 'Registration failed', 'error');
    }
  } catch {
    showToast('Registration failed. Is the server running?', 'error');
  }
}

function applyUserUI() {
  if (!currentUser) return;
  document.getElementById('topbar-username').textContent = currentUser.username;
  document.getElementById('sidebar-hostel-name').textContent = currentUser.hostel_name || 'My Hostel';
}

async function doLogout() {
  if (currentUser) {
    await fetch(`${API_BASE}/api/logout`, {
      method: 'POST', headers: { 'x-session-token': currentUser.token }
    }).catch(() => {});
    currentUser = null;
  }
  document.getElementById('login-page').style.display = 'flex';
  document.getElementById('main-content').style.display = 'none';
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
}

// ============ IN-MEMORY STATE (MIRROR OF BACKEND) ============
let db = {
  rooms: [],
  tenants: [],
  payments: []
};

async function refreshAllData() {
  try {
    const headers = { 'x-session-token': currentUser ? currentUser.token : '' };
    const [roomsRes, tenantsRes, paymentsRes] = await Promise.all([
      fetch(`${API_BASE}/api/rooms`, { headers }),
      fetch(`${API_BASE}/api/tenants`, { headers }),
      fetch(`${API_BASE}/api/payments`, { headers })
    ]);
    db.rooms = await roomsRes.json();
    db.tenants = await tenantsRes.json();
    db.payments = await paymentsRes.json();
  } catch (e) {
    console.error('Failed to load data from backend', e);
    showToast('Could not load data from backend', 'error');
  }
  updateStats();
  renderDashboard();
}
  
  // =================== NAVIGATION ===================
  const pageTitles = { dashboard:'Dashboard', rooms:'Room Management', tenants:'Tenant Management', payments:'Payment Management', reports:'Reports' };
  
  function showPage(name) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('page-' + name).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => { if (n.textContent.toLowerCase().includes(name.split('-')[0].slice(0,4))) n.classList.add('active'); });
    document.getElementById('page-title').textContent = pageTitles[name] || name;
    closeSidebar();
    if (name === 'dashboard') renderDashboard();
    if (name === 'rooms') renderRooms();
    if (name === 'tenants') renderTenants();
    if (name === 'payments') renderPayments();
    if (name === 'reports') renderReports();
  }
  
  function openSidebar() { document.getElementById('sidebar').classList.add('open'); document.getElementById('overlay').classList.add('open'); }
  function closeSidebar() { document.getElementById('sidebar').classList.remove('open'); document.getElementById('overlay').classList.remove('open'); }
  
  // =================== DATE ===================
  function setDate() {
    const d = new Date();
    document.getElementById('date-display').textContent = d.toLocaleDateString('en-IN', { weekday:'short', day:'numeric', month:'short', year:'numeric' });
  }
  setDate();
  
  // =================== STATUS HELPERS ===================
  function roomStatus(r) { return r.occupancy >= r.capacity ? 'Full' : 'Available'; }
  
  function paymentStatus(p) {
    if (p.status === 'Paid') return 'Paid';
    if (p.status === 'Pending' || p.status === 'Late') return p.status;
    const today = new Date(); today.setHours(0,0,0,0);
    const due = new Date(p.nextDue);
    return due < today ? 'Late' : 'Pending';
  }
  
  function badgeFor(status) {
    const map = { Paid: 'success', Pending: 'warning', Late: 'danger', Available: 'success', Full: 'danger' };
    return `<span class="badge badge-${map[status]||'info'}">${status}</span>`;
  }
  
  function getTenantById(id) { return db.tenants.find(t => String(t.id) === String(id)); }
  function getRoomById(id) { return db.rooms.find(r => String(r.id) === String(id)); }
  function getRoomByNumber(num) { return db.rooms.find(r => r.number === num); }

  /** True if this tenant has at least one row in `payments` (MySQL may return numeric ids). */
  function tenantHasAnyPayment(tenantId) {
    return db.payments.some(p => String(p.tenantId) === String(tenantId));
  }
  
  // =================== STATS ===================
  function updateStats() {
    const totalRooms = db.rooms.length;
    const availRooms = db.rooms.filter(r => roomStatus(r)==='Available').length;
    const totalTenants = db.tenants.length;
    const pending = db.tenants.filter(t => {
      const latestPay = db.payments.filter(p => p.tenantId === t.id && p.status === 'Paid').sort((a,b) => new Date(b.date)-new Date(a.date))[0];
      if (!latestPay) return true;
      const today = new Date(); today.setHours(0,0,0,0);
      return new Date(latestPay.nextDue) <= today;
    }).length;
    const totalIncome = db.payments.filter(p=>p.status==='Paid').reduce((s,p)=>s+Number(p.amount),0);
  
    const grid = document.getElementById('stats-grid');
    grid.innerHTML = `
      <div class="stat-card c1"><div class="stat-label">Total Rooms</div><div class="stat-value">${totalRooms}</div><div class="stat-icon">🏢</div></div>
      <div class="stat-card c2"><div class="stat-label">Available Rooms</div><div class="stat-value">${availRooms}</div><div class="stat-icon">🟢</div></div>
      <div class="stat-card c3"><div class="stat-label">Total Tenants</div><div class="stat-value">${totalTenants}</div><div class="stat-icon">👥</div></div>
      <div class="stat-card c4"><div class="stat-label">Pending Payments</div><div class="stat-value">${pending}</div><div class="stat-icon">⚠️</div></div>
      <div class="stat-card c5"><div class="stat-label">Total Income</div><div class="stat-value">₹${totalIncome.toLocaleString('en-IN')}</div><div class="stat-icon">💰</div></div>
    `;
  }
  
  // =================== DASHBOARD ===================
  function renderDashboard() {
    updateStats();
    // Recent payments
    const tb = document.getElementById('dash-payments-table');
    const pays = [...db.payments].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,5);
    if (!pays.length) { tb.innerHTML=`<tr><td colspan="5"><div class="empty-state"><div class="empty-icon">💳</div><p>No payments recorded yet</p></div></td></tr>`; }
    else tb.innerHTML = pays.map(p => {
      const t = getTenantById(p.tenantId);
      return `<tr><td>${t?t.name:'Unknown'}</td><td>₹${Number(p.amount).toLocaleString('en-IN')}</td><td>${p.date}</td><td>${p.method}</td><td>${badgeFor(p.status)}</td></tr>`;
    }).join('');
    // Rooms
    const rb = document.getElementById('dash-rooms-table');
    if (!db.rooms.length) { rb.innerHTML=`<tr><td colspan="5"><div class="empty-state"><div class="empty-icon">🏠</div><p>No rooms added yet</p></div></td></tr>`; }
    else rb.innerHTML = db.rooms.map(r => `<tr><td><strong>${r.number}</strong></td><td>${r.capacity}</td><td>${r.occupancy}</td><td>₹${Number(r.rent).toLocaleString('en-IN')}</td><td>${badgeFor(roomStatus(r))}</td></tr>`).join('');
  }
  
  // =================== ROOMS ===================
  function renderRooms() {
    const search = document.getElementById('room-search').value.toLowerCase();
    const filter = document.getElementById('room-filter').value;
    const tb = document.getElementById('rooms-table');
    let rooms = db.rooms.filter(r => {
      const st = roomStatus(r);
      return (!filter || st===filter) && (!search || r.number.toLowerCase().includes(search));
    });
    if (!rooms.length) { tb.innerHTML=`<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">🏠</div><p>No rooms found</p></div></td></tr>`; return; }
    tb.innerHTML = rooms.map(r => {
      const st = roomStatus(r);
      return `<tr>
        <td><strong>${r.number}</strong></td>
        <td>${r.capacity}</td>
        <td>${r.occupancy}</td>
        <td>₹${Number(r.rent).toLocaleString('en-IN')}</td>
        <td>₹${(r.capacity * r.rent).toLocaleString('en-IN')}</td>
        <td>${badgeFor(st)}</td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="openRoomModal('${r.id}')">✏️ Edit</button>
          <button class="btn btn-sm btn-danger" onclick="confirmDelete('room','${r.id}','Room ${r.number}')">🗑️</button>
        </td>
      </tr>`;
    }).join('');
  }
  
  function openRoomModal(id) {
    document.getElementById('room-modal-title').textContent = id ? 'Edit Room' : 'Add New Room';
    document.getElementById('r-id').value = id || '';
    if (id) {
      const r = getRoomById(id);
      document.getElementById('r-number').value = r.number;
      document.getElementById('r-capacity').value = r.capacity;
      document.getElementById('r-occupancy').value = r.occupancy;
      document.getElementById('r-rent').value = r.rent;
    } else {
      ['r-number','r-capacity','r-occupancy','r-rent'].forEach(f => document.getElementById(f).value = '');
    }
    openModal('room-modal');
  }
  
  async function saveRoom() {
    const id = document.getElementById('r-id').value;
    const number = document.getElementById('r-number').value.trim();
    const capacity = parseInt(document.getElementById('r-capacity').value);
    const occupancy = parseInt(document.getElementById('r-occupancy').value);
    const rent = parseFloat(document.getElementById('r-rent').value);
    if (!number || isNaN(capacity) || isNaN(occupancy) || isNaN(rent)) { showToast('Please fill all fields', 'error'); return; }
    if (occupancy > capacity) { showToast('Occupancy cannot exceed capacity', 'error'); return; }
    try {
      const method = id ? 'PUT' : 'POST';
      const url = id ? `${API_BASE}/api/rooms/${id}` : `${API_BASE}/api/rooms`;
      const res = await fetch(url, {
        method,
        headers: authHeaders(),
        body: JSON.stringify({ number, capacity, occupancy, rent })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to save room');
      }
      await refreshAllData();
      closeModal('room-modal');
      renderRooms();
      showToast(id ? 'Room updated!' : 'Room added!', 'success');
    } catch (e) {
      showToast(e.message, 'error');
    }
  }
  
  // =================== TENANTS ===================
  function renderTenants() {
    const search = document.getElementById('tenant-search').value.toLowerCase();
    const tb = document.getElementById('tenants-table');
    let tenants = db.tenants.filter(t => !search || t.name.toLowerCase().includes(search) || t.phone.includes(search));
    if (!tenants.length) { tb.innerHTML=`<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">👥</div><p>No tenants found</p></div></td></tr>`; return; }
    tb.innerHTML = tenants.map(t => {
      const room = getRoomById(t.roomId);
      const joinDay = t.joinDate ? new Date(t.joinDate).getDate() : '—';
      return `<tr>
        <td><strong>${t.name}</strong></td>
        <td>${t.phone}</td>
        <td>${room?room.number:'—'}</td>
        <td>${t.joinDate}</td>
        <td>₹${Number(t.rent).toLocaleString('en-IN')}</td>
        <td>${joinDay}th each month</td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="openTenantModal('${t.id}')">✏️ Edit</button>
          <button class="btn btn-sm btn-danger" onclick="confirmDelete('tenant','${t.id}','${t.name}')">🗑️</button>
        </td>
      </tr>`;
    }).join('');
  }
  
  function openTenantModal(id) {
    document.getElementById('tenant-modal-title').textContent = id ? 'Edit Tenant' : 'Add New Tenant';
    document.getElementById('t-id').value = id || '';
    // Populate room dropdown
    const sel = document.getElementById('t-room');
    sel.innerHTML = '<option value="">Select Room</option>' + db.rooms.map(r=>`<option value="${r.id}">Room ${r.number} (${roomStatus(r)})</option>`).join('');
    if (id) {
      const t = getTenantById(id);
      document.getElementById('t-name').value = t.name;
      document.getElementById('t-phone').value = t.phone;
      document.getElementById('t-room').value = t.roomId;
      document.getElementById('t-join').value = t.joinDate;
      document.getElementById('t-rent').value = t.rent;
    } else {
      ['t-name','t-phone','t-rent'].forEach(f=>document.getElementById(f).value='');
      document.getElementById('t-join').value = new Date().toISOString().split('T')[0];
    }
    openModal('tenant-modal');
  }
  
  async function saveTenant() {
    const id = document.getElementById('t-id').value;
    const name = document.getElementById('t-name').value.trim();
    const phone = document.getElementById('t-phone').value.trim();
    const roomId = document.getElementById('t-room').value;
    const joinDate = document.getElementById('t-join').value;
    const rent = parseFloat(document.getElementById('t-rent').value);
    if (!name||!phone||!roomId||!joinDate||isNaN(rent)) { showToast('Please fill all fields', 'error'); return; }
    try {
      const method = id ? 'PUT' : 'POST';
      const url = id ? `${API_BASE}/api/tenants/${id}` : `${API_BASE}/api/tenants`;
      const res = await fetch(url, {
        method,
        headers: authHeaders(),
        body: JSON.stringify({ name, phone, roomId, joinDate, rent })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to save tenant');
      }
      await refreshAllData();
      closeModal('tenant-modal');
      renderTenants();
      showToast(id?'Tenant updated!':'Tenant added!', 'success');
    } catch (e) {
      showToast(e.message, 'error');
    }
  }
  
  // =================== PAYMENTS ===================
  function renderPayments() {
    const search = document.getElementById('pay-search').value.toLowerCase();
    const filter = document.getElementById('pay-filter').value;
    const tb = document.getElementById('payments-table');
    let pays = db.payments.map(p => ({ ...p, computedStatus: paymentStatus(p) })).filter(p => {
      const t = getTenantById(p.tenantId);
      const name = t ? t.name.toLowerCase() : '';
      return (!filter || p.computedStatus===filter) && (!search || name.includes(search));
    }).sort((a,b) => new Date(b.date)-new Date(a.date));
  
    // Tenants with no payment row yet: show as outstanding with **Pay Now** (not stored until they pay).
    const outstanding = [];
    if (!filter || filter === 'Pending') {
      db.tenants.forEach(t => {
        if (tenantHasAnyPayment(t.id)) return;
        if (search && !t.name.toLowerCase().includes(search) && !String(t.phone).includes(search)) return;
        outstanding.push({
          id: null,
          tenantId: t.id,
          amount: t.rent,
          date: '—',
          nextDue: t.joinDate,
          method: '—',
          computedStatus: 'Pending',
          outstanding: true
        });
      });
    }
    pays = [...pays, ...outstanding];
  
    if (!pays.length) { tb.innerHTML=`<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">💳</div><p>No payments found</p></div></td></tr>`; return; }
    tb.innerHTML = pays.map(p => {
      const t = getTenantById(p.tenantId);
      const room = t ? getRoomById(t.roomId) : null;
      // Use explicit flags — don't rely on `p.id` truthiness (0 / BigInt / missing id broke Pay Now).
      const isOutstanding = p.outstanding === true || p.id === null || p.id === undefined;
      const actions = isOutstanding
        ? `<button type="button" class="btn btn-sm btn-success" onclick="quickRecord('${p.tenantId}')">Pay Now</button>`
        : `<button type="button" class="btn btn-sm btn-outline" onclick="openPaymentEdit(${p.id})">✏️ Edit</button>
           <button type="button" class="btn btn-sm btn-danger" onclick="confirmDelete('payment','${p.id}','this payment')">🗑️</button>`;
      return `<tr>
        <td><strong>${t?t.name:'Unknown'}</strong></td>
        <td>${room?room.number:'—'}</td>
        <td>₹${Number(p.amount).toLocaleString('en-IN')}</td>
        <td>${p.date}</td>
        <td>${p.nextDue||'—'}</td>
        <td>${p.method}</td>
        <td>${badgeFor(p.computedStatus)}</td>
        <td>${actions}</td>
      </tr>`;
    }).join('');
  }
  
  function resetPaymentModalForCreate() {
    document.getElementById('p-id').value = '';
    document.getElementById('payment-modal-title').textContent = 'Record Payment';
    const btn = document.getElementById('payment-save-btn');
    if (btn) btn.textContent = 'Record Payment';
    document.getElementById('p-status').value = 'Paid';
    document.getElementById('p-tenant').disabled = false;
  }

  /** Create: optional tenantId pre-selected (e.g. Pay Now). */
  function openPaymentModal(tenantId) {
    resetPaymentModalForCreate();
    const sel = document.getElementById('p-tenant');
    document.getElementById('p-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('p-amount').value = '';
    sel.innerHTML = '<option value="">Select Tenant</option>' + db.tenants.map(t=>`<option value="${t.id}">${t.name}</option>`).join('');
    if (tenantId !== undefined && tenantId !== null && String(tenantId).trim() !== '') {
      sel.value = String(tenantId);
      updateAmountHint();
    }
    openModal('payment-modal');
  }

  /** Update existing payment (CRUD). */
  function openPaymentEdit(paymentId) {
    const p = db.payments.find(x => String(x.id) === String(paymentId));
    if (!p) {
      showToast('Payment not found', 'error');
      return;
    }
    document.getElementById('p-id').value = p.id;
    document.getElementById('payment-modal-title').textContent = 'Edit Payment';
    const btn = document.getElementById('payment-save-btn');
    if (btn) btn.textContent = 'Update Payment';
    const sel = document.getElementById('p-tenant');
    sel.innerHTML = '<option value="">Select Tenant</option>' + db.tenants.map(t=>`<option value="${t.id}">${t.name}</option>`).join('');
    sel.value = String(p.tenantId);
    sel.disabled = false;
    document.getElementById('p-amount').value = p.amount;
    const d = p.date;
    document.getElementById('p-date').value = typeof d === 'string' && d.includes('T') ? d.split('T')[0] : String(d || '').slice(0, 10);
    document.getElementById('p-method').value = p.method || 'Cash';
    const st = p.status || 'Paid';
    document.getElementById('p-status').value = ['Paid', 'Pending', 'Late'].includes(st) ? st : 'Paid';
    updateAmountHint();
    openModal('payment-modal');
  }
  
  function quickRecord(tenantId) { openPaymentModal(tenantId); }
  
  document.getElementById('p-date').addEventListener('input', updateAmountHint);
  document.getElementById('p-tenant').addEventListener('change', updateAmountHint);
  
  function updateAmountHint() {
    const tId = document.getElementById('p-tenant').value;
    const date = document.getElementById('p-date').value;
    const t = getTenantById(tId);
    if (t && !document.getElementById('p-amount').value) document.getElementById('p-amount').value = t.rent;
    if (date) {
      const nextDue = new Date(date); nextDue.setMonth(nextDue.getMonth()+1);
      document.getElementById('p-due-date-text').textContent = nextDue.toLocaleDateString('en-IN', {day:'numeric',month:'long',year:'numeric'});
      document.getElementById('p-due-preview').style.display = 'block';
    }
  }
  
  async function savePayment() {
    const editIdRaw = document.getElementById('p-id').value.trim();
    const isEdit = editIdRaw !== '';
    const tenantIdRaw = document.getElementById('p-tenant').value;
    const tenantId = parseInt(String(tenantIdRaw).trim(), 10);
    const amount = parseFloat(document.getElementById('p-amount').value);
    const date = document.getElementById('p-date').value;
    const method = document.getElementById('p-method').value;
    const status = document.getElementById('p-status').value;
    if (!tenantIdRaw || Number.isNaN(tenantId) || tenantId < 1) {
      showToast('Please select a tenant', 'error');
      return;
    }
    if (isNaN(amount) || amount <= 0 || !date) {
      showToast('Please fill amount and payment date', 'error');
      return;
    }
    const payload = { tenantId, amount, date, method, status };
    try {
      const url = isEdit
        ? `${API_BASE}/api/payments/${encodeURIComponent(editIdRaw)}`
        : `${API_BASE}/api/payments`;
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const text = await res.text();
        let msg = 'Failed to save payment';
        try {
          const err = JSON.parse(text);
          if (err.message) msg = err.message;
        } catch (_) {
          if (text) msg = `${msg} (${res.status})`;
        }
        throw new Error(msg);
      }
      await refreshAllData();
      closeModal('payment-modal');
      resetPaymentModalForCreate();
      renderPayments();
      showToast(isEdit ? 'Payment updated! ✅' : 'Payment recorded! ✅', 'success');
    } catch (e) {
      showToast(e.message, 'error');
    }
  }
  
  // =================== DELETE ===================
  let pendingDelete = null;
  function confirmDelete(type, id, label) {
    document.getElementById('confirm-text').textContent = `Delete "${label}"? This cannot be undone.`;
    document.getElementById('confirm-ok').onclick = () => { doDelete(type, id); closeModal('confirm-modal'); };
    openModal('confirm-modal');
  }
  
  async function doDelete(type, id) {
    try {
      if (type === 'room') {
        const res = await fetch(`${API_BASE}/api/rooms/${id}`, { method: 'DELETE', headers: authHeaders() });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || 'Failed to delete room');
        }
        renderRooms();
      } else if (type === 'tenant') {
        const res = await fetch(`${API_BASE}/api/tenants/${id}`, { method: 'DELETE', headers: authHeaders() });
        if (!res.ok) throw new Error('Failed to delete tenant');
        renderTenants();
      } else if (type === 'payment') {
        const res = await fetch(`${API_BASE}/api/payments/${id}`, { method: 'DELETE', headers: authHeaders() });
        if (!res.ok) throw new Error('Failed to delete payment');
        renderPayments();
      }
      await refreshAllData();
      showToast('Deleted successfully', 'success');
    } catch (e) {
      showToast(e.message, 'error');
    }
  }
  
  // =================== REPORTS ===================
  function renderReports() {
    updateStats();
    const totalIncome = db.payments.filter(p=>p.status==='Paid').reduce((s,p)=>s+Number(p.amount),0);
    const pendingTenants = db.tenants.filter(t => {
      const latestPay = db.payments.filter(p=>p.tenantId===t.id&&p.status==='Paid').sort((a,b)=>new Date(b.date)-new Date(a.date))[0];
      if (!latestPay) return true;
      const today = new Date(); today.setHours(0,0,0,0);
      return new Date(latestPay.nextDue) <= today;
    });
    const availRooms = db.rooms.filter(r=>roomStatus(r)==='Available');
  
    document.getElementById('report-stats').innerHTML = `
      <div class="report-card"><h3>Total Income Collected</h3><div class="report-amount" style="color:var(--accent3)">₹${totalIncome.toLocaleString('en-IN')}</div></div>
      <div class="report-card"><h3>Pending Payments</h3><div class="report-amount" style="color:var(--warning)">${pendingTenants.length} tenants</div></div>
      <div class="report-card"><h3>Available Rooms</h3><div class="report-amount" style="color:var(--accent)">${availRooms.length} rooms</div></div>
    `;
  
    // Pending table
    const ptb = document.getElementById('report-pending-table');
    const pendingRows = db.tenants.map(t => {
      const latestPay = db.payments.filter(p=>p.tenantId===t.id&&p.status==='Paid').sort((a,b)=>new Date(b.date)-new Date(a.date))[0];
      const nextDue = latestPay ? latestPay.nextDue : t.joinDate;
      const today = new Date(); today.setHours(0,0,0,0);
      const isDue = !latestPay || new Date(nextDue) <= today;
      if (!isDue) return '';
      const room = getRoomById(t.roomId);
      const status = latestPay && new Date(nextDue) < today ? 'Late' : 'Pending';
      return `<tr><td><strong>${t.name}</strong></td><td>${room?room.number:'—'}</td><td>₹${Number(t.rent).toLocaleString('en-IN')}</td><td>${nextDue||'—'}</td><td>${badgeFor(status)}</td></tr>`;
    }).filter(Boolean).join('');
    ptb.innerHTML = pendingRows || `<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:20px">🎉 All payments are up to date!</td></tr>`;
  
    // Available rooms
    const atb = document.getElementById('report-avail-table');
    atb.innerHTML = availRooms.length ? availRooms.map(r=>`<tr><td><strong>${r.number}</strong></td><td>${r.capacity}</td><td>${r.occupancy}</td><td>${r.capacity-r.occupancy}</td><td>₹${Number(r.rent).toLocaleString('en-IN')}</td></tr>`).join('') :
      `<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:20px">No available rooms</td></tr>`;
  
    // Paid history
    const paid = db.payments.filter(p=>p.status==='Paid').sort((a,b)=>new Date(b.date)-new Date(a.date));
    const paidTb = document.getElementById('report-paid-table');
    paidTb.innerHTML = paid.length ? paid.map(p=>{const t=getTenantById(p.tenantId);return`<tr><td>${t?t.name:'—'}</td><td>₹${Number(p.amount).toLocaleString('en-IN')}</td><td>${p.date}</td><td>${p.method}</td></tr>`;}).join('') :
      `<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:20px">No paid payments yet</td></tr>`;
  }
  
  // =================== PDF EXPORT ===================
  function exportPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFont('helvetica');
    doc.setFontSize(18);
    doc.setTextColor(108, 99, 255);
    doc.text('RentFlow - Monthly Report', 14, 20);
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 120);
    doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, 14, 28);
  
    let y = 38;
    const totalIncome = db.payments.filter(p=>p.status==='Paid').reduce((s,p)=>s+Number(p.amount),0);
    doc.setFontSize(11); doc.setTextColor(30,30,40);
    doc.text(`Total Income Collected: INR ${totalIncome.toLocaleString('en-IN')}`, 14, y); y += 8;
    doc.text(`Total Rooms: ${db.rooms.length}  |  Tenants: ${db.tenants.length}`, 14, y); y += 14;
  
    doc.setFontSize(13); doc.setTextColor(108,99,255); doc.text('Pending / Late Payments', 14, y); y += 8;
    doc.setFontSize(9); doc.setTextColor(50,50,70);
    ['Tenant', 'Room', 'Amount Due', 'Next Due Date', 'Status'].forEach((h,i)=>doc.text(h,[14,60,100,135,170][i],y));
    y += 4; doc.line(14, y, 196, y); y += 6;
  
    db.tenants.forEach(t => {
      const lp = db.payments.filter(p=>p.tenantId===t.id&&p.status==='Paid').sort((a,b)=>new Date(b.date)-new Date(a.date))[0];
      const nextDue = lp ? lp.nextDue : t.joinDate;
      const today = new Date(); today.setHours(0,0,0,0);
      if (lp && new Date(nextDue) > today) return;
      const room = getRoomById(t.roomId);
      const status = lp && new Date(nextDue) < today ? 'Late' : 'Pending';
      doc.text(t.name.slice(0,18), 14, y);
      doc.text(room?room.number:'—', 60, y);
      doc.text(`INR ${Number(t.rent).toLocaleString('en-IN')}`, 100, y);
      doc.text(nextDue||'—', 135, y);
      doc.setTextColor(status==='Late'?200:200, status==='Late'?50:120, status==='Late'?50:20);
      doc.text(status, 170, y);
      doc.setTextColor(50,50,70);
      y += 7; if (y > 270) { doc.addPage(); y = 20; }
    });
  
    y += 6;
    doc.setFontSize(13); doc.setTextColor(108,99,255); doc.text('Available Rooms', 14, y); y += 8;
    doc.setFontSize(9); doc.setTextColor(50,50,70);
    db.rooms.filter(r=>roomStatus(r)==='Available').forEach(r=>{
      doc.text(`Room ${r.number} — Capacity: ${r.capacity}, Occupied: ${r.occupancy}, Vacant: ${r.capacity-r.occupancy}, Rent: INR ${r.rent}`, 14, y);
      y+=7; if(y>270){doc.addPage();y=20;}
    });
  
    doc.save(`rentflow-report-${new Date().toISOString().split('T')[0]}.pdf`);
    showToast('PDF report downloaded!', 'success');
  }
  
  // =================== MODAL HELPERS ===================
  function openModal(id) { document.getElementById(id).classList.add('open'); }
  function closeModal(id) { document.getElementById(id).classList.remove('open'); }
  document.querySelectorAll('.modal-overlay').forEach(m => m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); }));
  
  // =================== TOAST ===================
  let toastTimer;
  function showToast(msg, type='success') {
    const t = document.getElementById('toast');
    t.className = `toast ${type}`;
    t.innerHTML = `<span class="toast-dot">${type==='success'?'●':'●'}</span> ${msg}`;
    t.style.display = 'flex';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(()=>{ t.style.display='none'; }, 3000);
  }
  
  // Init date
  document.getElementById('date-display') && setDate();