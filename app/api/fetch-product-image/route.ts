import { NextRequest, NextResponse } from 'next/server';

const SITEMAP_URL = 'https://www.herbalife.com/en-in/products_sitemap.xml';
const CDN_BASE = 'https://www.herbalife.com/dmassets/market-reusable-assets/emea/india/images/canister';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

interface ProductEntry {
  slug: string;
  sku: string;
  name: string; // normalised, space-separated
}

// Module-level cache (per Node.js process / warm serverless instance)
let catalogCache: ProductEntry[] | null = null;
let catalogFetchedAt = 0;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

async function fetchCatalog(): Promise<ProductEntry[]> {
  const now = Date.now();
  if (catalogCache && now - catalogFetchedAt < CACHE_TTL_MS) return catalogCache;

  const res = await fetch(SITEMAP_URL, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Sitemap fetch failed: ${res.status}`);

  const xml = await res.text();
  const pattern = /herbalife\.com\/en-in\/u\/products\/([a-z0-9\-]+)/g;
  const seen = new Set<string>();
  const entries: ProductEntry[] = [];
  let m: RegExpExecArray | null;

  while ((m = pattern.exec(xml)) !== null) {
    const slug = m[1];
    if (seen.has(slug)) continue;
    seen.add(slug);
    const parts = slug.split('-');
    const sku = parts[parts.length - 1];
    // Name = everything before the SKU segment, spaces separated
    const name = parts.slice(0, -1).join(' ');
    entries.push({ slug, sku, name });
  }

  catalogCache = entries;
  catalogFetchedAt = now;
  return entries;
}

function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Score how well two product names match (0 = no match, higher = better)
function matchScore(input: string, candidate: string): number {
  const inWordsArr = normalise(input).split(' ').filter(w => w.length > 2);
  const candWords = normalise(candidate).split(' ').filter(w => w.length > 2);
  let score = 0;
  for (const w of candWords) {
    if (inWordsArr.includes(w)) score += w.length;
    for (const iw of inWordsArr) {
      if (w !== iw && (w.startsWith(iw) || iw.startsWith(w))) {
        score += Math.min(w.length, iw.length) * 0.5;
      }
    }
  }
  return score;
}

function findBestMatch(name: string, catalog: ProductEntry[]): ProductEntry | null {
  let best: ProductEntry | null = null;
  let bestScore = 0;

  for (const entry of catalog) {
    const score = matchScore(name, entry.name);
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }

  // Require score >= 7: prevents single short-word false positives (e.g. "lemon" alone matching wrong product)
  return bestScore >= 7 ? best : null;
}

export async function POST(req: NextRequest) {
  const { name } = await req.json();
  if (!name?.trim()) {
    return NextResponse.json({ imageUrl: null, error: 'Name required' }, { status: 400 });
  }

  try {
    const catalog = await fetchCatalog();
    const match = findBestMatch(name, catalog);

    if (match) {
      // Construct CDN image URL directly — confirmed pattern for all India products
      const imageUrl = `${CDN_BASE}/pc-${match.sku}-in.png`;
      return NextResponse.json({ imageUrl, matchedProduct: match.name });
    }

    return NextResponse.json({
      imageUrl: null,
      error: `No Herbalife India product found matching "${name}". Please enter the image URL manually.`,
    });
  } catch (err) {
    return NextResponse.json(
      { imageUrl: null, error: err instanceof Error ? err.message : 'Failed to search product catalog.' },
      { status: 500 }
    );
  }
}
