'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/lib/utils';
import type { Product } from '@/types/database';
import { Search, Upload, Pencil, Check, X, Plus, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Image from 'next/image';

export default function ProductsPage() {
  const { toast } = useToast();
  const [userId, setUserId] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [filtered, setFiltered] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [loading, setLoading] = useState(true);

  // Edit state
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [editPrice, setEditPrice] = useState('');
  const [editVP, setEditVP] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Add product state
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addPrice, setAddPrice] = useState('');
  const [addVP, setAddVP] = useState('');
  const [addCategory, setAddCategory] = useState('');
  const [addImageUrl, setAddImageUrl] = useState('');
  const [adding, setAdding] = useState(false);

  const fetchProducts = async (uid: string) => {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase.from('products').select('*').eq('user_id', uid).order('name');
    setProducts(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUserId(data.user.id);
        fetchProducts(data.user.id);
      }
    });
  }, []);

  useEffect(() => {
    let result = products;
    if (search) result = result.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
    if (categoryFilter) result = result.filter((p) => p.category === categoryFilter);
    setFiltered(result);
  }, [products, search, categoryFilter]);

  const categories = Array.from(new Set(products.map((p) => p.category).filter(Boolean))) as string[];

  const openEdit = (product: Product) => {
    setEditProduct(product);
    setEditPrice(product.retail_price.toString());
    setEditVP(product.volume_points.toString());
    setEditCategory(product.category ?? '');
  };

  const handleSaveEdit = async () => {
    if (!editProduct || !userId) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from('products')
      .update({
        retail_price: parseFloat(editPrice) || editProduct.retail_price,
        volume_points: parseFloat(editVP) || 0,
        category: editCategory || null,
      })
      .eq('id', editProduct.id)
      .eq('user_id', userId);
    setSaving(false);
    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Product updated' });
      setEditProduct(null);
      fetchProducts(userId);
    }
  };

  const handleDelete = async () => {
    if (!editProduct || !userId) return;
    setDeleting(true);
    const supabase = createClient();
    const { error } = await supabase.from('products').delete().eq('id', editProduct.id).eq('user_id', userId);
    setDeleting(false);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Product removed' });
      setEditProduct(null);
      fetchProducts(userId);
    }
  };

  const handleAddProduct = async () => {
    if (!addName.trim()) {
      toast({ title: 'Name required', description: 'Please enter a product name.', variant: 'destructive' });
      return;
    }
    if (!userId) return;
    setAdding(true);
    const supabase = createClient();
    const { error } = await supabase.from('products').insert({
      user_id: userId,
      name: addName.trim(),
      retail_price: parseFloat(addPrice) || 0,
      volume_points: parseFloat(addVP) || 0,
      category: addCategory.trim() || null,
      image_url: addImageUrl.trim() || null,
    });
    setAdding(false);
    if (error) {
      toast({ title: 'Add failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Product added' });
      setAddOpen(false);
      setAddName(''); setAddPrice(''); setAddVP(''); setAddCategory(''); setAddImageUrl('');
      fetchProducts(userId);
    }
  };

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!userId) return;
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',').map((h) => h.trim());
    const rows = lines.slice(1).map((line) => {
      const vals = line.split(',').map((v) => v.trim());
      return Object.fromEntries(headers.map((h, i) => [h, vals[i]]));
    });
    const supabase = createClient();
    const prods = rows.map((r) => ({
      user_id: userId,
      name: r.name,
      category: r.category || null,
      retail_price: parseFloat(r.my_price) || 0,
      image_url: r.image_url || null,
      volume_points: parseFloat(r.volume_points) || 0,
    }));
    const { error } = await supabase.from('products').upsert(prods, { onConflict: 'name' });
    if (error) {
      toast({ title: 'Upload failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Products imported', description: `${prods.length} products uploaded.` });
      fetchProducts(userId);
    }
    e.target.value = '';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Products</h1>
          <p className="text-muted-foreground text-sm">Herbalife product catalog</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={() => setAddOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Product
          </Button>
          <label className="cursor-pointer">
            <Button variant="outline" className="gap-2" asChild>
              <span><Upload className="h-4 w-4" />Import CSV</span>
            </Button>
            <input type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
          </label>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search products..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select
          className="h-10 rounded-md border border-input bg-background px-3 text-sm min-w-[160px]"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="">All categories</option>
          {categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <div className="h-40 bg-muted rounded-t-lg" />
              <CardContent className="p-4 space-y-2">
                <div className="h-4 bg-muted rounded w-3/4" />
                <div className="h-3 bg-muted rounded w-1/2" />
                <div className="h-4 bg-muted rounded w-1/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          {products.length === 0 ? (
            <>
              <p className="text-muted-foreground">No products yet. Use &quot;Add Product&quot; or &quot;Import CSV&quot; to get started.</p>
              <div className="inline-block text-left bg-muted rounded-md px-4 py-3">
                <p className="text-xs text-muted-foreground mb-1 font-medium">CSV format:</p>
                <code className="text-xs text-foreground">name, category, my_price, image_url, volume_points</code>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground">No products match your search.</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((product) => (
            <Card key={product.id} className="overflow-hidden hover:shadow-md transition-shadow group">
              <div className="relative h-40 bg-muted">
                {product.image_url ? (
                  <Image src={product.image_url} alt={product.name} fill className="object-cover" unoptimized />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <Image src="/herbalife-logo.png" alt="Herbalife" width={64} height={64} className="object-contain opacity-40" />
                  </div>
                )}
                <button
                  onClick={() => openEdit(product)}
                  className="absolute top-2 right-2 bg-white rounded-full p-1.5 shadow opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-50"
                  title="Edit product"
                >
                  <Pencil className="h-3.5 w-3.5 text-gray-600" />
                </button>
              </div>
              <CardContent className="p-4">
                <p className="font-medium text-sm line-clamp-2 mb-2">{product.name}</p>
                {product.category && (
                  <Badge variant="secondary" className="mb-2 text-xs">{product.category}</Badge>
                )}
                <div className="flex items-center justify-between mt-2">
                  <span className="font-bold text-primary" title="My Price">{formatCurrency(product.retail_price)}</span>
                  {product.volume_points > 0 && (
                    <span className="text-xs text-muted-foreground">{product.volume_points} VP</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground text-right">
        {filtered.length} of {products.length} products
      </p>

      {/* Add Product Dialog */}
      <Dialog open={addOpen} onOpenChange={(v) => { if (!v) setAddOpen(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Product</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Product Name <span className="text-destructive">*</span></Label>
              <Input
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="e.g. Formula 1 Shake"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>My Price (₹)</Label>
              <Input
                type="number"
                step="0.01"
                value={addPrice}
                onChange={(e) => setAddPrice(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label>Volume Points</Label>
              <Input
                type="number"
                step="0.01"
                value={addVP}
                onChange={(e) => setAddVP(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Input
                value={addCategory}
                onChange={(e) => setAddCategory(e.target.value)}
                placeholder="e.g. Meal Replacement"
                list="add-cat-suggestions"
              />
              <datalist id="add-cat-suggestions">
                {categories.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div className="space-y-2">
              <Label>Image URL <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input
                value={addImageUrl}
                onChange={(e) => setAddImageUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button className="gap-2" onClick={handleAddProduct} disabled={adding}>
                <Plus className="h-4 w-4" />
                {adding ? 'Adding...' : 'Add Product'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Product Dialog */}
      <Dialog open={!!editProduct} onOpenChange={(v) => { if (!v) setEditProduct(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Product</DialogTitle>
          </DialogHeader>
          {editProduct && (
            <div className="space-y-4">
              <p className="text-sm font-medium text-muted-foreground line-clamp-2">{editProduct.name}</p>

              <div className="space-y-2">
                <Label>My Price (₹)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label>Volume Points</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editVP}
                  onChange={(e) => setEditVP(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Category</Label>
                <Input
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  placeholder="e.g. Meal Replacement"
                  list="cat-suggestions"
                />
                <datalist id="cat-suggestions">
                  {categories.map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>

              <div className="flex gap-2 justify-between">
                <Button
                  variant="destructive"
                  className="gap-2"
                  onClick={handleDelete}
                  disabled={deleting || saving}
                >
                  <Trash2 className="h-4 w-4" />
                  {deleting ? 'Removing...' : 'Remove'}
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" className="gap-2" onClick={() => setEditProduct(null)}>
                    <X className="h-4 w-4" />Cancel
                  </Button>
                  <Button className="gap-2" onClick={handleSaveEdit} disabled={saving || deleting}>
                    <Check className="h-4 w-4" />
                    {saving ? 'Saving...' : 'Save'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
