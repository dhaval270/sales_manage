import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  BarChart3,
  Package,
  ShoppingCart,
  FileText,
  TrendingUp,
  Users,
  Receipt,
  Star,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';

export default async function Home() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect('/dashboard');

  return (
    <div className="min-h-screen bg-white text-gray-900">

      {/* ── Navbar ── */}
      <header className="sticky top-0 z-50 border-b border-gray-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
              <TrendingUp className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold text-gray-900">Herbalife Sales Manager</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="mx-auto max-w-6xl px-6 py-24 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-4 py-1.5 text-xs font-medium text-blue-700 mb-8">
          <Star className="h-3 w-3" />
          Built for Herbalife Nutrition Club Managers
        </div>
        <h1 className="text-5xl font-extrabold tracking-tight text-gray-900 sm:text-6xl leading-tight mb-6">
          Manage your sales,<br />
          <span className="text-blue-600">grow your business</span>
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-gray-500 mb-10">
          Track sales, manage inventory, monitor profits, and generate invoices — all in one place.
          Designed specifically for Herbalife nutrition club managers.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/signup"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-7 py-3.5 text-base font-semibold text-white hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200"
          >
            Start for free <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-7 py-3.5 text-base font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Sign in to dashboard
          </Link>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="border-y border-gray-100 bg-gray-50">
        <div className="mx-auto max-w-6xl px-6 py-12 grid grid-cols-2 sm:grid-cols-4 gap-8 text-center">
          {[
            { label: 'Sales Tracked', value: 'Every ₹' },
            { label: 'Profit Visibility', value: '100%' },
            { label: 'Invoice Generation', value: 'Instant' },
            { label: 'VP Monitoring', value: 'Real-time' },
          ].map((s) => (
            <div key={s.label}>
              <p className="text-3xl font-bold text-blue-600">{s.value}</p>
              <p className="text-sm text-gray-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Everything you need to run your club</h2>
          <p className="text-gray-500 max-w-xl mx-auto">Six powerful modules working together to give you complete control over your Herbalife business.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            {
              icon: ShoppingCart,
              color: 'bg-blue-50 text-blue-600',
              title: 'Sales Management',
              desc: 'Record sales with multiple products per transaction. Track payment status, methods, and generate per-sale invoices with full profit breakdown.',
            },
            {
              icon: Package,
              color: 'bg-emerald-50 text-emerald-600',
              title: 'Inventory Tracking',
              desc: 'Monitor stock levels in real-time. Get alerts when products run low and track inventory value at both cost and retail price.',
            },
            {
              icon: BarChart3,
              color: 'bg-purple-50 text-purple-600',
              title: 'Product Catalog',
              desc: 'Maintain your full product list with my price, retail price, and volume points. Auto-fills prices when adding sales.',
            },
            {
              icon: Receipt,
              color: 'bg-orange-50 text-orange-600',
              title: 'Invoice Generator',
              desc: 'Download professional invoices per customer showing my price, retail price, total cost, total retail, and profit per product.',
            },
            {
              icon: FileText,
              color: 'bg-rose-50 text-rose-600',
              title: 'Period Reports',
              desc: 'Generate detailed sales reports for any date range with revenue, profit, volume points, pending amounts, and customer breakdowns.',
            },
            {
              icon: Users,
              color: 'bg-indigo-50 text-indigo-600',
              title: 'Center & Members',
              desc: 'Track your nutrition club members, attendance, and membership status all in one dedicated module.',
            },
          ].map(({ icon: Icon, color, title, desc }) => (
            <div key={title} className="rounded-2xl border border-gray-100 bg-white p-6 hover:shadow-md transition-shadow">
              <div className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${color} mb-4`}>
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">{title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Why section ── */}
      <section className="bg-gray-50 border-y border-gray-100">
        <div className="mx-auto max-w-6xl px-6 py-24 grid md:grid-cols-2 gap-16 items-center">
          <div>
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Know your profit on every single sale</h2>
            <p className="text-gray-500 mb-8 leading-relaxed">
              Unlike generic tools, this platform is built around the way Herbalife managers actually work —
              with my price vs retail price, volume points, and per-product profit visibility baked in from day one.
            </p>
            <ul className="space-y-3">
              {[
                'Per-product profit breakdown on every invoice',
                'Volume Points (VP) tracked automatically',
                'Pending vs received payment tracking',
                'Multi-product sales in a single transaction',
                'Customer-wide invoice across all their orders',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-gray-700">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: 'Total Revenue', value: '₹1,24,500', color: 'text-blue-600' },
              { label: 'Total Profit', value: '₹38,200', color: 'text-emerald-600' },
              { label: 'Volume Points', value: '842.5 VP', color: 'text-purple-600' },
              { label: 'Pending Amount', value: '₹6,400', color: 'text-orange-500' },
            ].map((card) => (
              <div key={card.label} className="rounded-2xl bg-white border border-gray-100 p-5 shadow-sm">
                <p className="text-xs text-gray-400 mb-2">{card.label}</p>
                <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="mx-auto max-w-6xl px-6 py-24 text-center">
        <div className="rounded-3xl bg-blue-600 px-8 py-16">
          <h2 className="text-3xl font-bold text-white mb-4">Ready to take control of your business?</h2>
          <p className="text-blue-100 mb-8 max-w-lg mx-auto">
            Create your free account and start tracking sales, profits, and inventory in minutes.
          </p>
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 rounded-xl bg-white px-8 py-3.5 text-base font-semibold text-blue-600 hover:bg-blue-50 transition-colors"
          >
            Create free account <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-100 py-8">
        <div className="mx-auto max-w-6xl px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-400">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-600">
              <TrendingUp className="h-3 w-3 text-white" />
            </div>
            <span>Herbalife Sales Manager</span>
          </div>
          <p>Built for Herbalife Nutrition Club Managers</p>
          <div className="flex gap-4">
            <Link href="/login" className="hover:text-gray-700 transition-colors">Sign in</Link>
            <Link href="/signup" className="hover:text-gray-700 transition-colors">Sign up</Link>
          </div>
        </div>
      </footer>

    </div>
  );
}
