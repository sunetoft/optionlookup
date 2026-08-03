export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

const VALID_COLORS = ['amber', 'blue', 'green', 'red', 'purple', 'cyan', 'pink', 'orange', 'slate'];

/**
 * GET /api/scanner/categories
 * Returns the user's scan categories with ticker counts.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const categories = await prisma.scanCategory.findMany({
    where: { userId: session.user.id },
    include: {
      _count: { select: { scanTickers: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      tickerCount: c._count.scanTickers,
      createdAt: c.createdAt.toISOString(),
    })),
  });
}

/**
 * POST /api/scanner/categories
 * Body: { name: string, color?: string }
 * Creates a new category. Also supports batch operations:
 * Body: { action: 'batch-assign', categoryId: string, tickerIds: string[] }
 *   OR { action: 'batch-assign', categoryId: string, tickers: string[] } (by symbol)
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const body = await req.json();

    // ── Batch Assign ──────────────────────────────────────
    if (body?.action === 'batch-assign') {
      const { categoryId, tickerIds, tickers } = body;

      if (!categoryId) {
        return NextResponse.json({ error: 'categoryId is required' }, { status: 400 });
      }

      // Verify category ownership
      const category = await prisma.scanCategory.findFirst({
        where: { id: categoryId, userId: session.user.id },
      });
      if (!category) {
        return NextResponse.json({ error: 'Category not found' }, { status: 404 });
      }

      // Update by tickerIds or by ticker symbols
      if (Array.isArray(tickerIds) && tickerIds.length > 0) {
        await prisma.scanTicker.updateMany({
          where: { id: { in: tickerIds }, userId: session.user.id },
          data: { categoryId },
        });
      } else if (Array.isArray(tickers) && tickers.length > 0) {
        const upperTickers = tickers.map((t: string) => t.toUpperCase().trim());
        await prisma.scanTicker.updateMany({
          where: { ticker: { in: upperTickers }, userId: session.user.id },
          data: { categoryId },
        });
      } else {
        return NextResponse.json({ error: 'Provide tickerIds or tickers array' }, { status: 400 });
      }

      return NextResponse.json({ message: 'Tickers assigned to category', categoryId });
    }

    // ── Create Category ───────────────────────────────────
    const name = (body?.name ?? '').trim();
    const color = VALID_COLORS.includes(body?.color) ? body.color : 'amber';

    if (!name) {
      return NextResponse.json({ error: 'Category name is required' }, { status: 400 });
    }
    if (name.length > 50) {
      return NextResponse.json({ error: 'Category name must be ≤50 characters' }, { status: 400 });
    }

    // Check duplicate
    const existing = await prisma.scanCategory.findFirst({
      where: { userId: session.user.id, name },
    });
    if (existing) {
      return NextResponse.json({ error: 'Category already exists' }, { status: 409 });
    }

    const category = await prisma.scanCategory.create({
      data: { userId: session.user.id, name, color },
    });

    return NextResponse.json({ category });
  } catch (error: any) {
    console.error('[SCANNER/CATEGORIES] POST error:', error);
    return NextResponse.json({ error: 'Failed to create category' }, { status: 500 });
  }
}

/**
 * PUT /api/scanner/categories
 * Body: { id: string, name?: string, color?: string }
 * Updates a category.
 */
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { id, name, color } = body;

    if (!id) {
      return NextResponse.json({ error: 'Category id is required' }, { status: 400 });
    }

    // Verify ownership
    const existing = await prisma.scanCategory.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    }

    const data: { name?: string; color?: string } = {};
    if (name && name.trim()) data.name = name.trim();
    if (VALID_COLORS.includes(color)) data.color = color;

    const updated = await prisma.scanCategory.update({
      where: { id },
      data,
    });

    return NextResponse.json({ category: updated });
  } catch (error: any) {
    console.error('[SCANNER/CATEGORIES] PUT error:', error);
    return NextResponse.json({ error: 'Failed to update category' }, { status: 500 });
  }
}

/**
 * DELETE /api/scanner/categories
 * Body: { id: string }
 * Deletes a category. Tickers in it get categoryId set to null (SetNull).
 */
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: 'Category id is required' }, { status: 400 });
    }

    // Verify ownership then delete
    const existing = await prisma.scanCategory.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    }

    await prisma.scanCategory.delete({ where: { id } });

    return NextResponse.json({ message: 'Category deleted' });
  } catch (error: any) {
    console.error('[SCANNER/CATEGORIES] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete category' }, { status: 500 });
  }
}
