# Herbalife Sales & Revenue Management Platform

## Tech Stack

- **Frontend:** Next.js 14 (App Router), Tailwind CSS, shadcn/ui
- **Backend/DB:** Supabase (Auth, PostgreSQL, Row Level Security)
- **Auth:** Supabase Auth with Google OAuth + email/password
- **Scraping:** Cheerio + node-cron (server-side, cache prices in Supabase)
- **Deployment:** Vercel

---

## 1. Authentication

### 1.1 Sign Up Page (`/signup`)

- Fields: First Name, Last Name, Email, Confirm Email, Password, Confirm Password
- Client-side validation (emails match, password min 8 chars)
- On submit → `supabase.auth.signUp()` + insert profile row into `profiles` table with first_name, last_name
- "Sign up with Google" button → `supabase.auth.signInWithOAuth({ provider: 'google' })`
- Redirect to `/dashboard` on success

### 1.2 Login Page (`/login`)

- Fields: Email, Password
- "Login with Google" button
- On submit → `supabase.auth.signInWithPassword()`
- Redirect to `/dashboard` on success

### 1.3 Session Persistence

- Configure Supabase client with `persistSession: true`
- Set session expiry to **7+ days** (configure in Supabase dashboard → Auth → Settings → JWT expiry = 604800 seconds or more)
- Use `supabase.auth.onAuthStateChange()` listener in a global provider to auto-refresh tokens
- Wrap all authenticated pages in a middleware that redirects to `/login` if no session

### 1.4 Logout

- Logout button in the sidebar/navbar on every authenticated page
- Calls `supabase.auth.signOut()` → redirect to `/login`

---

## 2. Supabase Database Schema

```sql
-- Profiles (extends Supabase auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Scraped Herbalife products (cached)
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  retail_price NUMERIC(10,2) NOT NULL,
  image_url TEXT,
  source_url TEXT,
  volume_points NUMERIC(10,2) DEFAULT 0,
  last_scraped_at TIMESTAMPTZ DEFAULT now()
);

-- Product Inventory (manager's stock)
CREATE TABLE inventory (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  product_id INTEGER REFERENCES products(id),
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  my_price NUMERIC(10,2) NOT NULL,
  retail_price NUMERIC(10,2) NOT NULL,
  profit NUMERIC(10,2) GENERATED ALWAYS AS (retail_price - my_price) STORED,
  volume_points NUMERIC(10,2) DEFAULT 0,
  comments TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Retail Sales (product revenue)
CREATE TABLE sales (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  customer_name TEXT NOT NULL,
  reference TEXT,
  product_id INTEGER REFERENCES products(id),
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  my_price NUMERIC(10,2) NOT NULL,
  retail_price NUMERIC(10,2) NOT NULL,
  profit NUMERIC(10,2) GENERATED ALWAYS AS (retail_price - my_price) STORED,
  volume_points NUMERIC(10,2) DEFAULT 0,
  comments TEXT,
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'done')),
  payment_method TEXT CHECK (payment_method IN ('online', 'cash', NULL)),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Center customer fixed-price items
CREATE TABLE center_menu (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,          -- e.g. "Shake", "Afresh", "Combo"
  fixed_price NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Center customer sales
CREATE TABLE center_sales (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  customer_name TEXT NOT NULL,
  reference TEXT,
  product_name TEXT NOT NULL,       -- matches center_menu.item_name
  quantity INTEGER NOT NULL DEFAULT 1,
  fixed_price NUMERIC(10,2) NOT NULL,
  volume_points NUMERIC(10,2) DEFAULT 0,
  comments TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE center_menu ENABLE ROW LEVEL SECURITY;
ALTER TABLE center_sales ENABLE ROW LEVEL SECURITY;

-- RLS Policies: users can only access their own data
CREATE POLICY "Users manage own profile" ON profiles FOR ALL USING (auth.uid() = id);
CREATE POLICY "Products are public read" ON products FOR SELECT USING (true);
CREATE POLICY "Users manage own inventory" ON inventory FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own sales" ON sales FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own center_menu" ON center_menu FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own center_sales" ON center_sales FOR ALL USING (auth.uid() = user_id);
```

---

## 3. Product Scraping & Display

### 3.1 Scraper (API Route: `/api/scrape-products`)

- Use Cheerio to scrape all products from `https://www.herbalife.com/en-in` product pages
- Extract: product name, retail price (INR), image URL, category, product page URL
- Upsert into `products` table (match on name)
- Run on a cron schedule (daily) via Vercel Cron or a manual trigger button in admin
- If Herbalife blocks scraping, fall back to manual CSV upload for product data

### 3.2 Products Page (`/dashboard/products`)

- Display all products from `products` table in a responsive card grid
- Each card shows: image, name, category, retail price
- **Search bar** at top — filters products by name (client-side filter or Supabase `ilike` query)
- Optional: category filter dropdown

---

## 4. Product Revenue / Sales Page (`/dashboard/sales`)

### 4.1 Add Sale Form

| Field | Type | Notes |
|---|---|---|
| Date | Date picker | Defaults to today |
| Customer Name | Text input | Required |
| Reference | Text input | Optional |
| Product Name | Searchable dropdown | From `products` table |
| Quantity | Number | Required |
| My Price | Number (₹) | Manager's cost price |
| Retail Price | Number (₹) | Auto-filled from scraped data, editable |
| Comments | Textarea | Optional |
| Profit | Auto-calculated | `retail_price - my_price` (displayed, not editable) |
| Volume Points | Number | Optional |

- On product select, auto-fill retail_price from `products` table
- Save to `sales` table

### 4.2 Sales Table View

- Sortable, filterable data table showing all sales records
- Columns: Date, Customer, Reference, Product, Qty, My Price, Retail Price, Profit, Volume Points, Payment Status, Payment Method, Comments
- Inline edit and delete support
- Filter by date range, customer name, payment status

### 4.3 Customer Payment / Invoice Generator

- **Input:** Type a customer name → auto-suggest from existing sales
- **Output:** A summary report showing:
  - All products purchased by that customer (across all sales records)
  - Total quantity, total retail price, total profit
  - Grand total amount due
- **Payment status toggle:** Mark as "Done" or keep "Pending"
- **Payment method selector:** "Online" or "Cash" (only shown when marking as Done)
- When marked Done, update all related `sales` rows for that customer
- **Report generation:** Show/download a summary: `Total Retail Price - Total My Price = Total Profit`

---

## 5. Product Inventory Page (`/dashboard/inventory`)

### 5.1 Add Inventory Entry Form

| Field | Type | Notes |
|---|---|---|
| Date | Date picker | Defaults to today |
| Product Name | Searchable dropdown | From `products` table |
| Quantity | Number | Required |
| My Price | Number (₹) | What manager paid |
| Retail Price | Number (₹) | Auto-filled from scraped data |
| Comments | Textarea | Optional |
| Profit | Auto-calculated | `retail_price - my_price` |
| Volume Points | Number | Optional |

- Save to `inventory` table

### 5.2 Inventory Table View

- Data table with all inventory entries
- Columns: Date, Product, Qty, My Price, Retail Price, Profit, Volume Points, Comments
- Edit and delete support
- Summary row at bottom: total quantity, total cost, total profit

---

## 6. Center Customer Management Page (`/dashboard/center`)

### 6.1 Fixed Price Menu Management

- A settings panel (modal or collapsible section) where manager can:
  - Add menu items: item name (e.g., "Shake", "Afresh", "Combo") + fixed price
  - Edit existing items' prices
  - Delete items
- Stored in `center_menu` table
- These fixed prices apply uniformly to all center customers

### 6.2 Add Center Sale Form

| Field | Type | Notes |
|---|---|---|
| Date | Date picker | Defaults to today |
| Customer Name | Text input | Required |
| Reference | Text input | Optional |
| Product Name | Dropdown | From `center_menu` items |
| Quantity | Number | Default 1 |
| Price | Auto-filled | From `center_menu.fixed_price` |
| Volume Points | Number | Optional |
| Comments | Textarea | Optional |

- Save to `center_sales` table

### 6.3 Center Sales Table

- Data table with all center sale entries
- Edit and delete support

### 6.4 Center Revenue Reports

- **Daily Revenue:** Select a date → shows total revenue (sum of `fixed_price * quantity`), breakdown by item, number of customers served
- **Monthly Revenue:** Select a month → same breakdown aggregated for the month
- **Shake Counter:** Display count of shakes (or any specific item) sold today and this month
  - Query: `SELECT SUM(quantity) FROM center_sales WHERE product_name = 'Shake' AND date = TODAY / date BETWEEN month_start AND month_end`
- Show as summary cards at the top of the page

---

## 7. App Layout & Navigation

### Sidebar Navigation (visible on all authenticated pages)

```
📊 Dashboard (home/overview)
🛒 Products (scraped product catalog + search)
💰 Sales (product revenue + payment management)
📦 Inventory (stock management)
🏪 Center (center customer management + reports)
⚙️ Settings (profile, logout)
```

### Dashboard Home (`/dashboard`)

- Welcome message with manager's name
- Quick stats cards:
  - Today's sales count & revenue
  - Today's center revenue
  - Total products in inventory
  - Pending payments count
- Recent activity feed (last 5 sales, last 5 center sales)

---

## 8. Environment Variables Needed

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key  # for scraper API route only
```

---

## 9. Setup Instructions

1. Create a Supabase project at https://supabase.com
2. Run the SQL schema above in Supabase SQL Editor
3. Enable Google OAuth in Supabase → Auth → Providers → Google (add Google Client ID & Secret)
4. Set JWT expiry to 604800 (7 days) in Auth → Settings
5. Clone the repo, add `.env.local` with the keys above
6. Run `npm install && npm run dev`
7. Hit `/api/scrape-products` once to populate the products table (or use the admin trigger)

---

## 10. Key Implementation Notes

- All monetary values are in INR (₹)
- Use `react-hook-form` + `zod` for form validation
- Use `@tanstack/react-table` for data tables with sorting, filtering, pagination
- Use `date-fns` for date formatting
- Profit is always computed as `retail_price - my_price` — use a DB generated column so it stays consistent
- The scraper should handle pagination on the Herbalife site and scrape all product categories
- If scraping fails or is blocked, provide a CSV import fallback at `/dashboard/products` so manager can manually upload product data with columns: name, category, retail_price, image_url, volume_points
- All pages must be responsive (mobile-friendly) since the manager may use this on a phone
