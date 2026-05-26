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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { CenterMenu, CenterSale, CenterMembership, CenterMembershipVisit, Product, Customer } from '@/types/database';
import { Plus, Pencil, Trash2, Settings, Download, CheckCircle2, Circle, Users, Search, RotateCcw, Receipt, FileText, X, Eye } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format, startOfMonth, endOfMonth } from 'date-fns';

// ─── Schemas ─────────────────────────────────────────────────────────────────

const lineItemSchema = z.object({
  product_name: z.string().min(1, 'Product required'),
  quantity: z.coerce.number().min(1, 'Min 1'),
  my_price: z.coerce.number().min(0),
  fixed_price: z.coerce.number().min(0),
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

const menuSchema = z.object({
  item_name: z.string().min(1, 'Item name is required'),
  fixed_price: z.coerce.number().min(0, 'Price must be positive'),
});

const membershipSchema = z.object({
  customer_name: z.string().min(1, 'Customer name is required'),
  reference: z.string().optional(),
  total_shakes: z.coerce.number().min(1, 'At least 1 shake required'),
  price: z.coerce.number().min(0, 'Price must be non-negative'),
  payment_status: z.enum(['pending', 'paid']),
  start_date: z.string().min(1, 'Start date is required'),
});



type SaleForm = z.infer<typeof saleSchema>;
type MenuForm = z.infer<typeof menuSchema>;
type MembershipForm = z.infer<typeof membershipSchema>;

const emptyItem = { product_name: '', quantity: 1, my_price: 0, fixed_price: 0, volume_points: 0, comments: '' };

// ─── Types ────────────────────────────────────────────────────────────────────

type CenterSaleGroup = {
  key: string;
  date: string;
  customer_name: string;
  customer_phone: string | null;
  reference: string | null;
  items: CenterSale[];
  totalQty: number;
  totalAmount: number;
  totalMyAmount: number;
  totalProfit: number;
  totalVP: number;
  pendingAmount: number;
  status: 'done' | 'pending' | 'mixed';
  allIds: number[];
};

function groupCenterSales(sales: CenterSale[]): CenterSaleGroup[] {
  const map = new Map<string, CenterSaleGroup>();
  for (const s of sales) {
    const key = `${s.date}|${s.customer_name}|${s.reference ?? ''}`;
    if (!map.has(key)) {
      map.set(key, { key, date: s.date, customer_name: s.customer_name, customer_phone: s.customer_phone ?? null, reference: s.reference, items: [], totalQty: 0, totalAmount: 0, totalMyAmount: 0, totalProfit: 0, totalVP: 0, pendingAmount: 0, status: 'done', allIds: [] });
    }
    const g = map.get(key)!;
    g.items.push(s);
    g.allIds.push(s.id);
    g.totalQty += s.quantity;
    g.totalAmount += s.fixed_price * s.quantity;
    g.totalMyAmount += (s.my_price ?? 0) * s.quantity;
    g.totalVP += (s.volume_points ?? 0) * s.quantity;
    if (s.payment_status === 'done') g.totalProfit += (s.fixed_price - (s.my_price ?? 0)) * s.quantity;
    if (s.payment_status === 'pending') g.pendingAmount += s.fixed_price * s.quantity;
  }
  Array.from(map.values()).forEach((g) => {
    const hasDone = g.items.some((s) => s.payment_status === 'done');
    const hasPending = g.items.some((s) => s.payment_status === 'pending');
    g.status = hasDone && hasPending ? 'mixed' : hasPending ? 'pending' : 'done';
  });
  return Array.from(map.values());
}

// ─── Print helpers ────────────────────────────────────────────────────────────

function printCenterCustomerInvoice(customerSales: CenterSale[], customerName: string, managerName: string) {
  const totalRevenue = customerSales.reduce((a, s) => a + s.fixed_price * s.quantity, 0);
  const totalPending = customerSales.filter((s) => s.payment_status === 'pending').reduce((a, s) => a + s.fixed_price * s.quantity, 0);
  const cashAmount = customerSales.filter((s) => s.payment_method === 'cash').reduce((a, s) => a + s.fixed_price * s.quantity, 0);
  const onlineAmount = customerSales.filter((s) => s.payment_method === 'online').reduce((a, s) => a + s.fixed_price * s.quantity, 0);
  const totalVP = customerSales.reduce((a, s) => a + (s.volume_points ?? 0) * s.quantity, 0);

  const byDate = new Map<string, CenterSale[]>();
  for (const s of customerSales) {
    if (!byDate.has(s.date)) byDate.set(s.date, []);
    byDate.get(s.date)!.push(s);
  }

  const rows = Array.from(byDate.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, items]) => items.map((s) => `
      <tr>
        <td>${date}</td><td>${s.product_name}</td>
        <td class="num">${s.quantity}</td>
        <td class="num">₹${s.fixed_price.toFixed(2)}</td>
        <td class="num">₹${(s.fixed_price * s.quantity).toFixed(2)}</td>
        <td class="num status-${s.payment_status}">${s.payment_status}</td>
        <td class="num">${s.payment_method ?? '—'}</td>
      </tr>`).join('')).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
  <title>Customer Report – ${customerName}</title>
  <style>* {box-sizing:border-box;margin:0;padding:0} body{font-family:Arial,sans-serif;font-size:13px;color:#111;padding:32px} h1{font-size:22px;margin-bottom:4px} .sub{color:#666;font-size:12px;margin-bottom:24px} .meta{display:flex;justify-content:space-between;margin-bottom:24px} .meta div{line-height:1.8} .summary-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:28px} .card{border:1px solid #e5e7eb;border-radius:8px;padding:12px 14px} .card .label{font-size:10px;color:#666;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em} .card .value{font-size:18px;font-weight:700} table{width:100%;border-collapse:collapse;margin-bottom:20px} th{background:#f4f4f4;text-align:left;padding:8px 10px;font-size:12px;border-bottom:2px solid #ddd} td{padding:8px 10px;border-bottom:1px solid #eee} .num{text-align:right} tfoot tr td{font-weight:bold;background:#f9fafb} .status-done{color:#16a34a;font-weight:600} .status-pending{color:#d97706;font-weight:600} .footer{margin-top:40px;font-size:11px;color:#999;text-align:center} @media print{button{display:none}}</style>
  </head><body>
  <h1>Customer Sales Report</h1><p class="sub">Herbalife Sales Manager – Center</p>
  <div class="meta"><div><strong>Customer:</strong> ${customerName}<br/><strong>Total Transactions:</strong> ${customerSales.length} entries</div><div style="text-align:right"><strong>Manager:</strong> ${managerName}<br/><strong>Generated:</strong> ${new Date().toLocaleString()}</div></div>
  <div class="summary-grid">
    <div class="card"><div class="label">Total Revenue</div><div class="value" style="color:#1d4ed8">₹${totalRevenue.toFixed(2)}</div></div>
    <div class="card"><div class="label">Cash Received</div><div class="value" style="color:#059669">₹${cashAmount.toFixed(2)}</div></div>
    <div class="card"><div class="label">Online Received</div><div class="value" style="color:#2563eb">₹${onlineAmount.toFixed(2)}</div></div>
    <div class="card"><div class="label">Pending</div><div class="value" style="color:#d97706">₹${totalPending.toFixed(2)}</div></div>
    ${totalVP > 0 ? `<div class="card"><div class="label">Volume Points</div><div class="value" style="color:#7c3aed">${totalVP.toFixed(2)} VP</div></div>` : ''}
  </div>
  <table><thead><tr><th>Date</th><th>Product</th><th class="num">Qty</th><th class="num">Unit Price</th><th class="num">Total</th><th class="num">Status</th><th class="num">Method</th></tr></thead>
  <tbody>${rows}</tbody>
  <tfoot><tr><td colspan="4">TOTAL</td><td class="num">₹${totalRevenue.toFixed(2)}</td><td colspan="2"></td></tr></tfoot></table>
  <div class="footer">Herbalife Sales Manager · Center · Customer Report · ${customerName}</div>
  <script>window.onload=()=>{window.print()}<\/script></body></html>`;

  const win = window.open('', '_blank');
  if (win) { win.document.write(html); win.document.close(); }
}

function printCenterPeriodReport(periodSales: CenterSale[], from: string, to: string, managerName: string) {
  const revenue = periodSales.reduce((a, s) => a + s.fixed_price * s.quantity, 0);
  const cashAmount = periodSales.filter((s) => s.payment_method === 'cash').reduce((a, s) => a + s.fixed_price * s.quantity, 0);
  const onlineAmount = periodSales.filter((s) => s.payment_method === 'online').reduce((a, s) => a + s.fixed_price * s.quantity, 0);
  const pendingAmount = periodSales.filter((s) => s.payment_status === 'pending').reduce((a, s) => a + s.fixed_price * s.quantity, 0);
  const volumePoints = periodSales.reduce((a, s) => a + (s.volume_points ?? 0) * s.quantity, 0);
  const totalQty = periodSales.reduce((a, s) => a + s.quantity, 0);

  const byCustomer = new Map<string, { revenue: number; cash: number; online: number; pending: number; vp: number }>();
  for (const s of periodSales) {
    if (!byCustomer.has(s.customer_name)) byCustomer.set(s.customer_name, { revenue: 0, cash: 0, online: 0, pending: 0, vp: 0 });
    const c = byCustomer.get(s.customer_name)!;
    c.revenue += s.fixed_price * s.quantity;
    if (s.payment_method === 'cash') c.cash += s.fixed_price * s.quantity;
    if (s.payment_method === 'online') c.online += s.fixed_price * s.quantity;
    if (s.payment_status === 'pending') c.pending += s.fixed_price * s.quantity;
    c.vp += (s.volume_points ?? 0) * s.quantity;
  }

  const customerRows = Array.from(byCustomer.entries()).sort((a, b) => b[1].revenue - a[1].revenue).map(([name, d]) => `
    <tr><td>${name}</td><td class="num">₹${d.revenue.toFixed(2)}</td><td class="num" style="color:#059669">${d.cash > 0 ? `₹${d.cash.toFixed(2)}` : '—'}</td><td class="num" style="color:#2563eb">${d.online > 0 ? `₹${d.online.toFixed(2)}` : '—'}</td><td class="num">${d.vp.toFixed(2)}</td><td class="num" style="color:${d.pending > 0 ? '#d97706' : '#16a34a'}">${d.pending > 0 ? `₹${d.pending.toFixed(2)}` : '—'}</td></tr>`).join('');

  const fd = (d: string) => { if (!d || d === 'all') return d; const [y, mo, day] = d.split('-'); return `${day}/${mo}/${y}`; };
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Center Period Report ${fd(from)} to ${fd(to)}</title>
  <style>* {box-sizing:border-box;margin:0;padding:0} body{font-family:Arial,sans-serif;font-size:13px;color:#111;padding:32px} h1{font-size:22px;margin-bottom:4px} h2{font-size:15px;margin:24px 0 10px;color:#333} .sub{color:#666;font-size:12px;margin-bottom:24px} .meta{display:flex;justify-content:space-between;margin-bottom:24px} .summary-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:28px} .card{border:1px solid #e5e7eb;border-radius:8px;padding:12px 14px} .card .label{font-size:10px;color:#666;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em} .card .value{font-size:16px;font-weight:700} table{width:100%;border-collapse:collapse;margin-bottom:20px} th{background:#f4f4f4;text-align:left;padding:8px 10px;font-size:12px;border-bottom:2px solid #ddd} td{padding:8px 10px;border-bottom:1px solid #eee} .num{text-align:right} tfoot tr td{font-weight:bold;background:#f9fafb} .footer{margin-top:40px;font-size:11px;color:#999;text-align:center} @media print{button{display:none}}</style>
  </head><body>
  <h1>Center Period Sales Report</h1><p class="sub">Herbalife Sales Manager</p>
  <div class="meta"><div><strong>Period:</strong> ${fd(from)} to ${fd(to)}<br/><strong>Total Transactions:</strong> ${periodSales.length} items (${totalQty} units)</div><div style="text-align:right"><strong>Manager:</strong> ${managerName}<br/><strong>Generated:</strong> ${new Date().toLocaleString()}</div></div>
  <div class="summary-grid">
    <div class="card"><div class="label">Total Revenue</div><div class="value" style="color:#1d4ed8">₹${revenue.toFixed(2)}</div></div>
    <div class="card"><div class="label">Cash Received</div><div class="value" style="color:#059669">₹${cashAmount.toFixed(2)}</div></div>
    <div class="card"><div class="label">Online Received</div><div class="value" style="color:#2563eb">₹${onlineAmount.toFixed(2)}</div></div>
    <div class="card"><div class="label">Volume Points</div><div class="value" style="color:#7c3aed">${volumePoints.toFixed(2)}</div></div>
    <div class="card"><div class="label">Pending Amount</div><div class="value" style="color:#d97706">₹${pendingAmount.toFixed(2)}</div></div>
  </div>
  <h2>Customer Breakdown</h2>
  <table><thead><tr><th>Customer</th><th class="num">Revenue</th><th class="num">Cash</th><th class="num">Online</th><th class="num">Volume Points</th><th class="num">Pending</th></tr></thead>
  <tbody>${customerRows}</tbody>
  <tfoot><tr><td>TOTAL</td><td class="num">₹${revenue.toFixed(2)}</td><td class="num" style="color:#059669">₹${cashAmount.toFixed(2)}</td><td class="num" style="color:#2563eb">₹${onlineAmount.toFixed(2)}</td><td class="num">${volumePoints.toFixed(2)}</td><td class="num" style="color:#d97706">${pendingAmount > 0 ? `₹${pendingAmount.toFixed(2)}` : '—'}</td></tr></tfoot></table>
  <div class="footer">Herbalife Sales Manager · Center · Period Report · ${fd(from)} to ${fd(to)}</div>
  <script>window.onload=()=>{window.print()}<\/script></body></html>`;

  const win = window.open('', '_blank');
  if (win) { win.document.write(html); win.document.close(); }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CenterPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'sales' | 'memberships'>('sales');

  // Sales state
  const [sales, setSales] = useState<CenterSale[]>([]);
  const [menu, setMenu] = useState<CenterMenu[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editMenuItem, setEditMenuItem] = useState<CenterMenu | null>(null);

  // Invoice group
  const [invoiceGroup, setInvoiceGroup] = useState<CenterSaleGroup | null>(null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);

  // Edit single item
  const [editSale, setEditSale] = useState<CenterSale | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  // Customer autocomplete
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [custPhoneAdd, setCustPhoneAdd] = useState('');
  const [custPhoneEdit, setCustPhoneEdit] = useState('');
  const [custPhoneMembership, setCustPhoneMembership] = useState('');
  const [custDropdownAdd, setCustDropdownAdd] = useState(false);
  const [custDropdownEdit, setCustDropdownEdit] = useState(false);
  const [custDropdownMembership, setCustDropdownMembership] = useState(false);

  // Per-line product search
  const [productSearches, setProductSearches] = useState<string[]>(['']);
  const [openDropdownIndex, setOpenDropdownIndex] = useState<number | null>(null);

  // Membership state
  const [memberships, setMemberships] = useState<CenterMembership[]>([]);
  const [membershipVisits, setMembershipVisits] = useState<CenterMembershipVisit[]>([]);
  const [addMembershipOpen, setAddMembershipOpen] = useState(false);
  const [membershipReportOpen, setMembershipReportOpen] = useState(false);
  const [visitDateMap, setVisitDateMap] = useState<Record<number, string>>({});
  const [membershipSearch, setMembershipSearch] = useState('');
  const [resetOpen, setResetOpen] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [managerName, setManagerName] = useState('Manager');
  const [membershipPeriodOpen, setMembershipPeriodOpen] = useState(false);
  const [membershipPeriodFrom, setMembershipPeriodFrom] = useState('');
  const [membershipPeriodTo, setMembershipPeriodTo] = useState('');

  // Filters
  const [filterCustomer, setFilterCustomer] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // Period report
  const [periodReportOpen, setPeriodReportOpen] = useState(false);
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');

  // Customer invoice
  const [customerInvoiceOpen, setCustomerInvoiceOpen] = useState(false);
  const [invoiceCustomer, setInvoiceCustomer] = useState('');

  const today = format(new Date(), 'yyyy-MM-dd');
  const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(new Date()), 'yyyy-MM-dd');

  // Add form
  const { register, handleSubmit, reset, setValue, watch, control, formState: { errors } } = useForm<SaleForm>({
    resolver: zodResolver(saleSchema),
    defaultValues: { date: today, customer_name: '', reference: '', payment_method: 'cash', items: [emptyItem] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const watchItems = watch('items');

  // Edit form (single item)
  const editSchema = z.object({
    date: z.string().min(1),
    customer_name: z.string().min(1),
    reference: z.string().optional(),
    product_name: z.string().min(1),
    quantity: z.coerce.number().min(1),
    my_price: z.coerce.number().min(0),
    fixed_price: z.coerce.number().min(0),
    volume_points: z.coerce.number().optional(),
    comments: z.string().optional(),
  });
  type EditForm = z.infer<typeof editSchema>;
  const { register: regEdit, handleSubmit: handleEditSubmit, reset: resetEdit, setValue: setValueEdit, watch: watchEdit, formState: { errors: editErrors } } = useForm<EditForm>({ resolver: zodResolver(editSchema) });

  const menuForm = useForm<MenuForm>({ resolver: zodResolver(menuSchema) });
  const membershipForm = useForm<MembershipForm>({
    resolver: zodResolver(membershipSchema),
    defaultValues: { payment_status: 'pending', start_date: today, total_shakes: 1, price: 0 },
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const [{ data: salesData }, { data: menuData }, { data: membershipsData }, { data: visitsData }, { data: productsData }, { data: customersData }] = await Promise.all([
      supabase.from('center_sales').select('*').order('date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('center_menu').select('*').order('item_name'),
      supabase.from('center_memberships').select('*').order('created_at', { ascending: false }),
      supabase.from('center_membership_visits').select('*').order('visit_date', { ascending: true }),
      supabase.from('products').select('*').order('name'),
      supabase.from('customers').select('id, full_name, phone').order('full_name'),
    ]);
    setSales(salesData ?? []);
    setMenu(menuData ?? []);
    setMemberships((membershipsData ?? []) as CenterMembership[]);
    setMembershipVisits((visitsData ?? []) as CenterMembershipVisit[]);
    setProducts(productsData ?? []);
    setCustomers((customersData ?? []) as Customer[]);
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('first_name, last_name').eq('id', user.id).single();
      if (profile) setManagerName(`${profile.first_name} ${profile.last_name}`);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Filtered + grouped
  const filteredSales = sales.filter((s) => {
    if (filterCustomer && !s.customer_name.toLowerCase().includes(filterCustomer.toLowerCase())) return false;
    if (filterStatus && s.payment_status !== filterStatus) return false;
    if (filterDateFrom && s.date < filterDateFrom) return false;
    if (filterDateTo && s.date > filterDateTo) return false;
    return true;
  });
  const saleGroups = groupCenterSales(filteredSales);

  // Summary totals
  const totalRevenue = filteredSales.reduce((a, s) => a + s.fixed_price * s.quantity, 0);
  const totalCashRevenue = filteredSales.filter((s) => s.payment_method === 'cash').reduce((a, s) => a + s.fixed_price * s.quantity, 0);
  const totalOnlineRevenue = filteredSales.filter((s) => s.payment_method === 'online').reduce((a, s) => a + s.fixed_price * s.quantity, 0);
  const totalCashAmount = filteredSales.filter((s) => s.payment_method === 'cash' && s.payment_status === 'done').reduce((a, s) => a + (s.fixed_price - (s.my_price ?? 0)) * s.quantity, 0);
  const totalOnlineAmount = filteredSales.filter((s) => s.payment_method === 'online' && s.payment_status === 'done').reduce((a, s) => a + (s.fixed_price - (s.my_price ?? 0)) * s.quantity, 0);
  const totalPendingAmount = filteredSales.filter((s) => s.payment_status === 'pending').reduce((a, s) => a + s.fixed_price * s.quantity, 0);
  const totalVolumePoints = filteredSales.reduce((a, s) => a + (s.volume_points ?? 0) * s.quantity, 0);
  const totalProfit = filteredSales.filter((s) => s.payment_status === 'done').reduce((a, s) => a + (s.fixed_price - (s.my_price ?? 0)) * s.quantity, 0);

  // Today / monthly stats
  const todaySales = sales.filter((s) => s.date === today);
  const todayRevenue = todaySales.reduce((a, s) => a + s.fixed_price * s.quantity, 0);
  const monthlySales = sales.filter((s) => s.date >= monthStart && s.date <= monthEnd);
  const monthlyRevenue = monthlySales.reduce((a, s) => a + s.fixed_price * s.quantity, 0);

  // Period report
  const periodSales = sales.filter((s) => {
    if (periodFrom && s.date < periodFrom) return false;
    if (periodTo && s.date > periodTo) return false;
    return true;
  });
  const periodRevenue = periodSales.reduce((a, s) => a + s.fixed_price * s.quantity, 0);
  const periodCash = periodSales.filter((s) => s.payment_method === 'cash').reduce((a, s) => a + s.fixed_price * s.quantity, 0);
  const periodOnline = periodSales.filter((s) => s.payment_method === 'online').reduce((a, s) => a + s.fixed_price * s.quantity, 0);
  const periodPending = periodSales.filter((s) => s.payment_status === 'pending').reduce((a, s) => a + s.fixed_price * s.quantity, 0);

  // Customer invoice
  const uniqueCustomers = Array.from(new Set(sales.map((s) => s.customer_name)));
  const customerInvoiceSales = sales.filter((s) => s.customer_name.toLowerCase() === invoiceCustomer.toLowerCase());
  const customerInvoicePending = customerInvoiceSales.filter((s) => s.payment_status === 'pending');

  // Membership stats
  const membershipTodayRevenue = memberships.filter(m => m.start_date === today && m.payment_status === 'paid').reduce((a, m) => a + m.price, 0);
  const membershipMonthlyRevenue = memberships.filter(m => m.start_date >= monthStart && m.start_date <= monthEnd && m.payment_status === 'paid').reduce((a, m) => a + m.price, 0);
  const membershipTotalRevenue = memberships.filter(m => m.payment_status === 'paid').reduce((a, m) => a + m.price, 0);
  const membershipShakesToday = membershipVisits.filter(v => v.visit_date === today).length;
  const membershipShakesMonth = membershipVisits.filter(v => v.visit_date >= monthStart && v.visit_date <= monthEnd).length;
  const membershipShakesTotal = membershipVisits.length;
  const membershipTodayEntries = memberships.filter(m => m.start_date === today && m.payment_status === 'paid').length;
  const membershipMonthEntries = memberships.filter(m => m.start_date >= monthStart && m.start_date <= monthEnd && m.payment_status === 'paid').length;
  const activeMembershipsCount = memberships.filter(m => membershipVisits.filter(v => v.membership_id === m.id).length < m.total_shakes).length;
  const membershipPendingAmount = memberships.filter(m => m.payment_status === 'pending').reduce((a, m) => a + m.price, 0);

  // Membership period report
  const membershipPeriodData = memberships.filter(m => {
    if (!membershipPeriodFrom && !membershipPeriodTo) return false;
    if (membershipPeriodFrom && m.start_date < membershipPeriodFrom) return false;
    if (membershipPeriodTo && m.start_date > membershipPeriodTo) return false;
    return true;
  });
  const membershipPeriodRevenue = membershipPeriodData.filter(m => m.payment_status === 'paid').reduce((a, m) => a + m.price, 0);
  const membershipPeriodPending = membershipPeriodData.filter(m => m.payment_status === 'pending').reduce((a, m) => a + m.price, 0);

  // Product search helpers
  const getFilteredSuggestions = (search: string) => {
    const q = search.toLowerCase();
    const menuMatches = menu.filter(m => m.item_name.toLowerCase().includes(q)).slice(0, 5);
    const productMatches = products.filter(p => p.name.toLowerCase().includes(q) && !menuMatches.some(m => m.item_name === p.name)).slice(0, 5);
    return { menuMatches, productMatches };
  };

  const handleLineProductSelect = (index: number, name: string, price: number, vp?: number, myPrice?: number) => {
    setValue(`items.${index}.product_name`, name);
    setValue(`items.${index}.fixed_price`, price);
    setValue(`items.${index}.my_price`, myPrice ?? 0);
    if (vp !== undefined) setValue(`items.${index}.volume_points`, vp);
    const s = [...productSearches];
    s[index] = name;
    setProductSearches(s);
    setOpenDropdownIndex(null);
  };

  const handleAddLine = () => { append(emptyItem); setProductSearches([...productSearches, '']); };
  const handleRemoveLine = (index: number) => { remove(index); const s = [...productSearches]; s.splice(index, 1); setProductSearches(s); };

  const resetAddForm = () => {
    reset({ date: today, customer_name: '', reference: '', payment_method: 'cash', items: [emptyItem] });
    setProductSearches(['']);
    setOpenDropdownIndex(null);
    setCustPhoneAdd('');
    setCustDropdownAdd(false);
  };

  // CRUD
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
      my_price: item.my_price || 0,
      fixed_price: item.fixed_price,
      volume_points: item.volume_points || 0,
      comments: item.comments || null,
      payment_status: isPending ? 'pending' as const : 'done' as const,
      payment_method: isPending ? null : data.payment_method === 'cash' ? 'cash' as const : 'online' as const,
    }));
    const { error } = await supabase.from('center_sales').insert(rows);
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
    const { error } = await supabase.from('center_sales').update({
      date: data.date, customer_name: data.customer_name, customer_phone: custPhoneEdit.trim() || null,
      reference: data.reference || null, product_name: data.product_name, quantity: data.quantity,
      my_price: data.my_price || 0, fixed_price: data.fixed_price, volume_points: data.volume_points || 0, comments: data.comments || null,
    }).eq('id', editSale.id);
    if (error) { toast({ title: 'Update failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Sale updated' });
    setEditOpen(false);
    setEditSale(null);
    fetchData();
    if (invoiceGroup) {
      const updated = sales.map(s => s.id === editSale.id ? { ...s, ...data } : s);
      const reGrouped = groupCenterSales(updated as CenterSale[]);
      const found = reGrouped.find(g => g.key === invoiceGroup.key);
      if (found) setInvoiceGroup(found); else setInvoiceOpen(false);
    }
  };

  const handleEdit = (sale: CenterSale) => {
    setEditSale(sale);
    resetEdit({ date: sale.date, customer_name: sale.customer_name, reference: sale.reference ?? '', product_name: sale.product_name, quantity: sale.quantity, my_price: sale.my_price ?? 0, fixed_price: sale.fixed_price, volume_points: sale.volume_points, comments: sale.comments ?? '' });
    setCustPhoneEdit(sale.customer_phone ?? '');
    setCustDropdownEdit(false);
    setEditOpen(true);
  };

  const handleDeleteItem = async (id: number) => {
    if (!confirm('Remove this product from the sale?')) return;
    const supabase = createClient();
    await supabase.from('center_sales').delete().eq('id', id);
    toast({ title: 'Product removed' });
    fetchData();
    if (invoiceGroup) {
      const updated = sales.filter(s => s.id !== id);
      const reGrouped = groupCenterSales(updated);
      const found = reGrouped.find(g => g.key === invoiceGroup.key);
      if (found) setInvoiceGroup(found); else setInvoiceOpen(false);
    }
  };

  const handleDeleteGroup = async (group: CenterSaleGroup) => {
    if (!confirm(`Delete all ${group.items.length} product(s) in this sale?`)) return;
    const supabase = createClient();
    await supabase.from('center_sales').delete().in('id', group.allIds);
    toast({ title: 'Sale deleted' });
    fetchData();
  };

  const handleMarkGroupPaid = async (group: CenterSaleGroup, method: 'online' | 'cash') => {
    const supabase = createClient();
    const pendingIds = group.items.filter(s => s.payment_status === 'pending').map(s => s.id);
    await supabase.from('center_sales').update({ payment_status: 'done', payment_method: method }).in('id', pendingIds);
    toast({ title: 'Payments marked as done' });
    fetchData();
    setInvoiceOpen(false);
  };

  const handleMarkCustomerPaid = async (method: 'online' | 'cash') => {
    const supabase = createClient();
    await supabase.from('center_sales').update({ payment_status: 'done', payment_method: method }).in('id', customerInvoicePending.map(s => s.id));
    toast({ title: 'Payments marked as done' });
    fetchData();
    setCustomerInvoiceOpen(false);
    setInvoiceCustomer('');
  };

  // Menu CRUD
  const onMenuSubmit = async (data: MenuForm) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    if (editMenuItem) {
      const { error } = await supabase.from('center_menu').update({ item_name: data.item_name, fixed_price: data.fixed_price }).eq('id', editMenuItem.id);
      if (error) { toast({ title: 'Update failed', description: error.message, variant: 'destructive' }); return; }
      toast({ title: 'Menu item updated' });
    } else {
      const { error } = await supabase.from('center_menu').insert({ user_id: user.id, item_name: data.item_name, fixed_price: data.fixed_price });
      if (error) { toast({ title: 'Add failed', description: error.message, variant: 'destructive' }); return; }
      toast({ title: 'Menu item added' });
    }
    setEditMenuItem(null);
    menuForm.reset();
    fetchData();
  };

  const handleDeleteMenuItem = async (id: number) => {
    if (!confirm('Delete this menu item?')) return;
    const supabase = createClient();
    await supabase.from('center_menu').delete().eq('id', id);
    toast({ title: 'Menu item deleted' });
    fetchData();
  };

  // Membership CRUD
  const onMembershipSubmit = async (data: MembershipForm) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from('center_memberships').insert({ user_id: user.id, customer_name: data.customer_name, customer_phone: custPhoneMembership.trim() || null, reference: data.reference || null, total_shakes: data.total_shakes, price: data.price, payment_status: data.payment_status, start_date: data.start_date });
    if (error) { toast({ title: 'Failed to create membership', description: error.message, variant: 'destructive' }); return; }

    // Auto-create customer if not already in the list
    const exists = customers.some(c => c.full_name.toLowerCase() === data.customer_name.trim().toLowerCase());
    if (!exists) {
      await supabase.from('customers').insert({
        user_id: user.id,
        full_name: data.customer_name.trim(),
        phone: custPhoneMembership.trim() || null,
        status: 'active',
      });
      toast({ title: 'Membership created', description: `"${data.customer_name.trim()}" added as a new customer.` });
    } else {
      toast({ title: 'Membership created' });
    }

    setAddMembershipOpen(false);
    setCustPhoneMembership('');
    membershipForm.reset({ payment_status: 'pending', start_date: today, total_shakes: 1, price: 0 });
    fetchData();
  };

  const handleMarkVisit = async (membership: CenterMembership, visitDate: string) => {
    const visits = membershipVisits.filter(v => v.membership_id === membership.id);
    if (visits.length >= membership.total_shakes) { toast({ title: 'Membership complete', description: 'All shakes have been consumed.', variant: 'destructive' }); return; }
    if (visits.some(v => v.visit_date === visitDate)) { toast({ title: 'Already marked', description: `${membership.customer_name} already has a visit on ${visitDate}.`, variant: 'destructive' }); return; }
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from('center_membership_visits').insert({ membership_id: membership.id, user_id: user.id, visit_date: visitDate });
    if (error) { toast({ title: 'Failed to mark visit', description: error.message, variant: 'destructive' }); return; }
    const newUsed = visits.length + 1;
    const remaining = membership.total_shakes - newUsed;
    if (remaining === 0) {
      toast({ title: 'Membership complete!', description: `${membership.customer_name} has used all ${membership.total_shakes} shakes. Time to renew!` });
    } else if (remaining === 1) {
      toast({ title: 'Last shake remaining!', description: `${membership.customer_name} has only 1 shake left — remind them to renew.` });
    } else {
      toast({ title: 'Visit marked', description: `${membership.customer_name} — ${visitDate} (${remaining} shakes left)` });
    }
    setVisitDateMap(prev => ({ ...prev, [membership.id]: today }));
    fetchData();
  };

  const handleTogglePayment = async (membership: CenterMembership) => {
    const supabase = createClient();
    const newStatus = membership.payment_status === 'paid' ? 'pending' : 'paid';
    const { error } = await supabase.from('center_memberships').update({ payment_status: newStatus }).eq('id', membership.id);
    if (error) { toast({ title: 'Update failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: `Payment marked as ${newStatus}` });
    fetchData();
  };

  const handleDeleteMembership = async (id: number) => {
    if (!confirm('Delete this membership? All visit records will also be deleted.')) return;
    const supabase = createClient();
    await supabase.from('center_memberships').delete().eq('id', id);
    toast({ title: 'Membership deleted' });
    fetchData();
  };

  const handleSaveComment = async (id: number) => {
    const supabase = createClient();
    const { error } = await supabase.from('center_memberships').update({ comments: commentDraft || null }).eq('id', id);
    if (error) { toast({ title: 'Failed to save comment', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Comment saved' });
    setEditingCommentId(null);
    fetchData();
  };

  const handleRenewMembership = (customerName: string) => {
    const existing = customers.find(c => c.full_name === customerName);
    setCustPhoneMembership(existing?.phone ?? '');
    membershipForm.reset({ customer_name: customerName, payment_status: 'pending', start_date: today, total_shakes: 1, price: 0 });
    setAddMembershipOpen(true);
  };

  const handleResetAllMemberships = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from('center_memberships').delete().eq('user_id', user.id);
    if (error) { toast({ title: 'Reset failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'All memberships deleted' });
    setResetOpen(false);
    setResetConfirmText('');
    fetchData();
  };

  const fmtD = (d: string) => { if (!d) return '—'; const [y, mo, day] = d.split('-'); return `${day}/${mo}/${y}`; };

  const printSingleMembershipReport = (m: CenterMembership) => {
    const customerName = m.customer_name;
    const allMemberships = memberships.filter(x => x.customer_name === customerName).sort((a, b) => a.start_date.localeCompare(b.start_date));
    const totalPaid = allMemberships.filter(x => x.payment_status === 'paid').reduce((a, x) => a + x.price, 0);
    const totalShakesAll = allMemberships.reduce((a, x) => a + x.total_shakes, 0);
    const totalUsedAll = allMemberships.reduce((a, x) => a + membershipVisits.filter(v => v.membership_id === x.id).length, 0);
    const membershipBlocks = allMemberships.map((mem, idx) => {
      const visits = membershipVisits.filter(v => v.membership_id === mem.id).sort((a, b) => a.visit_date.localeCompare(b.visit_date));
      const used = visits.length;
      const remaining = mem.total_shakes - used;
      const isComplete = used >= mem.total_shakes;
      const lastVisit = visits[visits.length - 1]?.visit_date ?? '';
      const durationDays = lastVisit ? Math.max(1, Math.ceil((new Date(lastVisit).getTime() - new Date(mem.start_date).getTime()) / 86400000) + 1) : 0;
      const shakeCircles = Array.from({ length: mem.total_shakes }).map((_, i) => i < used ? `<span style="color:#16a34a;font-size:16px" title="${fmtD(visits[i]?.visit_date ?? '')}">&#10003;</span>` : `<span style="color:#d1d5db;font-size:16px">&#9675;</span>`).join(' ');
      const visitPills = visits.map(v => `<span style="display:inline-block;background:#dcfce7;color:#166534;font-size:10px;padding:2px 8px;border-radius:20px;margin:2px 2px 2px 0">${fmtD(v.visit_date)}</span>`).join('');
      const isCurrent = mem.id === m.id;
      return `<div style="border:${isCurrent ? '2px solid #3b82f6' : '1px solid #e5e7eb'};border-radius:10px;padding:16px 20px;margin-bottom:20px;${isCurrent ? 'background:#eff6ff' : ''}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
          <div>
            <span style="font-size:12px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:.05em">Membership #${idx + 1}${isCurrent ? ' — Current' : ' — Past'}</span>
            <p style="font-size:13px;margin-top:2px">Started: <strong>${fmtD(mem.start_date)}</strong>${mem.reference ? ` · Ref: ${mem.reference}` : ''}</p>
            ${lastVisit ? `<p style="font-size:11px;color:#666;margin-top:2px">Duration: ${fmtD(mem.start_date)} → ${fmtD(lastVisit)} (${durationDays} days)</p>` : ''}
          </div>
          <div style="text-align:right">
            <p style="font-size:16px;font-weight:700">&#8377;${mem.price.toFixed(2)}</p>
            <span style="padding:2px 10px;border-radius:12px;font-size:11px;font-weight:600;background:${mem.payment_status === 'paid' ? '#dcfce7' : '#fff7ed'};color:${mem.payment_status === 'paid' ? '#166534' : '#c2410c'}">${mem.payment_status === 'paid' ? 'Paid' : 'Pending'}</span>
            &nbsp;<span style="padding:2px 10px;border-radius:12px;font-size:11px;font-weight:600;background:${isComplete ? '#f3f4f6' : '#dcfce7'};color:${isComplete ? '#374151' : '#166534'}">${isComplete ? 'Complete' : 'Active'}</span>
          </div>
        </div>
        <div style="margin-bottom:10px">
          <span style="font-size:11px;color:#666;">Progress: ${used}/${mem.total_shakes} · Remaining: ${remaining}</span><br/>
          <div style="letter-spacing:3px;margin-top:4px">${shakeCircles}</div>
        </div>
        <div>${visitPills || '<span style="color:#999;font-size:11px">No visits yet.</span>'}</div>
        ${mem.comments ? `<p style="margin-top:8px;font-size:12px;color:#555;font-style:italic">💬 ${mem.comments}</p>` : ''}
      </div>`;
    }).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Membership Report — ${customerName}</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:13px;color:#111;padding:40px}h1{font-size:24px;margin-bottom:2px}.sub{color:#15803d;font-size:12px;margin-bottom:28px}.meta{display:flex;justify-content:space-between;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #e5e7eb}.summary-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:28px}.card{border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px}.card .label{font-size:10px;color:#666;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em}.card .value{font-size:20px;font-weight:700}.footer{margin-top:40px;font-size:11px;color:#999;text-align:center;border-top:1px solid #e5e7eb;padding-top:16px}@media print{button{display:none}}</style></head><body>
    <h1>Membership Report</h1><p class="sub">Herbalife Sales Manager</p>
    <div class="meta">
      <div><p style="font-size:22px;font-weight:700;margin-bottom:4px">${customerName}</p><p style="color:#666;font-size:12px">${allMemberships.length} membership${allMemberships.length !== 1 ? 's' : ''} total</p></div>
      <div style="text-align:right"><p><strong>Manager:</strong> ${managerName}</p><p><strong>Generated:</strong> ${new Date().toLocaleString()}</p></div>
    </div>
    <div class="summary-grid">
      <div class="card"><div class="label">Total Memberships</div><div class="value" style="color:#1d4ed8">${allMemberships.length}</div></div>
      <div class="card"><div class="label">Total Paid</div><div class="value" style="color:#16a34a">&#8377;${totalPaid.toFixed(2)}</div></div>
      <div class="card"><div class="label">Total Shakes</div><div class="value" style="color:#7c3aed">${totalShakesAll}</div></div>
      <div class="card"><div class="label">Shakes Used</div><div class="value" style="color:#be123c">${totalUsedAll}</div></div>
    </div>
    ${membershipBlocks}
    <div class="footer">Herbalife Sales Manager · ${customerName} · Full Membership History</div>
    <script>window.onload=()=>{window.print()}<\/script></body></html>`;
    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); }
  };

  const printMembershipReport = () => {
    const totalMemberships = memberships.length;
    const totalRevenueMem = memberships.reduce((a, m) => a + m.price, 0);
    const pendingCount = memberships.filter(m => m.payment_status === 'pending').length;
    const pendingRev = memberships.filter(m => m.payment_status === 'pending').reduce((a, m) => a + m.price, 0);
    const totalShakesUsed = membershipVisits.length;
    const memberRows = memberships.map(m => {
      const visits = membershipVisits.filter(v => v.membership_id === m.id).sort((a, b) => a.visit_date.localeCompare(b.visit_date));
      const used = visits.length; const remaining = m.total_shakes - used; const isComplete = used >= m.total_shakes;
      const visitPills = visits.map(v => `<span style="display:inline-block;background:#dcfce7;color:#166534;font-size:10px;padding:2px 7px;border-radius:20px;margin:2px 2px 2px 0">${fmtD(v.visit_date)}</span>`).join('');
      const shakeCircles = Array.from({ length: m.total_shakes }).map((_, i) => i < used ? `<span style="color:#16a34a;font-size:14px" title="${fmtD(visits[i]?.visit_date ?? '')}">&#10003;</span>` : `<span style="color:#d1d5db;font-size:14px">&#9675;</span>`).join(' ');
      return `<tr><td><strong>${m.customer_name}</strong>${m.reference ? `<br/><span style="color:#666;font-size:11px">${m.reference}</span>` : ''}</td><td>${fmtD(m.start_date)}</td><td class="num">${shakeCircles}<br/><span style="font-size:11px;color:#555">${used}/${m.total_shakes}</span></td><td class="num">${remaining}</td><td class="num">&#8377;${m.price.toFixed(2)}</td><td style="text-align:center"><span style="padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;background:${m.payment_status === 'paid' ? '#dcfce7' : '#fff7ed'};color:${m.payment_status === 'paid' ? '#166534' : '#c2410c'}">${m.payment_status === 'paid' ? 'Paid' : 'Pending'}</span></td><td style="text-align:center">${isComplete ? '<span style="padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;background:#f3f4f6;color:#374151">Complete</span>' : '<span style="color:#16a34a;font-size:11px">Active</span>'}</td><td>${visitPills || '<span style="color:#999;font-size:11px">No visits</span>'}</td></tr>`;
    }).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Membership Report</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:13px;color:#111;padding:32px}h1{font-size:22px;margin-bottom:4px}.sub{color:#666;font-size:12px;margin-bottom:24px}.meta{display:flex;justify-content:space-between;margin-bottom:24px}.summary-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:28px}.card{border:1px solid #e5e7eb;border-radius:8px;padding:12px 14px}.card .label{font-size:10px;color:#666;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em}.card .value{font-size:18px;font-weight:700}table{width:100%;border-collapse:collapse;margin-bottom:20px;font-size:12px}th{background:#f4f4f4;text-align:left;padding:8px 10px;font-size:11px;border-bottom:2px solid #ddd}td{padding:7px 10px;border-bottom:1px solid #eee;vertical-align:top}.num{text-align:center}.footer{margin-top:40px;font-size:11px;color:#999;text-align:center}@media print{button{display:none}}</style></head><body>
    <h1>Membership Report</h1><p class="sub">Herbalife Sales Manager</p>
    <div class="meta"><div><strong>Total Members:</strong> ${totalMemberships}<br/><strong>Shakes Used:</strong> ${totalShakesUsed}</div><div style="text-align:right"><strong>Manager:</strong> ${managerName}<br/><strong>Generated:</strong> ${new Date().toLocaleString()}</div></div>
    <div class="summary-grid"><div class="card"><div class="label">Total Members</div><div class="value" style="color:#1d4ed8">${totalMemberships}</div></div><div class="card"><div class="label">Total Revenue</div><div class="value" style="color:#be123c">&#8377;${totalRevenueMem.toFixed(2)}</div></div><div class="card"><div class="label">Pending Payment</div><div class="value" style="color:#c2410c">&#8377;${pendingRev.toFixed(2)}</div><div class="label">${pendingCount} members</div></div><div class="card"><div class="label">Total Shakes Used</div><div class="value" style="color:#16a34a">${totalShakesUsed}</div></div></div>
    <table><thead><tr><th>Customer</th><th>Start Date</th><th class="num">Progress</th><th class="num">Remaining</th><th class="num">Price</th><th style="text-align:center">Payment</th><th style="text-align:center">Status</th><th>Visit Dates</th></tr></thead><tbody>${memberRows}</tbody></table>
    <div class="footer">Herbalife Sales Manager · Membership Report · Generated ${new Date().toLocaleString()}</div>
    <script>window.onload=()=>{window.print()}<\/script></body></html>`;
    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); }
  };

  const printMembershipPeriodReport = (data: CenterMembership[], from: string, to: string) => {
    const totalRevenuePeriod = data.reduce((a, m) => a + m.price, 0);
    const pendingCount = data.filter(m => m.payment_status === 'pending').length;
    const pendingRev = data.filter(m => m.payment_status === 'pending').reduce((a, m) => a + m.price, 0);
    const totalShakesUsed = data.reduce((a, m) => a + membershipVisits.filter(v => v.membership_id === m.id).length, 0);
    const memberRows = data.map(m => {
      const visits = membershipVisits.filter(v => v.membership_id === m.id).sort((a, b) => a.visit_date.localeCompare(b.visit_date));
      const used = visits.length; const remaining = m.total_shakes - used; const isComplete = used >= m.total_shakes;
      const visitPills = visits.map(v => `<span style="display:inline-block;background:#dcfce7;color:#166534;font-size:10px;padding:2px 7px;border-radius:20px;margin:2px 2px 2px 0">${fmtD(v.visit_date)}</span>`).join('');
      const shakeCircles = Array.from({ length: m.total_shakes }).map((_, i) => i < used ? `<span style="color:#16a34a;font-size:14px" title="${fmtD(visits[i]?.visit_date ?? '')}">&#10003;</span>` : `<span style="color:#d1d5db;font-size:14px">&#9675;</span>`).join(' ');
      return `<tr><td><strong>${m.customer_name}</strong>${m.reference ? `<br/><span style="color:#666;font-size:11px">${m.reference}</span>` : ''}</td><td>${fmtD(m.start_date)}</td><td class="num">${shakeCircles}<br/><span style="font-size:11px;color:#555">${used}/${m.total_shakes}</span></td><td class="num">${remaining}</td><td class="num">&#8377;${m.price.toFixed(2)}</td><td style="text-align:center"><span style="padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;background:${m.payment_status === 'paid' ? '#dcfce7' : '#fff7ed'};color:${m.payment_status === 'paid' ? '#166534' : '#c2410c'}">${m.payment_status === 'paid' ? 'Paid' : 'Pending'}</span></td><td style="text-align:center">${isComplete ? '<span style="padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;background:#f3f4f6;color:#374151">Complete</span>' : '<span style="color:#16a34a;font-size:11px">Active</span>'}</td><td>${visitPills || '<span style="color:#999;font-size:11px">No visits</span>'}</td></tr>`;
    }).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Membership Period Report</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:13px;color:#111;padding:32px}h1{font-size:22px;margin-bottom:4px}.sub{color:#15803d;font-size:12px;margin-bottom:24px}.meta{display:flex;justify-content:space-between;margin-bottom:24px}.summary-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:28px}.card{border:1px solid #e5e7eb;border-radius:8px;padding:12px 14px}.card .label{font-size:10px;color:#666;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em}.card .value{font-size:18px;font-weight:700}table{width:100%;border-collapse:collapse;margin-bottom:20px;font-size:12px}th{background:#f4f4f4;text-align:left;padding:8px 10px;font-size:11px;border-bottom:2px solid #ddd}td{padding:7px 10px;border-bottom:1px solid #eee;vertical-align:top}.num{text-align:center}.footer{margin-top:40px;font-size:11px;color:#999;text-align:center}@media print{button{display:none}}</style></head><body>
    <h1>Membership Period Report</h1><p class="sub">Herbalife Sales Manager</p>
    <div class="meta"><div><strong>Total Members:</strong> ${data.length}<br/><strong>Shakes Used:</strong> ${totalShakesUsed}<br/><strong>Period:</strong> ${from ? fmtD(from) : 'All'} to ${to ? fmtD(to) : 'All'}</div><div style="text-align:right"><strong>Manager:</strong> ${managerName}<br/><strong>Generated:</strong> ${new Date().toLocaleString()}</div></div>
    <div class="summary-grid"><div class="card"><div class="label">Total Members</div><div class="value" style="color:#1d4ed8">${data.length}</div></div><div class="card"><div class="label">Total Revenue</div><div class="value" style="color:#be123c">&#8377;${totalRevenuePeriod.toFixed(2)}</div></div><div class="card"><div class="label">Pending Payment</div><div class="value" style="color:#c2410c">&#8377;${pendingRev.toFixed(2)}</div><div class="label">${pendingCount} members</div></div><div class="card"><div class="label">Total Shakes Used</div><div class="value" style="color:#16a34a">${totalShakesUsed}</div></div></div>
    <table><thead><tr><th>Customer</th><th>Start Date</th><th class="num">Progress</th><th class="num">Remaining</th><th class="num">Price</th><th style="text-align:center">Payment</th><th style="text-align:center">Status</th><th>Visit Dates</th></tr></thead><tbody>${memberRows}</tbody></table>
    <div class="footer">Herbalife Sales Manager · Membership Period Report · ${from ? fmtD(from) : 'All'} to ${to ? fmtD(to) : 'All'}</div>
    <script>window.onload=()=>{window.print()}<\/script></body></html>`;
    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); }
  };

  const statusBadgeVariant = (status: CenterSaleGroup['status']) =>
    status === 'done' ? 'success' : status === 'pending' ? 'warning' : 'secondary';

  const filteredCustomerGroups = Array.from(
    memberships.reduce((map, m) => { if (!map.has(m.customer_name)) map.set(m.customer_name, []); map.get(m.customer_name)!.push(m); return map; }, new Map<string, CenterMembership[]>())
  ).map(([name, ms]) => {
    const withVisits = ms.map(m => ({ membership: m, visits: membershipVisits.filter(v => v.membership_id === m.id).sort((a, b) => a.visit_date.localeCompare(b.visit_date)) }));
    return { name, active: withVisits.filter(({ membership: m, visits }) => visits.length < m.total_shakes), completed: withVisits.filter(({ membership: m, visits }) => visits.length >= m.total_shakes) };
  }).filter(group => !membershipSearch || group.name.toLowerCase().includes(membershipSearch.toLowerCase()));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Center</h1>
          <p className="text-muted-foreground text-sm">Customer management & revenue</p>
        </div>
        <div className="flex gap-2">
          <Button variant={activeTab === 'sales' ? 'default' : 'outline'} onClick={() => setActiveTab('sales')}>Sales</Button>
          <Button variant={activeTab === 'memberships' ? 'default' : 'outline'} onClick={() => setActiveTab('memberships')} className="gap-2">
            <Users className="h-4 w-4" />Memberships
          </Button>
        </div>
      </div>

      {/* ─── SALES TAB ─── */}
      {activeTab === 'sales' && (
        <>
          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Center Sales</h2>
              <p className="text-muted-foreground text-sm">Sales made at the center</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {/* Period Report */}
              <Dialog open={periodReportOpen} onOpenChange={(v) => { setPeriodReportOpen(v); if (!v) { setPeriodFrom(''); setPeriodTo(''); } }}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="gap-2"><FileText className="h-4 w-4" />Period Report</Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader><DialogTitle>Center Period Sales Report</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2"><Label>From Date</Label><Input type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} /></div>
                      <div className="space-y-2"><Label>To Date</Label><Input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} /></div>
                    </div>
                    {(periodFrom || periodTo) && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3"><p className="text-xs text-muted-foreground mb-1">Total Revenue</p><p className="text-lg font-bold text-blue-700 dark:text-blue-400">{formatCurrency(periodRevenue)}</p></div>
                          <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-3"><p className="text-xs text-muted-foreground mb-1">Cash Received</p><p className="text-lg font-bold text-green-700 dark:text-green-400">{formatCurrency(periodCash)}</p></div>
                          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3"><p className="text-xs text-muted-foreground mb-1">Online Received</p><p className="text-lg font-bold text-blue-600 dark:text-blue-400">{formatCurrency(periodOnline)}</p></div>
                          <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-lg p-3"><p className="text-xs text-muted-foreground mb-1">Pending Amount</p><p className="text-lg font-bold text-orange-600 dark:text-orange-400">{formatCurrency(periodPending)}</p></div>
                        </div>
                        <p className="text-xs text-muted-foreground text-center">{periodSales.length} records · {periodSales.reduce((a, s) => a + s.quantity, 0)} units</p>
                        {periodSales.length > 0 ? (
                          <Button className="w-full gap-2" onClick={() => printCenterPeriodReport(periodSales, periodFrom || 'all', periodTo || 'all', managerName)}>
                            <Download className="h-4 w-4" />Download Report
                          </Button>
                        ) : <p className="text-center text-sm text-muted-foreground py-2">No sales found in this period.</p>}
                      </div>
                    )}
                    {!periodFrom && !periodTo && <p className="text-center text-sm text-muted-foreground py-4">Select dates above to preview the report.</p>}
                  </div>
                </DialogContent>
              </Dialog>

              {/* Add Sale */}
              <Dialog open={addOpen} onOpenChange={(v) => { setAddOpen(v); if (!v) resetAddForm(); }}>
                <DialogTrigger asChild>
                  <Button className="gap-2"><Plus className="h-4 w-4" />Add Sale</Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
                  <DialogHeader><DialogTitle>Add Center Sale</DialogTitle></DialogHeader>
                  <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 overflow-y-auto flex-1 pr-1">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2"><Label>Date</Label><Input type="date" {...register('date')} />{errors.date && <p className="text-xs text-destructive">{errors.date.message}</p>}</div>
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
                    <div className="space-y-2"><Label>Reference (optional)</Label><Input placeholder="Reference" {...register('reference')} /></div>

                    {/* Product lines */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label>Products</Label>
                        <Button type="button" size="sm" variant="outline" className="gap-1 h-7 text-xs" onClick={handleAddLine}><Plus className="h-3 w-3" />Add Product</Button>
                      </div>

                      {/* Menu quick-select */}
                      {menu.length > 0 && (
                        <div className="flex gap-2 flex-wrap">
                          {menu.map((item) => (
                            <button key={item.id} type="button" className="px-3 py-1 text-xs border rounded-full hover:bg-accent transition-colors" onClick={() => {
                              const idx = fields.length - 1;
                              handleLineProductSelect(idx, item.item_name, item.fixed_price);
                            }}>
                              {item.item_name} — {formatCurrency(item.fixed_price)}
                            </button>
                          ))}
                        </div>
                      )}

                      {fields.map((field, index) => {
                        const qty = watchItems?.[index]?.quantity || 1;
                        const price = watchItems?.[index]?.fixed_price || 0;
                        const { menuMatches, productMatches } = getFilteredSuggestions(productSearches[index] || '');
                        const hasDropdown = openDropdownIndex === index && (productSearches[index] || '').length > 0 && (menuMatches.length > 0 || productMatches.length > 0);

                        const myPrice = watchItems?.[index]?.my_price || 0;
                        const lineProfit = (price - myPrice) * qty;

                        return (
                          <div key={field.id} className="border rounded-lg p-3 space-y-3 bg-muted/30">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-muted-foreground">Product {index + 1}</span>
                              {fields.length > 1 && (
                                <Button type="button" size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => handleRemoveLine(index)}><X className="h-3.5 w-3.5" /></Button>
                              )}
                            </div>

                            <div className="relative">
                              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input
                                placeholder="Search product..."
                                className="pl-9 bg-background"
                                value={productSearches[index] || ''}
                                onChange={(e) => {
                                  const s = [...productSearches]; s[index] = e.target.value; setProductSearches(s);
                                  setValue(`items.${index}.product_name`, e.target.value);
                                  setOpenDropdownIndex(index);
                                }}
                                onFocus={() => setOpenDropdownIndex(index)}
                              />
                              {hasDropdown && (
                                <div className="absolute z-50 w-full bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto">
                                  {menuMatches.length > 0 && (<>
                                    <div className="px-3 py-1 text-xs text-muted-foreground font-medium bg-muted/50">Center Menu</div>
                                    {menuMatches.map(item => (
                                      <button key={`m-${item.id}`} type="button" className="w-full text-left px-3 py-2 hover:bg-accent text-sm" onClick={() => handleLineProductSelect(index, item.item_name, item.fixed_price)}>
                                        <div className="font-medium">{item.item_name}</div>
                                        <div className="text-xs text-muted-foreground">{formatCurrency(item.fixed_price)}</div>
                                      </button>
                                    ))}
                                  </>)}
                                  {productMatches.length > 0 && (<>
                                    <div className="px-3 py-1 text-xs text-muted-foreground font-medium bg-muted/50">Products</div>
                                    {productMatches.map(p => (
                                      <button key={`p-${p.id}`} type="button" className="w-full text-left px-3 py-2 hover:bg-accent text-sm" onClick={() => handleLineProductSelect(index, p.name, p.retail_price, p.volume_points, p.retail_price)}>
                                        <div className="font-medium">{p.name}</div>
                                        <div className="text-xs text-muted-foreground">{formatCurrency(p.retail_price)}</div>
                                      </button>
                                    ))}
                                  </>)}
                                </div>
                              )}
                              {errors.items?.[index]?.product_name && <p className="text-xs text-destructive mt-1">{errors.items[index]?.product_name?.message}</p>}
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1"><Label className="text-xs">Quantity</Label><Input type="number" min={1} className="bg-background" {...register(`items.${index}.quantity`)} /></div>
                              <div className="space-y-1"><Label className="text-xs">Volume Points</Label><Input type="number" step="0.01" className="bg-background" {...register(`items.${index}.volume_points`)} /></div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <Label className="text-xs">My Price (₹) <span className="text-muted-foreground">per unit</span></Label>
                                <Input type="number" step="0.01" className="bg-background" {...register(`items.${index}.my_price`)} />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Selling Price (₹) <span className="text-muted-foreground">per unit</span></Label>
                                <Input type="number" step="0.01" className="bg-background" {...register(`items.${index}.fixed_price`)} />
                              </div>
                            </div>

                            <div className="grid grid-cols-3 gap-2 bg-background rounded-md px-3 py-2 text-xs border">
                              <div><p className="text-muted-foreground">My Total</p><p className="font-semibold">{formatCurrency(myPrice * qty)}</p></div>
                              <div><p className="text-muted-foreground">Selling Total</p><p className="font-semibold">{formatCurrency(price * qty)}</p></div>
                              <div><p className="text-muted-foreground">Profit</p><p className={`font-semibold ${lineProfit >= 0 ? 'text-green-600' : 'text-destructive'}`}>{formatCurrency(lineProfit)}</p></div>
                            </div>

                            <div className="space-y-1"><Label className="text-xs">Comments (optional)</Label><Input placeholder="Notes..." className="bg-background" {...register(`items.${index}.comments`)} /></div>
                          </div>
                        );
                      })}
                    </div>

                    {fields.length > 1 && (
                      <div className="bg-primary/5 border border-primary/20 rounded-lg px-4 py-3 flex justify-between items-center">
                        <span className="text-sm font-medium">Grand Total ({fields.length} products)</span>
                        <span className="font-bold text-primary text-base">{formatCurrency((watchItems || []).reduce((a, item) => a + (item.fixed_price || 0) * (item.quantity || 1), 0))}</span>
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
                            <button key={method} type="button" className={`rounded-md border px-3 py-2 text-sm font-medium capitalize transition-colors ${colors[method]}`} onClick={() => setValue('payment_method', method)}>
                              {method === 'online' ? 'Online' : method === 'cash' ? 'Cash' : 'Pending'}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex gap-2 justify-end">
                      <Button type="button" variant="outline" onClick={() => { setAddOpen(false); resetAddForm(); }}>Cancel</Button>
                      <Button type="submit">Add Sale{fields.length > 1 ? ` (${fields.length})` : ''}</Button>
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
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Pending Amount</CardTitle></CardHeader><CardContent><p className="text-xl font-bold text-orange-500">{formatCurrency(totalPendingAmount)}</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Volume Points</CardTitle></CardHeader><CardContent><p className="text-xl font-bold text-purple-600">{totalVolumePoints.toFixed(2)} VP</p></CardContent></Card>
          </div>

          {/* Today breakdown */}
          {todaySales.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Today — {formatCurrency(todayRevenue)} · {todaySales.reduce((a,s)=>a+s.quantity,0)} items</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(todaySales.reduce<Record<string,number>>((acc,s)=>{ acc[s.product_name]=(acc[s.product_name]||0)+s.quantity; return acc; },{})).map(([item,qty]) => (
                    <div key={item} className="flex items-center gap-2 bg-muted rounded-full px-3 py-1">
                      <span className="text-sm font-medium">{item}</span>
                      <span className="text-sm text-muted-foreground">×{qty}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Grouped Sales Table */}
          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-8 text-center text-muted-foreground">Loading...</div>
              ) : saleGroups.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">No center sales found.</div>
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
                        <TableHead className="text-right hidden lg:table-cell">Pending</TableHead>
                        <TableHead className="hidden md:table-cell">Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {saleGroups.map((group) => (
                        <TableRow key={group.key} className="cursor-pointer hover:bg-accent/50" onClick={() => { setInvoiceGroup(group); setInvoiceOpen(true); }}>
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
                          <TableCell className="text-right text-sm font-medium">{formatCurrency(group.totalAmount)}</TableCell>
                          <TableCell className="text-right text-sm hidden lg:table-cell">
                            {group.pendingAmount > 0 ? <span className="text-orange-500 font-medium">{formatCurrency(group.pendingAmount)}</span> : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <Badge variant={statusBadgeVariant(group.status)}>{group.status === 'mixed' ? 'partial' : group.status}</Badge>
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <div className="flex gap-1 justify-end">
                              <Button size="icon" variant="ghost" className="h-8 w-8" title="View" onClick={(e) => { e.stopPropagation(); setInvoiceGroup(group); setInvoiceOpen(true); }}><Eye className="h-3.5 w-3.5" /></Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" title="Delete" onClick={(e) => { e.stopPropagation(); handleDeleteGroup(group); }}><Trash2 className="h-3.5 w-3.5" /></Button>
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

          {/* Invoice Dialog */}
          <Dialog open={invoiceOpen} onOpenChange={(v) => { setInvoiceOpen(v); if (!v) setInvoiceGroup(null); }}>
            <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
              <DialogHeader>
                <DialogTitle className="text-lg">Sale — {invoiceGroup?.customer_name}</DialogTitle>
                <p className="text-sm text-muted-foreground">{invoiceGroup && formatDate(invoiceGroup.date)}{invoiceGroup?.reference && ` · Ref: ${invoiceGroup.reference}`}</p>
              </DialogHeader>
              {invoiceGroup && (
                <div className="space-y-4 overflow-y-auto flex-1 pr-1">
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right hidden md:table-cell">My Price</TableHead>
                          <TableHead className="text-right">Selling Price</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead className="text-right hidden md:table-cell">Profit</TableHead>
                          <TableHead className="text-right hidden md:table-cell">VP</TableHead>
                          <TableHead className="text-center">Status</TableHead>
                          <TableHead className="text-center">Method</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {invoiceGroup.items.map((s) => (
                          <TableRow key={s.id}>
                            <TableCell className="text-sm font-medium">{s.product_name}</TableCell>
                            <TableCell className="text-right text-sm">{s.quantity}</TableCell>
                            <TableCell className="text-right text-sm hidden md:table-cell text-muted-foreground">{formatCurrency(s.my_price ?? 0)}</TableCell>
                            <TableCell className="text-right text-sm">{formatCurrency(s.fixed_price)}</TableCell>
                            <TableCell className="text-right text-sm font-semibold">{formatCurrency(s.fixed_price * s.quantity)}</TableCell>
                            <TableCell className="text-right text-sm font-semibold hidden md:table-cell">
                              {s.payment_status === 'done'
                                ? <span className="text-green-600">{formatCurrency((s.fixed_price - (s.my_price ?? 0)) * s.quantity)}</span>
                                : <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell className="text-right text-sm hidden md:table-cell">
                              {(s.volume_points ?? 0) > 0 ? <span className="text-purple-600">{((s.volume_points ?? 0) * s.quantity).toFixed(2)}</span> : <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell className="text-center"><Badge variant={s.payment_status === 'done' ? 'success' : 'warning'}>{s.payment_status}</Badge></TableCell>
                            <TableCell className="text-center text-sm text-muted-foreground capitalize">{s.payment_method ?? '—'}</TableCell>
                            <TableCell>
                              <div className="flex gap-1 justify-end">
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { handleEdit(s); setInvoiceOpen(false); }}><Pencil className="h-3 w-3" /></Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDeleteItem(s.id)}><Trash2 className="h-3 w-3" /></Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="bg-muted rounded-lg p-4 space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Total Selling</span><span className="font-semibold">{formatCurrency(invoiceGroup.totalAmount)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">My Cost</span><span>{formatCurrency(invoiceGroup.totalMyAmount)}</span></div>
                    {invoiceGroup.totalVP > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Volume Points</span><span className="text-purple-600 font-semibold">{invoiceGroup.totalVP.toFixed(2)} VP</span></div>}
                    {invoiceGroup.pendingAmount > 0 && <div className="flex justify-between text-orange-500"><span>Pending Amount</span><span className="font-semibold">{formatCurrency(invoiceGroup.pendingAmount)}</span></div>}
                    <div className="flex justify-between font-bold border-t pt-2 mt-1"><span>Profit (received)</span><span className="text-green-600">{formatCurrency(invoiceGroup.totalProfit)}</span></div>
                  </div>

                  {invoiceGroup.status !== 'done' && (
                    <div className="border rounded-lg p-3 space-y-2">
                      <p className="text-sm font-medium">{invoiceGroup.items.filter(s => s.payment_status === 'pending').length} item(s) pending — mark as paid:</p>
                      <div className="flex gap-2">
                        <Button size="sm" className="flex-1" onClick={() => handleMarkGroupPaid(invoiceGroup, 'online')}>Online</Button>
                        <Button size="sm" variant="outline" className="flex-1" onClick={() => handleMarkGroupPaid(invoiceGroup, 'cash')}>Cash</Button>
                      </div>
                    </div>
                  )}
                  {invoiceGroup.status === 'done' && <Badge variant="success" className="w-full justify-center py-2">All payments received</Badge>}
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
                  <div className="space-y-2"><Label>Date</Label><Input type="date" {...regEdit('date')} /></div>
                  <div className="space-y-2">
                    <Label>Customer Name</Label>
                    <div className="relative">
                      <Input
                        value={watchEdit('customer_name') ?? ''}
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
                </div>
                <div className="space-y-2">
                  <Label>Customer Phone</Label>
                  <Input placeholder="Auto-filled or type..." value={custPhoneEdit} onChange={(e) => setCustPhoneEdit(e.target.value)} />
                </div>
                <div className="space-y-2"><Label>Reference</Label><Input {...regEdit('reference')} /></div>
                <div className="space-y-2">
                  <Label>Product Name</Label>
                  <Input {...regEdit('product_name')} list="edit-prod" />
                  <datalist id="edit-prod">{[...menu.map(m => m.item_name), ...products.map(p => p.name)].map((n, i) => <option key={i} value={n} />)}</datalist>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Quantity</Label><Input type="number" min={1} {...regEdit('quantity')} /></div>
                  <div className="space-y-2"><Label>Volume Points</Label><Input type="number" step="0.01" {...regEdit('volume_points')} /></div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>My Price (₹) per unit</Label><Input type="number" step="0.01" {...regEdit('my_price')} /></div>
                  <div className="space-y-2"><Label>Selling Price (₹) per unit</Label><Input type="number" step="0.01" {...regEdit('fixed_price')} /></div>
                </div>
                <div className="space-y-2"><Label>Comments</Label><Textarea rows={2} {...regEdit('comments')} /></div>
                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="outline" onClick={() => { setEditOpen(false); setEditSale(null); }}>Cancel</Button>
                  <Button type="submit">Update</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </>
      )}

      {/* ─── MEMBERSHIPS TAB ─── */}
      {activeTab === 'memberships' && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Today&apos;s Revenue</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{formatCurrency(membershipTodayRevenue)}</p><p className="text-xs text-muted-foreground">{membershipTodayEntries} paid today</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Monthly Revenue</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{formatCurrency(membershipMonthlyRevenue)}</p><p className="text-xs text-muted-foreground">{membershipMonthEntries} paid · {memberships.filter(m => m.payment_status === 'pending').length} pending</p></CardContent></Card>
            <Card className="border-green-200 dark:border-green-800"><CardHeader className="pb-2"><CardTitle className="text-sm text-green-700 dark:text-green-400">Total Revenue</CardTitle></CardHeader><CardContent><p className="text-xl font-bold text-green-700 dark:text-green-400">{formatCurrency(membershipTotalRevenue)}</p><p className="text-xs text-muted-foreground">{memberships.filter(m => m.payment_status === 'paid').length} paid memberships</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Shakes Today</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{membershipShakesToday}</p><p className="text-xs text-muted-foreground">served today</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Shakes This Month</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{membershipShakesMonth}</p><p className="text-xs text-muted-foreground">served · {activeMembershipsCount} active</p></CardContent></Card>
            <Card className="border-blue-200 dark:border-blue-800"><CardHeader className="pb-2"><CardTitle className="text-sm text-blue-700 dark:text-blue-400">Total Shakes</CardTitle></CardHeader><CardContent><p className="text-xl font-bold text-blue-700 dark:text-blue-400">{membershipShakesTotal}</p><p className="text-xs text-muted-foreground">all-time served</p></CardContent></Card>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Dialog open={addMembershipOpen} onOpenChange={(v) => { setAddMembershipOpen(v); if (!v) { setCustPhoneMembership(''); setCustDropdownMembership(false); membershipForm.reset({ payment_status: 'pending', start_date: today, total_shakes: 1, price: 0 }); } }}>
              <DialogTrigger asChild><Button className="gap-2"><Plus className="h-4 w-4" />New Membership</Button></DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>Create Membership</DialogTitle></DialogHeader>
                <form onSubmit={membershipForm.handleSubmit(onMembershipSubmit)} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Customer Name</Label>
                      <div className="relative">
                        <Input
                          placeholder="Search by name or phone..."
                          value={membershipForm.watch('customer_name') ?? ''}
                          onChange={(e) => { membershipForm.setValue('customer_name', e.target.value); setCustDropdownMembership(true); }}
                          onFocus={() => setCustDropdownMembership(true)}
                          onBlur={() => setTimeout(() => setCustDropdownMembership(false), 150)}
                        />
                        {custDropdownMembership && (
                          <div className="absolute z-50 w-full bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto mt-1">
                            {customers.filter(c => { const q = (membershipForm.watch('customer_name') ?? '').toLowerCase(); return c.full_name.toLowerCase().includes(q) || (c.phone ?? '').includes(q); }).slice(0, 8).map(c => (
                              <div key={c.id} className="px-3 py-2 hover:bg-accent cursor-pointer text-sm"
                                onMouseDown={() => { membershipForm.setValue('customer_name', c.full_name); setCustPhoneMembership(c.phone ?? ''); setCustDropdownMembership(false); }}>
                                <span className="font-medium">{c.full_name}</span>
                                {c.phone && <span className="text-muted-foreground ml-2">{c.phone}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      {membershipForm.formState.errors.customer_name && <p className="text-xs text-destructive">{membershipForm.formState.errors.customer_name.message}</p>}
                    </div>
                    <div className="space-y-2"><Label>Reference (optional)</Label><Input placeholder="Reference" {...membershipForm.register('reference')} /></div>
                  </div>
                  <div className="space-y-2">
                    <Label>Customer Phone</Label>
                    <Input placeholder="Auto-filled or type..." value={custPhoneMembership} onChange={(e) => setCustPhoneMembership(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Total Shakes</Label><Input type="number" min={1} {...membershipForm.register('total_shakes')} />{membershipForm.formState.errors.total_shakes && <p className="text-xs text-destructive">{membershipForm.formState.errors.total_shakes.message}</p>}</div>
                    <div className="space-y-2"><Label>Price (₹)</Label><Input type="number" step="0.01" min={0} {...membershipForm.register('price')} />{membershipForm.formState.errors.price && <p className="text-xs text-destructive">{membershipForm.formState.errors.price.message}</p>}</div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Start Date</Label><Input type="date" {...membershipForm.register('start_date')} /></div>
                    <div className="space-y-2"><Label>Payment Status</Label><select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" {...membershipForm.register('payment_status')}><option value="pending">Pending</option><option value="paid">Paid</option></select></div>
                  </div>
                  <div className="flex gap-2 justify-end"><Button type="button" variant="outline" onClick={() => setAddMembershipOpen(false)}>Cancel</Button><Button type="submit">Create Membership</Button></div>
                </form>
              </DialogContent>
            </Dialog>

            <Dialog open={membershipReportOpen} onOpenChange={setMembershipReportOpen}>
              <DialogTrigger asChild><Button variant="outline" disabled={memberships.length === 0}>View Report</Button></DialogTrigger>
              <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
                <DialogHeader><div className="flex items-center justify-between pr-8"><DialogTitle>Membership Report</DialogTitle><Button variant="outline" size="sm" className="gap-2" onClick={printMembershipReport}><Download className="h-4 w-4" />Download PDF</Button></div></DialogHeader>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow><TableHead>Customer</TableHead><TableHead>Reference</TableHead><TableHead className="text-center">Total</TableHead><TableHead className="text-center">Used</TableHead><TableHead className="text-center">Left</TableHead><TableHead className="text-right">Price</TableHead><TableHead>Payment</TableHead><TableHead>Start Date</TableHead><TableHead>Visit Dates</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {memberships.map(m => {
                        const visits = membershipVisits.filter(v => v.membership_id === m.id).sort((a, b) => a.visit_date.localeCompare(b.visit_date));
                        return (
                          <TableRow key={m.id}>
                            <TableCell className="font-medium">{m.customer_name}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">{m.reference ?? '-'}</TableCell>
                            <TableCell className="text-center">{m.total_shakes}</TableCell>
                            <TableCell className="text-center">{visits.length}</TableCell>
                            <TableCell className="text-center">{m.total_shakes - visits.length}</TableCell>
                            <TableCell className="text-right">{formatCurrency(m.price)}</TableCell>
                            <TableCell><Badge variant={m.payment_status === 'paid' ? 'default' : 'secondary'}>{m.payment_status === 'paid' ? 'Paid' : 'Pending'}</Badge></TableCell>
                            <TableCell className="text-sm">{formatDate(m.start_date)}</TableCell>
                            <TableCell>{visits.length === 0 ? <span className="text-muted-foreground text-sm">No visits</span> : <div className="flex flex-wrap gap-1">{visits.map(v => <span key={v.id} className="text-xs bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200 px-1.5 py-0.5 rounded">{formatDate(v.visit_date)}</span>)}</div>}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  {memberships.length === 0 && <div className="text-center py-8 text-muted-foreground">No memberships yet.</div>}
                </div>
              </DialogContent>
            </Dialog>

            <Button variant="outline" className="gap-2" onClick={() => setMembershipPeriodOpen(true)}><FileText className="h-4 w-4" />Period Report</Button>

            <Dialog open={resetOpen} onOpenChange={(v) => { setResetOpen(v); if (!v) setResetConfirmText(''); }}>
              <DialogTrigger asChild><Button variant="outline" className="gap-2 text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive" disabled={memberships.length === 0}><RotateCcw className="h-4 w-4" />Reset</Button></DialogTrigger>
              <DialogContent className="max-w-sm">
                <DialogHeader><DialogTitle className="text-destructive">Reset All Memberships</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">This will permanently delete <strong>all {memberships.length} membership records</strong> and all visit history.</p>
                  <div className="space-y-2"><Label className="text-sm">Type <span className="font-mono font-bold">RESET</span> to confirm</Label><Input placeholder="RESET" value={resetConfirmText} onChange={(e) => setResetConfirmText(e.target.value)} className="border-destructive/40 focus-visible:ring-destructive/30" /></div>
                  <div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={() => { setResetOpen(false); setResetConfirmText(''); }}>Cancel</Button><Button variant="destructive" className="flex-1" disabled={resetConfirmText !== 'RESET'} onClick={handleResetAllMemberships}>Delete All</Button></div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {memberships.length > 0 && (
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input placeholder="Search customer..." value={membershipSearch} onChange={e => setMembershipSearch(e.target.value)} className="pl-9" />
            </div>
          )}

          {loading ? <div className="text-center py-12 text-muted-foreground">Loading...</div>
            : memberships.length === 0 ? <div className="text-center py-16 text-muted-foreground"><Users className="h-12 w-12 mx-auto mb-4 opacity-30" /><p>No memberships yet. Create one to get started.</p></div>
            : filteredCustomerGroups.length === 0 ? <div className="text-center py-12 text-muted-foreground"><p>No customers match &quot;{membershipSearch}&quot;</p></div>
            : (
              <div className="space-y-8">
                {filteredCustomerGroups.map(group => (
                  <div key={group.name} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-base">{group.name}</h3>
                        <Badge variant={group.active.length > 0 ? 'default' : 'secondary'} className="text-xs">{group.active.length > 0 ? 'Active' : 'No active membership'}</Badge>
                      </div>
                      <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={() => handleRenewMembership(group.name)}><Plus className="h-3.5 w-3.5" />New Membership</Button>
                    </div>

                    {group.active.length > 0 && (
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {group.active.map(({ membership: m, visits }) => {
                          const used = visits.length;
                          const remaining = m.total_shakes - used;
                          const selectedDate = visitDateMap[m.id] ?? today;
                          const alreadyMarked = visits.some(v => v.visit_date === selectedDate);
                          return (
                            <Card key={m.id} className={remaining === 1 ? 'border-orange-400 dark:border-orange-500' : remaining === 0 ? 'border-red-400 dark:border-red-500' : ''}>
                              {remaining <= 1 && (
                                <div className={`px-4 py-1.5 text-xs font-medium flex items-center gap-1.5 rounded-t-lg ${remaining === 0 ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'}`}>
                                  <span>{remaining === 0 ? '🎯 Membership complete — renew now!' : '⚠️ Last shake remaining — remind to renew!'}</span>
                                </div>
                              )}
                              <CardHeader className="pb-3">
                                <div className="flex items-start justify-between">
                                  <div>{m.reference && <p className="text-xs text-muted-foreground">{m.reference}</p>}<p className="text-xs text-muted-foreground mt-0.5">From {formatDate(m.start_date)}</p></div>
                                  <div className="flex items-center gap-1">
                                    <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => printSingleMembershipReport(m)}><Download className="h-3.5 w-3.5" /></Button>
                                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDeleteMembership(m.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                                  </div>
                                </div>
                              </CardHeader>
                              <CardContent className="space-y-3">
                                <div>
                                  <div className="flex items-center justify-between mb-2"><span className="text-xs text-muted-foreground font-medium">Shakes</span><span className="text-xs font-semibold">{used} / {m.total_shakes}</span></div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {Array.from({ length: m.total_shakes }).map((_, i) => visits[i] ? <span key={i} title={`Visited: ${visits[i].visit_date}`} className="cursor-help"><CheckCircle2 className="h-5 w-5 text-green-500" /></span> : <Circle key={i} className="h-5 w-5 text-muted-foreground/25" />)}
                                  </div>
                                </div>
                                {visits.length > 0 && <div><p className="text-xs text-muted-foreground mb-1.5">Visit dates</p><div className="flex flex-wrap gap-1">{visits.map(v => <span key={v.id} className="text-xs bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 px-2 py-0.5 rounded-full">{formatDate(v.visit_date)}</span>)}</div></div>}
                                <div className="flex items-center justify-between pt-2 border-t">
                                  <div><p className="text-sm font-semibold">{formatCurrency(m.price)}</p><button className={`text-xs mt-0.5 hover:underline ${m.payment_status === 'paid' ? 'text-green-600' : 'text-orange-500'}`} onClick={() => handleTogglePayment(m)}>{m.payment_status === 'paid' ? '✓ Paid' : '⏳ Pending — tap to mark paid'}</button></div>
                                </div>
                                <div className="flex gap-2 items-center">
                                  <Input type="date" className="h-8 text-sm flex-1" value={selectedDate} min={m.start_date} onChange={e => setVisitDateMap(prev => ({ ...prev, [m.id]: e.target.value }))} />
                                  <Button size="sm" variant={alreadyMarked ? 'secondary' : 'default'} disabled={alreadyMarked || !selectedDate} onClick={() => handleMarkVisit(m, selectedDate)} className="gap-1.5 shrink-0"><CheckCircle2 className="h-3.5 w-3.5" />{alreadyMarked ? 'Already Marked' : 'Mark Visit'}</Button>
                                </div>
                                <div className="pt-2 border-t">
                                  {editingCommentId === m.id ? (
                                    <div className="space-y-2">
                                      <Textarea className="text-sm min-h-[60px] resize-none" placeholder="Add a note..." value={commentDraft} onChange={e => setCommentDraft(e.target.value)} autoFocus />
                                      <div className="flex gap-2 justify-end"><Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingCommentId(null)}>Cancel</Button><Button size="sm" className="h-7 text-xs" onClick={() => handleSaveComment(m.id)}>Save</Button></div>
                                    </div>
                                  ) : (
                                    <button className="w-full text-left" onClick={() => { setEditingCommentId(m.id); setCommentDraft(m.comments ?? ''); }}>
                                      {m.comments ? <p className="text-xs text-muted-foreground italic hover:text-foreground transition-colors">💬 {m.comments}</p> : <p className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors">+ Add comment...</p>}
                                    </button>
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    )}

                    {group.completed.length > 0 && (
                      <div className="border rounded-lg overflow-hidden">
                        <div className="px-4 py-2 bg-muted/50 text-xs font-medium text-muted-foreground">Past Memberships ({group.completed.length})</div>
                        {group.completed.map(({ membership: m }) => (
                          <div key={m.id} className="flex items-center justify-between px-4 py-2.5 border-t gap-3 flex-wrap">
                            <div className="flex items-center gap-3 flex-wrap">
                              <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                              <span className="text-xs text-muted-foreground">{formatDate(m.start_date)}</span>
                              <span className="text-xs font-medium">{m.total_shakes} shakes</span>
                              <Badge variant={m.payment_status === 'paid' ? 'default' : 'secondary'} className="text-xs h-5">{m.payment_status === 'paid' ? 'Paid' : 'Pending'}</Badge>
                              {m.comments && <span className="text-xs text-muted-foreground italic">💬 {m.comments}</span>}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold">{formatCurrency(m.price)}</span>
                              <button className={`text-xs hover:underline ${m.payment_status === 'paid' ? 'text-green-600' : 'text-orange-500'}`} onClick={() => handleTogglePayment(m)}>{m.payment_status === 'paid' ? '✓' : '⏳'}</button>
                              <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground" onClick={() => printSingleMembershipReport(m)}><Download className="h-3 w-3" /></Button>
                              <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => handleDeleteMembership(m.id)}><Trash2 className="h-3 w-3" /></Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

          {/* Membership Period Report Modal */}
          {membershipPeriodOpen && (
            <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
                 onClick={() => { setMembershipPeriodOpen(false); setMembershipPeriodFrom(''); setMembershipPeriodTo(''); }}>
              <div className="bg-background border rounded-lg p-6 w-full max-w-2xl shadow-lg relative max-h-[90vh] overflow-y-auto"
                   onClick={(e) => e.stopPropagation()}>
                <button onClick={() => { setMembershipPeriodOpen(false); setMembershipPeriodFrom(''); setMembershipPeriodTo(''); }}
                        className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100 transition-opacity">
                  <X className="h-4 w-4" />
                </button>
                <h2 className="text-lg font-semibold leading-none tracking-tight mb-4">Membership Period Report</h2>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2"><Label>From Date</Label><input type="date" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" value={membershipPeriodFrom} onChange={(e) => setMembershipPeriodFrom(e.target.value)} /></div>
                    <div className="space-y-2"><Label>To Date</Label><input type="date" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" value={membershipPeriodTo} onChange={(e) => setMembershipPeriodTo(e.target.value)} /></div>
                  </div>
                  {(membershipPeriodFrom || membershipPeriodTo) && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3"><p className="text-xs text-muted-foreground mb-1">Total Revenue</p><p className="text-lg font-bold text-blue-700 dark:text-blue-400">{formatCurrency(membershipPeriodRevenue)}</p></div>
                        <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-lg p-3"><p className="text-xs text-muted-foreground mb-1">Pending Amount</p><p className="text-lg font-bold text-orange-600 dark:text-orange-400">{formatCurrency(membershipPeriodPending)}</p></div>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">{membershipPeriodData.length} memberships · {membershipPeriodData.reduce((a, m) => a + m.total_shakes, 0)} total shakes</p>
                        {membershipPeriodData.length > 0 && (
                          <Button size="sm" variant="outline" className="gap-2" onClick={() => printMembershipPeriodReport(membershipPeriodData, membershipPeriodFrom, membershipPeriodTo)}>
                            <Download className="h-4 w-4" />Download PDF
                          </Button>
                        )}
                      </div>
                      {membershipPeriodData.length > 0 ? (
                        <div className="border rounded-lg overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/50">
                              <tr>
                                <th className="text-left px-3 py-2 text-xs font-medium">Customer</th>
                                <th className="text-center px-3 py-2 text-xs font-medium">Shakes</th>
                                <th className="text-center px-3 py-2 text-xs font-medium">Used</th>
                                <th className="text-center px-3 py-2 text-xs font-medium">Duration</th>
                                <th className="text-right px-3 py-2 text-xs font-medium">Price</th>
                                <th className="text-center px-3 py-2 text-xs font-medium">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {membershipPeriodData.map(m => {
                                const visits = membershipVisits.filter(v => v.membership_id === m.id).sort((a, b) => a.visit_date.localeCompare(b.visit_date));
                                const used = visits.length;
                                const lastVisit = visits[visits.length - 1]?.visit_date ?? today;
                                const durationDays = Math.max(1, Math.ceil((new Date(lastVisit).getTime() - new Date(m.start_date).getTime()) / 86400000) + 1);
                                return (
                                  <tr key={m.id} className="border-t">
                                    <td className="px-3 py-2 font-medium">{m.customer_name}{m.reference && <span className="ml-1 text-xs text-muted-foreground">· {m.reference}</span>}</td>
                                    <td className="px-3 py-2 text-center">{m.total_shakes}</td>
                                    <td className="px-3 py-2 text-center">{used}</td>
                                    <td className="px-3 py-2 text-center text-xs text-muted-foreground">{formatDate(m.start_date)} → {used > 0 ? formatDate(lastVisit) : '—'}<br />{used > 0 ? `${durationDays}d` : '—'}</td>
                                    <td className="px-3 py-2 text-right font-medium">{formatCurrency(m.price)}</td>
                                    <td className="px-3 py-2 text-center"><span className={`text-xs px-1.5 py-0.5 rounded-full ${m.payment_status === 'paid' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'}`}>{m.payment_status === 'paid' ? 'Paid' : 'Pending'}</span></td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : <p className="text-center text-sm text-muted-foreground py-2">No memberships found in this period.</p>}
                    </div>
                  )}
                  {!membershipPeriodFrom && !membershipPeriodTo && <p className="text-center text-sm text-muted-foreground py-4">Select dates above to preview the report.</p>}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
