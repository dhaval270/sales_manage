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
import type { Sale, Product } from '@/types/database';
import { Plus, Pencil, Trash2, Receipt, Search, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

// Multi-product add schema
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
  items: z.array(lineItemSchema).min(1),
});

type SaleForm = z.infer<typeof saleSchema>;

// Single-row edit schema
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

export default function SalesPage() {
  const { toast } = useToast();
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editSale, setEditSale] = useState<Sale | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [invoiceCustomer, setInvoiceCustomer] = useState('');
  const [invoiceOpen, setInvoiceOpen] = useState(false);

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
    defaultValues: { date: format(new Date(), 'yyyy-MM-dd'), customer_name: '', reference: '', items: [emptyItem] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const watchItems = watch('items');

  // Edit form
  const { register: regEdit, handleSubmit: handleEditSubmit, reset: resetEdit, watch: watchEdit, formState: { errors: editErrors } } = useForm<EditForm>({
    resolver: zodResolver(editSchema),
  });
  const editMyPrice = watchEdit('my_price') || 0;
  const editRetailPrice = watchEdit('retail_price') || 0;
  const editQty = watchEdit('quantity') || 1;

  const fetchData = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const [{ data: salesData }, { data: productsData }] = await Promise.all([
      supabase.from('sales').select('*').order('date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('products').select('*').order('name'),
    ]);
    setSales(salesData ?? []);
    setProducts(productsData ?? []);
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
    reset({ date: format(new Date(), 'yyyy-MM-dd'), customer_name: '', reference: '', items: [emptyItem] });
    setProductSearches(['']);
    setOpenDropdownIndex(null);
  };

  const onSubmit = async (data: SaleForm) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const rows = data.items.map((item) => ({
      user_id: user.id,
      date: data.date,
      customer_name: data.customer_name,
      reference: data.reference || null,
      product_name: item.product_name,
      quantity: item.quantity,
      my_price: item.my_price,
      retail_price: item.retail_price,
      volume_points: item.volume_points || 0,
      comments: item.comments || null,
    }));

    const { error } = await supabase.from('sales').insert(rows);
    if (error) { toast({ title: 'Add failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: `${rows.length} sale${rows.length > 1 ? 's' : ''} added` });
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
    setEditOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this sale?')) return;
    const supabase = createClient();
    await supabase.from('sales').delete().eq('id', id);
    toast({ title: 'Sale deleted' });
    fetchData();
  };

  // Invoice
  const invoiceSales = sales.filter((s) => s.customer_name.toLowerCase() === invoiceCustomer.toLowerCase());
  const invoiceTotalRetail = invoiceSales.reduce((a, s) => a + s.retail_price * s.quantity, 0);
  const invoiceTotalMy = invoiceSales.reduce((a, s) => a + s.my_price * s.quantity, 0);
  const invoicePending = invoiceSales.filter((s) => s.payment_status === 'pending');

  const handleMarkPaid = async (method: 'online' | 'cash') => {
    const supabase = createClient();
    await supabase.from('sales').update({ payment_status: 'done', payment_method: method }).in('id', invoicePending.map((s) => s.id));
    toast({ title: 'Payments marked as done' });
    fetchData();
    setInvoiceOpen(false);
    setInvoiceCustomer('');
  };

  const uniqueCustomers = Array.from(new Set(sales.map((s) => s.customer_name)));
  const totalRevenue = filteredSales.reduce((a, s) => a + s.retail_price * s.quantity, 0);
  const totalProfit = filteredSales.reduce((a, s) => a + s.profit * s.quantity, 0);
  const totalVolumePoints = filteredSales.reduce((a, s) => a + (s.volume_points ?? 0) * s.quantity, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Sales</h1>
          <p className="text-muted-foreground text-sm">Product revenue management</p>
        </div>
        <div className="flex gap-2">

          {/* Invoice */}
          <Dialog open={invoiceOpen} onOpenChange={(v) => { setInvoiceOpen(v); if (!v) setInvoiceCustomer(''); }}>
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
                {invoiceCustomer && invoiceSales.length > 0 && (
                  <div className="space-y-3">
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
                          {invoiceSales.map((s) => (
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
                      <div className="flex justify-between"><span>Total Selling</span><span className="font-medium">{formatCurrency(invoiceTotalRetail)}</span></div>
                      <div className="flex justify-between"><span>My Cost</span><span>{formatCurrency(invoiceTotalMy)}</span></div>
                      <div className="flex justify-between font-bold border-t pt-1 mt-1"><span>Profit</span><span className="text-green-600">{formatCurrency(invoiceTotalRetail - invoiceTotalMy)}</span></div>
                    </div>
                    {invoicePending.length > 0 ? (
                      <div>
                        <p className="text-sm font-medium mb-2">{invoicePending.length} pending. Mark as done:</p>
                        <div className="flex gap-2">
                          <Button size="sm" className="flex-1" onClick={() => handleMarkPaid('online')}>Online</Button>
                          <Button size="sm" variant="outline" className="flex-1" onClick={() => handleMarkPaid('cash')}>Cash</Button>
                        </div>
                      </div>
                    ) : (
                      <Badge variant="success" className="w-full justify-center py-1">All payments done</Badge>
                    )}
                  </div>
                )}
                {invoiceCustomer && invoiceSales.length === 0 && <p className="text-muted-foreground text-sm text-center py-4">No sales found for this customer.</p>}
              </div>
            </DialogContent>
          </Dialog>

          {/* Add Sale */}
          <Dialog open={addOpen} onOpenChange={(v) => { setAddOpen(v); if (!v) resetAddForm(); }}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="h-4 w-4" />Add Sale</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Add Sale</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input type="date" {...register('date')} />
                    {errors.date && <p className="text-xs text-destructive">{errors.date.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>Customer Name</Label>
                    <Input placeholder="Customer" {...register('customer_name')} list="cust-list" />
                    <datalist id="cust-list">{uniqueCustomers.map((c) => <option key={c} value={c} />)}</datalist>
                    {errors.customer_name && <p className="text-xs text-destructive">{errors.customer_name.message}</p>}
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

                        {/* Product search */}
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

                        {/* Live totals */}
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

                {/* Grand total when multiple products */}
                {fields.length > 1 && (
                  <div className="bg-primary/5 border border-primary/20 rounded-lg px-4 py-3 flex justify-between items-center">
                    <span className="text-sm font-medium">Grand Total ({fields.length} products)</span>
                    <span className="font-bold text-primary text-base">
                      {formatCurrency((watchItems || []).reduce((a, item) => a + (item.retail_price || 0) * (item.quantity || 1), 0))}
                    </span>
                  </div>
                )}

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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Revenue</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{formatCurrency(totalRevenue)}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Profit</CardTitle></CardHeader><CardContent><p className="text-xl font-bold text-green-600">{formatCurrency(totalProfit)}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Volume Points</CardTitle></CardHeader><CardContent><p className="text-xl font-bold text-purple-600">{totalVolumePoints.toFixed(2)} VP</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Transactions</CardTitle></CardHeader><CardContent><p className="text-xl font-bold">{filteredSales.length}</p></CardContent></Card>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : filteredSales.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No sales found.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">My Price</TableHead>
                    <TableHead className="text-right">My Total</TableHead>
                    <TableHead className="text-right">Selling Price</TableHead>
                    <TableHead className="text-right">Selling Total</TableHead>
                    <TableHead className="text-right">Profit</TableHead>
                    <TableHead className="text-right">VP</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Comments</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSales.map((sale) => (
                    <TableRow key={sale.id}>
                      <TableCell className="text-sm">{formatDate(sale.date)}</TableCell>
                      <TableCell className="text-sm font-medium">{sale.customer_name}</TableCell>
                      <TableCell className="text-sm max-w-[130px] truncate">{sale.product_name}</TableCell>
                      <TableCell className="text-right text-sm">{sale.quantity}</TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">{formatCurrency(sale.my_price)}</TableCell>
                      <TableCell className="text-right text-sm font-medium">{formatCurrency(sale.my_price * sale.quantity)}</TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">{formatCurrency(sale.retail_price)}</TableCell>
                      <TableCell className="text-right text-sm font-medium">{formatCurrency(sale.retail_price * sale.quantity)}</TableCell>
                      <TableCell className="text-right text-sm text-green-600 font-medium">{formatCurrency(sale.profit * sale.quantity)}</TableCell>
                      <TableCell className="text-right text-sm text-purple-600">{((sale.volume_points ?? 0) * sale.quantity).toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge variant={sale.payment_status === 'done' ? 'success' : 'warning'}>{sale.payment_status}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground capitalize">{sale.payment_method ?? '-'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[100px] truncate" title={sale.comments ?? ''}>{sale.comments ?? '-'}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-end">
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleEdit(sale)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleDelete(sale.id)}>
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

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={(v) => { setEditOpen(v); if (!v) setEditSale(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Sale</DialogTitle></DialogHeader>
          <form onSubmit={handleEditSubmit(onEditSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" {...regEdit('date')} />
              </div>
              <div className="space-y-2">
                <Label>Customer Name</Label>
                <Input {...regEdit('customer_name')} list="edit-cust" />
                <datalist id="edit-cust">{uniqueCustomers.map((c) => <option key={c} value={c} />)}</datalist>
                {editErrors.customer_name && <p className="text-xs text-destructive">{editErrors.customer_name.message}</p>}
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input type="number" min={1} {...regEdit('quantity')} />
              </div>
              <div className="space-y-2">
                <Label>Volume Points</Label>
                <Input type="number" step="0.01" {...regEdit('volume_points')} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>My Price (₹) per unit</Label>
                <Input type="number" step="0.01" {...regEdit('my_price')} />
              </div>
              <div className="space-y-2">
                <Label>Selling Price (₹) per unit</Label>
                <Input type="number" step="0.01" {...regEdit('retail_price')} />
              </div>
            </div>
            {/* Live totals */}
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
