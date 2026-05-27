'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
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
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Inventory, Product } from '@/types/database';
import { Plus, Pencil, Trash2, Search, FileText, Download, RotateCcw, PackageCheck, SlidersHorizontal, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import Link from 'next/link';

type StockReportRow = { product: string; purchased: number; sold: number; remaining: number; vpRemaining: number; adjustment: number };

function printInventoryPeriodReport(
  periodItems: Inventory[],
  from: string,
  to: string,
  managerName: string,
  stockRows: StockReportRow[],
  sectionLabel: string,
) {
  const totalQty = periodItems.reduce((a, i) => a + i.quantity, 0);
  const totalCost = periodItems.reduce((a, i) => a + i.my_price * i.quantity, 0);
  const totalVP = periodItems.reduce((a, i) => a + (i.volume_points ?? 0) * i.quantity, 0);

  const byProduct = new Map<string, { qty: number; cost: number; vp: number }>();
  for (const i of periodItems) {
    if (!byProduct.has(i.product_name)) byProduct.set(i.product_name, { qty: 0, cost: 0, vp: 0 });
    const p = byProduct.get(i.product_name)!;
    p.qty += i.quantity;
    p.cost += i.my_price * i.quantity;
    p.vp += (i.volume_points ?? 0) * i.quantity;
  }

  const productRows = Array.from(byProduct.entries())
    .sort((a, b) => b[1].cost - a[1].cost)
    .map(([name, d]) => `
      <tr>
        <td>${name}</td>
        <td class="num">${d.qty}</td>
        <td class="num">₹${(d.cost / d.qty).toFixed(2)}</td>
        <td class="num">₹${d.cost.toFixed(2)}</td>
        <td class="num" style="color:#7c3aed">${d.vp.toFixed(2)}</td>
      </tr>`)
    .join('');

  const stockRowsHtml = stockRows
    .sort((a, b) => a.remaining - b.remaining)
    .map(({ product, purchased, sold, remaining, vpRemaining, adjustment }) => {
      const statusColor = remaining <= 0 ? '#dc2626' : remaining <= 3 ? '#f97316' : '#16a34a';
      const statusText = remaining <= 0 ? 'Out of stock' : remaining <= 3 ? 'Low stock' : 'In stock';
      const adjText = adjustment !== 0 ? ` <span style="color:#f97316;font-size:11px">(${adjustment > 0 ? '+' : ''}${adjustment} adj)</span>` : '';
      return `
      <tr>
        <td>${product}</td>
        <td class="num">${purchased}</td>
        <td class="num">${sold}${adjText}</td>
        <td class="num" style="font-weight:700;color:${statusColor}">${remaining}</td>
        <td class="num" style="color:#7c3aed">${vpRemaining > 0 ? vpRemaining.toFixed(2) + ' VP' : '—'}</td>
        <td><span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;background:${remaining <= 0 ? '#fee2e2' : remaining <= 3 ? '#ffedd5' : '#dcfce7'};color:${statusColor}">${statusText}</span></td>
      </tr>`;
    })
    .join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Inventory Report ${from} to ${to}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 13px; color: #111; padding: 32px; }
    h1 { font-size: 22px; margin-bottom: 4px; }
    h2 { font-size: 15px; margin: 24px 0 10px; color: #333; }
    .sub { color: #666; font-size: 12px; margin-bottom: 24px; }
    .meta { display: flex; justify-content: space-between; margin-bottom: 24px; }
    .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 28px; }
    .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px 16px; }
    .card .label { font-size: 11px; color: #666; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.05em; }
    .card .value { font-size: 20px; font-weight: 700; }
    .card.qty .value { color: #1d4ed8; }
    .card.cost .value { color: #be123c; }
    .card.vp .value { color: #7c3aed; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th { background: #f4f4f4; text-align: left; padding: 8px 10px; font-size: 12px; border-bottom: 2px solid #ddd; }
    td { padding: 8px 10px; border-bottom: 1px solid #eee; }
    .num { text-align: right; }
    tfoot tr { font-weight: bold; background: #f9fafb; }
    .section-header { display: flex; align-items: center; gap: 8px; margin: 28px 0 12px; }
    .section-header h2 { margin: 0; }
    .section-note { font-size: 11px; color: #888; margin-left: 4px; }
    .footer { margin-top: 40px; font-size: 11px; color: #999; text-align: center; }
    @media print { button { display: none; } }
  </style>
</head>
<body>
  <h1>Inventory Period Report${sectionLabel ? ' — ' + sectionLabel : ''}</h1>
  <p class="sub">Herbalife Sales Manager</p>
  <div class="meta">
    <div>
      <strong>Period:</strong> ${from} to ${to}<br/>
      <strong>Total Entries:</strong> ${periodItems.length} purchase records
    </div>
    <div style="text-align:right">
      <strong>Manager:</strong> ${managerName}<br/>
      <strong>Generated:</strong> ${new Date().toLocaleString()}
    </div>
  </div>
  <div class="summary-grid">
    <div class="card qty"><div class="label">Total Units Purchased</div><div class="value">${totalQty}</div></div>
    <div class="card cost"><div class="label">Total Cost Spent</div><div class="value">₹${totalCost.toFixed(2)}</div></div>
    <div class="card vp"><div class="label">Total Volume Points</div><div class="value">${totalVP.toFixed(2)}</div></div>
  </div>

  <h2>Product Breakdown (Period)</h2>
  <table>
    <thead>
      <tr>
        <th>Product</th>
        <th class="num">Units</th>
        <th class="num">Avg. Price</th>
        <th class="num">Total Cost</th>
        <th class="num">Volume Points</th>
      </tr>
    </thead>
    <tbody>${productRows}</tbody>
    <tfoot>
      <tr>
        <td>TOTAL</td>
        <td class="num">${totalQty}</td>
        <td class="num">—</td>
        <td class="num">₹${totalCost.toFixed(2)}</td>
        <td class="num" style="color:#7c3aed">${totalVP.toFixed(2)}</td>
      </tr>
    </tfoot>
  </table>

  ${stockRows.length > 0 ? `
  <div class="section-header">
    <h2>Current Stock Remaining</h2>
    <span class="section-note">(all-time snapshot as of report date)</span>
  </div>
  <table>
    <thead>
      <tr>
        <th>Product</th>
        <th class="num">Purchased</th>
        <th class="num">Used / Sold</th>
        <th class="num">Remaining</th>
        <th class="num">VP Remaining</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>${stockRowsHtml}</tbody>
    <tfoot>
      <tr>
        <td>TOTAL</td>
        <td class="num">${stockRows.reduce((a, r) => a + r.purchased, 0)}</td>
        <td class="num">${stockRows.reduce((a, r) => a + r.sold, 0)}</td>
        <td class="num" style="color:#16a34a">${stockRows.reduce((a, r) => a + r.remaining, 0)}</td>
        <td class="num" style="color:#7c3aed">${stockRows.reduce((a, r) => a + r.vpRemaining, 0).toFixed(2)} VP</td>
        <td></td>
      </tr>
    </tfoot>
  </table>
  ` : ''}

  <div class="footer">Herbalife Sales Manager · Inventory Report · ${from} to ${to}</div>
  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (win) { win.document.write(html); win.document.close(); }
}

const inventorySchema = z.object({
  date: z.string().min(1, 'Date is required'),
  product_name: z.string().min(1, 'Product is required'),
  quantity: z.coerce.number().min(1, 'Quantity must be at least 1'),
  my_price: z.coerce.number().min(0, 'Price must be positive'),
  volume_points: z.coerce.number().optional(),
  comments: z.string().optional(),
});

type InventoryForm = z.infer<typeof inventorySchema>;

type StockRow = {
  product: string;
  purchased: number;
  trackedSold: number;
  sold: number;
  remaining: number;
  vpRemaining: number;
  adjustment: number;
  notes: string;
};

export default function InventoryPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'sales' | 'center'>('sales');

  // Shared data
  const [items, setItems] = useState<Inventory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [managerName, setManagerName] = useState('Manager');

  // Sales section
  const [salesData, setSalesData] = useState<{ product_name: string; quantity: number }[]>([]);
  const [stockAdjustments, setStockAdjustments] = useState<{ product_name: string; sold_adjustment: number; notes: string }[]>([]);
  const [stockEditItem, setStockEditItem] = useState<{ product: string; purchased: number; trackedSold: number; adjustment: number; notes: string } | null>(null);
  const [stockEditAdj, setStockEditAdj] = useState(0);
  const [stockEditNotes, setStockEditNotes] = useState('');
  const [stockDeleteProduct, setStockDeleteProduct] = useState<string | null>(null);
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // Center section
  const [centerSalesData, setCenterSalesData] = useState<{ product_name: string; quantity: number }[]>([]);
  const [centerStockAdjustments, setCenterStockAdjustments] = useState<{ product_name: string; sold_adjustment: number; notes: string }[]>([]);
  const [centerStockEditItem, setCenterStockEditItem] = useState<{ product: string; purchased: number; trackedSold: number; adjustment: number; notes: string } | null>(null);
  const [centerStockEditAdj, setCenterStockEditAdj] = useState(0);
  const [centerStockEditNotes, setCenterStockEditNotes] = useState('');
  const [centerStockDeleteProduct, setCenterStockDeleteProduct] = useState<string | null>(null);
  const [centerFilterFrom, setCenterFilterFrom] = useState('');
  const [centerFilterTo, setCenterFilterTo] = useState('');

  // Shared dialogs
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<Inventory | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);
  const [periodReportOpen, setPeriodReportOpen] = useState(false);
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [resetOpen, setResetOpen] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<InventoryForm>({
    resolver: zodResolver(inventorySchema),
    defaultValues: { date: format(new Date(), 'yyyy-MM-dd'), quantity: 1 },
  });

  const watchQty = watch('quantity') || 1;
  const watchMyPrice = watch('my_price') || 0;
  const watchVP = watch('volume_points') || 0;

  const fetchData = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const [
      { data: invData },
      { data: prodData },
      { data: salesRaw },
      { data: adjData },
      { data: centerSalesRaw },
      { data: centerAdjData },
      { data: { user } },
    ] = await Promise.all([
      supabase.from('inventory').select('*').order('date', { ascending: false }),
      supabase.from('products').select('*').order('name'),
      supabase.from('sales').select('product_name, quantity'),
      supabase.from('stock_adjustments').select('product_name, sold_adjustment, notes').or('section.eq.sales,section.is.null'),
      supabase.from('center_sales').select('product_name, quantity'),
      supabase.from('stock_adjustments').select('product_name, sold_adjustment, notes').eq('section', 'center'),
      supabase.auth.getUser(),
    ]);
    setItems(invData ?? []);
    setProducts(prodData ?? []);
    setSalesData(salesRaw ?? []);
    setStockAdjustments(adjData ?? []);
    setCenterSalesData(centerSalesRaw ?? []);
    setCenterStockAdjustments(centerAdjData ?? []);
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('first_name, last_name').eq('id', user.id).single();
      if (profile) setManagerName(`${profile.first_name} ${profile.last_name}`);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Split items by section
  const salesItems = items.filter(i => !i.section || i.section === 'sales');
  const centerItems = items.filter(i => i.section === 'center');

  // Filtered items
  const filteredSalesItems = salesItems.filter(i => {
    if (filterDateFrom && i.date < filterDateFrom) return false;
    if (filterDateTo && i.date > filterDateTo) return false;
    return true;
  });
  const filteredCenterItems = centerItems.filter(i => {
    if (centerFilterFrom && i.date < centerFilterFrom) return false;
    if (centerFilterTo && i.date > centerFilterTo) return false;
    return true;
  });

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(productSearch.toLowerCase())
  ).slice(0, 10);

  const handleProductSelect = (product: Product) => {
    setValue('product_name', product.name);
    setValue('my_price', product.retail_price);
    setValue('volume_points', product.volume_points);
    setProductSearch(product.name);
    setProductDropdownOpen(false);
  };

  const resetForm = () => {
    reset({ date: format(new Date(), 'yyyy-MM-dd'), quantity: 1 });
    setProductSearch('');
  };

  const onSubmit = async (data: InventoryForm) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const section = editItem ? (editItem.section || 'sales') : activeTab;

    const payload = {
      user_id: user.id,
      date: data.date,
      product_name: data.product_name,
      quantity: data.quantity,
      my_price: data.my_price,
      retail_price: data.my_price,
      volume_points: data.volume_points || 0,
      comments: data.comments || null,
      section,
    };

    if (editItem) {
      const { error } = await supabase.from('inventory').update(payload).eq('id', editItem.id);
      if (error) { toast({ title: 'Update failed', description: error.message, variant: 'destructive' }); return; }
      toast({ title: 'Item updated' });
    } else {
      const { error } = await supabase.from('inventory').insert(payload);
      if (error) { toast({ title: 'Add failed', description: error.message, variant: 'destructive' }); return; }
      toast({ title: `Item added to ${section === 'center' ? 'center' : 'sales'} inventory` });
    }
    setAddOpen(false);
    setEditItem(null);
    resetForm();
    fetchData();
  };

  const handleResetAll = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from('inventory').delete().eq('user_id', user.id).eq('section', activeTab);
    if (error) { toast({ title: 'Reset failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: `${activeTab === 'center' ? 'Center' : 'Sales'} inventory deleted` });
    setResetOpen(false);
    setResetConfirmText('');
    fetchData();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this inventory item?')) return;
    const supabase = createClient();
    await supabase.from('inventory').delete().eq('id', id);
    toast({ title: 'Item deleted' });
    fetchData();
  };

  const handleEdit = (item: Inventory) => {
    setEditItem(item);
    reset({
      date: item.date,
      product_name: item.product_name,
      quantity: item.quantity,
      my_price: item.my_price,
      volume_points: item.volume_points,
      comments: item.comments ?? '',
    });
    setProductSearch(item.product_name);
    setAddOpen(true);
  };

  // Sales stock remaining
  const stockRemaining = useMemo((): StockRow[] => {
    const purchasedMap = new Map<string, { qty: number; totalVP: number }>();
    for (const i of salesItems) {
      if (!purchasedMap.has(i.product_name)) purchasedMap.set(i.product_name, { qty: 0, totalVP: 0 });
      const p = purchasedMap.get(i.product_name)!;
      p.qty += i.quantity;
      p.totalVP += (i.volume_points ?? 0) * i.quantity;
    }
    const soldMap = new Map<string, number>();
    for (const s of salesData) {
      soldMap.set(s.product_name, (soldMap.get(s.product_name) ?? 0) + s.quantity);
    }
    const adjMap = new Map<string, { adjustment: number; notes: string }>();
    for (const a of stockAdjustments) {
      adjMap.set(a.product_name, { adjustment: a.sold_adjustment, notes: a.notes });
    }
    return Array.from(purchasedMap.entries())
      .map(([product, { qty: purchased, totalVP }]) => {
        const trackedSold = soldMap.get(product) ?? 0;
        const adj = adjMap.get(product);
        const sold = trackedSold + (adj?.adjustment ?? 0);
        const remaining = purchased - sold;
        const avgVP = purchased > 0 ? totalVP / purchased : 0;
        return { product, purchased, trackedSold, sold, remaining, vpRemaining: remaining * avgVP, adjustment: adj?.adjustment ?? 0, notes: adj?.notes ?? '' };
      })
      .sort((a, b) => a.remaining - b.remaining);
  }, [salesItems, salesData, stockAdjustments]);

  // Center stock remaining
  const centerStockRemaining = useMemo((): StockRow[] => {
    const purchasedMap = new Map<string, { qty: number; totalVP: number }>();
    for (const i of centerItems) {
      if (!purchasedMap.has(i.product_name)) purchasedMap.set(i.product_name, { qty: 0, totalVP: 0 });
      const p = purchasedMap.get(i.product_name)!;
      p.qty += i.quantity;
      p.totalVP += (i.volume_points ?? 0) * i.quantity;
    }
    const soldMap = new Map<string, number>();
    for (const s of centerSalesData) {
      soldMap.set(s.product_name, (soldMap.get(s.product_name) ?? 0) + s.quantity);
    }
    const adjMap = new Map<string, { adjustment: number; notes: string }>();
    for (const a of centerStockAdjustments) {
      adjMap.set(a.product_name, { adjustment: a.sold_adjustment, notes: a.notes });
    }
    return Array.from(purchasedMap.entries())
      .map(([product, { qty: purchased, totalVP }]) => {
        const trackedSold = soldMap.get(product) ?? 0;
        const adj = adjMap.get(product);
        const sold = trackedSold + (adj?.adjustment ?? 0);
        const remaining = purchased - sold;
        const avgVP = purchased > 0 ? totalVP / purchased : 0;
        return { product, purchased, trackedSold, sold, remaining, vpRemaining: remaining * avgVP, adjustment: adj?.adjustment ?? 0, notes: adj?.notes ?? '' };
      })
      .sort((a, b) => a.remaining - b.remaining);
  }, [centerItems, centerSalesData, centerStockAdjustments]);

  // Sales stock handlers
  const handleStockEdit = (row: StockRow) => {
    setStockEditItem({ product: row.product, purchased: row.purchased, trackedSold: row.trackedSold, adjustment: row.adjustment, notes: row.notes });
    setStockEditAdj(row.adjustment);
    setStockEditNotes(row.notes);
  };

  const handleStockEditSave = async () => {
    if (!stockEditItem) return;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from('stock_adjustments').upsert(
      { user_id: user.id, product_name: stockEditItem.product, sold_adjustment: stockEditAdj, notes: stockEditNotes, section: 'sales', updated_at: new Date().toISOString() },
      { onConflict: 'user_id,product_name,section' }
    );
    if (error) { toast({ title: 'Save failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Stock adjustment saved' });
    setStockEditItem(null);
    fetchData();
  };

  const confirmStockDelete = async () => {
    if (!stockDeleteProduct) return;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from('inventory').delete().eq('user_id', user.id).eq('product_name', stockDeleteProduct).eq('section', 'sales'),
      supabase.from('stock_adjustments').delete().eq('user_id', user.id).eq('product_name', stockDeleteProduct),
    ]);
    if (e1 || e2) { toast({ title: 'Delete failed', description: e1?.message ?? e2?.message, variant: 'destructive' }); return; }
    toast({ title: `"${stockDeleteProduct}" removed from sales inventory` });
    setStockDeleteProduct(null);
    fetchData();
  };

  // Center stock handlers
  const handleCenterStockEdit = (row: StockRow) => {
    setCenterStockEditItem({ product: row.product, purchased: row.purchased, trackedSold: row.trackedSold, adjustment: row.adjustment, notes: row.notes });
    setCenterStockEditAdj(row.adjustment);
    setCenterStockEditNotes(row.notes);
  };

  const handleCenterStockEditSave = async () => {
    if (!centerStockEditItem) return;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from('stock_adjustments').upsert(
      { user_id: user.id, product_name: centerStockEditItem.product, sold_adjustment: centerStockEditAdj, notes: centerStockEditNotes, section: 'center', updated_at: new Date().toISOString() },
      { onConflict: 'user_id,product_name,section' }
    );
    if (error) { toast({ title: 'Save failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Center stock adjustment saved' });
    setCenterStockEditItem(null);
    fetchData();
  };

  const confirmCenterStockDelete = async () => {
    if (!centerStockDeleteProduct) return;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from('inventory').delete().eq('user_id', user.id).eq('product_name', centerStockDeleteProduct).eq('section', 'center'),
      supabase.from('stock_adjustments').delete().eq('user_id', user.id).eq('product_name', centerStockDeleteProduct).eq('section', 'center'),
    ]);
    if (e1 || e2) { toast({ title: 'Delete failed', description: e1?.message ?? e2?.message, variant: 'destructive' }); return; }
    toast({ title: `"${centerStockDeleteProduct}" removed from center inventory` });
    setCenterStockDeleteProduct(null);
    fetchData();
  };

  // Period report
  const currentItems = activeTab === 'sales' ? salesItems : centerItems;
  const periodItems = currentItems.filter(i => {
    if (periodFrom && i.date < periodFrom) return false;
    if (periodTo && i.date > periodTo) return false;
    return true;
  });
  const periodQty = periodItems.reduce((a, i) => a + i.quantity, 0);
  const periodCost = periodItems.reduce((a, i) => a + i.my_price * i.quantity, 0);
  const periodVP = periodItems.reduce((a, i) => a + (i.volume_points ?? 0) * i.quantity, 0);

  // Totals
  const salesTotals = {
    qty: filteredSalesItems.reduce((a, i) => a + i.quantity, 0),
    cost: filteredSalesItems.reduce((a, i) => a + i.my_price * i.quantity, 0),
    vp: filteredSalesItems.reduce((a, i) => a + (i.volume_points ?? 0) * i.quantity, 0),
  };
  const centerTotals = {
    qty: filteredCenterItems.reduce((a, i) => a + i.quantity, 0),
    cost: filteredCenterItems.reduce((a, i) => a + i.my_price * i.quantity, 0),
    vp: filteredCenterItems.reduce((a, i) => a + (i.volume_points ?? 0) * i.quantity, 0),
  };

  const stockEditDialogContent = (
    item: typeof stockEditItem,
    adj: number, setAdj: (v: number) => void,
    notes: string, setNotes: (v: string) => void,
    onSave: () => void,
    onClose: () => void,
  ) => item ? (
    <div className="space-y-4">
      <p className="text-sm font-medium truncate">{item.product}</p>
      <div className="grid grid-cols-3 gap-3 text-center text-xs">
        <div className="bg-muted rounded p-2">
          <p className="text-muted-foreground mb-1">Purchased</p>
          <p className="font-bold text-base">{item.purchased}</p>
        </div>
        <div className="bg-muted rounded p-2">
          <p className="text-muted-foreground mb-1">Tracked Sold</p>
          <p className="font-bold text-base">{item.trackedSold}</p>
        </div>
        <div className="bg-muted rounded p-2">
          <p className="text-muted-foreground mb-1">Remaining</p>
          <p className={`font-bold text-base ${item.purchased - item.trackedSold - adj <= 0 ? 'text-destructive' : 'text-green-600'}`}>
            {item.purchased - item.trackedSold - adj}
          </p>
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-sm">Manual Used Adjustment</Label>
        <p className="text-xs text-muted-foreground">Add units used outside tracked records (use negative to revert).</p>
        <Input type="number" value={adj} onChange={(e) => setAdj(Number(e.target.value))} />
      </div>
      <div className="space-y-1">
        <Label className="text-sm">Notes (optional)</Label>
        <Input placeholder="Reason for adjustment..." value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={onSave}>Save</Button>
      </div>
    </div>
  ) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Inventory</h1>
          <p className="text-muted-foreground text-sm">Stock management</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={resetOpen} onOpenChange={(v) => { setResetOpen(v); if (!v) setResetConfirmText(''); }}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2 text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive">
                <RotateCcw className="h-4 w-4" />Reset
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle className="text-destructive">Reset {activeTab === 'center' ? 'Center' : 'Sales'} Inventory</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  This will permanently delete all <strong>{activeTab === 'center' ? 'center' : 'sales'} inventory records</strong>. This action cannot be undone.
                </p>
                <div className="space-y-2">
                  <Label className="text-sm">Type <span className="font-mono font-bold">RESET</span> to confirm</Label>
                  <Input placeholder="RESET" value={resetConfirmText} onChange={(e) => setResetConfirmText(e.target.value)} className="border-destructive/40 focus-visible:ring-destructive/30" />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => { setResetOpen(false); setResetConfirmText(''); }}>Cancel</Button>
                  <Button variant="destructive" className="flex-1" disabled={resetConfirmText !== 'RESET'} onClick={handleResetAll}>Delete All</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={periodReportOpen} onOpenChange={(v) => { setPeriodReportOpen(v); if (!v) { setPeriodFrom(''); setPeriodTo(''); } }}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2"><FileText className="h-4 w-4" />Period Report</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Inventory Period Report ({activeTab === 'center' ? 'Center' : 'Sales'})</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Select a date range to generate a summary of inventory purchases.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>From Date</Label><Input type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} /></div>
                  <div className="space-y-2"><Label>To Date</Label><Input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} /></div>
                </div>
                {(periodFrom || periodTo) && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                        <p className="text-xs text-muted-foreground mb-1">Total Units</p>
                        <p className="text-lg font-bold text-blue-700 dark:text-blue-400">{periodQty}</p>
                      </div>
                      <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-lg p-3">
                        <p className="text-xs text-muted-foreground mb-1">Total Cost</p>
                        <p className="text-lg font-bold text-rose-700 dark:text-rose-400">{formatCurrency(periodCost)}</p>
                      </div>
                      <div className="bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-lg p-3">
                        <p className="text-xs text-muted-foreground mb-1">Volume Points</p>
                        <p className="text-lg font-bold text-purple-700 dark:text-purple-400">{periodVP.toFixed(2)}</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground text-center">{periodItems.length} purchase records</p>
                    {periodItems.length > 0 ? (
                      <Button className="w-full gap-2" onClick={() => printInventoryPeriodReport(periodItems, periodFrom || 'all', periodTo || 'all', managerName, activeTab === 'center' ? centerStockRemaining : stockRemaining, activeTab === 'center' ? 'Center' : 'Sales')}>
                        <Download className="h-4 w-4" />Download Report
                      </Button>
                    ) : (
                      <p className="text-center text-sm text-muted-foreground py-2">No records found in this period.</p>
                    )}
                  </div>
                )}
                {!periodFrom && !periodTo && (
                  <p className="text-center text-sm text-muted-foreground py-4">Select dates above to preview the report.</p>
                )}
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={addOpen} onOpenChange={(v) => { setAddOpen(v); if (!v) { setEditItem(null); resetForm(); } }}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="h-4 w-4" />Add Item</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editItem ? 'Edit Item' : `Add ${activeTab === 'center' ? 'Center' : 'Sales'} Inventory Item`}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input type="date" {...register('date')} />
                    {errors.date && <p className="text-xs text-destructive">{errors.date.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>Quantity</Label>
                    <Input type="number" min={1} {...register('quantity')} />
                    {errors.quantity && <p className="text-xs text-destructive">{errors.quantity.message}</p>}
                  </div>
                </div>
                <div className="space-y-2 relative">
                  <Label>Product</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search product..."
                      className="pl-9"
                      value={productSearch}
                      onChange={(e) => { setProductSearch(e.target.value); setValue('product_name', e.target.value); setProductDropdownOpen(true); }}
                      onFocus={() => setProductDropdownOpen(true)}
                    />
                  </div>
                  {productDropdownOpen && filteredProducts.length > 0 && (
                    <div className="absolute z-50 w-full bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto">
                      {filteredProducts.map((p) => (
                        <button key={p.id} type="button" className="w-full text-left px-3 py-2 hover:bg-accent text-sm" onClick={() => handleProductSelect(p)}>
                          <div className="font-medium">{p.name}</div>
                          <div className="text-xs text-muted-foreground">{formatCurrency(p.retail_price)}</div>
                        </button>
                      ))}
                    </div>
                  )}
                  {errors.product_name && <p className="text-xs text-destructive">{errors.product_name.message}</p>}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>My Price (₹)</Label>
                    <Input type="number" step="0.01" {...register('my_price')} />
                    {errors.my_price && <p className="text-xs text-destructive">{errors.my_price.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>Volume Points</Label>
                    <Input type="number" step="0.01" {...register('volume_points')} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 bg-muted rounded-md px-3 py-2 text-xs border">
                  <div>
                    <p className="text-muted-foreground">Total Cost</p>
                    <p className="font-semibold">{formatCurrency(watchMyPrice * watchQty)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Total Volume Points</p>
                    <p className="font-semibold text-purple-600">{(watchVP * watchQty).toFixed(2)} VP</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Comments (optional)</Label>
                  <Textarea placeholder="Any notes..." {...register('comments')} rows={2} />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="outline" onClick={() => { setAddOpen(false); setEditItem(null); resetForm(); }}>Cancel</Button>
                  <Button type="submit">{editItem ? 'Update' : 'Add'}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-1 border-b">
        <button
          onClick={() => setActiveTab('sales')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'sales'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Sales Inventory
        </button>
        <button
          onClick={() => setActiveTab('center')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'center'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Center Inventory
        </button>
      </div>

      {/* Low stock reminder banner */}
      {!loading && (() => {
        const lowStockItems = (activeTab === 'sales' ? stockRemaining : centerStockRemaining)
          .filter(r => r.remaining <= 3 && r.remaining > 0);
        const outOfStockItems = (activeTab === 'sales' ? stockRemaining : centerStockRemaining)
          .filter(r => r.remaining <= 0);
        if (outOfStockItems.length === 0 && lowStockItems.length === 0) return null;
        return (
          <div className="space-y-2">
            {outOfStockItems.length > 0 && (
              <div className="flex items-start gap-2.5 px-4 py-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
                <svg className="h-4 w-4 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                <span><strong>{outOfStockItems.length} item(s) out of stock:</strong> {outOfStockItems.map(r => r.product).join(', ')}</span>
              </div>
            )}
            {lowStockItems.length > 0 && (
              <div className="flex items-start gap-2.5 px-4 py-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg text-sm text-amber-700 dark:text-amber-400">
                <svg className="h-4 w-4 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                <span><strong>{lowStockItems.length} item(s) need restocking:</strong> {lowStockItems.map(r => r.product).join(', ')}</span>
              </div>
            )}
          </div>
        );
      })()}

      {/* ───── SALES TAB ───── */}
      {activeTab === 'sales' && (
        <div className="space-y-6">
          {/* Date filters */}
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex flex-col sm:flex-row gap-3 items-end">
                <div className="space-y-1 flex-1">
                  <Label className="text-xs text-muted-foreground">From Date</Label>
                  <Input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} />
                </div>
                <div className="space-y-1 flex-1">
                  <Label className="text-xs text-muted-foreground">To Date</Label>
                  <Input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} />
                </div>
                {(filterDateFrom || filterDateTo) && (
                  <Button variant="outline" size="sm" onClick={() => { setFilterDateFrom(''); setFilterDateTo(''); }}>Clear</Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Quantity</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">{salesTotals.qty}</p><p className="text-xs text-muted-foreground">units purchased</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Cost</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">{formatCurrency(salesTotals.cost)}</p><p className="text-xs text-muted-foreground">amount spent</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Volume Points</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold text-purple-600">{salesTotals.vp.toFixed(2)} VP</p><p className="text-xs text-muted-foreground">accumulated VP</p></CardContent>
            </Card>
          </div>

          {/* Sales Stock Edit Dialog */}
          <Dialog open={!!stockEditItem} onOpenChange={(v) => { if (!v) setStockEditItem(null); }}>
            <DialogContent className="max-w-sm">
              <DialogHeader><DialogTitle className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4" />Adjust Sales Stock</DialogTitle></DialogHeader>
              {stockEditDialogContent(stockEditItem, stockEditAdj, setStockEditAdj, stockEditNotes, setStockEditNotes, handleStockEditSave, () => setStockEditItem(null))}
            </DialogContent>
          </Dialog>

          {/* Sales Stock Delete Dialog */}
          <Dialog open={!!stockDeleteProduct} onOpenChange={(v) => { if (!v) setStockDeleteProduct(null); }}>
            <DialogContent className="max-w-sm">
              <DialogHeader><DialogTitle className="text-destructive">Delete Product Stock</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  This will permanently delete <strong>all inventory records</strong> for <strong>"{stockDeleteProduct}"</strong>. This cannot be undone.
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setStockDeleteProduct(null)}>Cancel</Button>
                  <Button variant="destructive" className="flex-1" onClick={confirmStockDelete}>Delete</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Sales Stock Remaining */}
          {!loading && stockRemaining.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <PackageCheck className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <CardTitle className="text-base">Stock Remaining</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">Total purchased minus all sales — current stock on hand</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Purchased</TableHead>
                        <TableHead className="text-right">Sold</TableHead>
                        <TableHead className="text-right font-semibold">Remaining</TableHead>
                        <TableHead className="text-right hidden md:table-cell">VP Remaining</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stockRemaining.map(({ product, purchased, sold, remaining, vpRemaining, adjustment }) => (
                        <TableRow key={product}>
                          <TableCell className="font-medium text-sm">{product}</TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">{purchased}</TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">
                            {sold}
                            {adjustment !== 0 && <span className="ml-1 text-xs text-orange-500">({adjustment > 0 ? `+${adjustment}` : adjustment} adj)</span>}
                          </TableCell>
                          <TableCell className="text-right text-sm font-bold">
                            <span className={remaining <= 0 ? 'text-destructive' : remaining <= 3 ? 'text-orange-500' : 'text-green-600'}>{remaining}</span>
                          </TableCell>
                          <TableCell className="text-right text-sm text-purple-600 hidden md:table-cell">
                            {vpRemaining > 0 ? `${vpRemaining.toFixed(2)} VP` : '—'}
                          </TableCell>
                          <TableCell>
                            {remaining <= 0 ? <Badge variant="destructive">Out of stock</Badge>
                              : remaining <= 3 ? <Badge variant="warning">Low stock</Badge>
                              : <Badge variant="success">In stock</Badge>}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1 justify-end">
                              <Button size="icon" variant="ghost" className="h-8 w-8" title="Adjust stock"
                                onClick={() => handleStockEdit(stockRemaining.find(r => r.product === product)!)}>
                                <SlidersHorizontal className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" title="Delete product"
                                onClick={() => setStockDeleteProduct(product)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell className="font-bold">Total</TableCell>
                        <TableCell className="text-right font-bold">{stockRemaining.reduce((a, r) => a + r.purchased, 0)}</TableCell>
                        <TableCell className="text-right font-bold">{stockRemaining.reduce((a, r) => a + r.sold, 0)}</TableCell>
                        <TableCell className="text-right font-bold text-green-600">{stockRemaining.reduce((a, r) => a + r.remaining, 0)}</TableCell>
                        <TableCell className="text-right font-bold text-purple-600 hidden md:table-cell">{stockRemaining.reduce((a, r) => a + r.vpRemaining, 0).toFixed(2)} VP</TableCell>
                        <TableCell /><TableCell />
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Sales Purchase History */}
          <div>
            <h2 className="text-base font-semibold mb-3 text-muted-foreground">Purchase History</h2>
            {loading ? (
              <div className="text-center py-12 text-muted-foreground">Loading...</div>
            ) : (
              <Card>
                <CardContent className="p-0">
                  {filteredSalesItems.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                      {salesItems.length === 0 ? 'No sales inventory items yet. Add your first item.' : 'No items match the selected date range.'}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Product</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead className="text-right hidden md:table-cell">My Price</TableHead>
                            <TableHead className="text-right">Total Cost</TableHead>
                            <TableHead className="text-right hidden lg:table-cell">VP/unit</TableHead>
                            <TableHead className="text-right hidden md:table-cell">Total VP</TableHead>
                            <TableHead className="hidden lg:table-cell">Comments</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredSalesItems.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell className="text-sm">{formatDate(item.date)}</TableCell>
                              <TableCell className="text-sm font-medium max-w-[120px] truncate">{item.product_name}</TableCell>
                              <TableCell className="text-right text-sm">{item.quantity}</TableCell>
                              <TableCell className="text-right text-sm hidden md:table-cell">{formatCurrency(item.my_price)}</TableCell>
                              <TableCell className="text-right text-sm font-medium">{formatCurrency(item.my_price * item.quantity)}</TableCell>
                              <TableCell className="text-right text-sm text-muted-foreground hidden lg:table-cell">{item.volume_points ?? 0}</TableCell>
                              <TableCell className="text-right text-sm text-purple-600 font-medium hidden md:table-cell">{((item.volume_points ?? 0) * item.quantity).toFixed(2)}</TableCell>
                              <TableCell className="text-sm text-muted-foreground max-w-[120px] truncate hidden lg:table-cell">{item.comments ?? '-'}</TableCell>
                              <TableCell>
                                <div className="flex gap-1 justify-end">
                                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleEdit(item)}><Pencil className="h-3.5 w-3.5" /></Button>
                                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleDelete(item.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                        <TableFooter>
                          <TableRow>
                            <TableCell colSpan={2} className="font-bold">Total</TableCell>
                            <TableCell className="text-right font-bold">{salesTotals.qty}</TableCell>
                            <TableCell className="hidden md:table-cell" />
                            <TableCell className="text-right font-bold">{formatCurrency(salesTotals.cost)}</TableCell>
                            <TableCell className="hidden lg:table-cell" />
                            <TableCell className="text-right font-bold text-purple-600 hidden md:table-cell">{salesTotals.vp.toFixed(2)}</TableCell>
                            <TableCell className="hidden lg:table-cell" colSpan={2} />
                          </TableRow>
                        </TableFooter>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* ───── CENTER TAB ───── */}
      {activeTab === 'center' && (
        <div className="space-y-6">
          {/* Date filters */}
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex flex-col sm:flex-row gap-3 items-end">
                <div className="space-y-1 flex-1">
                  <Label className="text-xs text-muted-foreground">From Date</Label>
                  <Input type="date" value={centerFilterFrom} onChange={(e) => setCenterFilterFrom(e.target.value)} />
                </div>
                <div className="space-y-1 flex-1">
                  <Label className="text-xs text-muted-foreground">To Date</Label>
                  <Input type="date" value={centerFilterTo} onChange={(e) => setCenterFilterTo(e.target.value)} />
                </div>
                {(centerFilterFrom || centerFilterTo) && (
                  <Button variant="outline" size="sm" onClick={() => { setCenterFilterFrom(''); setCenterFilterTo(''); }}>Clear</Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Center Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Quantity</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">{centerTotals.qty}</p><p className="text-xs text-muted-foreground">units for center</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Cost</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">{formatCurrency(centerTotals.cost)}</p><p className="text-xs text-muted-foreground">amount spent</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Volume Points</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold text-purple-600">{centerTotals.vp.toFixed(2)} VP</p><p className="text-xs text-muted-foreground">accumulated VP</p></CardContent>
            </Card>
          </div>

          {/* Center Stock Edit Dialog */}
          <Dialog open={!!centerStockEditItem} onOpenChange={(v) => { if (!v) setCenterStockEditItem(null); }}>
            <DialogContent className="max-w-sm">
              <DialogHeader><DialogTitle className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4" />Adjust Center Stock</DialogTitle></DialogHeader>
              {stockEditDialogContent(centerStockEditItem, centerStockEditAdj, setCenterStockEditAdj, centerStockEditNotes, setCenterStockEditNotes, handleCenterStockEditSave, () => setCenterStockEditItem(null))}
            </DialogContent>
          </Dialog>

          {/* Center Stock Delete Dialog */}
          <Dialog open={!!centerStockDeleteProduct} onOpenChange={(v) => { if (!v) setCenterStockDeleteProduct(null); }}>
            <DialogContent className="max-w-sm">
              <DialogHeader><DialogTitle className="text-destructive">Delete Center Product Stock</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  This will permanently delete <strong>all center inventory records</strong> for <strong>"{centerStockDeleteProduct}"</strong>. This cannot be undone.
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setCenterStockDeleteProduct(null)}>Cancel</Button>
                  <Button variant="destructive" className="flex-1" onClick={confirmCenterStockDelete}>Delete</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Center Stock Remaining */}
          {!loading && centerStockRemaining.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <PackageCheck className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <CardTitle className="text-base">Center Stock Remaining</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">Center inventory minus center sales usage and manual adjustments</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Purchased</TableHead>
                        <TableHead className="text-right">Used</TableHead>
                        <TableHead className="text-right font-semibold">Remaining</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {centerStockRemaining.map(({ product, purchased, sold, remaining, adjustment }) => (
                        <TableRow key={product}>
                          <TableCell className="font-medium text-sm">{product}</TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">{purchased}</TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">
                            {sold}
                            {adjustment !== 0 && <span className="ml-1 text-xs text-orange-500">({adjustment > 0 ? `+${adjustment}` : adjustment} adj)</span>}
                          </TableCell>
                          <TableCell className="text-right text-sm font-bold">
                            <span className={remaining <= 0 ? 'text-destructive' : remaining <= 3 ? 'text-orange-500' : 'text-green-600'}>{remaining}</span>
                          </TableCell>
                          <TableCell>
                            {remaining <= 0 ? <Badge variant="destructive">Out of stock</Badge>
                              : remaining <= 3 ? <Badge variant="warning">Low stock</Badge>
                              : <Badge variant="success">In stock</Badge>}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1 justify-end">
                              <Button size="icon" variant="ghost" className="h-8 w-8" title="Adjust stock"
                                onClick={() => handleCenterStockEdit(centerStockRemaining.find(r => r.product === product)!)}>
                                <SlidersHorizontal className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" title="Delete product"
                                onClick={() => setCenterStockDeleteProduct(product)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell className="font-bold">Total</TableCell>
                        <TableCell className="text-right font-bold">{centerStockRemaining.reduce((a, r) => a + r.purchased, 0)}</TableCell>
                        <TableCell className="text-right font-bold">{centerStockRemaining.reduce((a, r) => a + r.sold, 0)}</TableCell>
                        <TableCell className="text-right font-bold text-green-600">{centerStockRemaining.reduce((a, r) => a + r.remaining, 0)}</TableCell>
                        <TableCell /><TableCell />
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Center Purchase History */}
          <div>
            <h2 className="text-base font-semibold mb-3 text-muted-foreground">Center Purchase History</h2>
            {loading ? (
              <div className="text-center py-12 text-muted-foreground">Loading...</div>
            ) : (
              <Card>
                <CardContent className="p-0">
                  {filteredCenterItems.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                      {centerItems.length === 0 ? 'No center inventory items yet. Add items using "Add Item" above.' : 'No items match the selected date range.'}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Product</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead className="text-right hidden md:table-cell">My Price</TableHead>
                            <TableHead className="text-right">Total Cost</TableHead>
                            <TableHead className="hidden lg:table-cell">Comments</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredCenterItems.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell className="text-sm">{formatDate(item.date)}</TableCell>
                              <TableCell className="text-sm font-medium max-w-[120px] truncate">{item.product_name}</TableCell>
                              <TableCell className="text-right text-sm">{item.quantity}</TableCell>
                              <TableCell className="text-right text-sm hidden md:table-cell">{formatCurrency(item.my_price)}</TableCell>
                              <TableCell className="text-right text-sm font-medium">{formatCurrency(item.my_price * item.quantity)}</TableCell>
                              <TableCell className="text-sm text-muted-foreground max-w-[120px] truncate hidden lg:table-cell">{item.comments ?? '-'}</TableCell>
                              <TableCell>
                                <div className="flex gap-1 justify-end">
                                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleEdit(item)}><Pencil className="h-3.5 w-3.5" /></Button>
                                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleDelete(item.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                        <TableFooter>
                          <TableRow>
                            <TableCell colSpan={2} className="font-bold">Total</TableCell>
                            <TableCell className="text-right font-bold">{centerTotals.qty}</TableCell>
                            <TableCell className="hidden md:table-cell" />
                            <TableCell className="text-right font-bold">{formatCurrency(centerTotals.cost)}</TableCell>
                            <TableCell className="hidden lg:table-cell" colSpan={2} />
                          </TableRow>
                        </TableFooter>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
