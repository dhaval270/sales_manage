'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { formatDate, formatCurrency } from '@/lib/utils';
import type { Customer, Sale, CenterSale, CenterMembership, CenterMembershipVisit, CustomerHealthReading } from '@/types/database';
import {
  Plus, Search, Pencil, Trash2, Users, Activity,
  UserCheck, Dumbbell, X, FileText, Download, PlusCircle, ChevronDown, ChevronUp,
} from 'lucide-react';
import { format } from 'date-fns';

// ─── Toggle ───────────────────────────────────────────────────────────────────
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
        checked ? 'bg-primary' : 'bg-muted-foreground/30'
      }`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
        checked ? 'translate-x-6' : 'translate-x-1'
      }`} />
    </button>
  );
}

// ─── Health Field ─────────────────────────────────────────────────────────────
function HealthField({ label, normal, value, onChange, placeholder }: {
  label: string; normal?: string; value: string;
  onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-sm">{label}</Label>
      <Input type="number" step="0.1" placeholder={placeholder ?? '—'} value={value} onChange={(e) => onChange(e.target.value)} />
      {normal && <p className="text-xs text-muted-foreground">Normal: {normal}</p>}
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface CustomerForm {
  full_name: string; phone: string; date_of_birth: string; gender: string;
  status: string; referred_by: string; health_problem: string;
  is_daily_shake_member: boolean; is_distributor: boolean; notes: string;
}

interface HealthReadingEntry {
  _key: string;
  id?: number;
  reading_date: string;
  age: string;
  height_cm: string; weight_kg: string; bmi: string; body_fat_pct: string;
  visceral_fat: string; bmr_kcal: string; body_age: string;
  subcutaneous_fat_pct: string; trunk_subcutaneous_fat_pct: string;
  arms_subcutaneous_fat_pct: string; legs_subcutaneous_fat_pct: string;
  muscle_pct: string;
}

interface MembershipForm {
  reference: string; total_shakes: string; price: string;
  start_date: string; payment_status: 'pending' | 'paid';
}

interface ReportData {
  sales: Sale[];
  centerSales: CenterSale[];
  memberships: CenterMembership[];
  membershipVisits: CenterMembershipVisit[];
  healthReadings: CustomerHealthReading[];
}

const emptyForm = (): CustomerForm => ({
  full_name: '', phone: '', date_of_birth: '', gender: '', status: 'active',
  referred_by: '', health_problem: '',
  is_daily_shake_member: false, is_distributor: false, notes: '',
});

function calcAge(dob: string, onDate: string): string {
  if (!dob || !onDate) return '';
  const birth = new Date(dob);
  const ref = new Date(onDate);
  let age = ref.getFullYear() - birth.getFullYear();
  const m = ref.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < birth.getDate())) age--;
  return age >= 0 ? String(age) : '';
}

const emptyReading = (): HealthReadingEntry => ({
  _key: Math.random().toString(36).slice(2),
  reading_date: format(new Date(), 'yyyy-MM-dd'),
  age: '',
  height_cm: '', weight_kg: '', bmi: '', body_fat_pct: '',
  visceral_fat: '', bmr_kcal: '', body_age: '',
  subcutaneous_fat_pct: '', trunk_subcutaneous_fat_pct: '',
  arms_subcutaneous_fat_pct: '', legs_subcutaneous_fat_pct: '',
  muscle_pct: '',
});

const readingFromCustomer = (c: Customer): HealthReadingEntry => ({
  _key: Math.random().toString(36).slice(2),
  reading_date: c.created_at.slice(0, 10),
  age: calcAge(c.date_of_birth ?? '', c.created_at.slice(0, 10)),
  height_cm: c.height_cm?.toString() ?? '',
  weight_kg: c.weight_kg?.toString() ?? '',
  bmi: c.bmi?.toString() ?? '',
  body_fat_pct: c.body_fat_pct?.toString() ?? '',
  visceral_fat: c.visceral_fat?.toString() ?? '',
  bmr_kcal: c.bmr_kcal?.toString() ?? '',
  body_age: c.body_age ?? '',
  subcutaneous_fat_pct: c.subcutaneous_fat_pct?.toString() ?? '',
  trunk_subcutaneous_fat_pct: c.trunk_subcutaneous_fat_pct?.toString() ?? '',
  arms_subcutaneous_fat_pct: c.arms_subcutaneous_fat_pct?.toString() ?? '',
  legs_subcutaneous_fat_pct: c.legs_subcutaneous_fat_pct?.toString() ?? '',
  muscle_pct: c.muscle_pct?.toString() ?? '',
});

const dbReadingToEntry = (r: CustomerHealthReading): HealthReadingEntry => ({
  _key: r.id.toString(),
  id: r.id,
  reading_date: r.reading_date,
  age: r.age?.toString() ?? '',
  height_cm: r.height_cm?.toString() ?? '',
  weight_kg: r.weight_kg?.toString() ?? '',
  bmi: r.bmi?.toString() ?? '',
  body_fat_pct: r.body_fat_pct?.toString() ?? '',
  visceral_fat: r.visceral_fat?.toString() ?? '',
  bmr_kcal: r.bmr_kcal?.toString() ?? '',
  body_age: r.body_age ?? '',
  subcutaneous_fat_pct: r.subcutaneous_fat_pct?.toString() ?? '',
  trunk_subcutaneous_fat_pct: r.trunk_subcutaneous_fat_pct?.toString() ?? '',
  arms_subcutaneous_fat_pct: r.arms_subcutaneous_fat_pct?.toString() ?? '',
  legs_subcutaneous_fat_pct: r.legs_subcutaneous_fat_pct?.toString() ?? '',
  muscle_pct: r.muscle_pct?.toString() ?? '',
});

const emptyMembership = (): MembershipForm => ({
  reference: '', total_shakes: '1', price: '0',
  start_date: format(new Date(), 'yyyy-MM-dd'), payment_status: 'paid',
});

function numOrNull(v: string): number | null {
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

// ─── Shared print helpers ─────────────────────────────────────────────────────
const PRINT_BASE_STYLES = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;font-size:13px;color:#111;padding:32px}
  h1{font-size:22px;margin-bottom:2px}
  h2{font-size:14px;margin:24px 0 10px;color:#444;border-bottom:1px solid #e5e7eb;padding-bottom:6px}
  .sub{color:#666;font-size:12px;margin-bottom:20px}
  .meta{display:flex;justify-content:space-between;margin-bottom:20px;font-size:12px}
  .badges{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px}
  .badge{padding:2px 10px;border-radius:999px;font-size:11px;font-weight:600;border:1px solid}
  .badge.active{background:#dcfce7;color:#16a34a;border-color:#86efac}
  .badge.inactive{background:#f3f4f6;color:#6b7280;border-color:#d1d5db}
  .badge.blue{background:#dbeafe;color:#1d4ed8;border-color:#93c5fd}
  .badge.purple{background:#f3e8ff;color:#7c3aed;border-color:#c4b5fd}
  .health-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
  .health-item{background:#f9fafb;border-radius:6px;padding:8px 10px}
  .health-item .hl{font-size:10px;color:#888;margin-bottom:2px}
  .health-item .hv{font-size:13px;font-weight:600}
  table{width:100%;border-collapse:collapse;margin-bottom:8px}
  th{background:#f4f4f4;text-align:left;padding:7px 10px;font-size:11px;border-bottom:2px solid #ddd}
  td{padding:7px 10px;border-bottom:1px solid #eee;font-size:12px}
  .num{text-align:right}
  .status{padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600}
  .status.paid{background:#dcfce7;color:#16a34a}
  .status.pending{background:#fef9c3;color:#854d0e}
  .empty{color:#999;font-size:12px;padding:10px 0}
  .footer{margin-top:40px;font-size:11px;color:#999;text-align:center;border-top:1px solid #eee;padding-top:16px}
  .notes-box{background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:10px 12px;font-size:12px;color:#555}
  .scard{border:1px solid #e5e7eb;border-radius:8px;padding:12px}
  .scard .label{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px}
  .scard .value{font-size:18px;font-weight:700}
  .summary{display:grid;gap:12px;margin-bottom:24px}
  @media print{button{display:none}}
`;

function buildCustomerHeader(customer: Customer, managerName: string) {
  return `
  <h1>Customer Report</h1>
  <p class="sub">Herbalife Sales Manager</p>
  <div class="meta">
    <div>
      <strong>${customer.full_name}</strong>${customer.phone ? ' &nbsp;·&nbsp; ' + customer.phone : ''}<br/>
      ${customer.date_of_birth ? 'DOB: ' + customer.date_of_birth + ' &nbsp;·&nbsp; ' : ''}
      ${customer.gender ? customer.gender + ' &nbsp;·&nbsp; ' : ''}
      ${customer.health_problem ? 'Health: ' + customer.health_problem : ''}
    </div>
    <div style="text-align:right">
      <strong>Manager:</strong> ${managerName}<br/>
      <strong>Generated:</strong> ${new Date().toLocaleString()}
    </div>
  </div>
  <div class="badges">
    <span class="badge ${customer.status === 'active' ? 'active' : 'inactive'}">${customer.status}</span>
    ${customer.is_daily_shake_member ? '<span class="badge blue">Shake Member</span>' : ''}
    ${customer.is_distributor ? '<span class="badge purple">Distributor</span>' : ''}
    ${customer.referred_by ? `<span class="badge" style="background:#f0fdf4;color:#166534;border-color:#bbf7d0">Ref: ${customer.referred_by}</span>` : ''}
  </div>`;
}

function openPrintWindow(title: string, body: string) {
  const html = `<!DOCTYPE html><html>
<head><meta charset="utf-8"/><title>${title}</title><style>${PRINT_BASE_STYLES}</style></head>
<body>${body}<script>window.onload=()=>{window.print();}<\/script></body></html>`;
  const win = window.open('', '_blank');
  if (win) { win.document.write(html); win.document.close(); }
}

// ─── Print: Health Readings Report ───────────────────────────────────────────
function printHealthReport(customer: Customer, data: ReportData, managerName: string) {
  const tableStyles = `
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;font-size:11px;color:#111;padding:16px}
    .report-title{background:#2ecc71;color:#fff;text-align:center;font-size:16px;font-weight:700;padding:10px;border-radius:6px 6px 0 0}
    .meta{font-size:11px;color:#555;margin:10px 0 8px;display:flex;justify-content:space-between}
    .notes-box{background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:8px 10px;font-size:11px;color:#555;margin-top:12px}
    .footer{margin-top:16px;font-size:10px;color:#999;text-align:center;border-top:1px solid #eee;padding-top:10px}
    table{width:100%;border-collapse:collapse;border:2px solid #e8a000}
    thead tr.title-row th{background:#2ecc71;color:#fff;text-align:center;font-size:14px;font-weight:700;padding:8px;border:1px solid #2ecc71}
    thead tr.header-row th{background:#f5a800;color:#111;text-align:center;font-size:10px;font-weight:700;padding:6px 4px;border:1px solid #e8a000;vertical-align:middle;line-height:1.3}
    tbody tr td{text-align:center;padding:5px 4px;border:1px solid #e8a000;font-size:11px}
    tbody tr:nth-child(even) td{background:#fffbe6}
    @media print{button{display:none}body{padding:8px}}
  `;

  const rowsHtml = data.healthReadings.length > 0
    ? data.healthReadings.map(r => `
        <tr>
          <td>${r.reading_date}</td>
          <td>${r.age ?? ''}</td>
          <td>${r.height_cm ?? ''}</td>
          <td>${r.weight_kg ?? ''}</td>
          <td>${r.body_fat_pct ?? ''}</td>
          <td>${r.visceral_fat ?? ''}</td>
          <td>${r.bmr_kcal ?? ''}</td>
          <td>${r.bmi ?? ''}</td>
          <td>${r.body_age ?? ''}</td>
          <td>${r.subcutaneous_fat_pct ?? ''}</td>
          <td>${r.trunk_subcutaneous_fat_pct ?? ''}</td>
          <td>${r.arms_subcutaneous_fat_pct ?? ''}</td>
          <td>${r.legs_subcutaneous_fat_pct ?? ''}</td>
          <td>${r.muscle_pct ?? ''}</td>
        </tr>`).join('')
    : `<tr><td colspan="14" style="text-align:center;color:#999;padding:16px">No health readings recorded.</td></tr>`;

  const html = `<!DOCTYPE html><html>
<head><meta charset="utf-8"/><title>Health Report — ${customer.full_name}</title><style>${tableStyles}</style></head>
<body>
  <div class="meta">
    <span><strong>${customer.full_name}</strong>${customer.phone ? ' · ' + customer.phone : ''}${customer.date_of_birth ? ' · DOB: ' + customer.date_of_birth : ''}${customer.gender ? ' · ' + customer.gender : ''}</span>
    <span><strong>Manager:</strong> ${managerName} &nbsp;·&nbsp; ${new Date().toLocaleDateString()}</span>
  </div>
  <table>
    <thead>
      <tr class="title-row"><th colspan="14">My Fat Analysis Report</th></tr>
      <tr class="header-row">
        <th>Date</th>
        <th>Age</th>
        <th>Height</th>
        <th>Weight</th>
        <th>Body Fat<br/>M:14-17%<br/>F:21-24%</th>
        <th>Visceral Fat<br/>2 to 8</th>
        <th>BMR<br/>1800 to 2000</th>
        <th>BMI<br/>20 to 23</th>
        <th>Body Age</th>
        <th>Subcutaneous<br/>Fat</th>
        <th>Trunk Body<br/>Subcutaneous Fat<br/>Less Than 20%</th>
        <th>Arms<br/>Less than 22%</th>
        <th>Legs<br/>Less than 20%</th>
        <th>Muscle<br/>M:33-36%<br/>F:30-33%</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  ${customer.notes ? `<div class="notes-box"><strong>Notes:</strong> ${customer.notes}</div>` : ''}
  <div class="footer">Herbalife Sales Manager &nbsp;·&nbsp; Health Report &nbsp;·&nbsp; ${customer.full_name} &nbsp;·&nbsp; ${new Date().toLocaleDateString()}</div>
  <script>window.onload=()=>{window.print();}<\/script>
</body></html>`;

  const win = window.open('', '_blank');
  if (win) { win.document.write(html); win.document.close(); }
}

// ─── Print: History Report (Sales + Center + Memberships) ────────────────────
function printHistoryReport(customer: Customer, data: ReportData, managerName: string) {
  const visitsByMembership = data.membershipVisits.reduce((map, v) => {
    if (!map.has(v.membership_id)) map.set(v.membership_id, []);
    map.get(v.membership_id)!.push(v.visit_date);
    return map;
  }, new Map<number, string[]>());

  const totalSalesSpent = data.sales.reduce((a, s) => a + s.retail_price * s.quantity, 0);
  const totalSalesVP = data.sales.reduce((a, s) => a + (s.volume_points ?? 0) * s.quantity, 0);
  const totalCenterSpent = data.centerSales.reduce((a, s) => a + s.fixed_price * s.quantity, 0);
  const totalMembershipSpent = data.memberships.reduce((a, m) => a + m.price, 0);
  const totalProfit = data.sales.filter(s => s.payment_status === 'done').reduce((a, s) => a + (s.profit ?? 0) * s.quantity, 0);

  const salesRowsHtml = data.sales.map(s => {
    const isPaid = s.payment_status === 'done';
    const profitCell = isPaid
      ? `<td class="num" style="color:#16a34a">₹${((s.profit ?? 0) * s.quantity).toFixed(2)}</td>`
      : `<td class="num" style="color:#9ca3af">—</td>`;
    return `
    <tr>
      <td>${s.date}</td><td>${s.product_name}</td>
      <td class="num">${s.quantity}</td>
      <td class="num">₹${s.my_price.toFixed(2)}</td>
      <td class="num">₹${s.retail_price.toFixed(2)}</td>
      <td class="num">₹${(s.my_price * s.quantity).toFixed(2)}</td>
      <td class="num">₹${(s.retail_price * s.quantity).toFixed(2)}</td>
      ${profitCell}
      <td class="num" style="color:#7c3aed">${((s.volume_points ?? 0) * s.quantity).toFixed(2)}</td>
      <td><span class="status ${isPaid ? 'paid' : 'pending'}">${isPaid ? 'Paid' : 'Pending'}</span></td>
      <td>${s.payment_method ?? '—'}</td>
    </tr>`;
  }).join('');

  const centerRowsHtml = data.centerSales.map(s => `
    <tr>
      <td>${s.date}</td><td>${s.product_name}</td>
      <td class="num">${s.quantity}</td>
      <td class="num">₹${s.fixed_price.toFixed(2)}</td>
      <td class="num">₹${(s.fixed_price * s.quantity).toFixed(2)}</td>
      <td><span class="status ${s.payment_status === 'done' ? 'paid' : 'pending'}">${s.payment_status === 'done' ? 'Paid' : 'Pending'}</span></td>
    </tr>`).join('');

  const memRowsHtml = data.memberships.map(m => {
    const visits = visitsByMembership.get(m.id) ?? [];
    const remaining = m.total_shakes - visits.length;
    const visitDatesHtml = visits.length > 0
      ? visits.map(d => `<span style="display:inline-block;background:#dcfce7;color:#16a34a;border-radius:4px;padding:1px 6px;font-size:10px;margin:1px">${d}</span>`).join(' ')
      : '<span style="color:#999;font-size:11px">No visits yet</span>';
    return `
    <tr>
      <td>${m.start_date}</td>
      <td class="num">${m.total_shakes}</td>
      <td class="num">${visits.length} / ${m.total_shakes}</td>
      <td class="num" style="color:${remaining > 0 ? '#16a34a' : '#6b7280'}">${remaining}</td>
      <td class="num">₹${m.price.toFixed(2)}</td>
      <td>${m.reference || '—'}</td>
      <td><span class="status ${m.payment_status === 'paid' ? 'paid' : 'pending'}">${m.payment_status === 'paid' ? 'Paid' : 'Pending'}</span></td>
      <td>${visitDatesHtml}</td>
    </tr>`;
  }).join('');

  openPrintWindow(`History Report — ${customer.full_name}`, `
    ${buildCustomerHeader(customer, managerName)}
    <div class="summary" style="grid-template-columns:repeat(4,1fr)">
      <div class="scard"><div class="label">Sales Records</div><div class="value">${data.sales.length}</div></div>
      <div class="scard"><div class="label">Sales Spent</div><div class="value" style="color:#be123c">₹${totalSalesSpent.toFixed(2)}</div></div>
      <div class="scard"><div class="label">Center Records</div><div class="value" style="color:#b45309">${data.centerSales.length}</div></div>
      <div class="scard"><div class="label">Memberships</div><div class="value" style="color:#1d4ed8">${data.memberships.length}</div></div>
    </div>

    <h2>Sales History (${data.sales.length} records · Retail ₹${totalSalesSpent.toFixed(2)} · Profit ₹${totalProfit.toFixed(2)} paid only · ${totalSalesVP.toFixed(2)} VP)</h2>
    ${data.sales.length > 0 ? `
    <table>
      <thead><tr><th>Date</th><th>Product</th><th class="num">Qty</th><th class="num">My Price</th><th class="num">Retail Price</th><th class="num">Total My</th><th class="num">Total Retail</th><th class="num">Profit</th><th class="num">VP</th><th>Status</th><th>Method</th></tr></thead>
      <tbody>${salesRowsHtml}</tbody>
    </table>` : '<p class="empty">No sales records found.</p>'}

    <h2>Center Sales History (${data.centerSales.length} records · Total ₹${totalCenterSpent.toFixed(2)})</h2>
    ${data.centerSales.length > 0 ? `
    <table>
      <thead><tr><th>Date</th><th>Item</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Total</th><th>Payment</th></tr></thead>
      <tbody>${centerRowsHtml}</tbody>
    </table>` : '<p class="empty">No center sales records found.</p>'}

    <h2>Memberships (${data.memberships.length} plans · Total ₹${totalMembershipSpent.toFixed(2)})</h2>
    ${data.memberships.length > 0 ? `
    <table>
      <thead><tr><th>Start Date</th><th class="num">Total</th><th class="num">Used</th><th class="num">Left</th><th class="num">Price</th><th>Reference</th><th>Payment</th><th>Visit Dates</th></tr></thead>
      <tbody>${memRowsHtml}</tbody>
    </table>` : '<p class="empty">No memberships found.</p>'}

    ${customer.notes ? `<h2>Notes</h2><div class="notes-box">${customer.notes}</div>` : ''}
    <div class="footer">Herbalife Sales Manager &nbsp;·&nbsp; History Report &nbsp;·&nbsp; ${customer.full_name} &nbsp;·&nbsp; ${new Date().toLocaleDateString()}</div>
  `);
}

// ─── Health Reading Card ──────────────────────────────────────────────────────
function HealthReadingCard({
  reading, index, total, onChange, onDelete, collapsed, onToggleCollapse, dateOfBirth,
}: {
  reading: HealthReadingEntry;
  index: number;
  total: number;
  onChange: (key: keyof HealthReadingEntry, value: string) => void;
  onDelete: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  dateOfBirth?: string;
}) {
  return (
    <div className="rounded-lg border overflow-hidden">
      <div
        className="flex items-center justify-between px-3 py-2 bg-muted/40 cursor-pointer select-none"
        onClick={onToggleCollapse}
      >
        <div className="flex items-center gap-2">
          {collapsed ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />}
          <span className="text-sm font-medium">Reading {index + 1}</span>
          {reading.reading_date && <span className="text-xs text-muted-foreground">— {reading.reading_date}</span>}
          {reading.weight_kg && <span className="text-xs text-muted-foreground">· {reading.weight_kg} kg</span>}
          {reading.bmi && <span className="text-xs text-muted-foreground">· BMI {reading.bmi}</span>}
        </div>
        {total > 1 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="text-destructive hover:text-destructive/70 p-1"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {!collapsed && (
        <div className="p-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-sm">Date of Reading <span className="text-destructive">*</span></Label>
              <Input type="date" value={reading.reading_date} onChange={(e) => {
                onChange('reading_date', e.target.value);
                if (dateOfBirth) onChange('age', calcAge(dateOfBirth, e.target.value));
              }} />
            </div>
            <div className="space-y-1">
              <Label className="text-sm">Age (years)</Label>
              <Input type="number" step="1" placeholder="—" value={reading.age} onChange={(e) => onChange('age', e.target.value)} />
              {dateOfBirth && <p className="text-xs text-muted-foreground">Auto from DOB</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <HealthField label="Height (cm)" value={reading.height_cm} onChange={(v) => onChange('height_cm', v)} placeholder="165" />
            <HealthField label="Weight (kg)" value={reading.weight_kg} onChange={(v) => onChange('weight_kg', v)} placeholder="70.5" />
            <HealthField label="Body Fat (%)" normal="M: 14–17%  F: 21–24%" value={reading.body_fat_pct} onChange={(v) => onChange('body_fat_pct', v)} placeholder="25.0" />
            <HealthField label="Visceral Fat" normal="2–8" value={reading.visceral_fat} onChange={(v) => onChange('visceral_fat', v)} placeholder="5" />
            <HealthField label="BMR (kcal)" normal="1800–2000" value={reading.bmr_kcal} onChange={(v) => onChange('bmr_kcal', v)} placeholder="1850" />
            <HealthField label="BMI" normal="20–23" value={reading.bmi} onChange={(v) => onChange('bmi', v)} placeholder="22.5" />
            <div className="space-y-1">
              <Label className="text-sm">Body Age</Label>
              <Input placeholder="—" value={reading.body_age} onChange={(e) => onChange('body_age', e.target.value)} />
            </div>
            <HealthField label="Subcutaneous Fat (%)" normal="< 20%" value={reading.subcutaneous_fat_pct} onChange={(v) => onChange('subcutaneous_fat_pct', v)} placeholder="18" />
            <HealthField label="Trunk Subcutaneous Fat (%)" normal="< 20%" value={reading.trunk_subcutaneous_fat_pct} onChange={(v) => onChange('trunk_subcutaneous_fat_pct', v)} placeholder="12" />
            <HealthField label="Arms Subcutaneous Fat (%)" normal="< 22%" value={reading.arms_subcutaneous_fat_pct} onChange={(v) => onChange('arms_subcutaneous_fat_pct', v)} placeholder="20" />
            <HealthField label="Legs Subcutaneous Fat (%)" normal="< 20%" value={reading.legs_subcutaneous_fat_pct} onChange={(v) => onChange('legs_subcutaneous_fat_pct', v)} placeholder="18" />
            <HealthField label="Muscle (%)" normal="M: 33–36%  F: 30–33%" value={reading.muscle_pct} onChange={(v) => onChange('muscle_pct', v)} placeholder="34.0" />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function CustomersPage() {
  const { toast } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [referSearch, setReferSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState<CustomerForm>(emptyForm());
  const [healthReadings, setHealthReadings] = useState<HealthReadingEntry[]>([emptyReading()]);
  const [deletedReadingIds, setDeletedReadingIds] = useState<number[]>([]);
  const [collapsedReadings, setCollapsedReadings] = useState<Set<string>>(new Set());
  const [membership, setMembership] = useState<MembershipForm>(emptyMembership());
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [managerName, setManagerName] = useState('Manager');
  const [filterType, setFilterType] = useState<'all' | 'active' | 'shake_member' | 'distributor'>('all');
  const [showAdditionalMembership, setShowAdditionalMembership] = useState(false);

  // Report state
  const [reportCustomer, setReportCustomer] = useState<Customer | null>(null);
  const [reportData, setReportData] = useState<ReportData>({ sales: [], centerSales: [], memberships: [], membershipVisits: [], healthReadings: [] });
  const [reportLoading, setReportLoading] = useState(false);
  const [showHealthReadings, setShowHealthReadings] = useState(false);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const [{ data }, { data: { user } }] = await Promise.all([
      supabase.from('customers').select('*').order('created_at', { ascending: false }),
      supabase.auth.getUser(),
    ]);
    setCustomers(data ?? []);
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('first_name, last_name').eq('id', user.id).single();
      if (profile) setManagerName(`${profile.first_name} ${profile.last_name}`);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  const openReport = async (c: Customer) => {
    setReportCustomer(c);
    setShowHealthReadings(false);
    setReportLoading(true);
    const supabase = createClient();
    const [{ data: sales }, { data: centerSales }, { data: memberships }, { data: dbReadings }] = await Promise.all([
      supabase.from('sales').select('*').eq('customer_name', c.full_name).order('date', { ascending: false }),
      supabase.from('center_sales').select('*').eq('customer_name', c.full_name).order('date', { ascending: false }),
      supabase.from('center_memberships').select('*').eq('customer_name', c.full_name).order('start_date', { ascending: false }),
      supabase.from('customer_health_readings').select('*').eq('customer_id', c.id).order('reading_date', { ascending: true }),
    ]);
    const membershipIds = (memberships ?? []).map(m => m.id);
    let membershipVisits: CenterMembershipVisit[] = [];
    if (membershipIds.length > 0) {
      const { data: visits } = await supabase.from('center_membership_visits').select('*').in('membership_id', membershipIds).order('visit_date', { ascending: true });
      membershipVisits = visits ?? [];
    }
    setReportData({
      sales: sales ?? [],
      centerSales: centerSales ?? [],
      memberships: memberships ?? [],
      membershipVisits,
      healthReadings: dbReadings ?? [],
    });
    setReportLoading(false);
  };

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase();
    const matchesSearch = c.full_name.toLowerCase().includes(q) || (c.phone ?? '').toLowerCase().includes(q);
    const matchesFilter =
      filterType === 'all' ? true :
      filterType === 'active' ? c.status === 'active' :
      filterType === 'shake_member' ? c.is_daily_shake_member :
      c.is_distributor;
    const matchesRefer = !referSearch.trim() || (c.referred_by ?? '').toLowerCase().includes(referSearch.trim().toLowerCase());
    return matchesSearch && matchesFilter && matchesRefer;
  });

  const openAdd = () => {
    setEditCustomer(null);
    setForm(emptyForm());
    const r = emptyReading();
    setHealthReadings([r]); // age populated after DOB entered
    setDeletedReadingIds([]);
    setCollapsedReadings(new Set());
    setMembership(emptyMembership());
    setShowAdditionalMembership(false);
    setDialogOpen(true);
  };

  const openEdit = async (c: Customer) => {
    setEditCustomer(c);
    setForm({
      full_name: c.full_name, phone: c.phone ?? '', date_of_birth: c.date_of_birth ?? '',
      gender: c.gender ?? '', status: c.status, referred_by: c.referred_by ?? '',
      health_problem: c.health_problem ?? '',
      is_daily_shake_member: c.is_daily_shake_member, is_distributor: c.is_distributor,
      notes: c.notes ?? '',
    });
    setMembership(emptyMembership());
    setShowAdditionalMembership(false);
    setDeletedReadingIds([]);

    // Fetch existing health readings
    const supabase = createClient();
    const { data: dbReadings } = await supabase.from('customer_health_readings').select('*').eq('customer_id', c.id).order('reading_date', { ascending: true });
    if (dbReadings && dbReadings.length > 0) {
      const entries = dbReadings.map(r => {
        const entry = dbReadingToEntry(r);
        if (!entry.age && c.date_of_birth) entry.age = calcAge(c.date_of_birth, entry.reading_date);
        return entry;
      });
      setHealthReadings(entries);
      // Collapse all except the last (most recent)
      const collapsed = new Set(entries.slice(0, -1).map(e => e._key));
      setCollapsedReadings(collapsed);
    } else {
      // Auto-import from customer fields if any health data exists
      const hasData = c.height_cm || c.weight_kg || c.bmi || c.body_fat_pct;
      if (hasData) {
        const seeded = readingFromCustomer(c);
        setHealthReadings([seeded]);
        setCollapsedReadings(new Set());
      } else {
        const r = emptyReading();
        setHealthReadings([r]);
        setCollapsedReadings(new Set());
      }
    }
    setDialogOpen(true);
  };

  const setField = <K extends keyof CustomerForm>(key: K, value: CustomerForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key === 'date_of_birth' && typeof value === 'string') {
      setHealthReadings(prev => prev.map(r => ({ ...r, age: calcAge(value, r.reading_date) })));
    }
  };

  const setMemField = <K extends keyof MembershipForm>(key: K, value: MembershipForm[K]) =>
    setMembership((prev) => ({ ...prev, [key]: value }));

  const updateReading = (key: string, field: keyof HealthReadingEntry, value: string) => {
    setHealthReadings(prev => prev.map(r => r._key === key ? { ...r, [field]: value } : r));
  };

  const addReading = () => {
    const r = emptyReading();
    if (form.date_of_birth) r.age = calcAge(form.date_of_birth, r.reading_date);
    setHealthReadings(prev => {
      setCollapsedReadings(new Set(prev.map(p => p._key)));
      return [...prev, r];
    });
  };

  const deleteReading = (key: string) => {
    const reading = healthReadings.find(r => r._key === key);
    if (reading?.id) setDeletedReadingIds(prev => [...prev, reading.id!]);
    setHealthReadings(prev => prev.filter(r => r._key !== key));
  };

  const toggleCollapse = (key: string) => {
    setCollapsedReadings(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleSave = async () => {
    if (!form.full_name.trim()) { toast({ title: 'Full name is required', variant: 'destructive' }); return; }
    if (!form.phone.trim()) { toast({ title: 'Phone number is required', variant: 'destructive' }); return; }
    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    // Use latest reading for customer-level health fields (backward compat)
    const latest = [...healthReadings].sort((a, b) => b.reading_date.localeCompare(a.reading_date))[0];

    const payload = {
      user_id: user.id, full_name: form.full_name.trim(), phone: form.phone.trim(),
      date_of_birth: form.date_of_birth || null, gender: form.gender || null,
      status: form.status, referred_by: form.referred_by.trim() || null,
      health_problem: form.health_problem.trim() || null,
      height_cm: numOrNull(latest?.height_cm ?? ''), weight_kg: numOrNull(latest?.weight_kg ?? ''),
      bmi: numOrNull(latest?.bmi ?? ''), body_fat_pct: numOrNull(latest?.body_fat_pct ?? ''),
      visceral_fat: numOrNull(latest?.visceral_fat ?? ''), bmr_kcal: numOrNull(latest?.bmr_kcal ?? ''),
      body_age: latest?.body_age?.trim() || null,
      subcutaneous_fat_pct: numOrNull(latest?.subcutaneous_fat_pct ?? ''),
      trunk_subcutaneous_fat_pct: numOrNull(latest?.trunk_subcutaneous_fat_pct ?? ''),
      arms_subcutaneous_fat_pct: numOrNull(latest?.arms_subcutaneous_fat_pct ?? ''),
      legs_subcutaneous_fat_pct: numOrNull(latest?.legs_subcutaneous_fat_pct ?? ''),
      muscle_pct: numOrNull(latest?.muscle_pct ?? ''),
      is_daily_shake_member: form.is_daily_shake_member, is_distributor: form.is_distributor,
      notes: form.notes.trim() || null,
    };

    const savedName = form.full_name.trim();
    let customerId = editCustomer?.id;
    let shouldCreateMembership = false;

    if (editCustomer) {
      const { error } = await supabase.from('customers').update(payload).eq('id', editCustomer.id);
      if (error) { toast({ title: 'Update failed', description: error.message, variant: 'destructive' }); setSaving(false); return; }
      shouldCreateMembership = form.is_daily_shake_member && !editCustomer.is_daily_shake_member;
      toast({ title: 'Customer updated' });
    } else {
      const { data: newCustomer, error } = await supabase.from('customers').insert(payload).select('id').single();
      if (error || !newCustomer) { toast({ title: 'Add failed', description: error?.message, variant: 'destructive' }); setSaving(false); return; }
      customerId = newCustomer.id;
      shouldCreateMembership = form.is_daily_shake_member;
      toast({ title: 'Customer added' });
    }

    // Save health readings
    if (deletedReadingIds.length > 0) {
      await supabase.from('customer_health_readings').delete().in('id', deletedReadingIds);
    }
    for (const r of healthReadings) {
      if (!r.reading_date) continue;
      const readingPayload = {
        user_id: user.id, customer_id: customerId!,
        reading_date: r.reading_date,
        height_cm: numOrNull(r.height_cm), weight_kg: numOrNull(r.weight_kg),
        bmi: numOrNull(r.bmi), body_fat_pct: numOrNull(r.body_fat_pct),
        visceral_fat: numOrNull(r.visceral_fat), bmr_kcal: numOrNull(r.bmr_kcal),
        body_age: r.body_age.trim() || null,
        subcutaneous_fat_pct: numOrNull(r.subcutaneous_fat_pct),
        trunk_subcutaneous_fat_pct: numOrNull(r.trunk_subcutaneous_fat_pct),
        arms_subcutaneous_fat_pct: numOrNull(r.arms_subcutaneous_fat_pct),
        legs_subcutaneous_fat_pct: numOrNull(r.legs_subcutaneous_fat_pct),
        muscle_pct: numOrNull(r.muscle_pct),
        age: numOrNull(r.age),
      };
      if (r.id) {
        await supabase.from('customer_health_readings').update(readingPayload).eq('id', r.id);
      } else {
        await supabase.from('customer_health_readings').insert(readingPayload);
      }
    }

    if (shouldCreateMembership || showAdditionalMembership) {
      const { error: memErr } = await supabase.from('center_memberships').insert({
        user_id: user.id, customer_name: savedName,
        customer_phone: form.phone.trim() || null,
        reference: membership.reference.trim() || null,
        total_shakes: parseInt(membership.total_shakes) || 1,
        price: parseFloat(membership.price) || 0,
        payment_status: membership.payment_status,
        start_date: membership.start_date,
      });
      if (memErr) toast({ title: 'Membership creation failed', description: memErr.message, variant: 'destructive' });
      else toast({ title: 'Membership created', description: `Membership added for ${savedName}` });
    }

    setSaving(false);
    setDialogOpen(false);
    fetchCustomers();
  };

  const handleDelete = async (id: number) => {
    const supabase = createClient();
    const { error } = await supabase.from('customers').delete().eq('id', id);
    if (error) { toast({ title: 'Delete failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Customer deleted' });
    setDeleteId(null);
    fetchCustomers();
  };

  const total = customers.length;
  const active = customers.filter(c => c.status === 'active').length;
  const shakeMembers = customers.filter(c => c.is_daily_shake_member).length;
  const distributors = customers.filter(c => c.is_distributor).length;

  // Map: customer full_name → list of customers they referred
  const referralMap = customers.reduce((map, c) => {
    if (c.referred_by?.trim()) {
      const key = c.referred_by.trim().toLowerCase();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return map;
  }, new Map<string, Customer[]>());

  const getReferrals = (name: string) => referralMap.get(name.trim().toLowerCase()) ?? [];

  const showMembershipForm =
    (!editCustomer && form.is_daily_shake_member) ||
    (!!editCustomer && form.is_daily_shake_member && !editCustomer.is_daily_shake_member) ||
    showAdditionalMembership;

  // Report summary values
  const rTotalSalesSpent = reportData.sales.reduce((a, s) => a + s.retail_price * s.quantity, 0);
  const rTotalSalesVP = reportData.sales.reduce((a, s) => a + (s.volume_points ?? 0) * s.quantity, 0);
  const rTotalCenterSpent = reportData.centerSales.reduce((a, s) => a + s.fixed_price * s.quantity, 0);
  const rTotalMemSpent = reportData.memberships.reduce((a, m) => a + m.price, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Customers</h1>
          <p className="text-muted-foreground text-sm">Manage your customer profiles</p>
        </div>
        <Button className="gap-2" onClick={openAdd}><Plus className="h-4 w-4" />Add Customer</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { key: 'all', label: 'Total', count: total, icon: <Users className="h-4 w-4" />, color: 'text-foreground', ring: 'ring-foreground/20' },
          { key: 'active', label: 'Active', count: active, icon: <Activity className="h-4 w-4 text-green-500" />, color: 'text-green-600', ring: 'ring-green-400' },
          { key: 'shake_member', label: 'Shake Members', count: shakeMembers, icon: <Dumbbell className="h-4 w-4 text-blue-500" />, color: 'text-blue-600', ring: 'ring-blue-400' },
          { key: 'distributor', label: 'Distributors', count: distributors, icon: <UserCheck className="h-4 w-4 text-purple-500" />, color: 'text-purple-600', ring: 'ring-purple-400' },
        ].map(({ key, label, count, icon, color, ring }) => (
          <Card
            key={key}
            onClick={() => setFilterType(prev => prev === key ? 'all' : key as typeof filterType)}
            className={`cursor-pointer transition-all hover:shadow-md ${filterType === key ? `ring-2 ${ring}` : ''}`}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-1.5">{icon}{label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-2xl font-bold ${color}`}>{count}</p>
              {filterType === key && <p className="text-xs text-muted-foreground mt-0.5">Filtered ↓ — click to clear</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search */}
      <div className="flex flex-wrap gap-3">
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name or phone..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          {search && (
            <button className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setSearch('')}>
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Filter by referred by..." className="pl-9" value={referSearch} onChange={(e) => setReferSearch(e.target.value)} />
          {referSearch && (
            <button className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setReferSearch('')}>
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Customer cards */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {customers.length === 0 ? 'No customers yet. Add your first customer.' :
           filterType !== 'all' ? `No customers match the "${filterType === 'shake_member' ? 'Shake Members' : filterType === 'active' ? 'Active' : 'Distributors'}" filter.` :
           'No customers match your search.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((c) => (
            <Card key={c.id}>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{c.full_name}</p>
                    {c.phone && <p className="text-xs text-muted-foreground mt-0.5">{c.phone}</p>}
                    {c.health_problem && <p className="text-xs text-muted-foreground mt-0.5 truncate">{c.health_problem}</p>}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" title="View Report" onClick={() => openReport(c)}>
                      <FileText className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" title="Edit" onClick={() => openEdit(c)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" title="Delete" onClick={() => setDeleteId(c.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  <Badge variant={c.status === 'active' ? 'success' : 'secondary'} className="text-xs">{c.status}</Badge>
                  {c.gender && <Badge variant="outline" className="text-xs">{c.gender}</Badge>}
                  {c.is_daily_shake_member && <Badge className="text-xs bg-blue-100 text-blue-700 border-blue-200">Shake Member</Badge>}
                  {c.is_distributor && <Badge className="text-xs bg-purple-100 text-purple-700 border-purple-200">Distributor</Badge>}
                </div>

                {getReferrals(c.full_name).length > 0 && (
                  <div className="mt-1.5">
                    <Badge className="text-xs bg-emerald-100 text-emerald-700 border-emerald-200 gap-1">
                      <Users className="h-3 w-3" />Referred {getReferrals(c.full_name).length}
                    </Badge>
                  </div>
                )}
                {c.referred_by && (
                  <p className="text-xs text-muted-foreground mt-1">Ref by: <span className="font-medium">{c.referred_by}</span></p>
                )}
                {(c.weight_kg || c.bmi || c.body_fat_pct) && (
                  <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                    {c.weight_kg && <span>Weight: <strong>{c.weight_kg} kg</strong></span>}
                    {c.bmi && <span>BMI: <strong>{c.bmi}</strong></span>}
                    {c.body_fat_pct && <span>Fat: <strong>{c.body_fat_pct}%</strong></span>}
                  </div>
                )}

                <p className="text-xs text-muted-foreground mt-2">Added {formatDate(c.created_at)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Report Dialog ── */}
      <Dialog open={reportCustomer !== null} onOpenChange={(v) => { if (!v) setReportCustomer(null); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0 gap-0">
          {reportCustomer && (
            <>
              {/* Sticky header bar */}
              <div className="sticky top-0 z-10 bg-background border-b px-6 py-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <DialogTitle className="text-base font-semibold leading-tight truncate">{reportCustomer.full_name}</DialogTitle>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    {reportCustomer.phone && <span className="text-xs text-muted-foreground">{reportCustomer.phone}</span>}
                    {reportCustomer.health_problem && <span className="text-xs text-muted-foreground">· {reportCustomer.health_problem}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={reportLoading}
                    onClick={() => printHealthReport(reportCustomer, reportData, managerName)}
                  >
                    <Download className="h-3.5 w-3.5" />Health Report
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    className="gap-1.5"
                    disabled={reportLoading}
                    onClick={() => printHistoryReport(reportCustomer, reportData, managerName)}
                  >
                    <Download className="h-3.5 w-3.5" />History Report
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    onClick={() => setReportCustomer(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="px-6 py-4">

              {reportLoading ? (
                <div className="text-center py-12 text-muted-foreground">Loading report...</div>
              ) : (
                <div className="space-y-6 pt-2">
                  {/* Profile badges */}
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={reportCustomer.status === 'active' ? 'success' : 'secondary'}>{reportCustomer.status}</Badge>
                    {reportCustomer.gender && <Badge variant="outline">{reportCustomer.gender}</Badge>}
                    {reportCustomer.date_of_birth && <Badge variant="outline">DOB: {reportCustomer.date_of_birth}</Badge>}
                    {reportCustomer.is_daily_shake_member && <Badge className="bg-blue-100 text-blue-700 border-blue-200">Shake Member</Badge>}
                    {reportCustomer.is_distributor && <Badge className="bg-purple-100 text-purple-700 border-purple-200">Distributor</Badge>}
                    {reportCustomer.referred_by && <Badge variant="outline">Ref: {reportCustomer.referred_by}</Badge>}
                    {reportCustomer.health_problem && <Badge variant="outline">{reportCustomer.health_problem}</Badge>}
                  </div>

                  {/* Summary cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-muted rounded-lg p-3 text-center">
                      <p className="text-xs text-muted-foreground mb-1">Sales Records</p>
                      <p className="text-xl font-bold">{reportData.sales.length}</p>
                    </div>
                    <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900 rounded-lg p-3 text-center">
                      <p className="text-xs text-muted-foreground mb-1">Sales Spent</p>
                      <p className="text-xl font-bold text-rose-600">{formatCurrency(rTotalSalesSpent)}</p>
                    </div>
                    <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900 rounded-lg p-3 text-center">
                      <p className="text-xs text-muted-foreground mb-1">Center Spent</p>
                      <p className="text-xl font-bold text-amber-600">{formatCurrency(rTotalCenterSpent)}</p>
                    </div>
                    <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900 rounded-lg p-3 text-center">
                      <p className="text-xs text-muted-foreground mb-1">Memberships</p>
                      <p className="text-xl font-bold text-blue-600">{reportData.memberships.length}</p>
                    </div>
                  </div>

                  {/* Health readings */}
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowHealthReadings(v => !v)}
                      className="flex items-center justify-between w-full border-b pb-1 mb-3 group"
                    >
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Health Readings &nbsp;<span className="font-normal normal-case">{reportData.healthReadings.length} recorded</span>
                      </p>
                      <span className="text-xs text-muted-foreground group-hover:text-foreground flex items-center gap-1">
                        {showHealthReadings ? <><ChevronUp className="h-3.5 w-3.5" />Hide</> : <><ChevronDown className="h-3.5 w-3.5" />Show</>}
                      </span>
                    </button>
                    {showHealthReadings && (
                      reportData.healthReadings.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-2">No health readings found.</p>
                      ) : (
                        <div className="space-y-3">
                          {reportData.healthReadings.map((r, i) => {
                            const fields = [
                              ['Age', r.age ? `${r.age} yrs` : null],
                              ['Height', r.height_cm ? `${r.height_cm} cm` : null],
                              ['Weight', r.weight_kg ? `${r.weight_kg} kg` : null],
                              ['Body Fat', r.body_fat_pct ? `${r.body_fat_pct}%` : null, 'M:14–17% F:21–24%'],
                              ['Visceral Fat', r.visceral_fat ? String(r.visceral_fat) : null, '2–8'],
                              ['BMR', r.bmr_kcal ? `${r.bmr_kcal} kcal` : null, '1800–2000'],
                              ['BMI', r.bmi ? String(r.bmi) : null, '20–23'],
                              ['Body Age', r.body_age || null],
                              ['Subcutaneous Fat', r.subcutaneous_fat_pct ? `${r.subcutaneous_fat_pct}%` : null, '<20%'],
                              ['Trunk Sub. Fat', r.trunk_subcutaneous_fat_pct ? `${r.trunk_subcutaneous_fat_pct}%` : null, '<20%'],
                              ['Arms Sub. Fat', r.arms_subcutaneous_fat_pct ? `${r.arms_subcutaneous_fat_pct}%` : null, '<22%'],
                              ['Legs Sub. Fat', r.legs_subcutaneous_fat_pct ? `${r.legs_subcutaneous_fat_pct}%` : null, '<20%'],
                              ['Muscle', r.muscle_pct ? `${r.muscle_pct}%` : null, 'M:33–36% F:30–33%'],
                            ].filter(([, v]) => v !== null);
                            return (
                              <div key={r.id} className="rounded-lg border p-3 space-y-2">
                                <p className="text-sm font-medium">Reading {i + 1} — {formatDate(r.reading_date)}</p>
                                {fields.length > 0 ? (
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                                    {fields.map(([label, value, normal]) => (
                                      <div key={label as string} className="bg-muted/50 rounded-md px-3 py-2">
                                        <p className="text-xs text-muted-foreground">{label as string}</p>
                                        <p className="font-semibold">{value as string}</p>
                                        {normal && <p className="text-xs text-muted-foreground">Normal: {normal as string}</p>}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-xs text-muted-foreground">No data entered for this reading.</p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )
                    )}
                  </div>

                  {/* Sales history */}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      Sales History &nbsp;
                      <span className="font-normal normal-case">
                        {reportData.sales.length} records · Retail {formatCurrency(rTotalSalesSpent)} · Profit {formatCurrency(reportData.sales.filter(s => s.payment_status === 'done').reduce((a, s) => a + (s.profit ?? 0) * s.quantity, 0))} (paid only) · {rTotalSalesVP.toFixed(2)} VP
                      </span>
                    </p>
                    {reportData.sales.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-2">No sales records found.</p>
                    ) : (
                      <div className="overflow-x-auto rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Date</TableHead>
                              <TableHead>Product</TableHead>
                              <TableHead className="text-right">Qty</TableHead>
                              <TableHead className="text-right">My Price</TableHead>
                              <TableHead className="text-right">Retail Price</TableHead>
                              <TableHead className="text-right">Total My</TableHead>
                              <TableHead className="text-right">Total Retail</TableHead>
                              <TableHead className="text-right">Profit</TableHead>
                              <TableHead className="text-right">VP</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Method</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {reportData.sales.map((s) => (
                              <TableRow key={s.id}>
                                <TableCell className="text-sm">{formatDate(s.date)}</TableCell>
                                <TableCell className="text-sm font-medium max-w-[140px] truncate">{s.product_name}</TableCell>
                                <TableCell className="text-right text-sm">{s.quantity}</TableCell>
                                <TableCell className="text-right text-sm">{formatCurrency(s.my_price)}</TableCell>
                                <TableCell className="text-right text-sm">{formatCurrency(s.retail_price)}</TableCell>
                                <TableCell className="text-right text-sm">{formatCurrency(s.my_price * s.quantity)}</TableCell>
                                <TableCell className="text-right text-sm font-medium">{formatCurrency(s.retail_price * s.quantity)}</TableCell>
                                <TableCell className="text-right text-sm font-medium">
                                  {s.payment_status === 'done'
                                    ? <span className="text-green-600">{formatCurrency((s.profit ?? 0) * s.quantity)}</span>
                                    : <span className="text-muted-foreground">—</span>}
                                </TableCell>
                                <TableCell className="text-right text-sm text-purple-600">{((s.volume_points ?? 0) * s.quantity).toFixed(2)}</TableCell>
                                <TableCell>
                                  <Badge variant={s.payment_status === 'done' ? 'success' : 'warning'} className="text-xs">
                                    {s.payment_status === 'done' ? 'Paid' : 'Pending'}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">{s.payment_method ?? '—'}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>

                  {/* Center sales */}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      Center Sales &nbsp;
                      <span className="font-normal normal-case">
                        {reportData.centerSales.length} records · {formatCurrency(rTotalCenterSpent)}
                      </span>
                    </p>
                    {reportData.centerSales.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-2">No center sales records found.</p>
                    ) : (
                      <div className="overflow-x-auto rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Date</TableHead>
                              <TableHead>Item</TableHead>
                              <TableHead className="text-right">Qty</TableHead>
                              <TableHead className="text-right">Price</TableHead>
                              <TableHead className="text-right">Total</TableHead>
                              <TableHead>Payment</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {reportData.centerSales.map((s) => (
                              <TableRow key={s.id}>
                                <TableCell className="text-sm">{formatDate(s.date)}</TableCell>
                                <TableCell className="text-sm font-medium max-w-[150px] truncate">{s.product_name}</TableCell>
                                <TableCell className="text-right text-sm">{s.quantity}</TableCell>
                                <TableCell className="text-right text-sm">{formatCurrency(s.fixed_price)}</TableCell>
                                <TableCell className="text-right text-sm font-medium">{formatCurrency(s.fixed_price * s.quantity)}</TableCell>
                                <TableCell>
                                  <Badge variant={s.payment_status === 'done' ? 'success' : 'warning'} className="text-xs">
                                    {s.payment_status === 'done' ? 'Paid' : 'Pending'}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>

                  {/* Memberships */}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      Memberships &nbsp;
                      <span className="font-normal normal-case">
                        {reportData.memberships.length} plans · {formatCurrency(rTotalMemSpent)}
                      </span>
                    </p>
                    {reportData.memberships.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-2">No memberships found.</p>
                    ) : (
                      <div className="space-y-3">
                        {reportData.memberships.map((m) => {
                          const visits = reportData.membershipVisits.filter(v => v.membership_id === m.id).sort((a, b) => a.visit_date.localeCompare(b.visit_date));
                          const remaining = m.total_shakes - visits.length;
                          return (
                            <div key={m.id} className="rounded-lg border p-3 space-y-2">
                              <div className="flex items-start justify-between gap-2 flex-wrap">
                                <div className="flex items-center gap-3 flex-wrap">
                                  <span className="text-sm font-medium">{formatDate(m.start_date)}</span>
                                  {m.reference && <span className="text-xs text-muted-foreground">Ref: {m.reference}</span>}
                                  <Badge variant={m.payment_status === 'paid' ? 'success' : 'warning'} className="text-xs">
                                    {m.payment_status === 'paid' ? 'Paid' : 'Pending'}
                                  </Badge>
                                </div>
                                <span className="text-sm font-semibold">{formatCurrency(m.price)}</span>
                              </div>
                              <div className="flex gap-4 text-xs text-muted-foreground">
                                <span>Total: <strong className="text-foreground">{m.total_shakes}</strong></span>
                                <span>Used: <strong className="text-foreground">{visits.length}</strong></span>
                                <span>Remaining: <strong className={remaining > 0 ? 'text-green-600' : 'text-muted-foreground'}>{remaining}</strong></span>
                              </div>
                              {visits.length > 0 ? (
                                <div className="flex flex-wrap gap-1 pt-1">
                                  {visits.map(v => (
                                    <span key={v.id} className="text-xs bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200 px-1.5 py-0.5 rounded">
                                      {v.visit_date}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground">No visits recorded yet.</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Referrals by this customer */}
                  {(() => {
                    const refs = getReferrals(reportCustomer.full_name);
                    if (refs.length === 0) return null;
                    return (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                          Customers Referred by {reportCustomer.full_name} &nbsp;
                          <span className="font-normal normal-case">{refs.length} people</span>
                        </p>
                        <div className="rounded-md border overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Phone</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Joined</TableHead>
                                <TableHead>Health Problem</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {refs.map(r => (
                                <TableRow key={r.id}>
                                  <TableCell className="font-medium text-sm">{r.full_name}</TableCell>
                                  <TableCell className="text-sm text-muted-foreground">{r.phone ?? '—'}</TableCell>
                                  <TableCell>
                                    <Badge variant={r.status === 'active' ? 'success' : 'secondary'} className="text-xs">{r.status}</Badge>
                                  </TableCell>
                                  <TableCell className="text-sm text-muted-foreground">{formatDate(r.created_at)}</TableCell>
                                  <TableCell className="text-sm text-muted-foreground">{r.health_problem ?? '—'}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Notes */}
                  {reportCustomer.notes && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Notes</p>
                      <p className="text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-2">{reportCustomer.notes}</p>
                    </div>
                  )}
                </div>
              )}
              </div>{/* end px-6 py-4 */}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ── */}
      <Dialog open={deleteId !== null} onOpenChange={(v) => { if (!v) setDeleteId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-destructive">Delete Customer</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Are you sure you want to delete this customer? This cannot be undone.</p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setDeleteId(null)}>Cancel</Button>
              <Button variant="destructive" className="flex-1" onClick={() => deleteId && handleDelete(deleteId)}>Delete</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Add / Edit Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) setDialogOpen(false); }}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editCustomer ? 'Edit Customer' : 'New Customer'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-6 pb-2">
            {/* Basic Details */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 border-b pb-1">Basic Details</p>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>Full Name <span className="text-destructive">*</span></Label>
                  <Input placeholder="Jane Smith" value={form.full_name} onChange={(e) => setField('full_name', e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Phone / WhatsApp <span className="text-destructive">*</span></Label>
                    <Input placeholder="+91 98765 00000" value={form.phone} onChange={(e) => setField('phone', e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Date of Birth</Label>
                    <Input type="date" value={form.date_of_birth} onChange={(e) => setField('date_of_birth', e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Gender</Label>
                    <select value={form.gender} onChange={(e) => setField('gender', e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                      <option value="">Select</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label>Status</Label>
                    <select value={form.status} onChange={(e) => setField('status', e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Referred By</Label>
                  <Input placeholder="Friend, Instagram..." value={form.referred_by} onChange={(e) => setField('referred_by', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Health Problem</Label>
                  <Input placeholder="e.g. Diabetes, Hypertension..." value={form.health_problem} onChange={(e) => setField('health_problem', e.target.value)} />
                </div>
              </div>
            </div>

            {/* Health Readings */}
            <div>
              <div className="flex items-center justify-between border-b pb-1 mb-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Health Readings <span className="normal-case font-normal">(Optional)</span>
                </p>
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={addReading}>
                  <PlusCircle className="h-3 w-3" />Add Reading
                </Button>
              </div>
              <div className="space-y-2">
                {healthReadings.map((r, i) => (
                  <HealthReadingCard
                    key={r._key}
                    reading={r}
                    index={i}
                    total={healthReadings.length}
                    onChange={(field, value) => updateReading(r._key, field, value)}
                    onDelete={() => deleteReading(r._key)}
                    collapsed={collapsedReadings.has(r._key)}
                    onToggleCollapse={() => toggleCollapse(r._key)}
                    dateOfBirth={form.date_of_birth || undefined}
                  />
                ))}
              </div>
            </div>

            {/* Program */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 border-b pb-1">Program</p>
              <div className="space-y-3">
                <div className="flex items-center justify-between py-2 px-3 rounded-lg border">
                  <div>
                    <p className="text-sm font-medium">Daily Shake Member</p>
                    <p className="text-xs text-muted-foreground">Enrolled in shake program</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {form.is_daily_shake_member && editCustomer?.is_daily_shake_member && !showAdditionalMembership && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1 border-blue-300 text-blue-700 hover:bg-blue-50"
                        onClick={() => { setMembership(emptyMembership()); setShowAdditionalMembership(true); }}
                      >
                        <PlusCircle className="h-3 w-3" />Add Membership
                      </Button>
                    )}
                    <Toggle checked={form.is_daily_shake_member} onChange={(v) => { setField('is_daily_shake_member', v); if (!v) setShowAdditionalMembership(false); }} />
                  </div>
                </div>

                {showMembershipForm && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">
                        {showAdditionalMembership ? 'Add Another Membership' : 'Create Membership'}
                      </p>
                      {showAdditionalMembership && (
                        <button type="button" className="text-xs text-blue-600 hover:underline" onClick={() => setShowAdditionalMembership(false)}>Cancel</button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-sm">Customer Name</Label>
                        <Input value={form.full_name || 'Customer'} disabled className="bg-background/60" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-sm">Reference (optional)</Label>
                        <Input placeholder="Reference" value={membership.reference} onChange={(e) => setMemField('reference', e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-sm">Total Shakes</Label>
                        <Input type="number" min={1} value={membership.total_shakes} onChange={(e) => setMemField('total_shakes', e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-sm">Price (₹)</Label>
                        <Input type="number" step="0.01" min={0} value={membership.price} onChange={(e) => setMemField('price', e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-sm">Start Date</Label>
                        <Input type="date" value={membership.start_date} onChange={(e) => setMemField('start_date', e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-sm">Payment Status</Label>
                        <select value={membership.payment_status} onChange={(e) => setMemField('payment_status', e.target.value as 'pending' | 'paid')} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                          <option value="paid">Paid</option>
                          <option value="pending">Pending</option>
                        </select>
                      </div>
                    </div>
                    <p className="text-xs text-blue-600 dark:text-blue-400">This membership will be created in the Center section automatically.</p>
                  </div>
                )}

                <div className="flex items-center justify-between py-2 px-3 rounded-lg border">
                  <div>
                    <p className="text-sm font-medium">Became Distributor</p>
                    <p className="text-xs text-muted-foreground">This customer is now a distributor</p>
                  </div>
                  <Toggle checked={form.is_distributor} onChange={(v) => setField('is_distributor', v)} />
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea placeholder="Any notes..." rows={3} value={form.notes} onChange={(e) => setField('notes', e.target.value)} />
            </div>

            <div className="flex gap-2 justify-end pt-1">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : editCustomer ? 'Update Customer' : 'Add Customer'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
