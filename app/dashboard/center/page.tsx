'use client';

import { useEffect, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
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
import type { CenterMenu, CenterSale, CenterMembership, CenterMembershipVisit } from '@/types/database';
import { Plus, Pencil, Trash2, Settings, Download, CheckCircle2, Circle, Users, Search, RotateCcw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format, startOfMonth, endOfMonth } from 'date-fns';

const saleSchema = z.object({
  date: z.string().min(1, 'Date is required'),
  customer_name: z.string().min(1, 'Customer name is required'),
  reference: z.string().optional(),
  product_name: z.string().min(1, 'Product is required'),
  quantity: z.coerce.number().min(1),
  fixed_price: z.coerce.number().min(0),
  volume_points: z.coerce.number().optional(),
  comments: z.string().optional(),
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

export default function CenterPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'sales' | 'memberships'>('sales');

  // Sales state
  const [sales, setSales] = useState<CenterSale[]>([]);
  const [menu, setMenu] = useState<CenterMenu[]>([]);
  const [loading, setLoading] = useState(true);
  const [addSaleOpen, setAddSaleOpen] = useState(false);
  const [editSale, setEditSale] = useState<CenterSale | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editMenuItem, setEditMenuItem] = useState<CenterMenu | null>(null);

  // Membership state
  const [memberships, setMemberships] = useState<CenterMembership[]>([]);
  const [membershipVisits, setMembershipVisits] = useState<CenterMembershipVisit[]>([]);
  const [addMembershipOpen, setAddMembershipOpen] = useState(false);
  const [membershipReportOpen, setMembershipReportOpen] = useState(false);
  // Per-membership selected visit date (defaults to today)
  const [visitDateMap, setVisitDateMap] = useState<Record<number, string>>({});
  const [membershipSearch, setMembershipSearch] = useState('');
  const [resetOpen, setResetOpen] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  // Per-membership comment editing state
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [managerName, setManagerName] = useState('Manager');

  const today = format(new Date(), 'yyyy-MM-dd');
  const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(new Date()), 'yyyy-MM-dd');

  const saleForm = useForm<SaleForm>({
    resolver: zodResolver(saleSchema),
    defaultValues: { date: today, quantity: 1 },
  });
  const menuForm = useForm<MenuForm>({ resolver: zodResolver(menuSchema) });
  const membershipForm = useForm<MembershipForm>({
    resolver: zodResolver(membershipSchema),
    defaultValues: { payment_status: 'pending', start_date: today, total_shakes: 1, price: 0 },
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const [{ data: salesData }, { data: menuData }, { data: membershipsData }, { data: visitsData }] = await Promise.all([
      supabase.from('center_sales').select('*').order('date', { ascending: false }),
      supabase.from('center_menu').select('*').order('item_name'),
      supabase.from('center_memberships').select('*').order('created_at', { ascending: false }),
      supabase.from('center_membership_visits').select('*').order('visit_date', { ascending: true }),
    ]);
    setSales(salesData ?? []);
    setMenu(menuData ?? []);
    setMemberships((membershipsData ?? []) as CenterMembership[]);
    setMembershipVisits((visitsData ?? []) as CenterMembershipVisit[]);
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('first_name, last_name').eq('id', user.id).single();
      if (profile) setManagerName(`${profile.first_name} ${profile.last_name}`);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Revenue stats
  const todaySales = sales.filter((s) => s.date === today);
  const todayRevenue = todaySales.reduce((a, s) => a + s.fixed_price * s.quantity, 0);
  const monthlySales = sales.filter((s) => s.date >= monthStart && s.date <= monthEnd);
  const monthlyRevenue = monthlySales.reduce((a, s) => a + s.fixed_price * s.quantity, 0);
  const todayShakes = todaySales.reduce((a, s) => a + s.quantity, 0);
  const monthShakes = monthlySales.reduce((a, s) => a + s.quantity, 0);

  const todayBreakdown = todaySales.reduce<Record<string, number>>((acc, s) => {
    acc[s.product_name] = (acc[s.product_name] || 0) + s.quantity;
    return acc;
  }, {});

  // Sale CRUD
  const onSaleSubmit = async (data: SaleForm) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const payload = {
      user_id: user.id,
      date: data.date,
      customer_name: data.customer_name,
      reference: data.reference || null,
      product_name: data.product_name,
      quantity: data.quantity,
      fixed_price: data.fixed_price,
      volume_points: data.volume_points || 0,
      comments: data.comments || null,
    };
    if (editSale) {
      const { error } = await supabase.from('center_sales').update(payload).eq('id', editSale.id);
      if (error) { toast({ title: 'Update failed', description: error.message, variant: 'destructive' }); return; }
      toast({ title: 'Sale updated' });
    } else {
      const { error } = await supabase.from('center_sales').insert(payload);
      if (error) { toast({ title: 'Add failed', description: error.message, variant: 'destructive' }); return; }
      toast({ title: 'Center sale added' });
    }
    setAddSaleOpen(false);
    setEditSale(null);
    saleForm.reset({ date: today, quantity: 1 });
    fetchData();
  };

  const handleDeleteSale = async (id: number) => {
    if (!confirm('Delete this sale?')) return;
    const supabase = createClient();
    await supabase.from('center_sales').delete().eq('id', id);
    toast({ title: 'Sale deleted' });
    fetchData();
  };

  const handleEditSale = (sale: CenterSale) => {
    setEditSale(sale);
    saleForm.reset({
      date: sale.date,
      customer_name: sale.customer_name,
      reference: sale.reference ?? '',
      product_name: sale.product_name,
      quantity: sale.quantity,
      fixed_price: sale.fixed_price,
      volume_points: sale.volume_points,
      comments: sale.comments ?? '',
    });
    setAddSaleOpen(true);
  };

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

  const handleMenuItemSelect = (item: CenterMenu) => {
    saleForm.setValue('product_name', item.item_name);
    saleForm.setValue('fixed_price', item.fixed_price);
  };

  // Membership CRUD
  const onMembershipSubmit = async (data: MembershipForm) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from('center_memberships').insert({
      user_id: user.id,
      customer_name: data.customer_name,
      reference: data.reference || null,
      total_shakes: data.total_shakes,
      price: data.price,
      payment_status: data.payment_status,
      start_date: data.start_date,
    });
    if (error) { toast({ title: 'Failed to create membership', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Membership created' });
    setAddMembershipOpen(false);
    membershipForm.reset({ payment_status: 'pending', start_date: today, total_shakes: 1, price: 0 });
    fetchData();
  };

  const handleMarkVisit = async (membership: CenterMembership, visitDate: string) => {
    const visits = membershipVisits.filter(v => v.membership_id === membership.id);
    if (visits.length >= membership.total_shakes) {
      toast({ title: 'Membership complete', description: 'All shakes have been consumed.', variant: 'destructive' });
      return;
    }
    if (visits.some(v => v.visit_date === visitDate)) {
      toast({ title: 'Already marked', description: `${membership.customer_name} already has a visit on ${visitDate}.`, variant: 'destructive' });
      return;
    }
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from('center_membership_visits').insert({
      membership_id: membership.id,
      user_id: user.id,
      visit_date: visitDate,
    });
    if (error) { toast({ title: 'Failed to mark visit', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Visit marked', description: `${membership.customer_name} — ${visitDate}` });
    // Reset the date picker back to today for this membership
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
    membershipForm.reset({ customer_name: customerName, payment_status: 'pending', start_date: today, total_shakes: 1, price: 0 });
    setAddMembershipOpen(true);
  };

  const handleResetAllMemberships = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from('center_memberships').delete().eq('user_id', user.id);
    if (error) { toast({ title: 'Reset failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'All memberships deleted', description: 'Membership data has been reset.' });
    setResetOpen(false);
    setResetConfirmText('');
    fetchData();
  };

  const printMembershipReport = () => {
    const totalMemberships = memberships.length;
    const totalRevenue = memberships.reduce((a, m) => a + m.price, 0);
    const pendingCount = memberships.filter(m => m.payment_status === 'pending').length;
    const pendingRev = memberships.filter(m => m.payment_status === 'pending').reduce((a, m) => a + m.price, 0);
    const totalShakesUsed = membershipVisits.length;

    const memberRows = memberships.map(m => {
      const visits = membershipVisits
        .filter(v => v.membership_id === m.id)
        .sort((a, b) => a.visit_date.localeCompare(b.visit_date));
      const used = visits.length;
      const remaining = m.total_shakes - used;
      const isComplete = used >= m.total_shakes;
      const visitPills = visits.map(v =>
        `<span style="display:inline-block;background:#dcfce7;color:#166534;font-size:10px;padding:2px 7px;border-radius:20px;margin:2px 2px 2px 0">${v.visit_date}</span>`
      ).join('');
      const shakeCircles = Array.from({ length: m.total_shakes }).map((_, i) =>
        i < used
          ? `<span style="color:#16a34a;font-size:14px" title="${visits[i]?.visit_date ?? ''}">&#10003;</span>`
          : `<span style="color:#d1d5db;font-size:14px">&#9675;</span>`
      ).join(' ');
      return `
        <tr>
          <td>
            <strong>${m.customer_name}</strong>
            ${m.reference ? `<br/><span style="color:#666;font-size:11px">${m.reference}</span>` : ''}
          </td>
          <td>${m.start_date}</td>
          <td class="num">${shakeCircles}<br/><span style="font-size:11px;color:#555">${used}/${m.total_shakes}</span></td>
          <td class="num">${remaining}</td>
          <td class="num">&#8377;${m.price.toFixed(2)}</td>
          <td style="text-align:center">
            <span style="padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;background:${m.payment_status === 'paid' ? '#dcfce7' : '#fff7ed'};color:${m.payment_status === 'paid' ? '#166534' : '#c2410c'}">
              ${m.payment_status === 'paid' ? 'Paid' : 'Pending'}
            </span>
          </td>
          <td style="text-align:center">
            ${isComplete ? '<span style="padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;background:#f3f4f6;color:#374151">Complete</span>' : '<span style="color:#16a34a;font-size:11px">Active</span>'}
          </td>
          <td>${visitPills || '<span style="color:#999;font-size:11px">No visits</span>'}</td>
          <td style="color:#555;font-size:11px;font-style:italic">${m.comments ? m.comments.replace(/</g, '&lt;').replace(/>/g, '&gt;') : '<span style="color:#ccc">—</span>'}</td>
        </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Membership Report ${format(new Date(), 'yyyy-MM-dd')}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 13px; color: #111; padding: 32px; }
    h1 { font-size: 22px; margin-bottom: 4px; }
    h2 { font-size: 15px; margin: 24px 0 10px; color: #333; }
    .sub { color: #666; font-size: 12px; margin-bottom: 24px; }
    .meta { display: flex; justify-content: space-between; margin-bottom: 24px; }
    .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 28px; }
    .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 14px; }
    .card .label { font-size: 10px; color: #666; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.05em; }
    .card .value { font-size: 18px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }
    th { background: #f4f4f4; text-align: left; padding: 8px 10px; font-size: 11px; border-bottom: 2px solid #ddd; }
    td { padding: 7px 10px; border-bottom: 1px solid #eee; vertical-align: top; }
    .num { text-align: center; }
    .footer { margin-top: 40px; font-size: 11px; color: #999; text-align: center; }
    @media print { button { display: none; } }
  </style>
</head>
<body>
  <h1>Membership Report</h1>
  <p class="sub">Herbalife Sales Manager</p>
  <div class="meta">
    <div>
      <strong>Total Members:</strong> ${totalMemberships}<br/>
      <strong>Shakes Used:</strong> ${totalShakesUsed}
    </div>
    <div style="text-align:right">
      <strong>Manager:</strong> ${managerName}<br/>
      <strong>Generated:</strong> ${new Date().toLocaleString()}
    </div>
  </div>
  <div class="summary-grid">
    <div class="card"><div class="label">Total Members</div><div class="value" style="color:#1d4ed8">${totalMemberships}</div></div>
    <div class="card"><div class="label">Total Revenue</div><div class="value" style="color:#be123c">&#8377;${totalRevenue.toFixed(2)}</div></div>
    <div class="card"><div class="label">Pending Payment</div><div class="value" style="color:#c2410c">&#8377;${pendingRev.toFixed(2)}</div><div class="label">${pendingCount} members</div></div>
    <div class="card"><div class="label">Total Shakes Used</div><div class="value" style="color:#16a34a">${totalShakesUsed}</div></div>
  </div>
  <h2>Member Details</h2>
  <table>
    <thead>
      <tr>
        <th>Customer</th>
        <th>Start Date</th>
        <th class="num">Progress</th>
        <th class="num">Remaining</th>
        <th class="num">Price</th>
        <th style="text-align:center">Payment</th>
        <th style="text-align:center">Status</th>
        <th>Visit Dates</th>
        <th>Comment</th>
      </tr>
    </thead>
    <tbody>${memberRows}</tbody>
  </table>
  <div class="footer">Herbalife Sales Manager · Membership Report · Generated ${new Date().toLocaleString()}</div>
  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); }
  };

  const uniqueCustomers = Array.from(new Set(sales.map((s) => s.customer_name)));

  // Membership stats
  const activeMembershipsCount = memberships.filter(m => {
    const used = membershipVisits.filter(v => v.membership_id === m.id).length;
    return used < m.total_shakes;
  }).length;
  const pendingAmount = memberships
    .filter(m => m.payment_status === 'pending')
    .reduce((a, m) => a + m.price, 0);

  // Group memberships by customer name, preserving creation order of first membership
  const filteredCustomerGroups = Array.from(
    memberships.reduce((map, m) => {
      if (!map.has(m.customer_name)) map.set(m.customer_name, []);
      map.get(m.customer_name)!.push(m);
      return map;
    }, new Map<string, CenterMembership[]>())
  ).map(([name, ms]) => {
    const withVisits = ms.map(m => ({
      membership: m,
      visits: membershipVisits.filter(v => v.membership_id === m.id).sort((a, b) => a.visit_date.localeCompare(b.visit_date)),
    }));
    return {
      name,
      active: withVisits.filter(({ membership: m, visits }) => visits.length < m.total_shakes),
      completed: withVisits.filter(({ membership: m, visits }) => visits.length >= m.total_shakes),
    };
  }).filter(group => !membershipSearch || group.name.toLowerCase().includes(membershipSearch.toLowerCase()));

  return (
    <div className="space-y-6">
      {/* Header with tab switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Center</h1>
          <p className="text-muted-foreground text-sm">Customer management & revenue</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={activeTab === 'sales' ? 'default' : 'outline'}
            onClick={() => setActiveTab('sales')}
          >
            Sales
          </Button>
          <Button
            variant={activeTab === 'memberships' ? 'default' : 'outline'}
            onClick={() => setActiveTab('memberships')}
            className="gap-2"
          >
            <Users className="h-4 w-4" />
            Memberships
          </Button>
        </div>
      </div>

      {/* ─── SALES TAB ─── */}
      {activeTab === 'sales' && (
        <>
          <div className="flex gap-2 flex-wrap">
            <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Settings className="h-4 w-4" />
                  Manage Menu
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Center Menu</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <form onSubmit={menuForm.handleSubmit(onMenuSubmit)} className="flex gap-2">
                    <div className="flex-1 space-y-1">
                      <Input placeholder="Item name (e.g. Shake)" {...menuForm.register('item_name')} />
                      {menuForm.formState.errors.item_name && <p className="text-xs text-destructive">{menuForm.formState.errors.item_name.message}</p>}
                    </div>
                    <div className="w-28 space-y-1">
                      <Input type="number" step="0.01" placeholder="Price ₹" {...menuForm.register('fixed_price')} />
                      {menuForm.formState.errors.fixed_price && <p className="text-xs text-destructive">{menuForm.formState.errors.fixed_price.message}</p>}
                    </div>
                    <Button type="submit" size="sm">{editMenuItem ? 'Update' : 'Add'}</Button>
                  </form>
                  <div className="space-y-2">
                    {menu.map((item) => (
                      <div key={item.id} className="flex items-center justify-between p-2 border rounded-md">
                        <div>
                          <p className="font-medium text-sm">{item.item_name}</p>
                          <p className="text-xs text-muted-foreground">{formatCurrency(item.fixed_price)}</p>
                        </div>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditMenuItem(item); menuForm.reset({ item_name: item.item_name, fixed_price: item.fixed_price }); }}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDeleteMenuItem(item.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    {menu.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No menu items yet.</p>}
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={addSaleOpen} onOpenChange={(v) => { setAddSaleOpen(v); if (!v) { setEditSale(null); saleForm.reset({ date: today, quantity: 1 }); } }}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Add Sale
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editSale ? 'Edit Sale' : 'Add Center Sale'}</DialogTitle>
                </DialogHeader>
                <form onSubmit={saleForm.handleSubmit(onSaleSubmit)} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Date</Label>
                      <Input type="date" {...saleForm.register('date')} />
                    </div>
                    <div className="space-y-2">
                      <Label>Customer Name</Label>
                      <Input placeholder="Customer" {...saleForm.register('customer_name')} list="center-cust" />
                      <datalist id="center-cust">{uniqueCustomers.map((c) => <option key={c} value={c} />)}</datalist>
                      {saleForm.formState.errors.customer_name && <p className="text-xs text-destructive">{saleForm.formState.errors.customer_name.message}</p>}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Reference (optional)</Label>
                    <Input placeholder="Reference" {...saleForm.register('reference')} />
                  </div>
                  <div className="space-y-2">
                    <Label>Product (from menu)</Label>
                    <div className="flex gap-2 flex-wrap">
                      {menu.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className="px-3 py-1.5 text-sm border rounded-full hover:bg-accent transition-colors"
                          onClick={() => handleMenuItemSelect(item)}
                        >
                          {item.item_name} — {formatCurrency(item.fixed_price)}
                        </button>
                      ))}
                    </div>
                    <Input placeholder="Or type product name" {...saleForm.register('product_name')} />
                    {saleForm.formState.errors.product_name && <p className="text-xs text-destructive">{saleForm.formState.errors.product_name.message}</p>}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Quantity</Label>
                      <Input type="number" min={1} {...saleForm.register('quantity')} />
                    </div>
                    <div className="space-y-2">
                      <Label>Price (₹)</Label>
                      <Input type="number" step="0.01" {...saleForm.register('fixed_price')} />
                      {saleForm.formState.errors.fixed_price && <p className="text-xs text-destructive">{saleForm.formState.errors.fixed_price.message}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label>Volume Points</Label>
                      <Input type="number" step="0.01" {...saleForm.register('volume_points')} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Comments (optional)</Label>
                    <Textarea placeholder="Any notes..." {...saleForm.register('comments')} rows={2} />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button type="button" variant="outline" onClick={() => { setAddSaleOpen(false); setEditSale(null); saleForm.reset({ date: today, quantity: 1 }); }}>Cancel</Button>
                    <Button type="submit">{editSale ? 'Update' : 'Add Sale'}</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {/* Revenue summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Today&apos;s Revenue</CardTitle></CardHeader>
              <CardContent><p className="text-xl font-bold">{formatCurrency(todayRevenue)}</p><p className="text-xs text-muted-foreground">{todaySales.reduce((a, s) => a + s.quantity, 0)} items · {todaySales.length} entries</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Monthly Revenue</CardTitle></CardHeader>
              <CardContent><p className="text-xl font-bold">{formatCurrency(monthlyRevenue)}</p><p className="text-xs text-muted-foreground">{monthlySales.reduce((a, s) => a + s.quantity, 0)} items · {monthlySales.length} entries</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Shakes Today</CardTitle></CardHeader>
              <CardContent><p className="text-xl font-bold">{todayShakes}</p><p className="text-xs text-muted-foreground">total shakes served</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Shakes This Month</CardTitle></CardHeader>
              <CardContent><p className="text-xl font-bold">{monthShakes}</p><p className="text-xs text-muted-foreground">total shakes served</p></CardContent>
            </Card>
          </div>

          {/* Today's breakdown */}
          {Object.keys(todayBreakdown).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Today&apos;s Item Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3">
                  {Object.entries(todayBreakdown).map(([item, qty]) => (
                    <div key={item} className="flex items-center gap-2 bg-muted rounded-full px-3 py-1">
                      <span className="text-sm font-medium">{item}</span>
                      <span className="text-sm text-muted-foreground">×{qty}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Sales table */}
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Loading...</div>
          ) : (
            <Card>
              <CardContent className="p-0">
                {sales.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">No center sales yet.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>Product</TableHead>
                          <TableHead className="text-right hidden md:table-cell">Qty</TableHead>
                          <TableHead className="text-right hidden md:table-cell">Price</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead className="hidden lg:table-cell">Comments</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sales.map((sale) => (
                          <TableRow key={sale.id}>
                            <TableCell className="text-sm">{formatDate(sale.date)}</TableCell>
                            <TableCell className="text-sm font-medium">{sale.customer_name}</TableCell>
                            <TableCell className="text-sm max-w-[100px] truncate">{sale.product_name}</TableCell>
                            <TableCell className="text-right text-sm hidden md:table-cell">{sale.quantity}</TableCell>
                            <TableCell className="text-right text-sm hidden md:table-cell">{formatCurrency(sale.fixed_price)}</TableCell>
                            <TableCell className="text-right text-sm font-medium">{formatCurrency(sale.fixed_price * sale.quantity)}</TableCell>
                            <TableCell className="text-sm text-muted-foreground max-w-[100px] truncate hidden lg:table-cell">{sale.comments ?? '-'}</TableCell>
                            <TableCell>
                              <div className="flex gap-1 justify-end">
                                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleEditSale(sale)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleDeleteSale(sale.id)}>
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
          )}
        </>
      )}

      {/* ─── MEMBERSHIPS TAB ─── */}
      {activeTab === 'memberships' && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Memberships</CardTitle></CardHeader>
              <CardContent><p className="text-xl font-bold">{memberships.length}</p><p className="text-xs text-muted-foreground">{activeMembershipsCount} active</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Pending Payment</CardTitle></CardHeader>
              <CardContent><p className="text-xl font-bold">{formatCurrency(pendingAmount)}</p><p className="text-xs text-muted-foreground">{memberships.filter(m => m.payment_status === 'pending').length} members unpaid</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Visits Today</CardTitle></CardHeader>
              <CardContent><p className="text-xl font-bold">{membershipVisits.filter(v => v.visit_date === today).length}</p><p className="text-xs text-muted-foreground">membership shakes served</p></CardContent>
            </Card>
          </div>

          {/* Actions */}
          <div className="flex gap-2 flex-wrap">
            <Dialog open={addMembershipOpen} onOpenChange={(v) => { setAddMembershipOpen(v); if (!v) membershipForm.reset({ payment_status: 'pending', start_date: today, total_shakes: 1, price: 0 }); }}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  New Membership
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Create Membership</DialogTitle>
                </DialogHeader>
                <form onSubmit={membershipForm.handleSubmit(onMembershipSubmit)} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Customer Name</Label>
                      <Input placeholder="Customer" {...membershipForm.register('customer_name')} list="membership-cust" />
                      <datalist id="membership-cust">{uniqueCustomers.map((c) => <option key={c} value={c} />)}</datalist>
                      {membershipForm.formState.errors.customer_name && <p className="text-xs text-destructive">{membershipForm.formState.errors.customer_name.message}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label>Reference (optional)</Label>
                      <Input placeholder="Reference" {...membershipForm.register('reference')} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Total Shakes</Label>
                      <Input type="number" min={1} {...membershipForm.register('total_shakes')} />
                      {membershipForm.formState.errors.total_shakes && <p className="text-xs text-destructive">{membershipForm.formState.errors.total_shakes.message}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label>Price (₹)</Label>
                      <Input type="number" step="0.01" min={0} {...membershipForm.register('price')} />
                      {membershipForm.formState.errors.price && <p className="text-xs text-destructive">{membershipForm.formState.errors.price.message}</p>}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Start Date</Label>
                      <Input type="date" {...membershipForm.register('start_date')} />
                    </div>
                    <div className="space-y-2">
                      <Label>Payment Status</Label>
                      <select
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        {...membershipForm.register('payment_status')}
                      >
                        <option value="pending">Pending</option>
                        <option value="paid">Paid</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button type="button" variant="outline" onClick={() => setAddMembershipOpen(false)}>Cancel</Button>
                    <Button type="submit">Create Membership</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>

            <Dialog open={membershipReportOpen} onOpenChange={setMembershipReportOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" disabled={memberships.length === 0}>View Report</Button>
              </DialogTrigger>
              <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <div className="flex items-center justify-between pr-8">
                    <DialogTitle>Membership Report</DialogTitle>
                    <Button variant="outline" size="sm" className="gap-2" onClick={printMembershipReport}>
                      <Download className="h-4 w-4" />
                      Download PDF
                    </Button>
                  </div>
                </DialogHeader>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Customer</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead className="text-center">Total</TableHead>
                        <TableHead className="text-center">Used</TableHead>
                        <TableHead className="text-center">Left</TableHead>
                        <TableHead className="text-right">Price</TableHead>
                        <TableHead>Payment</TableHead>
                        <TableHead>Start Date</TableHead>
                        <TableHead>Visit Dates</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {memberships.map(m => {
                        const visits = membershipVisits
                          .filter(v => v.membership_id === m.id)
                          .sort((a, b) => a.visit_date.localeCompare(b.visit_date));
                        return (
                          <TableRow key={m.id}>
                            <TableCell className="font-medium">{m.customer_name}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">{m.reference ?? '-'}</TableCell>
                            <TableCell className="text-center">{m.total_shakes}</TableCell>
                            <TableCell className="text-center">{visits.length}</TableCell>
                            <TableCell className="text-center">{m.total_shakes - visits.length}</TableCell>
                            <TableCell className="text-right">{formatCurrency(m.price)}</TableCell>
                            <TableCell>
                              <Badge variant={m.payment_status === 'paid' ? 'default' : 'secondary'}>
                                {m.payment_status === 'paid' ? 'Paid' : 'Pending'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">{formatDate(m.start_date)}</TableCell>
                            <TableCell>
                              {visits.length === 0 ? (
                                <span className="text-muted-foreground text-sm">No visits</span>
                              ) : (
                                <div className="flex flex-wrap gap-1">
                                  {visits.map(v => (
                                    <span key={v.id} className="text-xs bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200 px-1.5 py-0.5 rounded">
                                      {v.visit_date}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  {memberships.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">No memberships yet.</div>
                  )}
                </div>
              </DialogContent>
            </Dialog>

            <Button variant="outline" className="gap-2" onClick={printMembershipReport} disabled={memberships.length === 0}>
              <Download className="h-4 w-4" />
              Download PDF
            </Button>

            <Dialog open={resetOpen} onOpenChange={(v) => { setResetOpen(v); if (!v) setResetConfirmText(''); }}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2 text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive" disabled={memberships.length === 0}>
                  <RotateCcw className="h-4 w-4" />
                  Reset
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle className="text-destructive">Reset All Memberships</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    This will permanently delete <strong>all {memberships.length} membership records</strong> and all visit history. This action cannot be undone.
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
                    <Button variant="destructive" className="flex-1" disabled={resetConfirmText !== 'RESET'} onClick={handleResetAllMemberships}>
                      Delete All
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Customer search */}
          {memberships.length > 0 && (
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search customer..."
                value={membershipSearch}
                onChange={e => setMembershipSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          )}

          {/* Membership cards — grouped by customer */}
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Loading...</div>
          ) : memberships.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>No memberships yet. Create one to get started.</p>
            </div>
          ) : filteredCustomerGroups.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>No customers match &quot;{membershipSearch}&quot;</p>
            </div>
          ) : (
            <div className="space-y-8">
              {filteredCustomerGroups.map(group => (
                <div key={group.name} className="space-y-3">
                  {/* Customer header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-base">{group.name}</h3>
                      <Badge variant={group.active.length > 0 ? 'default' : 'secondary'} className="text-xs">
                        {group.active.length > 0 ? 'Active' : 'No active membership'}
                      </Badge>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 h-8 text-xs"
                      onClick={() => handleRenewMembership(group.name)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      New Membership
                    </Button>
                  </div>

                  {/* Active membership cards */}
                  {group.active.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {group.active.map(({ membership: m, visits }) => {
                        const used = visits.length;
                        const selectedDate = visitDateMap[m.id] ?? today;
                        const alreadyMarkedOnSelected = visits.some(v => v.visit_date === selectedDate);

                        return (
                          <Card key={m.id}>
                            <CardHeader className="pb-3">
                              <div className="flex items-start justify-between">
                                <div>
                                  {m.reference && <p className="text-xs text-muted-foreground">{m.reference}</p>}
                                  <p className="text-xs text-muted-foreground mt-0.5">From {formatDate(m.start_date)}</p>
                                </div>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDeleteMembership(m.id)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </CardHeader>
                            <CardContent className="space-y-3">
                              <div>
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-xs text-muted-foreground font-medium">Shakes</span>
                                  <span className="text-xs font-semibold">{used} / {m.total_shakes}</span>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {Array.from({ length: m.total_shakes }).map((_, i) => {
                                    const visit = visits[i];
                                    return visit ? (
                                      <span key={i} title={`Visited: ${visit.visit_date}`} className="cursor-help">
                                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                                      </span>
                                    ) : (
                                      <Circle key={i} className="h-5 w-5 text-muted-foreground/25" />
                                    );
                                  })}
                                </div>
                              </div>

                              {visits.length > 0 && (
                                <div>
                                  <p className="text-xs text-muted-foreground mb-1.5">Visit dates</p>
                                  <div className="flex flex-wrap gap-1">
                                    {visits.map(v => (
                                      <span key={v.id} className="text-xs bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 px-2 py-0.5 rounded-full">
                                        {v.visit_date}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}

                              <div className="flex items-center justify-between pt-2 border-t">
                                <div>
                                  <p className="text-sm font-semibold">{formatCurrency(m.price)}</p>
                                  <button
                                    className={`text-xs mt-0.5 hover:underline ${m.payment_status === 'paid' ? 'text-green-600' : 'text-orange-500'}`}
                                    onClick={() => handleTogglePayment(m)}
                                  >
                                    {m.payment_status === 'paid' ? '✓ Paid' : '⏳ Pending — tap to mark paid'}
                                  </button>
                                </div>
                              </div>

                              <div className="flex gap-2 items-center">
                                <Input
                                  type="date"
                                  className="h-8 text-sm flex-1"
                                  value={selectedDate}
                                  min={m.start_date}
                                  onChange={e => setVisitDateMap(prev => ({ ...prev, [m.id]: e.target.value }))}
                                />
                                <Button
                                  size="sm"
                                  variant={alreadyMarkedOnSelected ? 'secondary' : 'default'}
                                  disabled={alreadyMarkedOnSelected || !selectedDate}
                                  onClick={() => handleMarkVisit(m, selectedDate)}
                                  className="gap-1.5 shrink-0"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  {alreadyMarkedOnSelected ? 'Already Marked' : 'Mark Visit'}
                                </Button>
                              </div>

                              <div className="pt-2 border-t">
                                {editingCommentId === m.id ? (
                                  <div className="space-y-2">
                                    <Textarea
                                      className="text-sm min-h-[60px] resize-none"
                                      placeholder="Add a note about this customer..."
                                      value={commentDraft}
                                      onChange={e => setCommentDraft(e.target.value)}
                                      autoFocus
                                    />
                                    <div className="flex gap-2 justify-end">
                                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingCommentId(null)}>Cancel</Button>
                                      <Button size="sm" className="h-7 text-xs" onClick={() => handleSaveComment(m.id)}>Save</Button>
                                    </div>
                                  </div>
                                ) : (
                                  <button className="w-full text-left" onClick={() => { setEditingCommentId(m.id); setCommentDraft(m.comments ?? ''); }}>
                                    {m.comments ? (
                                      <p className="text-xs text-muted-foreground italic hover:text-foreground transition-colors">💬 {m.comments}</p>
                                    ) : (
                                      <p className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors">+ Add comment...</p>
                                    )}
                                  </button>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  )}

                  {/* Completed memberships — compact history */}
                  {group.completed.length > 0 && (
                    <div className="border rounded-lg overflow-hidden">
                      <div className="px-4 py-2 bg-muted/50 text-xs font-medium text-muted-foreground">
                        Past Memberships ({group.completed.length})
                      </div>
                      {group.completed.map(({ membership: m, visits }) => (
                        <div key={m.id} className="flex items-center justify-between px-4 py-2.5 border-t gap-3 flex-wrap">
                          <div className="flex items-center gap-3 flex-wrap">
                            <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                            <span className="text-xs text-muted-foreground">{formatDate(m.start_date)}</span>
                            <span className="text-xs font-medium">{m.total_shakes} shakes</span>
                            <Badge variant={m.payment_status === 'paid' ? 'default' : 'secondary'} className="text-xs h-5">
                              {m.payment_status === 'paid' ? 'Paid' : 'Pending'}
                            </Badge>
                            {m.comments && (
                              <span className="text-xs text-muted-foreground italic">💬 {m.comments}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold">{formatCurrency(m.price)}</span>
                            <button
                              className={`text-xs hover:underline ${m.payment_status === 'paid' ? 'text-green-600' : 'text-orange-500'}`}
                              onClick={() => handleTogglePayment(m)}
                            >
                              {m.payment_status === 'paid' ? '✓' : '⏳'}
                            </button>
                            <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => handleDeleteMembership(m.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
