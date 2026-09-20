import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const BRAND_COLOR = [22, 163, 74]; // --primary green
const MUTED = [120, 120, 120];
const DARK = [30, 30, 30];

function addHeader(doc, title, subtitle, pageWidth = 210) {
  doc.setFillColor(...BRAND_COLOR);
  doc.rect(0, 0, pageWidth, 16, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('FWR Recyclers', 14, 10.5);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), pageWidth - 14, 10.5, { align: 'right' });

  doc.setTextColor(...DARK);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 14, 28);

  if (subtitle) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    doc.text(subtitle, 14, 35);
  }
}

function addStatRow(doc, stats, y, pageWidth = 210) {
  const colW = (pageWidth - 28) / stats.length;
  stats.forEach(({ label, value }, i) => {
    const x = 14 + i * colW;
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(x, y, colW - 4, 18, 2, 2, 'F');
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...BRAND_COLOR);
    doc.text(String(value), x + 6, y + 10);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    doc.text(label, x + 6, y + 15.5);
  });
  return y + 24;
}

export function exportPurchasesPDF({ filtered, filterMaterial, selectedMaterial, filterSupplier, selectedSupplier, filterYard, period, totalValue, totalWeight }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const parts = [];
  if (period !== 'all') parts.push(`Period: ${period}`);
  if (filterYard) parts.push(`Yard: ${filterYard.charAt(0).toUpperCase() + filterYard.slice(1)}`);
  if (selectedSupplier) parts.push(`Supplier: ${selectedSupplier.name}`);
  if (selectedMaterial) parts.push(`Item: ${selectedMaterial.name}`);
  const subtitle = parts.length ? parts.join('  ·  ') : 'All records';

  addHeader(doc, 'Purchases Report', subtitle);

  const stats = [
    { label: 'Transactions', value: filtered.length },
    { label: filterMaterial ? `Total — ${selectedMaterial?.name}` : 'Total Value', value: Number(totalValue).toLocaleString('en-US', { minimumFractionDigits: 2 }) },
  ];
  if (filterMaterial && totalWeight != null) {
    stats.push({ label: `Weight — ${selectedMaterial?.name}`, value: `${Number(totalWeight).toLocaleString('en-US', { minimumFractionDigits: 2 })} kg` });
  }

  let y = addStatRow(doc, stats, 40);

  autoTable(doc, {
    startY: y,
    head: [['Date', 'Supplier', 'Items', 'Created By', 'Total']],
    body: filtered.map((tx) => {
      const matchedItem = filterMaterial ? tx.items.find((item) => item.material === filterMaterial) : null;
      const displayTotal = matchedItem ? matchedItem.totalPrice : tx.grandTotal;
      return [
        new Date(tx.createdAt).toLocaleDateString(),
        tx.supplierName || '—',
        tx.items.map((i) => i.materialName).join(', '),
        tx.createdBy || '—',
        Number(displayTotal).toLocaleString('en-US', { minimumFractionDigits: 2 }),
      ];
    }),
    headStyles: { fillColor: BRAND_COLOR, fontSize: 9, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8.5 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 4: { halign: 'right', fontStyle: 'bold' } },
    margin: { left: 14, right: 14 },
  });

  doc.save(`purchases-report-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function exportSalesPDF({ filtered, filterMaterial, selectedMaterial, filterCustomer, selectedCustomer, filterYard, period, totalValue, totalWeight }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const parts = [];
  if (period !== 'all') parts.push(`Period: ${period}`);
  if (filterYard) parts.push(`Yard: ${filterYard.charAt(0).toUpperCase() + filterYard.slice(1)}`);
  if (selectedCustomer) parts.push(`Customer: ${selectedCustomer.name}`);
  if (selectedMaterial) parts.push(`Item: ${selectedMaterial.name}`);
  const subtitle = parts.length ? parts.join('  ·  ') : 'All records';

  addHeader(doc, 'Sales Report', subtitle);

  const stats = [
    { label: 'Sales', value: filtered.length },
    { label: filterMaterial ? `Total — ${selectedMaterial?.name}` : 'Total Value', value: Number(totalValue).toLocaleString('en-US', { minimumFractionDigits: 2 }) },
  ];
  if (filterMaterial && totalWeight != null) {
    stats.push({ label: `Weight — ${selectedMaterial?.name}`, value: `${Number(totalWeight).toLocaleString('en-US', { minimumFractionDigits: 2 })} kg` });
  }

  let y = addStatRow(doc, stats, 40);

  autoTable(doc, {
    startY: y,
    head: [['Date', 'Customer', 'Yard', 'Items', 'Created By', 'Total']],
    body: filtered.map((sale) => {
      const matchedItem = filterMaterial ? sale.items.find((item) => item.material === filterMaterial) : null;
      const displayTotal = matchedItem ? matchedItem.totalPrice : sale.grandTotal;
      return [
        new Date(sale.createdAt).toLocaleDateString(),
        sale.customerName || '—',
        sale.yard || 'hospital',
        sale.items.map((i) => i.materialName).join(', '),
        sale.createdBy || '—',
        Number(displayTotal).toLocaleString('en-US', { minimumFractionDigits: 2 }),
      ];
    }),
    headStyles: { fillColor: BRAND_COLOR, fontSize: 9, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8.5 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 5: { halign: 'right', fontStyle: 'bold' } },
    margin: { left: 14, right: 14 },
  });

  doc.save(`sales-report-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export async function exportSalaryPDF({ employee, month, year, apiGet }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const fmt = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 });
  const fmtH = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  // Fetch all records (no month filter) for the scope
  const params = employee ? { employee: employee._id } : {};
  const { data: allRecords } = await apiGet('/salary-records', { params });

  if (employee) {
    // Single employee: group by month-year
    addHeader(doc, `Salary Report — ${employee.name}`, 'All months summary');
    const byMonth = {};
    allRecords.forEach((r) => {
      const d = new Date(r.date);
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
      if (!byMonth[key]) byMonth[key] = { label: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`, hours: 0, amount: 0 };
      byMonth[key].hours += r.hours;
      byMonth[key].amount += r.amount;
    });
    const rows = Object.keys(byMonth).sort().reverse().map((k) => [
      byMonth[k].label,
      fmtH(byMonth[k].hours),
      fmt(byMonth[k].amount),
    ]);
    const totalH = allRecords.reduce((s, r) => s + r.hours, 0);
    const totalA = allRecords.reduce((s, r) => s + r.amount, 0);
    const stats = [
      { label: 'Total Hours', value: fmtH(totalH) },
      { label: 'Total Paid', value: fmt(totalA) },
    ];
    let y = addStatRow(doc, stats, 40);
    autoTable(doc, {
      startY: y,
      head: [['Month', 'Hours', 'Amount']],
      body: rows,
      foot: [['Total', fmtH(totalH), fmt(totalA)]],
      headStyles: { fillColor: BRAND_COLOR, fontSize: 9, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8.5 },
      footStyles: { fillColor: [240, 253, 244], textColor: BRAND_COLOR, fontStyle: 'bold', fontSize: 9 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right', fontStyle: 'bold' } },
      margin: { left: 14, right: 14 },
    });
    doc.save(`salary-${employee.name.toLowerCase().replace(/\s+/g, '-')}-all-months.pdf`);
  } else {
    // All employees: group by employee, then month-year
    addHeader(doc, 'Salary Report — All Employees', 'Monthly summary per employee');
    const byEmp = {};
    allRecords.forEach((r) => {
      const empKey = r.employeeName;
      const d = new Date(r.date);
      const mKey = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
      const mLabel = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
      if (!byEmp[empKey]) byEmp[empKey] = { months: {}, totalH: 0, totalA: 0 };
      if (!byEmp[empKey].months[mKey]) byEmp[empKey].months[mKey] = { label: mLabel, hours: 0, amount: 0 };
      byEmp[empKey].months[mKey].hours += r.hours;
      byEmp[empKey].months[mKey].amount += r.amount;
      byEmp[empKey].totalH += r.hours;
      byEmp[empKey].totalA += r.amount;
    });
    const grandH = allRecords.reduce((s, r) => s + r.hours, 0);
    const grandA = allRecords.reduce((s, r) => s + r.amount, 0);
    const stats = [
      { label: 'Employees', value: Object.keys(byEmp).length },
      { label: 'Total Hours', value: fmtH(grandH) },
      { label: 'Total Paid', value: fmt(grandA) },
    ];
    let y = addStatRow(doc, stats, 40);
    Object.keys(byEmp).sort().forEach((empName) => {
      const emp = byEmp[empName];
      const rows = Object.keys(emp.months).sort().reverse().map((k) => [
        emp.months[k].label,
        fmtH(emp.months[k].hours),
        fmt(emp.months[k].amount),
      ]);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...BRAND_COLOR);
      doc.text(empName, 14, y + 5);
      y += 8;
      autoTable(doc, {
        startY: y,
        head: [['Month', 'Hours', 'Amount']],
        body: rows,
        foot: [['Total', fmtH(emp.totalH), fmt(emp.totalA)]],
        headStyles: { fillColor: BRAND_COLOR, fontSize: 8.5, fontStyle: 'bold' },
        bodyStyles: { fontSize: 8 },
        footStyles: { fillColor: [240, 253, 244], textColor: BRAND_COLOR, fontStyle: 'bold', fontSize: 8.5 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right', fontStyle: 'bold' } },
        margin: { left: 14, right: 14 },
      });
      y = doc.lastAutoTable.finalY + 10;
    });
    doc.save(`salary-all-employees-${new Date().toISOString().slice(0, 10)}.pdf`);
  }
}

// Salary dates are stored as UTC midnight of the chosen day, so the ISO prefix is the day itself.
const salaryDayKey = (r) => String(r.date).slice(0, 10);
const fmtSalaryDay = (key, opts = { weekday: 'short', day: 'numeric', month: 'short' }) =>
  new Date(`${key}T00:00:00`).toLocaleDateString('en-US', opts);
const bySalaryDayThenStart = (a, b) =>
  salaryDayKey(a).localeCompare(salaryDayKey(b)) || (a.startTime || '').localeCompare(b.startTime || '');

const SALARY_TABLE_STYLE = {
  headStyles: { fillColor: BRAND_COLOR, fontSize: 8.5, fontStyle: 'bold' },
  bodyStyles: { fontSize: 8 },
  footStyles: { fillColor: [240, 253, 244], textColor: BRAND_COLOR, fontStyle: 'bold', fontSize: 8.5 },
  alternateRowStyles: { fillColor: [248, 250, 252] },
  margin: { left: 14, right: 14 },
  // Default repeats the totals row on every page, which reads as a wrong subtotal mid-table.
  showFoot: 'lastPage',
};

// columnStyles only reach body cells; this keeps header and total cells in line with the numbers.
const alignRight = (cols) => ({
  columnStyles: Object.fromEntries(cols.map((c, i) => [c, { halign: 'right', ...(i === cols.length - 1 && { fontStyle: 'bold' }) }])),
  didParseCell: (data) => { if (cols.includes(data.column.index)) data.cell.styles.halign = 'right'; },
});

function salaryTotals(records) {
  return {
    hours: records.reduce((s, r) => s + r.hours, 0),
    amount: records.reduce((s, r) => s + r.amount, 0),
  };
}

function addSectionTitle(doc, text, y) {
  if (y > 260) { doc.addPage(); y = 20; }
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...BRAND_COLOR);
  doc.text(text, 14, y + 5);
  return y + 8;
}

// One day, every employee who worked it.
export function exportSalaryDailyPDF({ date, records }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const fmt = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 });
  const fmtH = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 });

  const sorted = [...records].sort((a, b) =>
    a.employeeName.localeCompare(b.employeeName) || (a.startTime || '').localeCompare(b.startTime || ''));
  const totals = salaryTotals(sorted);

  addHeader(doc, 'Daily Salary Report', fmtSalaryDay(date, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }));
  const y = addStatRow(doc, [
    { label: 'Employees', value: new Set(sorted.map((r) => r.employeeName)).size },
    { label: 'Total Hours', value: fmtH(totals.hours) },
    { label: 'Total Paid', value: fmt(totals.amount) },
  ], 40);

  autoTable(doc, {
    ...SALARY_TABLE_STYLE,
    startY: y,
    head: [['Employee', 'Start', 'End', 'Hours', 'Amount']],
    body: sorted.map((r) => [r.employeeName, r.startTime || '—', r.endTime || '—', fmtH(r.hours), fmt(r.amount)]),
    foot: [['Total', '', '', fmtH(totals.hours), fmt(totals.amount)]],
    ...alignRight([3, 4]),
  });

  doc.save(`salary-daily-${date}.pdf`);
}

// One month, day by day. With an employee: just their days. Without: per-day totals across
// everyone, followed by a day-by-day section for each employee.
export function exportSalaryMonthDailyPDF({ month, year, records, employee }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const fmt = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 });
  const fmtH = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  const monthLabel = `${MONTH_NAMES[month]} ${year}`;
  const sorted = [...records].sort(bySalaryDayThenStart);
  const totals = salaryTotals(sorted);
  const days = new Set(sorted.map(salaryDayKey));

  const entryTable = (rows, startY) => {
    const t = salaryTotals(rows);
    autoTable(doc, {
      ...SALARY_TABLE_STYLE,
      startY,
      head: [['Date', 'Start', 'End', 'Hours', 'Amount']],
      body: rows.map((r) => [fmtSalaryDay(salaryDayKey(r)), r.startTime || '—', r.endTime || '—', fmtH(r.hours), fmt(r.amount)]),
      foot: [['Total', '', '', fmtH(t.hours), fmt(t.amount)]],
      ...alignRight([3, 4]),
    });
    return doc.lastAutoTable.finalY + 10;
  };

  if (employee) {
    addHeader(doc, `Salary Report — ${employee.name}`, `${monthLabel}  ·  day by day`);
    const y = addStatRow(doc, [
      { label: 'Days Worked', value: days.size },
      { label: 'Total Hours', value: fmtH(totals.hours) },
      { label: 'Total Paid', value: fmt(totals.amount) },
    ], 40);
    entryTable(sorted, y);
    doc.save(`salary-${employee.name.toLowerCase().replace(/\s+/g, '-')}-${year}-${String(month + 1).padStart(2, '0')}-daily.pdf`);
    return;
  }

  addHeader(doc, 'Salary Report — All Employees', `${monthLabel}  ·  day by day`);
  const byEmp = {};
  sorted.forEach((r) => { (byEmp[r.employeeName] ||= []).push(r); });
  let y = addStatRow(doc, [
    { label: 'Employees', value: Object.keys(byEmp).length },
    { label: 'Days', value: days.size },
    { label: 'Total Hours', value: fmtH(totals.hours) },
    { label: 'Total Paid', value: fmt(totals.amount) },
  ], 40);

  const byDay = {};
  sorted.forEach((r) => {
    const k = salaryDayKey(r);
    byDay[k] ||= { employees: new Set(), hours: 0, amount: 0 };
    byDay[k].employees.add(r.employeeName);
    byDay[k].hours += r.hours;
    byDay[k].amount += r.amount;
  });
  y = addSectionTitle(doc, 'Daily Totals — All Employees', y);
  autoTable(doc, {
    ...SALARY_TABLE_STYLE,
    startY: y,
    head: [['Date', 'Employees', 'Hours', 'Amount']],
    body: Object.keys(byDay).sort().map((k) => [fmtSalaryDay(k), byDay[k].employees.size, fmtH(byDay[k].hours), fmt(byDay[k].amount)]),
    foot: [['Total', '', fmtH(totals.hours), fmt(totals.amount)]],
    ...alignRight([1, 2, 3]),
  });
  y = doc.lastAutoTable.finalY + 12;

  Object.keys(byEmp).sort().forEach((name) => {
    y = addSectionTitle(doc, name, y);
    y = entryTable(byEmp[name], y);
  });

  doc.save(`salary-all-employees-${year}-${String(month + 1).padStart(2, '0')}-daily.pdf`);
}

// Per-item purchases and sales over a period. Every item is listed, in alphabetical order;
// rows with movement in the period are tinted so they stand out from the untouched ones.
export function exportStockMovementPDF({ periodLabel, yardLabel, rows, totals }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  const W = 297;
  const fmt = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const int = (n) => Number(n).toLocaleString('en-US');
  const active = rows.filter((r) => r.active);

  addHeader(doc, 'Purchases & Sales Report', `${periodLabel}  ·  ${yardLabel}`, W);
  const y = addStatRow(doc, [
    { label: 'Items', value: int(rows.length) },
    { label: 'With Movement', value: int(active.length) },
    { label: 'Purchased (kg)', value: fmt(totals.purchaseWeight) },
    { label: 'Purchased Value', value: fmt(totals.purchaseValue) },
    { label: 'Sold (kg)', value: fmt(totals.saleWeight) },
    { label: 'Sold Value', value: fmt(totals.saleValue) },
  ], 40, W);

  const numeric = [1, 2, 3, 4];
  autoTable(doc, {
    startY: y,
    head: [[
      { content: 'Item', rowSpan: 2 },
      { content: 'Purchased', colSpan: 2, styles: { halign: 'center' } },
      { content: 'Sold', colSpan: 2, styles: { halign: 'center' } },
    ], ['Weight (kg)', 'Value', 'Weight (kg)', 'Value']],
    body: rows.map((r) => [r.name, fmt(r.purchaseWeight), fmt(r.purchaseValue), fmt(r.saleWeight), fmt(r.saleValue)]),
    foot: [['Total', fmt(totals.purchaseWeight), fmt(totals.purchaseValue), fmt(totals.saleWeight), fmt(totals.saleValue)]],
    headStyles: { fillColor: BRAND_COLOR, fontSize: 9, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8.5, textColor: DARK },
    footStyles: { fillColor: [240, 253, 244], textColor: BRAND_COLOR, fontStyle: 'bold', fontSize: 9.5 },
    columnStyles: Object.fromEntries(numeric.map((c) => [c, { halign: 'right' }])),
    didParseCell: (data) => {
      if (data.section === 'body') {
        const row = rows[data.row.index];
        if (row?.active) {
          data.cell.styles.fillColor = [220, 252, 231]; // moved in this period
          data.cell.styles.textColor = [22, 101, 52];
          data.cell.styles.fontStyle = 'bold';
        } else {
          data.cell.styles.textColor = MUTED;
        }
      }
      if (data.section !== 'head' || data.row.index === 1) {
        if (numeric.includes(data.column.index)) data.cell.styles.halign = 'right';
      }
    },
    showFoot: 'lastPage',
    margin: { left: 14, right: 14 },
  });

  doc.save(`purchases-sales-${periodLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.pdf`);
}

const MONTH_NAMES_PDF = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function exportIncomePDF({ filtered, totalFiltered, period, selectedTagObj }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const parts = [];
  if (period !== 'all') parts.push(`Period: ${period}`);
  if (selectedTagObj) parts.push(`Tag: ${selectedTagObj.name}`);
  const subtitle = parts.length ? parts.join('  ·  ') : 'All records';

  addHeader(doc, 'Income Report', subtitle);

  const stats = [
    { label: 'Records', value: filtered.length },
    { label: 'Total Income', value: Number(totalFiltered).toLocaleString('en-US', { minimumFractionDigits: 2 }) },
  ];

  let y = addStatRow(doc, stats, 40);

  autoTable(doc, {
    startY: y,
    head: [['Date', 'Description', 'Yard', 'Tags', 'Amount']],
    body: filtered.map((inc) => [
      new Date(inc.createdAt).toLocaleDateString(),
      inc.description || '—',
      inc.yard || 'hospital',
      inc.tags?.map((t) => t.name).join(', ') || '—',
      Number(inc.amount).toLocaleString('en-US', { minimumFractionDigits: 2 }),
    ]),
    headStyles: { fillColor: BRAND_COLOR, fontSize: 9, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8.5 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 4: { halign: 'right', fontStyle: 'bold' } },
    margin: { left: 14, right: 14 },
  });

  doc.save(`income-report-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function exportExpensesPDF({ filtered, totalFiltered, period, selectedTagObj }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const parts = [];
  if (period !== 'all') parts.push(`Period: ${period}`);
  if (selectedTagObj) parts.push(`Tag: ${selectedTagObj.name}`);
  const subtitle = parts.length ? parts.join('  ·  ') : 'All records';

  addHeader(doc, 'Expenses Report', subtitle);

  const stats = [
    { label: 'Expenses', value: filtered.length },
    { label: 'Total Amount', value: Number(totalFiltered).toLocaleString('en-US', { minimumFractionDigits: 2 }) },
  ];

  let y = addStatRow(doc, stats, 40);

  autoTable(doc, {
    startY: y,
    head: [['Date', 'Description', 'Tags', 'Amount']],
    body: filtered.map((e) => [
      new Date(e.createdAt).toLocaleDateString(),
      e.description || '—',
      e.tags?.map((t) => t.name).join(', ') || '—',
      Number(e.amount).toLocaleString('en-US', { minimumFractionDigits: 2 }),
    ]),
    headStyles: { fillColor: BRAND_COLOR, fontSize: 9, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8.5 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 3: { halign: 'right', fontStyle: 'bold' } },
    margin: { left: 14, right: 14 },
  });

  doc.save(`expenses-report-${new Date().toISOString().slice(0, 10)}.pdf`);
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function exportSupplierPDF({ supplier, itemRows, monthGrandTotal, monthGrandWeight, monthTxs, selectedMonth, selectedYear }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  addHeader(doc, `Supplier Report — ${supplier.name}`, `${MONTH_NAMES[selectedMonth]} ${selectedYear}${supplier.phone ? `  ·  ${supplier.phone}` : ''}`);

  const stats = [
    { label: 'Transactions', value: monthTxs.length },
    { label: 'Total Weight', value: `${Number(monthGrandWeight).toLocaleString('en-US', { minimumFractionDigits: 2 })} kg` },
    { label: 'Total Paid', value: Number(monthGrandTotal).toLocaleString('en-US', { minimumFractionDigits: 2 }) },
  ];

  let y = addStatRow(doc, stats, 40);

  autoTable(doc, {
    startY: y,
    head: [['Item', 'Transactions', 'Total Weight', 'Total Amount']],
    body: itemRows.map((row) => [
      row.name,
      row.count,
      `${Number(row.totalWeight).toLocaleString('en-US', { minimumFractionDigits: 2 })} kg`,
      Number(row.totalAmount).toLocaleString('en-US', { minimumFractionDigits: 2 }),
    ]),
    foot: [[
      'Total', '',
      `${Number(monthGrandWeight).toLocaleString('en-US', { minimumFractionDigits: 2 })} kg`,
      Number(monthGrandTotal).toLocaleString('en-US', { minimumFractionDigits: 2 }),
    ]],
    headStyles: { fillColor: BRAND_COLOR, fontSize: 9, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8.5 },
    footStyles: { fillColor: [240, 253, 244], textColor: BRAND_COLOR, fontStyle: 'bold', fontSize: 9 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right', fontStyle: 'bold' } },
    margin: { left: 14, right: 14 },
  });

  doc.save(`supplier-${supplier.name.toLowerCase().replace(/\s+/g, '-')}-${MONTH_NAMES[selectedMonth].toLowerCase()}-${selectedYear}.pdf`);
}

export function exportCustomerPDF({ customer, itemRows, monthGrandTotal, monthGrandWeight, monthSales, selectedMonth, selectedYear }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  addHeader(doc, `Customer Report — ${customer.name}`, `${MONTH_NAMES[selectedMonth]} ${selectedYear}${customer.phone ? `  ·  ${customer.phone}` : ''}`);

  const stats = [
    { label: 'Sales', value: monthSales.length },
    { label: 'Total Weight', value: `${Number(monthGrandWeight).toLocaleString('en-US', { minimumFractionDigits: 2 })} kg` },
    { label: 'Total Received', value: Number(monthGrandTotal).toLocaleString('en-US', { minimumFractionDigits: 2 }) },
  ];

  let y = addStatRow(doc, stats, 40);

  autoTable(doc, {
    startY: y,
    head: [['Item', 'Sales', 'Total Weight', 'Total Amount']],
    body: itemRows.map((row) => [
      row.name,
      row.count,
      `${Number(row.totalWeight).toLocaleString('en-US', { minimumFractionDigits: 2 })} kg`,
      Number(row.totalAmount).toLocaleString('en-US', { minimumFractionDigits: 2 }),
    ]),
    foot: [[
      'Total', '',
      `${Number(monthGrandWeight).toLocaleString('en-US', { minimumFractionDigits: 2 })} kg`,
      Number(monthGrandTotal).toLocaleString('en-US', { minimumFractionDigits: 2 }),
    ]],
    headStyles: { fillColor: BRAND_COLOR, fontSize: 9, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8.5 },
    footStyles: { fillColor: [240, 253, 244], textColor: BRAND_COLOR, fontStyle: 'bold', fontSize: 9 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right', fontStyle: 'bold' } },
    margin: { left: 14, right: 14 },
  });

  doc.save(`customer-${customer.name.toLowerCase().replace(/\s+/g, '-')}-${MONTH_NAMES[selectedMonth].toLowerCase()}-${selectedYear}.pdf`);
}

export function exportPLPDF({
  from, to, yardLabel,
  filteredTransactions, filteredSales, filteredExpenses, filteredIncomes, filteredSalaries,
  totalRevenue, totalIncome, totalPurchases, totalExpenses, totalSalaries, netPL,
}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const fmt = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 });
  const fmtDate = (d) => new Date(d).toLocaleDateString();
  const isProfit = netPL >= 0;

  addHeader(doc, 'Profit & Loss Report', `${from}  to  ${to}  ·  ${yardLabel}`);

  let y = addStatRow(doc, [
    { label: 'Sales Revenue', value: fmt(totalRevenue) },
    { label: 'Other Income', value: fmt(totalIncome) },
    { label: 'Purchases Cost', value: fmt(totalPurchases) },
  ], 40);
  y = addStatRow(doc, [
    { label: 'Expenses', value: fmt(totalExpenses) },
    { label: 'Salaries', value: fmt(totalSalaries) },
    { label: isProfit ? 'Net Profit' : 'Net Loss', value: (isProfit ? '+' : '') + fmt(netPL) },
  ], y);

  // Net P/L highlight box
  doc.setFillColor(...(isProfit ? [220, 252, 231] : [254, 226, 226]));
  doc.roundedRect(14, y, 182, 14, 2, 2, 'F');
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...(isProfit ? BRAND_COLOR : [220, 38, 38]));
  doc.text(`${isProfit ? 'NET PROFIT' : 'NET LOSS'}: ${(isProfit ? '+' : '') + fmt(netPL)}`, 105, y + 9, { align: 'center' });
  y += 20;

  const section = ({ title, color, footFill, head, rows, total }) => {
    if (y > 260) { doc.addPage(); y = 20; }
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...color);
    doc.text(`${title}  (${rows.length} records)`, 14, y + 5);
    const last = head.length - 1;
    autoTable(doc, {
      startY: y + 8,
      head: [head],
      body: rows,
      foot: [[...Array(last - 1).fill(''), 'Total', fmt(total)]],
      headStyles: { fillColor: color, fontSize: 8.5, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8 },
      footStyles: { fillColor: footFill, textColor: color, fontStyle: 'bold', fontSize: 9 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { [last]: { halign: 'right', fontStyle: 'bold' } },
      didParseCell: (data) => { if (data.column.index === last) data.cell.styles.halign = 'right'; },
      showFoot: 'lastPage',
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 10;
  };

  section({
    title: 'Sales', color: BRAND_COLOR, footFill: [220, 252, 231], total: totalRevenue,
    head: ['Date', 'Customer', 'Items', 'Amount'],
    rows: filteredSales.map((s) => [fmtDate(s.createdAt), s.customerName || '—', s.items.map((i) => i.materialName).join(', '), fmt(s.grandTotal)]),
  });
  section({
    title: 'Other Income', color: [8, 145, 178], footFill: [224, 242, 254], total: totalIncome,
    head: ['Date', 'Description', 'Tags', 'Amount'],
    rows: filteredIncomes.map((inc) => [fmtDate(inc.createdAt), inc.description || '—', inc.tags?.map((t) => t.name).join(', ') || '—', fmt(inc.amount)]),
  });
  section({
    title: 'Purchases', color: [180, 83, 9], footFill: [254, 243, 199], total: totalPurchases,
    head: ['Date', 'Supplier', 'Items', 'Amount'],
    rows: filteredTransactions.map((tx) => [fmtDate(tx.createdAt), tx.supplierName || '—', tx.items.map((i) => i.materialName).join(', '), fmt(tx.grandTotal)]),
  });
  section({
    title: 'Expenses', color: [220, 38, 38], footFill: [254, 226, 226], total: totalExpenses,
    head: ['Date', 'Description', 'Tags', 'Amount'],
    rows: filteredExpenses.map((e) => [fmtDate(e.createdAt), e.description || '—', e.tags?.map((t) => t.name).join(', ') || '—', fmt(e.amount)]),
  });
  section({
    title: 'Salaries', color: [124, 58, 237], footFill: [237, 233, 254], total: totalSalaries,
    head: ['Date', 'Employee', 'Time', 'Hours', 'Amount'],
    rows: filteredSalaries.map((r) => [
      fmtSalaryDay(salaryDayKey(r), { year: 'numeric', month: 'numeric', day: 'numeric' }),
      r.employeeName,
      r.startTime && r.endTime ? `${r.startTime} – ${r.endTime}` : '—',
      r.hours,
      fmt(r.amount),
    ]),
  });

  const yardSuffix = yardLabel === 'All Yards' ? '' : `-${yardLabel.toLowerCase()}`;
  doc.save(`pl-report-${from}-to-${to}${yardSuffix}.pdf`);
}
