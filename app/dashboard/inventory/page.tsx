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
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Inventory, Product } from '@/types/database';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

const inventorySchema = z.object({
  date: z.string().min(1, 'Date is required'),
  product_name: z.string().min(1, 'Product is required'),
  quantity: z.coerce.number().min(1, 'Quantity must be at least 1'),
  my_price: z.coerce.number().min(0, 'Price must be positive'),
  volume_points: z.coerce.number().optional(),
  comments: z.string().optional(),
});

type InventoryForm = z.infer<typeof inventorySchema>;

export default function InventoryPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<Inventory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<Inventory | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);

  // Filters
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

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
    const [{ data: invData }, { data: prodData }] = await Promise.all([
      supabase.from('inventory').select('*').order('date', { ascending: false }),
      supabase.from('products').select('*').order('name'),
    ]);
    setItems(invData ?? []);
    setProducts(prodData ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Filtered items based on date range
  const filteredItems = items.filter((i) => {
    if (filterDateFrom && i.date < filterDateFrom) return false;
    if (filterDateTo && i.date > filterDateTo) return false;
    return true;
  });

  const filteredProducts = products.filter((p) =>
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

    const payload = {
      user_id: user.id,
      date: data.date,
      product_name: data.product_name,
      quantity: data.quantity,
      my_price: data.my_price,
      retail_price: data.my_price, // keep column satisfied
      volume_points: data.volume_points || 0,
      comments: data.comments || null,
    };

    if (editItem) {
      const { error } = await supabase.from('inventory').update(payload).eq('id', editItem.id);
      if (error) { toast({ title: 'Update failed', description: error.message, variant: 'destructive' }); return; }
      toast({ title: 'Item updated' });
    } else {
      const { error } = await supabase.from('inventory').insert(payload);
      if (error) { toast({ title: 'Add failed', description: error.message, variant: 'destructive' }); return; }
      toast({ title: 'Item added to inventory' });
    }
    setAddOpen(false);
    setEditItem(null);
    resetForm();
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

  // Totals from filtered items
  const totalQty = filteredItems.reduce((a, i) => a + i.quantity, 0);
  const totalCost = filteredItems.reduce((a, i) => a + i.my_price * i.quantity, 0);
  const totalVP = filteredItems.reduce((a, i) => a + (i.volume_points ?? 0) * i.quantity, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Inventory</h1>
          <p className="text-muted-foreground text-sm">Stock management</p>
        </div>
        <Dialog open={addOpen} onOpenChange={(v) => { setAddOpen(v); if (!v) { setEditItem(null); resetForm(); } }}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" />Add Item</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editItem ? 'Edit Item' : 'Add Inventory Item'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
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

              {/* Product search */}
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

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>My Price (₹) <span className="text-xs text-muted-foreground font-normal"></span></Label>
                  <Input type="number" step="0.01" {...register('my_price')} />
                  {errors.my_price && <p className="text-xs text-destructive">{errors.my_price.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Volume Points <span className="text-xs text-muted-foreground font-normal"></span></Label>
                  <Input type="number" step="0.01" {...register('volume_points')} />
                </div>
              </div>

              {/* Live totals */}
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
              <Button variant="outline" size="sm" onClick={() => { setFilterDateFrom(''); setFilterDateTo(''); }}>
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Quantity</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{totalQty}</p><p className="text-xs text-muted-foreground">units purchased</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Cost</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{formatCurrency(totalCost)}</p><p className="text-xs text-muted-foreground">amount spent</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Volume Points</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-purple-600">{totalVP.toFixed(2)} VP</p><p className="text-xs text-muted-foreground">accumulated VP</p></CardContent>
        </Card>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : (
        <Card>
          <CardContent className="p-0">
            {filteredItems.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                {items.length === 0 ? 'No inventory items yet. Add your first item.' : 'No items match the selected date range.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">My Price</TableHead>
                      <TableHead className="text-right">Total Cost</TableHead>
                      <TableHead className="text-right">VP/unit</TableHead>
                      <TableHead className="text-right">Total VP</TableHead>
                      <TableHead>Comments</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="text-sm">{formatDate(item.date)}</TableCell>
                        <TableCell className="text-sm font-medium max-w-[160px] truncate">{item.product_name}</TableCell>
                        <TableCell className="text-right text-sm">{item.quantity}</TableCell>
                        <TableCell className="text-right text-sm">{formatCurrency(item.my_price)}</TableCell>
                        <TableCell className="text-right text-sm font-medium">{formatCurrency(item.my_price * item.quantity)}</TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">{item.volume_points ?? 0}</TableCell>
                        <TableCell className="text-right text-sm text-purple-600 font-medium">{((item.volume_points ?? 0) * item.quantity).toFixed(2)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[120px] truncate">{item.comments ?? '-'}</TableCell>
                        <TableCell>
                          <div className="flex gap-1 justify-end">
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleEdit(item)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleDelete(item.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={2} className="font-bold">Total</TableCell>
                      <TableCell className="text-right font-bold">{totalQty}</TableCell>
                      <TableCell />
                      <TableCell className="text-right font-bold">{formatCurrency(totalCost)}</TableCell>
                      <TableCell />
                      <TableCell className="text-right font-bold text-purple-600">{totalVP.toFixed(2)}</TableCell>
                      <TableCell colSpan={2} />
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
