import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, formatDate } from '@/lib/utils';
import { DollarSign, Package, ShoppingCart, Clock } from 'lucide-react';
import { format } from 'date-fns';

export default async function DashboardPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const today = format(new Date(), 'yyyy-MM-dd');

  const [
    { data: profile },
    { data: todaySales },
    { data: todayCenterSales },
    { data: inventoryItems },
    { data: pendingSales },
    { data: recentSales },
    { data: recentCenterSales },
  ] = await Promise.all([
    supabase.from('profiles').select('first_name').eq('id', user.id).single(),
    supabase.from('sales').select('retail_price, quantity').eq('user_id', user.id).eq('date', today),
    supabase.from('center_sales').select('fixed_price, quantity').eq('user_id', user.id).eq('date', today),
    supabase.from('inventory').select('quantity').eq('user_id', user.id),
    supabase.from('sales').select('id').eq('user_id', user.id).eq('payment_status', 'pending'),
    supabase.from('sales').select('id, date, customer_name, product_name, retail_price, comments').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
    supabase.from('center_sales').select('id, date, customer_name, product_name, fixed_price').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
  ]);

  const todaySalesRevenue = (todaySales ?? []).reduce((acc, s) => acc + s.retail_price * s.quantity, 0);
  const todayCenterRevenue = (todayCenterSales ?? []).reduce((acc, s) => acc + s.fixed_price * s.quantity, 0);
  const totalInventoryQty = (inventoryItems ?? []).reduce((acc, i) => acc + i.quantity, 0);

  const stats = [
    {
      title: "Today's Sales",
      value: formatCurrency(todaySalesRevenue),
      sub: `${todaySales?.length ?? 0} transactions`,
      icon: DollarSign,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      title: "Today's Center Revenue",
      value: formatCurrency(todayCenterRevenue),
      sub: `${todayCenterSales?.length ?? 0} customers served`,
      icon: ShoppingCart,
      color: 'text-green-600',
      bg: 'bg-green-50',
    },
    {
      title: 'Total Inventory',
      value: totalInventoryQty.toString(),
      sub: 'units in stock',
      icon: Package,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
    },
    {
      title: 'Pending Payments',
      value: (pendingSales?.length ?? 0).toString(),
      sub: 'awaiting payment',
      icon: Clock,
      color: 'text-orange-600',
      bg: 'bg-orange-50',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          Welcome back, {profile?.first_name ?? 'Manager'} 👋
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {format(new Date(), 'EEEE, MMMM d, yyyy')}
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <div className={`p-2 rounded-full ${stat.bg}`}>
                  <Icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground mt-1">{stat.sub}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Recent activity */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Sales</CardTitle>
          </CardHeader>
          <CardContent>
            {recentSales && recentSales.length > 0 ? (
              <div className="space-y-3">
                {recentSales.map((sale) => (
                  <div key={sale.id} className="flex justify-between items-start text-sm">
                    <div>
                      <p className="font-medium">{sale.customer_name}</p>
                      <p className="text-muted-foreground text-xs">{sale.product_name} · {formatDate(sale.date)}</p>
                      {sale.comments && <p className="text-muted-foreground text-xs italic mt-0.5">{sale.comments}</p>}
                    </div>
                    <span className="font-semibold text-green-600 shrink-0 ml-2">{formatCurrency(sale.retail_price)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm text-center py-4">No sales yet today</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Center Sales</CardTitle>
          </CardHeader>
          <CardContent>
            {recentCenterSales && recentCenterSales.length > 0 ? (
              <div className="space-y-3">
                {recentCenterSales.map((sale) => (
                  <div key={sale.id} className="flex justify-between items-center text-sm">
                    <div>
                      <p className="font-medium">{sale.customer_name}</p>
                      <p className="text-muted-foreground text-xs">{sale.product_name} · {formatDate(sale.date)}</p>
                    </div>
                    <span className="font-semibold text-green-600">{formatCurrency(sale.fixed_price)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm text-center py-4">No center sales yet</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
