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
import { formatCurrency, formatDate } from '@/lib/utils';
import type { CenterMenu, CenterSale } from '@/types/database';
import { Plus, Pencil, Trash2, Settings } from 'lucide-react';
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

type SaleForm = z.infer<typeof saleSchema>;
type MenuForm = z.infer<typeof menuSchema>;

export default function CenterPage() {
  const { toast } = useToast();
  const [sales, setSales] = useState<CenterSale[]>([]);
  const [menu, setMenu] = useState<CenterMenu[]>([]);
  const [loading, setLoading] = useState(true);
  const [addSaleOpen, setAddSaleOpen] = useState(false);
  const [editSale, setEditSale] = useState<CenterSale | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editMenuItem, setEditMenuItem] = useState<CenterMenu | null>(null);

  const today = format(new Date(), 'yyyy-MM-dd');
  const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(new Date()), 'yyyy-MM-dd');

  const saleForm = useForm<SaleForm>({
    resolver: zodResolver(saleSchema),
    defaultValues: { date: today, quantity: 1 },
  });

  const menuForm = useForm<MenuForm>({ resolver: zodResolver(menuSchema) });

  const fetchData = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const [{ data: salesData }, { data: menuData }] = await Promise.all([
      supabase.from('center_sales').select('*').order('date', { ascending: false }),
      supabase.from('center_menu').select('*').order('item_name'),
    ]);
    setSales(salesData ?? []);
    setMenu(menuData ?? []);
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

  // By-item breakdown
  const todayBreakdown = todaySales.reduce<Record<string, number>>((acc, s) => {
    acc[s.product_name] = (acc[s.product_name] || 0) + s.quantity;
    return acc;
  }, {});

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

  const uniqueCustomers = Array.from(new Set(sales.map((s) => s.customer_name)));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Center</h1>
          <p className="text-muted-foreground text-sm">Customer management & revenue</p>
        </div>
        <div className="flex gap-2">
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
                <div className="grid grid-cols-2 gap-4">
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
                <div className="grid grid-cols-3 gap-4">
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
      </div>

      {/* Revenue summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Comments</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sales.map((sale) => (
                      <TableRow key={sale.id}>
                        <TableCell className="text-sm">{formatDate(sale.date)}</TableCell>
                        <TableCell className="text-sm font-medium">{sale.customer_name}</TableCell>
                        <TableCell className="text-sm">{sale.product_name}</TableCell>
                        <TableCell className="text-right text-sm">{sale.quantity}</TableCell>
                        <TableCell className="text-right text-sm">{formatCurrency(sale.fixed_price)}</TableCell>
                        <TableCell className="text-right text-sm font-medium">{formatCurrency(sale.fixed_price * sale.quantity)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[100px] truncate">{sale.comments ?? '-'}</TableCell>
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
    </div>
  );
}
