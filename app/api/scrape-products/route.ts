import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function POST() {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setAll(cookiesToSet: any[]) {
          cookiesToSet.forEach(({ name, value, options }: { name: string; value: string; options?: unknown }) => cookieStore.set(name, value, options as never));
        },
      },
    }
  );

  try {
    const baseUrl = 'https://www.herbalife.com/en-in';
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
    };

    const response = await fetch(baseUrl, { headers });
    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch Herbalife site: ${response.status}. Use CSV import instead.` },
        { status: 422 }
      );
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const products: Array<{
      name: string;
      category: string | null;
      retail_price: number;
      image_url: string | null;
      source_url: string | null;
    }> = [];

    // Try common selectors for product cards
    $('[class*="product-card"], [class*="product-item"], [data-product], .product').each((_, el) => {
      const name = $(el).find('[class*="product-name"], [class*="title"], h3, h2').first().text().trim();
      const priceText = $(el).find('[class*="price"], .price').first().text().trim();
      const imageUrl = $(el).find('img').first().attr('src') || null;
      const linkHref = $(el).find('a').first().attr('href');
      const sourceUrl = linkHref ? (linkHref.startsWith('http') ? linkHref : `${baseUrl}${linkHref}`) : null;

      const priceMatch = priceText.match(/[\d,]+\.?\d*/);
      const retailPrice = priceMatch ? parseFloat(priceMatch[0].replace(',', '')) : 0;

      if (name && retailPrice > 0) {
        products.push({ name, category: null, retail_price: retailPrice, image_url: imageUrl, source_url: sourceUrl });
      }
    });

    if (products.length === 0) {
      return NextResponse.json(
        { error: 'No products found via scraping. The site may block bots. Use CSV import instead.', count: 0 },
        { status: 422 }
      );
    }

    const { error } = await supabase.from('products').upsert(products, { onConflict: 'name' });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ count: products.length, message: 'Products scraped and saved.' });
  } catch (err: unknown) {
    console.error('Scrape error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Scrape failed. Use CSV import.' },
      { status: 500 }
    );
  }
}
