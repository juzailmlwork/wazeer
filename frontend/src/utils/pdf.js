import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const BRAND_COLOR = [22, 163, 74]; // --primary green
const MUTED = [120, 120, 120];
const DARK = [30, 30, 30];

function addHeader(doc, title, subtitle) {
  doc.setFillColor(...BRAND_COLOR);
  doc.rect(0, 0, 210, 16, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Wazeer', 14, 10.5);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), 196, 10.5, { align: 'right' });

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

function addStatRow(doc, stats, y) {
  const colW = (210 - 28) / stats.length;
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

export function exportPurchasesPDF({ filtered, filterMaterial, selectedMaterial, filterSupplier, selectedSupplier, period, totalValue, totalWeight }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const parts = [];
  if (period !== 'all') parts.push(`Period: ${period}`);
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
