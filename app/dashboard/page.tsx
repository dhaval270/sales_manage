import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, formatDate } from '@/lib/utils';
import { DollarSign, Package, ShoppingCart, Clock, Cake, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';

export default async function DashboardPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const now = new Date();
  const today = format(now, 'yyyy-MM-dd');

  // Birthday window: today → 2 days ahead (month-day only)
  const birthdayWindow = [0, 1, 2].map((offset) => {
    const d = new Date(now);
    d.setDate(d.getDate() + offset);
    return { mmdd: format(d, 'MM-dd'), label: offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : 'In 2 days' };
  });

  const [
    { data: profile },
    { data: todaySales },
    { data: inventoryItems },
    { data: pendingSales },
    { data: recentSales },
    { data: recentCenterSales },
    { data: allCustomers },
    { data: allMemberships },
    { data: allVisits },
    { data: todayMemberships },
  ] = await Promise.all([
    supabase.from('profiles').select('first_name').eq('id', user.id).single(),
    supabase.from('sales').select('retail_price, quantity').eq('user_id', user.id).eq('date', today),
    supabase.from('inventory').select('quantity').eq('user_id', user.id),
    supabase.from('sales').select('retail_price, quantity').eq('user_id', user.id).eq('payment_status', 'pending'),
    supabase.from('sales').select('id, date, customer_name, product_name, retail_price, comments').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
    supabase.from('center_sales').select('id, date, customer_name, product_name, fixed_price').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
    supabase.from('customers').select('id, full_name, phone, date_of_birth').eq('user_id', user.id).not('date_of_birth', 'is', null),
    supabase.from('center_memberships').select('id, customer_name, customer_phone, total_shakes').eq('user_id', user.id),
    supabase.from('center_membership_visits').select('membership_id').eq('user_id', user.id),
    supabase.from('center_memberships').select('price').eq('user_id', user.id).eq('start_date', today).eq('payment_status', 'paid'),
  ]);

  // Match customers whose birthday month-day falls in the window
  type BirthdayEntry = { id: number; full_name: string; phone: string | null; date_of_birth: string; label: string; isToday: boolean; age: number };
  const birthdayCustomers: BirthdayEntry[] = (allCustomers ?? [])
    .flatMap((c) => {
      if (!c.date_of_birth) return [];
      const mmdd = c.date_of_birth.slice(5); // "YYYY-MM-DD" → "MM-DD"
      const match = birthdayWindow.find((w) => w.mmdd === mmdd);
      if (!match) return [];
      const birthYear = parseInt(c.date_of_birth.slice(0, 4));
      const age = now.getFullYear() - birthYear;
      return [{ ...c, label: match.label, isToday: match.label === 'Today', age }];
    })
    .sort((a, b) => (b.isToday ? 1 : 0) - (a.isToday ? 1 : 0));

  // Membership renewal reminders
  const visitCounts = (allVisits ?? []).reduce((acc, v) => {
    acc[v.membership_id] = (acc[v.membership_id] ?? 0) + 1;
    return acc;
  }, {} as Record<number, number>);

  const lastShakeMembers = (allMemberships ?? []).filter(m => (m.total_shakes - (visitCounts[m.id] ?? 0)) === 1);

  const todaySalesRevenue = (todaySales ?? []).reduce((acc, s) => acc + s.retail_price * s.quantity, 0);
  const todayCenterRevenue = (todayMemberships ?? []).reduce((acc, m) => acc + m.price, 0);
  const totalInventoryQty = (inventoryItems ?? []).reduce((acc, i) => acc + i.quantity, 0);
  const pendingAmount = (pendingSales ?? []).reduce((acc, s) => acc + s.retail_price * s.quantity, 0);

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
      sub: `${todayMemberships?.length ?? 0} paid membership${(todayMemberships?.length ?? 0) !== 1 ? 's' : ''} today`,
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
      title: 'Pending Amount',
      value: formatCurrency(pendingAmount),
      sub: `${pendingSales?.length ?? 0} pending payment${(pendingSales?.length ?? 0) !== 1 ? 's' : ''}`,
      icon: Clock,
      color: 'text-orange-600',
      bg: 'bg-orange-50',
    },
  ];

  const todayBirthdays = birthdayCustomers.filter(c => c.isToday);
  const pastBirthdays = birthdayCustomers.filter(c => !c.isToday);

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

      {/* Birthday reminders */}
      {birthdayCustomers.length > 0 && (
        <div className={`rounded-xl border p-4 ${todayBirthdays.length > 0 ? 'border-pink-300 bg-pink-50 dark:bg-pink-950/20 dark:border-pink-800' : 'border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800'}`}>
          <div className="flex items-center gap-2 mb-3">
            <Cake className={`h-5 w-5 ${todayBirthdays.length > 0 ? 'text-pink-500' : 'text-orange-400'}`} />
            <p className={`font-semibold text-sm ${todayBirthdays.length > 0 ? 'text-pink-700 dark:text-pink-300' : 'text-orange-700 dark:text-orange-300'}`}>
              {todayBirthdays.length > 0 ? `🎂 ${todayBirthdays.length} Birthday${todayBirthdays.length > 1 ? 's' : ''} Today!` : 'Upcoming Birthdays'}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {birthdayCustomers.map((c) => (
              <div key={c.id} className={`flex items-center gap-3 rounded-lg px-3 py-2 ${c.isToday ? 'bg-pink-100 dark:bg-pink-900/30 border border-pink-200 dark:border-pink-700' : 'bg-white/70 dark:bg-white/5 border border-orange-100 dark:border-orange-800'}`}>
                <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${c.isToday ? 'bg-pink-500 text-white' : 'bg-orange-200 text-orange-700'}`}>
                  {c.full_name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-semibold leading-tight">{c.full_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.isToday ? `Turns ${c.age} today` : `${c.label} · turns ${c.age}`}
                    {' · '}{c.date_of_birth.slice(8, 10)}/{c.date_of_birth.slice(5, 7)}
                    {c.phone && <span> · {c.phone}</span>}
                  </p>
                </div>
                {c.isToday && <span className="text-lg ml-1">🎉</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Membership renewal reminders */}
      {lastShakeMembers.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <p className="font-semibold text-sm text-amber-700 dark:text-amber-300">
              Membership Renewal Reminders
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {lastShakeMembers.map((m) => (
              <div key={m.id} className="flex items-center gap-3 rounded-lg px-3 py-2 bg-amber-100 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700">
                <div className="h-8 w-8 rounded-full bg-amber-400 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                  {m.customer_name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-semibold leading-tight">{m.customer_name}</p>
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    ⚠️ Last shake remaining — remind to renew!
                    {m.customer_phone && <span> · {m.customer_phone}</span>}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
