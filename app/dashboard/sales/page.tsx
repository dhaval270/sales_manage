'use client';

import { useEffect, useState, useCallback } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Sale, Product, Customer } from '@/types/database';
import { Plus, Pencil, Trash2, Receipt, Search, X, Eye, Download, FileText, RotateCcw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

// ─── Schemas ────────────────────────────────────────────────────────────────

const lineItemSchema = z.object({
  product_name: z.string().min(1, 'Product required'),
  quantity: z.coerce.number().min(1, 'Min 1'),
  my_price: z.coerce.number().min(0),
  retail_price: z.coerce.number().min(0),
  volume_points: z.coerce.number().optional(),
  comments: z.string().optional(),
});

const saleSchema = z.object({
  date: z.string().min(1, 'Date is required'),
  customer_name: z.string().min(1, 'Customer name is required'),
  reference: z.string().optional(),
  payment_method: z.enum(['online', 'cash', 'pending']),
  items: z.array(lineItemSchema).min(1),
});

type SaleForm = z.infer<typeof saleSchema>;

const editSchema = z.object({
  date: z.string().min(1),
  customer_name: z.string().min(1),
  reference: z.string().optional(),
  product_name: z.string().min(1),
  quantity: z.coerce.number().min(1),
  my_price: z.coerce.number().min(0),
  retail_price: z.coerce.number().min(0),
  volume_points: z.coerce.number().optional(),
  comments: z.string().optional(),
});
type EditForm = z.infer<typeof editSchema>;

const emptyItem = { product_name: '', quantity: 1, my_price: 0, retail_price: 0, volume_points: 0, comments: '' };

// ─── Types ───────────────────────────────────────────────────────────────────

type SaleGroup = {
  key: string;
  date: string;
  customer_name: string;
  customer_phone: string | null;
  reference: string | null;
  items: Sale[];
  totalQty: number;
  totalSellingAmount: number;
  totalMyAmount: number;
  totalProfit: number;        // only from 'done' items
  pendingAmount: number;      // selling total of 'pending' items
  totalVP: number;
  status: 'done' | 'pending' | 'mixed';
  allIds: number[];
};

function groupSales(sales: Sale[]): SaleGroup[] {
  const map = new Map<string, SaleGroup>();
  for (const s of sales) {
    const key = `${s.date}|${s.customer_name}|${s.reference ?? ''}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        date: s.date,
        customer_name: s.customer_name,
        customer_phone: s.customer_phone ?? null,
        reference: s.reference,
        items: [],
        totalQty: 0,
        totalSellingAmount: 0,
        totalMyAmount: 0,
        totalProfit: 0,
        pendingAmount: 0,
        totalVP: 0,
        status: 'done',
        allIds: [],
      });
    }
    const g = map.get(key)!;
    g.items.push(s);
    g.allIds.push(s.id);
    g.totalQty += s.quantity;
    g.totalSellingAmount += s.retail_price * s.quantity;
    g.totalMyAmount += s.my_price * s.quantity;
    g.totalVP += (s.volume_points ?? 0) * s.quantity;
    if (s.payment_status === 'done') {
      g.totalProfit += s.profit * s.quantity;
    } else {
      g.pendingAmount += s.retail_price * s.quantity;
    }
  }

  Array.from(map.values()).forEach((g) => {
    const hasDone = g.items.some((s: Sale) => s.payment_status === 'done');
    const hasPending = g.items.some((s: Sale) => s.payment_status === 'pending');
    g.status = hasDone && hasPending ? 'mixed' : hasPending ? 'pending' : 'done';
  });

  return Array.from(map.values());
}

// ─── Invoice print ───────────────────────────────────────────────────────────

function printInvoice(group: SaleGroup, managerName: string) {
  const rows = group.items
    .map(
      (s) => {
        const totalMy = s.my_price * s.quantity;
        const totalRetail = s.retail_price * s.quantity;
        const profit = totalRetail - totalMy;
        return `
      <tr>
        <td>${s.product_name}</td>
        <td class="num">${s.quantity}</td>
        <td class="num">₹${s.my_price.toFixed(2)}</td>
        <td class="num">₹${s.retail_price.toFixed(2)}</td>
        <td class="num">₹${totalMy.toFixed(2)}</td>
        <td class="num">₹${totalRetail.toFixed(2)}</td>
        <td class="num" style="${s.payment_status === 'done' ? 'color:#16a34a;font-weight:600' : 'color:#999'}">${s.payment_status === 'done' ? `₹${profit.toFixed(2)}` : '—'}</td>
        <td class="num">${(s.volume_points ?? 0) > 0 ? `${((s.volume_points ?? 0) * s.quantity).toFixed(2)}` : '—'}</td>
        <td class="num status-${s.payment_status}">${s.payment_status}</td>
        <td class="num">${s.payment_method ?? '—'}</td>
      </tr>`;
      }
    )
    .join('');

  const totalPending = group.pendingAmount;
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Invoice – ${group.customer_name}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 13px; color: #111; padding: 32px; }
    h1 { font-size: 22px; margin-bottom: 4px; }
    .sub { color: #666; font-size: 12px; margin-bottom: 24px; }
    .meta { display: flex; justify-content: space-between; margin-bottom: 24px; }
    .meta div { line-height: 1.8; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th { background: #f4f4f4; text-align: left; padding: 8px 10px; font-size: 12px; border-bottom: 2px solid #ddd; }
    td { padding: 8px 10px; border-bottom: 1px solid #eee; }
    .num { text-align: right; }
    .totals { margin-left: auto; width: 260px; }
    .totals tr td { border: none; padding: 4px 10px; }
    .totals tr:last-child td { font-weight: bold; font-size: 14px; border-top: 2px solid #111; padding-top: 8px; }
    .status-done { color: #16a34a; font-weight: 600; }
    .status-pending { color: #d97706; font-weight: 600; }
    .footer { margin-top: 40px; font-size: 11px; color: #999; text-align: center; }
    @media print { button { display: none; } }
  </style>
</head>
<body>
  <h1>Sales Invoice</h1>
  <p class="sub">Herbalife Sales Manager</p>
  <div class="meta">
    <div>
      <strong>Bill To:</strong><br/>
      ${group.customer_name}<br/>
      ${group.reference ? `Ref: ${group.reference}` : ''}
    </div>
    <div style="text-align:right">
      <strong>Date:</strong> ${group.date}<br/>
      <strong>Manager:</strong> ${managerName}
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Product</th>
        <th class="num">Qty</th>
        <th class="num">My Price</th>
        <th class="num">Retail Price</th>
        <th class="num">Total My</th>
        <th class="num">Total Retail</th>
        <th class="num">Profit</th>
        <th class="num">VP</th>
        <th class="num">Status</th>
        <th class="num">Method</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <table class="totals">
    <tr><td>Subtotal</td><td class="num">₹${group.totalSellingAmount.toFixed(2)}</td></tr>
    ${totalPending > 0 ? `<tr><td style="color:#d97706">Pending</td><td class="num" style="color:#d97706">₹${totalPending.toFixed(2)}</td></tr>` : ''}
    ${group.totalVP > 0 ? `<tr><td style="color:#7c3aed">Total Volume Points</td><td class="num" style="color:#7c3aed">${group.totalVP.toFixed(2)} VP</td></tr>` : ''}
    <tr><td>Total</td><td class="num">₹${group.totalSellingAmount.toFixed(2)}</td></tr>
  </table>
  <div class="footer">Generated on ${new Date().toLocaleString()} · Herbalife Sales Manager</div>
  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}

// ─── Customer Invoice print ──────────────────────────────────────────────────

function printCustomerInvoice(customerSales: Sale[], customerName: string, managerName: string) {
  const totalRevenue = customerSales.reduce((a, s) => a + s.retail_price * s.quantity, 0);
  const totalMyCost = customerSales.reduce((a, s) => a + s.my_price * s.quantity, 0);
  const totalProfit = customerSales.filter((s) => s.payment_status === 'done').reduce((a, s) => a + s.profit * s.quantity, 0);
  const totalPending = customerSales.filter((s) => s.payment_status === 'pending').reduce((a, s) => a + s.retail_price * s.quantity, 0);
  const totalVP = customerSales.reduce((a, s) => a + (s.volume_points ?? 0) * s.quantity, 0);
  const cashAmount = customerSales.filter((s) => s.payment_method === 'cash').reduce((a, s) => a + s.retail_price * s.quantity, 0);
  const onlineAmount = customerSales.filter((s) => s.payment_method === 'online').reduce((a, s) => a + s.retail_price * s.quantity, 0);

  // Group by date for organised display
  const byDate = new Map<string, Sale[]>();
  for (const s of customerSales) {
    if (!byDate.has(s.date)) byDate.set(s.date, []);
    byDate.get(s.date)!.push(s);
  }

  const rows = Array.from(byDate.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, items]) => items.map((s) => {
      const totalMy = s.my_price * s.quantity;
      const totalRetail = s.retail_price * s.quantity;
      const profit = totalRetail - totalMy;
      return `
      <tr>
        <td>${date}</td>
        <td>${s.product_name}</td>
        <td class="num">${s.quantity}</td>
        <td class="num">₹${s.retail_price.toFixed(2)}</td>
        <td class="num">₹${totalRetail.toFixed(2)}</td>
        <td class="num" style="${s.payment_status === 'done' ? 'color:#16a34a;font-weight:600' : 'color:#999'}">${s.payment_status === 'done' ? `₹${profit.toFixed(2)}` : '—'}</td>
        <td class="num status-${s.payment_status}">${s.payment_status}</td>
        <td class="num">${s.payment_method ?? '—'}</td>
      </tr>`;
    }).join('')).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Customer Report – ${customerName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 13px; color: #111; padding: 32px; }
    h1 { font-size: 22px; margin-bottom: 4px; }
    h2 { font-size: 15px; margin: 24px 0 10px; color: #333; }
    .sub { color: #666; font-size: 12px; margin-bottom: 24px; }
    .meta { display: flex; justify-content: space-between; margin-bottom: 24px; }
    .meta div { line-height: 1.8; }
    .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 28px; }
    .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 14px; }
    .card .label { font-size: 11px; color: #666; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.05em; }
    .card .value { font-size: 18px; font-weight: 700; }
    .card.revenue .value { color: #1d4ed8; }
    .card.profit .value { color: #16a34a; }
    .card.cash .value { color: #059669; }
    .card.online .value { color: #2563eb; }
    .card.vp .value { color: #7c3aed; }
    .card.pending .value { color: #d97706; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th { background: #f4f4f4; text-align: left; padding: 8px 10px; font-size: 12px; border-bottom: 2px solid #ddd; }
    td { padding: 8px 10px; border-bottom: 1px solid #eee; }
    .num { text-align: right; }
    .status-done { color: #16a34a; font-weight: 600; }
    .status-pending { color: #d97706; font-weight: 600; }
    .footer { margin-top: 40px; font-size: 11px; color: #999; text-align: center; }
    @media print { button { display: none; } }
  </style>
</head>
<body>
  <h1>Customer Sales Report</h1>
  <p class="sub">Herbalife Sales Manager</p>
  <div class="meta">
    <div>
      <strong>Customer:</strong> ${customerName}<br/>
      <strong>Total Transactions:</strong> ${customerSales.length} items
    </div>
    <div style="text-align:right">
      <strong>Manager:</strong> ${managerName}<br/>
      <strong>Generated:</strong> ${new Date().toLocaleString()}
    </div>
  </div>

  <div class="summary-grid">
    <div class="card revenue"><div class="label">Total Revenue</div><div class="value">₹${totalRevenue.toFixed(2)}</div></div>
    <div class="card profit"><div class="label">Total Profit</div><div class="value">₹${totalProfit.toFixed(2)}</div></div>
    <div class="card cash"><div class="label">Cash Received</div><div class="value">₹${cashAmount.toFixed(2)}</div></div>
    <div class="card online"><div class="label">Online Received</div><div class="value">₹${onlineAmount.toFixed(2)}</div></div>
    ${totalVP > 0 ? `<div class="card vp"><div class="label">Volume Points</div><div class="value">${totalVP.toFixed(2)} VP</div></div>` : ''}
    ${totalPending > 0 ? `<div class="card pending"><div class="label">Pending</div><div class="value">₹${totalPending.toFixed(2)}</div></div>` : ''}
  </div>

  <h2>All Transactions</h2>
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Product</th>
        <th class="num">Qty</th>
        <th class="num">Unit Price</th>
        <th class="num">Total</th>
        <th class="num">Profit</th>
        <th class="num">Status</th>
        <th class="num">Method</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr style="font-weight:bold;background:#f9fafb">
        <td colspan="4">TOTAL</td>
        <td class="num">₹${totalRevenue.toFixed(2)}</td>
        <td class="num" style="color:#16a34a">₹${totalProfit.toFixed(2)}</td>
        <td colspan="2"></td>
      </tr>
    </tfoot>
  </table>

  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px;font-size:12px;color:#555">
    <strong>Summary:</strong> My Cost: ₹${totalMyCost.toFixed(2)} · Cash: ₹${cashAmount.toFixed(2)} · Online: ₹${onlineAmount.toFixed(2)}${totalPending > 0 ? ` · Pending: ₹${totalPending.toFixed(2)}` : ''}
  </div>

  <div class="footer">Herbalife Sales Manager · Customer Report · ${customerName}</div>
  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}

// ─── Period Report print ─────────────────────────────────────────────────────

function printPeriodReport(
  periodSales: Sale[],
  from: string,
  to: string,
  managerName: string,
) {
  const revenue = periodSales.reduce((a, s) => a + s.retail_price * s.quantity, 0);
  const myCost = periodSales.reduce((a, s) => a + s.my_price * s.quantity, 0);
  const profit = periodSales.filter((s) => s.payment_status === 'done').reduce((a, s) => a + s.profit * s.quantity, 0);
  const cashAmount = periodSales.filter((s) => s.payment_method === 'cash').reduce((a, s) => a + s.retail_price * s.quantity, 0);
  const onlineAmount = periodSales.filter((s) => s.payment_method === 'online').reduce((a, s) => a + s.retail_price * s.quantity, 0);
  const pendingAmount = periodSales.filter((s) => s.payment_status === 'pending').reduce((a, s) => a + s.retail_price * s.quantity, 0);
  const volumePoints = periodSales.reduce((a, s) => a + (s.volume_points ?? 0) * s.quantity, 0);
  const totalQty = periodSales.reduce((a, s) => a + s.quantity, 0);

  // Group by customer for breakdown
  const byCustomer = new Map<string, { revenue: number; profit: number; cash: number; online: number; pending: number; vp: number }>();
  for (const s of periodSales) {
    if (!byCustomer.has(s.customer_name)) byCustomer.set(s.customer_name, { revenue: 0, profit: 0, cash: 0, online: 0, pending: 0, vp: 0 });
    const c = byCustomer.get(s.customer_name)!;
    c.revenue += s.retail_price * s.quantity;
    if (s.payment_status === 'done') c.profit += s.profit * s.quantity;
    if (s.payment_method === 'cash') c.cash += s.retail_price * s.quantity;
    if (s.payment_method === 'online') c.online += s.retail_price * s.quantity;
    if (s.payment_status === 'pending') c.pending += s.retail_price * s.quantity;
    c.vp += (s.volume_points ?? 0) * s.quantity;
  }

  const customerRows = Array.from(byCustomer.entries())
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .map(([name, d]) => `
      <tr>
        <td>${name}</td>
        <td class="num">₹${d.revenue.toFixed(2)}</td>
        <td class="num" style="color:#16a34a">₹${d.profit.toFixed(2)}</td>
        <td class="num" style="color:#059669">${d.cash > 0 ? `₹${d.cash.toFixed(2)}` : '—'}</td>
        <td class="num" style="color:#2563eb">${d.online > 0 ? `₹${d.online.toFixed(2)}` : '—'}</td>
        <td class="num">${d.vp.toFixed(2)}</td>
        <td class="num" style="color:${d.pending > 0 ? '#d97706' : '#16a34a'}">${d.pending > 0 ? `₹${d.pending.toFixed(2)}` : '—'}</td>
      </tr>`)
    .join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Period Report ${from} to ${to}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 13px; color: #111; padding: 32px; }
    h1 { font-size: 22px; margin-bottom: 4px; }
    h2 { font-size: 15px; margin: 24px 0 10px; color: #333; }
    .sub { color: #666; font-size: 12px; margin-bottom: 24px; }
    .meta { display: flex; justify-content: space-between; margin-bottom: 24px; }
    .summary-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; margin-bottom: 28px; }
    .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 14px; }
    .card .label { font-size: 10px; color: #666; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.05em; }
    .card .value { font-size: 16px; font-weight: 700; }
    .card.revenue .value { color: #1d4ed8; }
    .card.profit .value { color: #16a34a; }
    .card.cash .value { color: #059669; }
    .card.online .value { color: #2563eb; }
    .card.vp .value { color: #7c3aed; }
    .card.pending .value { color: #d97706; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th { background: #f4f4f4; text-align: left; padding: 8px 10px; font-size: 12px; border-bottom: 2px solid #ddd; }
    td { padding: 8px 10px; border-bottom: 1px solid #eee; }
    .num { text-align: right; }
    .footer { margin-top: 40px; font-size: 11px; color: #999; text-align: center; }
    @media print { button { display: none; } }
  </style>
</head>
<body>
  <h1>Period Sales Report</h1>
  <p class="sub">Herbalife Sales Manager</p>
  <div class="meta">
    <div>
      <strong>Period:</strong> ${from} to ${to}<br/>
      <strong>Total Transactions:</strong> ${periodSales.length} items (${totalQty} units)
    </div>
    <div style="text-align:right">
      <strong>Manager:</strong> ${managerName}<br/>
      <strong>Generated:</strong> ${new Date().toLocaleString()}
    </div>
  </div>

  <div class="summary-grid">
    <div class="card revenue"><div class="label">Total Revenue</div><div class="value">₹${revenue.toFixed(2)}</div></div>
    <div class="card profit"><div class="label">Total Profit</div><div class="value">₹${profit.toFixed(2)}</div></div>
    <div class="card cash"><div class="label">Cash Received</div><div class="value">₹${cashAmount.toFixed(2)}</div></div>
    <div class="card online"><div class="label">Online Received</div><div class="value">₹${onlineAmount.toFixed(2)}</div></div>
    <div class="card vp"><div class="label">Volume Points</div><div class="value">${volumePoints.toFixed(2)}</div></div>
    <div class="card pending"><div class="label">Pending Amount</div><div class="value">₹${pendingAmount.toFixed(2)}</div></div>
  </div>

  <h2>Customer Breakdown</h2>
  <table>
    <thead>
      <tr>
        <th>Customer</th>
        <th class="num">Revenue</th>
        <th class="num">Profit</th>
        <th class="num">Cash</th>
        <th class="num">Online</th>
        <th class="num">Volume Points</th>
        <th class="num">Pending</th>
      </tr>
    </thead>
    <tbody>${customerRows}</tbody>
    <tfoot>
      <tr style="font-weight:bold;background:#f9fafb">
        <td>TOTAL</td>
        <td class="num">₹${revenue.toFixed(2)}</td>
        <td class="num" style="color:#16a34a">₹${profit.toFixed(2)}</td>
        <td class="num" style="color:#059669">₹${cashAmount.toFixed(2)}</td>
        <td class="num" style="color:#2563eb">₹${onlineAmount.toFixed(2)}</td>
        <td class="num">${volumePoints.toFixed(2)}</td>
        <td class="num" style="color:#d97706">${pendingAmount > 0 ? `₹${pendingAmount.toFixed(2)}` : '—'}</td>
      </tr>
    </tfoot>
  </table>

  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px;font-size:12px;color:#555">
    <strong>Notes:</strong> Profit is calculated only from received payments (done status). Pending amount represents unpaid sales. My Cost for this period: ₹${myCost.toFixed(2)}.
  </div>

  <div class="footer">Herbalife Sales Manager · Period Report · ${from} to ${to}</div>
  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function SalesPage() {
  const { toast } = useToast();
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editSale, setEditSale] = useState<Sale | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [invoiceGroup, setInvoiceGroup] = useState<SaleGroup | null>(null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [managerName, setManagerName] = useState('Manager');

  // Customer-wide invoice (existing)
  const [invoiceCustomer, setInvoiceCustomer] = useState('');
  const [customerInvoiceOpen, setCustomerInvoiceOpen] = useState(false);

  // Period report
  const [periodReportOpen, setPeriodReportOpen] = useState(false);
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');

  // Reset
  const [resetOpen, setResetOpen] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');

  // Customer autocomplete
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [custPhoneAdd, setCustPhoneAdd] = useState('');
  const [custPhoneEdit, setCustPhoneEdit] = useState('');
  const [custDropdownAdd, setCustDropdownAdd] = useState(false);
  const [custDropdownEdit, setCustDropdownEdit] = useState(false);

  // Per-line product search
  const [productSearches, setProductSearches] = useState<string[]>(['']);
  const [openDropdownIndex, setOpenDropdownIndex] = useState<number | null>(null);

  // Filters
  const [filterCustomer, setFilterCustomer] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // Add form
  const { register, handleSubmit, reset, setValue, watch, control, formState: { errors } } = useForm<SaleForm>({
    resolver: zodResolver(saleSchema),
    defaultValues: { date: format(new Date(), 'yyyy-MM-dd'), customer_name: '', reference: '', payment_method: 'cash', items: [emptyItem] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const watchItems = watch('items');

  // Edit form
  const { register: regEdit, handleSubmit: handleEditSubmit, reset: resetEdit, setValue: setValueEdit, watch: watchEdit, formState: { errors: editErrors } } = useForm<EditForm>({
    resolver: zodResolver(editSchema),
  });
  const editMyPrice = watchEdit('my_price') || 0;
  const editRetailPrice = watchEdit('retail_price') || 0;
  const editQty = watchEdit('quantity') || 1;

  const fetchData = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const [{ data: salesData }, { data: productsData }, { data: customersData }, { data: { user } }] = await Promise.all([
      supabase.from('sales').select('*').order('date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('products').select('*').order('name'),
      supabase.from('customers').select('id, full_name, phone').order('full_name'),
      supabase.auth.getUser(),
    ]);
    setSales(salesData ?? []);
    setProducts(productsData ?? []);
    setCustomers((customersData ?? []) as Customer[]);
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('first_name, last_name').eq('id', user.id).single();
      if (profile) setManagerName(`${profile.first_name} ${profile.last_name}`);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filteredSales = sales.filter((s) => {
    if (filterCustomer && !s.customer_name.toLowerCase().includes(filterCustomer.toLowerCase())) return false;
    if (filterStatus && s.payment_status !== filterStatus) return false;
    if (filterDateFrom && s.date < filterDateFrom) return false;
    if (filterDateTo && s.date > filterDateTo) return false;
    return true;
  });

  const saleGroups = groupSales(filteredSales);

  const getFilteredProducts = (search: string) =>
    products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase())).slice(0, 10);

  const handleProductSelect = (index: number, product: Product) => {
    setValue(`items.${index}.product_name`, product.name);
    setValue(`items.${index}.my_price`, product.retail_price);
    setValue(`items.${index}.volume_points`, product.volume_points);
    const s = [...productSearches];
    s[index] = product.name;
    setProductSearches(s);
    setOpenDropdownIndex(null);
  };

  const handleAddLine = () => {
    append(emptyItem);
    setProductSearches([...productSearches, '']);
  };

  const handleRemoveLine = (index: number) => {
    remove(index);
    const s = [...productSearches];
    s.splice(index, 1);
    setProductSearches(s);
  };

  const resetAddForm = () => {
    reset({ date: format(new Date(), 'yyyy-MM-dd'), customer_name: '', reference: '', payment_method: 'cash', items: [emptyItem] });
    setProductSearches(['']);
    setOpenDropdownIndex(null);
    setCustPhoneAdd('');
    setCustDropdownAdd(false);
  };

  const onSubmit = async (data: SaleForm) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const isPending = data.payment_method === 'pending';
    const rows = data.items.map((item) => ({
      user_id: user.id,
      date: data.date,
      customer_name: data.customer_name,
      customer_phone: custPhoneAdd.trim() || null,
      reference: data.reference || null,
      product_name: item.product_name,
      quantity: item.quantity,
      my_price: item.my_price,
      retail_price: item.retail_price,
      volume_points: item.volume_points || 0,
      comments: item.comments || null,
      payment_status: isPending ? 'pending' : 'done',
      payment_method: isPending ? null : data.payment_method,
    }));

    const { error } = await supabase.from('sales').insert(rows);
    if (error) { toast({ title: 'Add failed', description: error.message, variant: 'destructive' }); return; }

    // Auto-create customer if not already in the list
    const exists = customers.some(c => c.full_name.toLowerCase() === data.customer_name.trim().toLowerCase());
    if (!exists) {
      await supabase.from('customers').insert({
        user_id: user.id,
        full_name: data.customer_name.trim(),
        phone: custPhoneAdd.trim() || null,
        status: 'active',
      });
      toast({ title: `Sale added (${rows.length} product${rows.length > 1 ? 's' : ''})`, description: `"${data.customer_name.trim()}" added as a new customer.` });
    } else {
      toast({ title: `Sale added (${rows.length} product${rows.length > 1 ? 's' : ''})` });
    }

    setAddOpen(false);
    resetAddForm();
    fetchData();
  };

  const onEditSubmit = async (data: EditForm) => {
    if (!editSale) return;
    const supabase = createClient();
    const { error } = await supabase.from('sales').update({
      date: data.date,
      customer_name: data.customer_name,
      customer_phone: custPhoneEdit.trim() || null,
      reference: data.reference || null,
      product_name: data.product_name,
      quantity: data.quantity,
      my_price: data.my_price,
      retail_price: data.retail_price,
      volume_points: data.volume_points || 0,
      comments: data.comments || null,
    }).eq('id', editSale.id);
    if (error) { toast({ title: 'Update failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Sale updated' });
    setEditOpen(false);
    setEditSale(null);
    fetchData();
  };

  const handleEdit = (sale: Sale) => {
    setEditSale(sale);
    resetEdit({
      date: sale.date,
      customer_name: sale.customer_name,
      reference: sale.reference ?? '',
      product_name: sale.product_name,
      quantity: sale.quantity,
      my_price: sale.my_price,
      retail_price: sale.retail_price,
      volume_points: sale.volume_points,
      comments: sale.comments ?? '',
    });
    setCustPhoneEdit(sale.customer_phone ?? '');
    setCustDropdownEdit(false);
    setEditOpen(true);
  };

  // Delete a single product row
  const handleDeleteItem = async (id: number) => {
    if (!confirm('Remove this product from the sale?')) return;
    const supabase = createClient();
    await supabase.from('sales').delete().eq('id', id);
    toast({ title: 'Product removed' });
    fetchData();
    // refresh invoice group
    if (invoiceGroup) {
      const updated = sales.filter((s) => s.id !== id);
      const reGrouped = groupSales(updated);
      const found = reGrouped.find((g) => g.key === invoiceGroup.key);
      if (found) setInvoiceGroup(found);
      else setInvoiceOpen(false);
    }
  };

  // Delete entire sale group
  const handleDeleteGroup = async (group: SaleGroup) => {
    if (!confirm(`Delete all ${group.items.length} product(s) in this sale?`)) return;
    const supabase = createClient();
    await supabase.from('sales').delete().in('id', group.allIds);
    toast({ title: 'Sale deleted' });
    fetchData();
  };

  // Reset all sales
  const handleResetAll = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from('sales').delete().eq('user_id', user.id);
    if (error) { toast({ title: 'Reset failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'All sales deleted', description: 'Your sales data has been reset.' });
    setResetOpen(false);
    setResetConfirmText('');
    fetchData();
  };

  // Mark pending items in group as paid
  const handleMarkGroupPaid = async (group: SaleGroup, method: 'online' | 'cash') => {
    const supabase = createClient();
    const pendingIds = group.items.filter((s) => s.payment_status === 'pending').map((s) => s.id);
    await supabase.from('sales').update({ payment_status: 'done', payment_method: method }).in('id', pendingIds);
    toast({ title: 'Payments marked as done' });
    fetchData();
    setInvoiceOpen(false);
  };

  // Customer-wide invoice
  const uniqueCustomers = Array.from(new Set(sales.map((s) => s.customer_name)));
  const customerInvoiceSales = sales.filter((s) => s.customer_name.toLowerCase() === invoiceCustomer.toLowerCase());
  const customerInvoicePending = customerInvoiceSales.filter((s) => s.payment_status === 'pending');

  const handleMarkCustomerPaid = async (method: 'online' | 'cash') => {
    const supabase = createClient();
    await supabase.from('sales').update({ payment_status: 'done', payment_method: method }).in('id', customerInvoicePending.map((s) => s.id));
    toast({ title: 'Payments marked as done' });
    fetchData();
    setCustomerInvoiceOpen(false);
    setInvoiceCustomer('');
  };

  // Period report filtered sales
  const periodSales = sales.filter((s) => {
    if (periodFrom && s.date < periodFrom) return false;
    if (periodTo && s.date > periodTo) return false;
    return true;
  });
  const periodRevenue = periodSales.reduce((a, s) => a + s.retail_price * s.quantity, 0);
  const periodProfit = periodSales.filter((s) => s.payment_status === 'done').reduce((a, s) => a + s.profit * s.quantity, 0);
  const periodPending = periodSales.filter((s) => s.payment_status === 'pending').reduce((a, s) => a + s.retail_price * s.quantity, 0);
  const periodVP = periodSales.reduce((a, s) => a + (s.volume_points ?? 0) * s.quantity, 0);

  // Summary totals
  const totalRevenue = filteredSales.reduce((a, s) => a + s.retail_price * s.quantity, 0);
  const totalProfit = filteredSales.filter((s) => s.payment_status === 'done').reduce((a, s) => a + s.profit * s.quantity, 0);
  const totalCashRevenue = filteredSales.filter((s) => s.payment_method === 'cash').reduce((a, s) => a + s.retail_price * s.quantity, 0);
  const totalOnlineRevenue = filteredSales.filter((s) => s.payment_method === 'online').reduce((a, s) => a + s.retail_price * s.quantity, 0);
  const totalCashAmount = filteredSales.filter((s) => s.payment_method === 'cash').reduce((a, s) => a + s.profit * s.quantity, 0);
  const totalOnlineAmount = filteredSales.filter((s) => s.payment_method === 'online').reduce((a, s) => a + s.profit * s.quantity, 0);
  const totalPendingAmount = filteredSales.filter((s) => s.payment_status === 'pending').reduce((a, s) => a + s.retail_price * s.quantity, 0);
  const totalVolumePoints = filteredSales.reduce((a, s) => a + (s.volume_points ?? 0) * s.quantity, 0);

  const statusBadgeVariant = (status: SaleGroup['status']) =>
    status === 'done' ? 'success' : status === 'pending' ? 'warning' : 'secondary';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Sales</h1>
          <p className="text-muted-foreground text-sm">Product revenue management</p>
        </div>
        <div className="flex gap-2">

          {/* Reset All Sales */}
          <Dialog open={resetOpen} onOpenChange={(v) => { setResetOpen(v); if (!v) setResetConfirmText(''); }}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2 text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive">
                <RotateCcw className="h-4 w-4" />Reset
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle className="text-destructive">Reset All Sales</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  This will permanently delete <strong>all {sales.length} sale records</strong>. This action cannot be undone.
                </p>
                <div className="space-y-2">
                  <Label className="text-sm">Type <span className="font-mono font-bold">RESET</span> to confirm</Label>
                  <Input
                    placeholder="RESET"
                    value={resetConfirmText}
                    onChange={(e) => setResetConfirmText(e.target.value)}
                    className="border-destructive/40 focus-visible:ring-destructive/30"
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => { setResetOpen(false); setResetConfirmText(''); }}>Cancel</Button>
                  <Button
                    variant="destructive"
                    className="flex-1"
                    disabled={resetConfirmText !== 'RESET'}
                    onClick={handleResetAll}
                  >
                    Delete All
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Period Report */}
          <Dialog open={periodReportOpen} onOpenChange={(v) => { setPeriodReportOpen(v); if (!v) { setPeriodFrom(''); setPeriodTo(''); } }}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2"><FileText className="h-4 w-4" />Period Report</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Period Sales Report</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Select a date range to generate a summary report with revenue, profit, volume, and pending amounts.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>From Date</Label>
                    <Input type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>To Date</Label>
                    <Input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} />
                  </div>
                </div>

                {(periodFrom || periodTo) && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                        <p className="text-xs text-muted-foreground mb-1">Total Revenue</p>
                        <p className="text-lg font-bold text-blue-700 dark:text-blue-400">{formatCurrency(periodRevenue)}</p>
                      </div>
                      <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-3">
                        <p className="text-xs text-muted-foreground mb-1">Total Profit</p>
                        <p className="text-lg font-bold text-green-700 dark:text-green-400">{formatCurrency(periodProfit)}</p>
                      </div>
                      <div className="bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-lg p-3">
                        <p className="text-xs text-muted-foreground mb-1">Volume Points</p>
                        <p className="text-lg font-bold text-purple-700 dark:text-purple-400">{periodVP.toFixed(2)} VP</p>
                      </div>
                      <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-lg p-3">
                        <p className="text-xs text-muted-foreground mb-1">Pending Amount</p>
                        <p className="text-lg font-bold text-orange-600 dark:text-orange-400">{formatCurrency(periodPending)}</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground text-center">{periodSales.length} sale records · {periodSales.reduce((a, s) => a + s.quantity, 0)} units</p>
                    {periodSales.length > 0 ? (
                      <Button className="w-full gap-2" onClick={() => printPeriodReport(periodSales, periodFrom || 'all', periodTo || 'all', managerName)}>
                        <Download className="h-4 w-4" />Download Report
                      </Button>
                    ) : (
                      <p className="text-center text-sm text-muted-foreground py-2">No sales found in this period.</p>
                    )}
                  </div>
                )}

                {!periodFrom && !periodTo && (
                  <p className="text-center text-sm text-muted-foreground py-4">Select dates above to preview the report.</p>
                )}
              </div>
            </DialogContent>
          </Dialog>

          {/* Customer-wide Invoice */}
          <Dialog open={customerInvoiceOpen} onOpenChange={(v) => { setCustomerInvoiceOpen(v); if (!v) setInvoiceCustomer(''); }}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2"><Receipt className="h-4 w-4" />Invoice</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Customer Invoice</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Customer Name</Label>
                  <Input placeholder="Type customer name..." value={invoiceCustomer} onChange={(e) => setInvoiceCustomer(e.target.value)} list="inv-cust" />
                  <datalist id="inv-cust">{uniqueCustomers.map((c) => <option key={c} value={c} />)}</datalist>
                </div>
                {invoiceCustomer && customerInvoiceSales.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex justify-end">
                      <Button size="sm" variant="outline" className="gap-2" onClick={() => printCustomerInvoice(customerInvoiceSales, invoiceCustomer, managerName)}>
                        <Download className="h-4 w-4" />Download PDF
                      </Button>
                    </div>
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Product</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead className="text-right">Unit</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {customerInvoiceSales.map((s) => (
                            <TableRow key={s.id}>
                              <TableCell className="text-sm">{s.product_name}</TableCell>
                              <TableCell className="text-right text-sm">{s.quantity}</TableCell>
                              <TableCell className="text-right text-sm">{formatCurrency(s.retail_price)}</TableCell>
                              <TableCell className="text-right text-sm font-medium">{formatCurrency(s.retail_price * s.quantity)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <div className="bg-muted p-3 rounded-lg space-y-1 text-sm">
                      <div className="flex justify-between"><span>Total Selling</span><span className="font-medium">{formatCurrency(customerInvoiceSales.reduce((a, s) => a + s.retail_price * s.quantity, 0))}</span></div>
                      <div className="flex justify-between"><span>My Cost</span><span>{formatCurrency(customerInvoiceSales.reduce((a, s) => a + s.my_price * s.quantity, 0))}</span></div>
                      <div className="flex justify-between font-bold border-t pt-1 mt-1"><span>Profit</span><span className="text-green-600">{formatCurrency(customerInvoiceSales.filter((s) => s.payment_status === 'done').reduce((a, s) => a + s.profit * s.quantity, 0))}</span></div>
                    </div>
                    {customerInvoicePending.length > 0 ? (
                      <div>
                        <p className="text-sm font-medium mb-2">{customerInvoicePending.length} pending. Mark as done:</p>
                        <div className="flex gap-2">
                          <Button size="sm" className="flex-1" onClick={() => handleMarkCustomerPaid('online')}>Online</Button>
                          <Button size="sm" variant="outline" className="flex-1" onClick={() => handleMarkCustomerPaid('cash')}>Cash</Button>
                        </div>
                      </div>
                    ) : (
                      <Badge variant="success" className="w-full justify-center py-1">All payments done</Badge>
                    )}
                  </div>
                )}
                {invoiceCustomer && customerInvoiceSales.length === 0 && <p className="text-muted-foreground text-sm text-center py-4">No sales found for this customer.</p>}
              </div>
            </DialogContent>
          </Dialog>

          {/* Add Sale */}
          <Dialog open={addOpen} onOpenChange={(v) => { setAddOpen(v); if (!v) resetAddForm(); }}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="h-4 w-4" />Add Sale</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
              <DialogHeader><DialogTitle>Add Sale</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 overflow-y-auto flex-1 pr-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input type="date" {...register('date')} />
                    {errors.date && <p className="text-xs text-destructive">{errors.date.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>Customer Name</Label>
                    <div className="relative">
                      <Input
                        placeholder="Search by name or phone..."
                        value={watch('customer_name')}
                        onChange={(e) => { setValue('customer_name', e.target.value); setCustDropdownAdd(true); }}
                        onFocus={() => setCustDropdownAdd(true)}
                        onBlur={() => setTimeout(() => setCustDropdownAdd(false), 150)}
                      />
                      {custDropdownAdd && (
                        <div className="absolute z-50 w-full bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto top-full mt-1">
                          {customers.filter(c => {
                            const q = watch('customer_name').toLowerCase();
                            return c.full_name.toLowerCase().includes(q) || (c.phone ?? '').includes(q);
                          }).slice(0, 8).map(c => (
                            <button key={c.id} type="button" className="w-full text-left px-3 py-2 hover:bg-accent text-sm"
                              onMouseDown={() => { setValue('customer_name', c.full_name); setCustPhoneAdd(c.phone ?? ''); setCustDropdownAdd(false); }}>
                              <span className="font-medium">{c.full_name}</span>
                              {c.phone && <span className="ml-2 text-xs text-muted-foreground">{c.phone}</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {errors.customer_name && <p className="text-xs text-destructive">{errors.customer_name.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>Customer Phone</Label>
                    <Input placeholder="Auto-filled or type..." value={custPhoneAdd} onChange={(e) => setCustPhoneAdd(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Reference (optional)</Label>
                  <Input placeholder="Reference" {...register('reference')} />
                </div>

                {/* Product lines */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Products</Label>
                    <Button type="button" size="sm" variant="outline" className="gap-1 h-7 text-xs" onClick={handleAddLine}>
                      <Plus className="h-3 w-3" />Add Product
                    </Button>
                  </div>

                  {fields.map((field, index) => {
                    const qty = watchItems?.[index]?.quantity || 1;
                    const myPrice = watchItems?.[index]?.my_price || 0;
                    const sellingPrice = watchItems?.[index]?.retail_price || 0;
                    const lineProfit = (sellingPrice - myPrice) * qty;

                    return (
                      <div key={field.id} className="border rounded-lg p-3 space-y-3 bg-muted/30">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-muted-foreground">Product {index + 1}</span>
                          {fields.length > 1 && (
                            <Button type="button" size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => handleRemoveLine(index)}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>

                        <div className="relative">
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              placeholder="Search product..."
                              className="pl-9 bg-background"
                              value={productSearches[index] || ''}
                              onChange={(e) => {
                                const s = [...productSearches];
                                s[index] = e.target.value;
                                setProductSearches(s);
                                setValue(`items.${index}.product_name`, e.target.value);
                                setOpenDropdownIndex(index);
                              }}
                              onFocus={() => setOpenDropdownIndex(index)}
                            />
                          </div>
                          {openDropdownIndex === index && getFilteredProducts(productSearches[index] || '').length > 0 && (
                            <div className="absolute z-50 w-full bg-background border rounded-md shadow-lg max-h-40 overflow-y-auto">
                              {getFilteredProducts(productSearches[index] || '').map((p) => (
                                <button key={p.id} type="button" className="w-full text-left px-3 py-2 hover:bg-accent text-sm" onClick={() => handleProductSelect(index, p)}>
                                  <div className="font-medium">{p.name}</div>
                                  <div className="text-xs text-muted-foreground">{formatCurrency(p.retail_price)}</div>
                                </button>
                              ))}
                            </div>
                          )}
                          {errors.items?.[index]?.product_name && <p className="text-xs text-destructive mt-1">{errors.items[index]?.product_name?.message}</p>}
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">Quantity</Label>
                            <Input type="number" min={1} className="bg-background" {...register(`items.${index}.quantity`)} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Volume Points</Label>
                            <Input type="number" step="0.01" className="bg-background" {...register(`items.${index}.volume_points`)} />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">My Price (₹) <span className="text-muted-foreground">per unit</span></Label>
                            <Input type="number" step="0.01" className="bg-background" {...register(`items.${index}.my_price`)} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Selling Price (₹) <span className="text-muted-foreground">per unit</span></Label>
                            <Input type="number" step="0.01" className="bg-background" {...register(`items.${index}.retail_price`)} />
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 bg-background rounded-md px-3 py-2 text-xs border">
                          <div>
                            <p className="text-muted-foreground">My Total</p>
                            <p className="font-semibold">{formatCurrency(myPrice * qty)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Selling Total</p>
                            <p className="font-semibold">{formatCurrency(sellingPrice * qty)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Profit</p>
                            <p className={`font-semibold ${lineProfit >= 0 ? 'text-green-600' : 'text-destructive'}`}>{formatCurrency(lineProfit)}</p>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs">Comments (optional)</Label>
                          <Input placeholder="Notes..." className="bg-background" {...register(`items.${index}.comments`)} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {fields.length > 1 && (
                  <div className="bg-primary/5 border border-primary/20 rounded-lg px-4 py-3 flex justify-between items-center">
                    <span className="text-sm font-medium">Grand Total ({fields.length} products)</span>
                    <span className="font-bold text-primary text-base">
                      {formatCurrency((watchItems || []).reduce((a, item) => a + (item.retail_price || 0) * (item.quantity || 1), 0))}
                    </span>
                  </div>
                )}

                {/* Payment method */}
                <div className="space-y-2">
                  <Label>Payment</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['cash', 'online', 'pending'] as const).map((method) => {
                      const selected = watch('payment_method') === method;
                      const colors: Record<string, string> = {
                        cash: selected ? 'bg-green-600 text-white border-green-600 hover:bg-green-700' : 'border-green-200 text-green-700 hover:bg-green-50 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-950/30',
                        online: selected ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700' : 'border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-950/30',
                        pending: selected ? 'bg-orange-500 text-white border-orange-500 hover:bg-orange-600' : 'border-orange-200 text-orange-600 hover:bg-orange-50 dark:border-orange-800 dark:text-orange-400 dark:hover:bg-orange-950/30',
                      };
                      return (
                        <button
                          key={method}
                          type="button"
                          className={`rounded-md border px-3 py-2 text-sm font-medium capitalize transition-colors ${colors[method]}`}
                          onClick={() => setValue('payment_method', method)}
                        >
                          {method === 'online' ? 'Online' : method === 'cash' ? 'Cash' : 'Pending'}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="outline" onClick={() => { setAddOpen(false); resetAddForm(); }}>Cancel</Button>
                  <Button type="submit">Add Sale{fields.length > 1 ? `s (${fields.length})` : ''}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Input placeholder="Filter by customer..." value={filterCustomer} onChange={(e) => setFilterCustomer(e.target.value)} />
            <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="done">Done</option>
            </select>
            <Input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} />
            <Input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Revenue</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{formatCurrency(totalRevenue)}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Profit</CardTitle></CardHeader><CardContent><p className="text-xl font-bold text-green-600">{formatCurrency(totalProfit)}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Cash Revenue</CardTitle></CardHeader><CardContent><p className="text-xl font-bold text-emerald-600">{formatCurrency(totalCashRevenue)}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Online Revenue</CardTitle></CardHeader><CardContent><p className="text-xl font-bold text-blue-600">{formatCurrency(totalOnlineRevenue)}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Cash Profit</CardTitle></CardHeader><CardContent><p className="text-xl font-bold text-emerald-500">{formatCurrency(totalCashAmount)}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Online Profit</CardTitle></CardHeader><CardContent><p className="text-xl font-bold text-blue-500">{formatCurrency(totalOnlineAmount)}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Volume Points</CardTitle></CardHeader><CardContent><p className="text-xl font-bold text-purple-600">{totalVolumePoints.toFixed(2)} VP</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Pending Amount</CardTitle></CardHeader><CardContent><p className="text-xl font-bold text-orange-500">{formatCurrency(totalPendingAmount)}</p></CardContent></Card>
      </div>

      {/* Grouped Sales Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : saleGroups.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No sales found.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="hidden md:table-cell">Reference</TableHead>
                    <TableHead className="text-right">Products</TableHead>
                    <TableHead className="text-right">Total Qty</TableHead>
                    <TableHead className="text-right hidden xl:table-cell">Volume</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right hidden lg:table-cell">Profit</TableHead>
                    <TableHead className="text-right hidden lg:table-cell">Pending</TableHead>
                    <TableHead className="hidden md:table-cell">Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {saleGroups.map((group) => (
                    <TableRow
                      key={group.key}
                      className="cursor-pointer hover:bg-accent/50"
                      onClick={() => { setInvoiceGroup(group); setInvoiceOpen(true); }}
                    >
                      <TableCell className="text-sm">{formatDate(group.date)}</TableCell>
                      <TableCell>
                        <p className="text-sm font-medium">{group.customer_name}</p>
                        {group.customer_phone && <p className="text-xs text-muted-foreground">{group.customer_phone}</p>}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground hidden md:table-cell">{group.reference ?? '—'}</TableCell>
                      <TableCell className="text-right text-sm">{group.items.length}</TableCell>
                      <TableCell className="text-right text-sm">{group.totalQty}</TableCell>
                      <TableCell className="text-right text-sm hidden xl:table-cell">
                        {group.totalVP > 0 ? <span className="text-purple-600 font-medium">{group.totalVP.toFixed(2)} VP</span> : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium">{formatCurrency(group.totalSellingAmount)}</TableCell>
                      <TableCell className="text-right text-sm font-medium hidden lg:table-cell">
                        {group.totalProfit > 0 ? <span className="text-green-600">{formatCurrency(group.totalProfit)}</span> : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right text-sm hidden lg:table-cell">
                        {group.pendingAmount > 0 ? <span className="text-orange-500 font-medium">{formatCurrency(group.pendingAmount)}</span> : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Badge variant={statusBadgeVariant(group.status)}>
                          {group.status === 'mixed' ? 'partial' : group.status}
                        </Badge>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1 justify-end">
                          <Button size="icon" variant="ghost" className="h-8 w-8" title="View Invoice" onClick={(e) => { e.stopPropagation(); setInvoiceGroup(group); setInvoiceOpen(true); }}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" title="Delete Sale" onClick={(e) => { e.stopPropagation(); handleDeleteGroup(group); }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invoice Dialog (per sale group) */}
      <Dialog open={invoiceOpen} onOpenChange={(v) => { setInvoiceOpen(v); if (!v) setInvoiceGroup(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="text-lg">Invoice — {invoiceGroup?.customer_name}</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {invoiceGroup && formatDate(invoiceGroup.date)}
              {invoiceGroup?.reference && ` · Ref: ${invoiceGroup.reference}`}
            </p>
          </DialogHeader>

          {invoiceGroup && (
            <div className="space-y-4 overflow-y-auto flex-1 pr-1">
              <div className="flex justify-end">
                <Button size="sm" variant="outline" className="gap-2" onClick={() => invoiceGroup && printInvoice(invoiceGroup, managerName)}>
                  <Download className="h-4 w-4" />Download Invoice
                </Button>
              </div>
              {/* Products table */}
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Qty</TableHead>
                      <TableHead className="text-right whitespace-nowrap">My Price</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Retail Price</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Total My</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Total Retail</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Profit</TableHead>
                      <TableHead className="text-right whitespace-nowrap">VP</TableHead>
                      <TableHead className="text-center whitespace-nowrap">Status</TableHead>
                      <TableHead className="text-center whitespace-nowrap">Method</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoiceGroup.items.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="text-sm font-medium">{s.product_name}</TableCell>
                        <TableCell className="text-right text-sm">{s.quantity}</TableCell>
                        <TableCell className="text-right text-sm whitespace-nowrap">{formatCurrency(s.my_price)}</TableCell>
                        <TableCell className="text-right text-sm whitespace-nowrap">{formatCurrency(s.retail_price)}</TableCell>
                        <TableCell className="text-right text-sm whitespace-nowrap">{formatCurrency(s.my_price * s.quantity)}</TableCell>
                        <TableCell className="text-right text-sm font-semibold whitespace-nowrap">{formatCurrency(s.retail_price * s.quantity)}</TableCell>
                        <TableCell className="text-right text-sm font-semibold whitespace-nowrap">
                          {s.payment_status === 'done' ? <span className="text-green-600">{formatCurrency((s.retail_price - s.my_price) * s.quantity)}</span> : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-right text-sm whitespace-nowrap">
                          {(s.volume_points ?? 0) > 0 ? <span className="text-purple-600">{((s.volume_points ?? 0) * s.quantity).toFixed(2)}</span> : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={s.payment_status === 'done' ? 'success' : 'warning'}>{s.payment_status}</Badge>
                        </TableCell>
                        <TableCell className="text-center text-sm text-muted-foreground capitalize whitespace-nowrap">
                          {s.payment_method ?? '—'}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 justify-end">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { handleEdit(s); setInvoiceOpen(false); }}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDeleteItem(s.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Totals */}
              <div className="bg-muted rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Selling</span>
                  <span className="font-semibold">{formatCurrency(invoiceGroup.totalSellingAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">My Cost</span>
                  <span>{formatCurrency(invoiceGroup.totalMyAmount)}</span>
                </div>
                {invoiceGroup.totalVP > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Volume Points</span>
                    <span className="text-purple-600 font-semibold">{invoiceGroup.totalVP.toFixed(2)} VP</span>
                  </div>
                )}
                {invoiceGroup.pendingAmount > 0 && (
                  <div className="flex justify-between text-orange-500">
                    <span>Pending Amount</span>
                    <span className="font-semibold">{formatCurrency(invoiceGroup.pendingAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold border-t pt-2 mt-1">
                  <span>Profit (received)</span>
                  <span className="text-green-600">{formatCurrency(invoiceGroup.totalProfit)}</span>
                </div>
              </div>

              {/* Mark as paid */}
              {invoiceGroup.status !== 'done' && (
                <div className="border rounded-lg p-3 space-y-2">
                  <p className="text-sm font-medium">
                    {invoiceGroup.items.filter((s) => s.payment_status === 'pending').length} item(s) pending — mark as paid:
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1" onClick={() => handleMarkGroupPaid(invoiceGroup, 'online')}>Online</Button>
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => handleMarkGroupPaid(invoiceGroup, 'cash')}>Cash</Button>
                  </div>
                </div>
              )}
              {invoiceGroup.status === 'done' && (
                <Badge variant="success" className="w-full justify-center py-2">All payments received</Badge>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={(v) => { setEditOpen(v); if (!v) setEditSale(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader><DialogTitle>Edit Product</DialogTitle></DialogHeader>
          <form onSubmit={handleEditSubmit(onEditSubmit)} className="space-y-4 overflow-y-auto flex-1 pr-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" {...regEdit('date')} />
              </div>
              <div className="space-y-2">
                <Label>Customer Name</Label>
                <div className="relative">
                  <Input
                    value={watchEdit('customer_name')}
                    onChange={(e) => { setValueEdit('customer_name', e.target.value); setCustDropdownEdit(true); }}
                    onFocus={() => setCustDropdownEdit(true)}
                    onBlur={() => setTimeout(() => setCustDropdownEdit(false), 150)}
                  />
                  {custDropdownEdit && (
                    <div className="absolute z-50 w-full bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto top-full mt-1">
                      {customers.filter(c => {
                        const q = (watchEdit('customer_name') ?? '').toLowerCase();
                        return c.full_name.toLowerCase().includes(q) || (c.phone ?? '').includes(q);
                      }).slice(0, 8).map(c => (
                        <button key={c.id} type="button" className="w-full text-left px-3 py-2 hover:bg-accent text-sm"
                          onMouseDown={() => { setValueEdit('customer_name', c.full_name); setCustPhoneEdit(c.phone ?? ''); setCustDropdownEdit(false); }}>
                          <span className="font-medium">{c.full_name}</span>
                          {c.phone && <span className="ml-2 text-xs text-muted-foreground">{c.phone}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {editErrors.customer_name && <p className="text-xs text-destructive">{editErrors.customer_name.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>Customer Phone</Label>
                <Input value={custPhoneEdit} onChange={(e) => setCustPhoneEdit(e.target.value)} placeholder="Auto-filled or type..." />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Reference</Label>
              <Input {...regEdit('reference')} />
            </div>
            <div className="space-y-2">
              <Label>Product Name</Label>
              <Input {...regEdit('product_name')} list="edit-prod" />
              <datalist id="edit-prod">{products.map((p) => <option key={p.id} value={p.name} />)}</datalist>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input type="number" min={1} {...regEdit('quantity')} />
              </div>
              <div className="space-y-2">
                <Label>Volume Points</Label>
                <Input type="number" step="0.01" {...regEdit('volume_points')} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>My Price (₹) per unit</Label>
                <Input type="number" step="0.01" {...regEdit('my_price')} />
              </div>
              <div className="space-y-2">
                <Label>Selling Price (₹) per unit</Label>
                <Input type="number" step="0.01" {...regEdit('retail_price')} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 bg-muted rounded-md px-3 py-2 text-xs border">
              <div><p className="text-muted-foreground">My Total</p><p className="font-semibold">{formatCurrency(editMyPrice * editQty)}</p></div>
              <div><p className="text-muted-foreground">Selling Total</p><p className="font-semibold">{formatCurrency(editRetailPrice * editQty)}</p></div>
              <div><p className="text-muted-foreground">Profit</p><p className={`font-semibold ${(editRetailPrice - editMyPrice) * editQty >= 0 ? 'text-green-600' : 'text-destructive'}`}>{formatCurrency((editRetailPrice - editMyPrice) * editQty)}</p></div>
            </div>
            <div className="space-y-2">
              <Label>Comments</Label>
              <Textarea rows={2} {...regEdit('comments')} />
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => { setEditOpen(false); setEditSale(null); }}>Cancel</Button>
              <Button type="submit">Update</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
