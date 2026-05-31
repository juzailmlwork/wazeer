import { useState, useEffect, useRef, useMemo } from 'react';
import api from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { exportSalaryPDF } from '../../utils/pdf.js';

const pad = (n) => String(n).padStart(2, '0');
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

export default function SalaryTab() {
  const { user, isSuperAdmin } = useAuth();
  const now = new Date();

  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [records, setRecords] = useState([]);
  const [loadingEmp, setLoadingEmp] = useState(true);
  const [loadingRec, setLoadingRec] = useState(false);

  // Combobox state
  const [query, setQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [empSaving, setEmpSaving] = useState(false);
  const comboRef = useRef(null);

  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());

  const [form, setForm] = useState({ date: todayStr(), hours: '', amount: '' });
  const [recSaving, setRecSaving] = useState(false);
  const [recError, setRecError] = useState('');

  const [pdfMenuOpen, setPdfMenuOpen] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const pdfMenuRef = useRef(null);

  useEffect(() => {
    api.get('/employees').then(({ data }) => setEmployees(data)).finally(() => setLoadingEmp(false));
  }, []);

  useEffect(() => {
    if (!selectedEmployee) { setRecords([]); return; }
    setLoadingRec(true);
    api.get('/salary-records', { params: { employee: selectedEmployee._id, month, year } })
      .then(({ data }) => setRecords(data))
      .finally(() => setLoadingRec(false));
  }, [selectedEmployee, month, year]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e) => {
      if (comboRef.current && !comboRef.current.contains(e.target)) setDropdownOpen(false);
      if (pdfMenuRef.current && !pdfMenuRef.current.contains(e.target)) setPdfMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filteredEmployees = useMemo(() => {
    if (!query.trim()) return employees;
    return employees.filter((e) => e.name.toLowerCase().includes(query.toLowerCase()));
  }, [employees, query]);

  const exactMatch = employees.some((e) => e.name.toLowerCase() === query.toLowerCase().trim());

  const handleSelectEmployee = (emp) => {
    setSelectedEmployee(emp);
    setQuery('');
    setDropdownOpen(false);
  };

  const handleCreateEmployee = async () => {
    const name = query.trim();
    if (!name) return;
    setEmpSaving(true);
    try {
      const { data } = await api.post('/employees', { name });
      setEmployees((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      handleSelectEmployee(data);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to create employee');
    } finally {
      setEmpSaving(false);
    }
  };

  const handleDeleteEmployee = async () => {
    if (!selectedEmployee) return;
    if (!confirm(`Delete employee "${selectedEmployee.name}"? All their salary records will remain.`)) return;
    try {
      await api.delete(`/employees/${selectedEmployee._id}`);
      setEmployees((prev) => prev.filter((e) => e._id !== selectedEmployee._id));
      setSelectedEmployee(null);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete employee');
    }
  };

  const handleAddRecord = async (e) => {
    e.preventDefault();
    setRecError('');
    setRecSaving(true);
    try {
      const { data } = await api.post('/salary-records', {
        employeeId: selectedEmployee._id,
        employeeName: selectedEmployee.name,
        date: form.date,
        hours: form.hours,
        amount: form.amount,
      });
      const recDate = new Date(data.date);
      if (recDate.getFullYear() === year && recDate.getMonth() === month) {
        setRecords((prev) => [data, ...prev].sort((a, b) => new Date(b.date) - new Date(a.date)));
      }
      setForm({ date: todayStr(), hours: '', amount: '' });
    } catch (err) {
      setRecError(err.response?.data?.message || 'Failed to add record');
    } finally {
      setRecSaving(false);
    }
  };

  const handleDeleteRecord = async (id) => {
    if (!confirm('Delete this salary record?')) return;
    try {
      await api.delete(`/salary-records/${id}`);
      setRecords((prev) => prev.filter((r) => r._id !== id));
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete');
    }
  };

  const handleDownloadPDF = async (allEmployees) => {
    setPdfMenuOpen(false);
    setPdfLoading(true);
    try {
      await exportSalaryPDF({
        employee: allEmployees ? null : selectedEmployee,
        month,
        year,
        apiGet: api.get,
      });
    } catch (err) {
      alert('Failed to generate PDF');
    } finally {
      setPdfLoading(false);
    }
  };

  const totalHours = useMemo(() => records.reduce((s, r) => s + r.hours, 0), [records]);
  const totalAmount = useMemo(() => records.reduce((s, r) => s + r.amount, 0), [records]);

  const yearOptions = [];
  for (let y = now.getFullYear(); y >= now.getFullYear() - 3; y--) yearOptions.push(y);

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>

      {/* Employee combobox */}
      <div className="card" style={{ marginBottom: 16, padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, fontSize: 15, whiteSpace: 'nowrap' }}>Employee</span>

          {selectedEmployee ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'var(--primary-light)', color: 'var(--primary-dark)',
                borderRadius: 20, padding: '4px 12px', fontWeight: 600, fontSize: 14,
              }}>
                {selectedEmployee.name}
                <button
                  onClick={() => setSelectedEmployee(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary-dark)', fontSize: 16, lineHeight: 1, padding: 0 }}
                >
                  ×
                </button>
              </span>
              {isSuperAdmin && (
                <button className="btn-danger btn-sm" onClick={handleDeleteEmployee}>Delete Employee</button>
              )}
            </div>
          ) : (
            <div ref={comboRef} style={{ position: 'relative', flex: '1 1 240px', maxWidth: 340 }}>
              <input
                type="text"
                placeholder={loadingEmp ? 'Loading...' : 'Type employee name...'}
                value={query}
                disabled={loadingEmp}
                onChange={(e) => { setQuery(e.target.value); setDropdownOpen(true); }}
                onFocus={() => setDropdownOpen(true)}
                style={{ width: '100%', marginBottom: 0 }}
              />
              {dropdownOpen && (query.trim() !== '' || filteredEmployees.length > 0) && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
                  background: 'white', border: '1px solid var(--border)', borderRadius: 6,
                  boxShadow: 'var(--shadow)', maxHeight: 220, overflowY: 'auto', marginTop: 2,
                }}>
                  {filteredEmployees.map((emp) => (
                    <div
                      key={emp._id}
                      onMouseDown={() => handleSelectEmployee(emp)}
                      style={{
                        padding: '9px 14px', cursor: 'pointer', fontSize: 14,
                        borderBottom: '1px solid var(--border)',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--primary-light)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                    >
                      {emp.name}
                    </div>
                  ))}
                  {query.trim() && !exactMatch && (
                    <div
                      onMouseDown={handleCreateEmployee}
                      style={{
                        padding: '9px 14px', cursor: 'pointer', fontSize: 14,
                        color: 'var(--primary-dark)', fontWeight: 500,
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--primary-light)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                    >
                      {empSaving ? 'Creating...' : `+ Create "${query.trim()}"`}
                    </div>
                  )}
                  {filteredEmployees.length === 0 && !query.trim() && (
                    <div style={{ padding: '9px 14px', fontSize: 13, color: 'var(--text-muted)' }}>No employees yet.</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* PDF download button */}
          <div ref={pdfMenuRef} style={{ position: 'relative', marginLeft: 'auto' }}>
            <button
              className="btn-ghost btn-sm"
              onClick={() => setPdfMenuOpen((o) => !o)}
              disabled={pdfLoading}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {pdfLoading ? 'Generating...' : '⬇ Download PDF'}
            </button>
            {pdfMenuOpen && (
              <div style={{
                position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 200,
                background: 'white', border: '1px solid var(--border)', borderRadius: 6,
                boxShadow: 'var(--shadow)', minWidth: 180,
              }}>
                {selectedEmployee && (
                  <div
                    onMouseDown={() => handleDownloadPDF(false)}
                    style={{ padding: '10px 16px', cursor: 'pointer', fontSize: 14, borderBottom: '1px solid var(--border)' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--primary-light)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                  >
                    {selectedEmployee.name}
                  </div>
                )}
                <div
                  onMouseDown={() => handleDownloadPDF(true)}
                  style={{ padding: '10px 16px', cursor: 'pointer', fontSize: 14 }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--primary-light)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                >
                  All Employees
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {!selectedEmployee ? (
        <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Search or create an employee above to view their salary records.</p>
        </div>
      ) : (
        <div>
          {/* Month selector */}
          <div className="card" style={{ marginBottom: 16, padding: '14px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Month:</span>
              <select value={month} onChange={(e) => setMonth(Number(e.target.value))} style={{ width: 130 }}>
                {MONTH_NAMES.map((m, i) => <option key={i} value={i}>{m}</option>)}
              </select>
              <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 90 }}>
                {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 16 }}>
            <div className="card" style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--primary-dark)' }}>
                {totalHours.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Total Hours</div>
            </div>
            <div className="card" style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--primary-dark)' }}>
                {totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                Total Paid — {MONTH_NAMES[month]} {year}
              </div>
            </div>
          </div>

          {/* Add entry form */}
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Add Entry</h3>
            <form onSubmit={handleAddRecord}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div className="form-group" style={{ marginBottom: 0, flex: '1 1 140px' }}>
                  <label>Date</label>
                  <input
                    type="date"
                    value={form.date}
                    max={todayStr()}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0, flex: '1 1 110px' }}>
                  <label>Hours</label>
                  <input
                    type="number"
                    placeholder="0.0"
                    min="0"
                    step="0.5"
                    value={form.hours}
                    onChange={(e) => setForm({ ...form, hours: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0, flex: '1 1 130px' }}>
                  <label>Amount</label>
                  <input
                    type="number"
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    required
                  />
                </div>
                <button type="submit" className="btn-primary" style={{ whiteSpace: 'nowrap', padding: '8px 20px' }} disabled={recSaving}>
                  {recSaving ? 'Saving...' : 'Add Entry'}
                </button>
              </div>
              {recError && <p className="error-msg" style={{ marginTop: 8, marginBottom: 0 }}>{recError}</p>}
            </form>
          </div>

          {/* Records table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: 15, fontWeight: 600 }}>
                {MONTH_NAMES[month]} {year}
              </h3>
              <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{records.length} entries</span>
            </div>

            {loadingRec ? (
              <div className="empty-state">Loading...</div>
            ) : records.length === 0 ? (
              <div className="empty-state">No entries for this month.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th style={{ textAlign: 'right' }}>Hours</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                    <th>Added By</th>
                    {isSuperAdmin && <th />}
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr key={r._id}>
                      <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                        {new Date(r.date).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 500 }}>{r.hours}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--primary-dark)' }}>
                        {Number(r.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{r.createdBy || '—'}</td>
                      {isSuperAdmin && (
                        <td>
                          <button className="btn-danger btn-sm" onClick={() => handleDeleteRecord(r._id)}>Delete</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#f8fafc' }}>
                    <td style={{ fontWeight: 600, padding: '10px 16px' }}>Total</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, padding: '10px 16px' }}>
                      {totalHours.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--primary-dark)', padding: '10px 16px' }}>
                      {totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td colSpan={isSuperAdmin ? 2 : 1} />
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
