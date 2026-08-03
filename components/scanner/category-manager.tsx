'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  FolderPlus, Pencil, Trash2, Check, X, Folder, FolderOpen,
  ArrowRightLeft, Loader2,
} from 'lucide-react';
import { CATEGORY_COLORS, getColorClasses } from './category-colors';

export interface Category {
  id: string;
  name: string;
  color: string;
  tickerCount: number;
}

interface TickerLite {
  id: string;
  ticker: string;
  categoryId: string | null;
}

interface CategoryManagerProps {
  tickers: TickerLite[];
  onCategoriesChanged: () => void;
  onBatchAssign: (categoryId: string, tickerSymbols: string[]) => Promise<void>;
}

export function CategoryManager({ tickers, onCategoriesChanged, onBatchAssign }: CategoryManagerProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('amber');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('amber');

  // Batch assign state
  const [batchMode, setBatchMode] = useState(false);
  const [selectedTickers, setSelectedTickers] = useState<Set<string>>(new Set());
  const [batchCategory, setBatchCategory] = useState<string>('');
  const [assigning, setAssigning] = useState(false);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/scanner/categories');
      if (!res.ok) return;
      const data = await res.json();
      setCategories(data.categories || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) {
      toast.error('Enter a category name');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/scanner/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color: newColor }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Failed to create category');
        return;
      }
      toast.success(`Category "${name}" created`);
      setNewName('');
      setNewColor('amber');
      setShowCreate(false);
      await fetchCategories();
      onCategoriesChanged();
    } catch {
      toast.error('Failed to create category');
    } finally {
      setCreating(false);
    }
  };

  const handleUpdate = async (id: string) => {
    const name = editName.trim();
    if (!name) {
      toast.error('Category name cannot be empty');
      return;
    }
    try {
      const res = await fetch('/api/scanner/categories', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name, color: editColor }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Failed to update');
        return;
      }
      toast.success('Category updated');
      setEditingId(null);
      await fetchCategories();
      onCategoriesChanged();
    } catch {
      toast.error('Failed to update category');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete category "${name}"? Tickers in it will become uncategorized.`)) return;
    try {
      const res = await fetch('/api/scanner/categories', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        toast.error('Failed to delete category');
        return;
      }
      toast.success(`Category "${name}" deleted`);
      await fetchCategories();
      onCategoriesChanged();
    } catch {
      toast.error('Failed to delete category');
    }
  };

  const toggleTicker = (ticker: string) => {
    setSelectedTickers((prev) => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker);
      else next.add(ticker);
      return next;
    });
  };

  const selectAllInCategory = (categoryId: string | null) => {
    const tickersInCat = tickers.filter((t) => t.categoryId === categoryId).map((t) => t.ticker);
    setSelectedTickers((prev) => {
      const next = new Set(prev);
      tickersInCat.forEach((t) => next.add(t));
      return next;
    });
  };

  const selectAll = () => {
    setSelectedTickers(new Set(tickers.map((t) => t.ticker)));
  };

  const clearSelection = () => {
    setSelectedTickers(new Set());
  };

  const handleBatchAssign = async () => {
    if (selectedTickers.size === 0) {
      toast.error('Select at least one ticker');
      return;
    }
    if (!batchCategory) {
      toast.error('Choose a target category');
      return;
    }
    setAssigning(true);
    try {
      const tickerSymbols = Array.from(selectedTickers);
      await onBatchAssign(batchCategory, tickerSymbols);
      // Update local category ticker counts optimistically
      await fetchCategories();
      setSelectedTickers(new Set());
      setBatchMode(false);
      onCategoriesChanged();
    } catch {
      toast.error('Batch assign failed');
    } finally {
      setAssigning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500 py-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading categories...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Category chips bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-slate-500 font-medium mr-1">Categories:</span>
        {categories.length === 0 && !showCreate && (
          <span className="text-xs text-slate-600 italic">No categories yet</span>
        )}
        {categories.map((cat) => {
          const cc = getColorClasses(cat.color);
          return (
            <div
              key={cat.id}
              className={`group flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${cc.badge} text-xs font-medium`}
            >
              <span className={`h-2 w-2 rounded-full ${cc.dot}`} />
              {editingId === cat.id ? (
                <span className="flex items-center gap-1">
                  <input
                    autoFocus
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleUpdate(cat.id)}
                    className="w-24 px-1 py-0 bg-slate-900 border border-slate-700 rounded text-xs text-slate-100 focus:outline-none"
                  />
                  <button onClick={() => handleUpdate(cat.id)} className="text-green-400 hover:text-green-300">
                    <Check className="h-3 w-3" />
                  </button>
                  <button onClick={() => setEditingId(null)} className="text-slate-500 hover:text-slate-300">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ) : (
                <>
                  <span>{cat.name}</span>
                  <span className="opacity-60">({cat.tickerCount})</span>
                  <button
                    onClick={() => {
                      setEditingId(cat.id);
                      setEditName(cat.name);
                      setEditColor(cat.color);
                    }}
                    className="opacity-100 md:opacity-0 md:group-hover:opacity-100 text-slate-500 hover:text-slate-300 transition-opacity"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => handleDelete(cat.id, cat.name)}
                    className="opacity-100 md:opacity-0 md:group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-opacity"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </>
              )}
            </div>
          );
        })}

        {/* Create button */}
        {!showCreate ? (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full border border-slate-700 text-xs text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-colors"
          >
            <FolderPlus className="h-3 w-3" /> New
          </button>
        ) : (
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-full border border-amber-500/30 bg-amber-500/5">
            <input
              autoFocus
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder="Category name"
              className="w-32 px-1 py-0 bg-transparent text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none"
              maxLength={50}
            />
            <div className="flex items-center gap-1">
              {CATEGORY_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setNewColor(c)}
                  className={`h-3.5 w-3.5 rounded-full transition-transform ${getColorClasses(c).dot} ${
                    newColor === c ? 'ring-2 ring-offset-1 ring-offset-slate-900 ring-white scale-110' : 'opacity-60 hover:opacity-100'
                  }`}
                />
              ))}
            </div>
            <button onClick={handleCreate} disabled={creating} className="text-green-400 hover:text-green-300 disabled:opacity-50">
              {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            </button>
            <button onClick={() => { setShowCreate(false); setNewName(''); }} className="text-slate-500 hover:text-slate-300">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Edit-mode color picker */}
      {editingId && (
        <div className="flex items-center gap-2 px-3 py-2 bg-slate-900/50 border border-slate-800 rounded-lg">
          <span className="text-xs text-slate-500">Color:</span>
          {CATEGORY_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setEditColor(c)}
              className={`h-4 w-4 rounded-full transition-transform ${getColorClasses(c).dot} ${
                editColor === c ? 'ring-2 ring-offset-1 ring-offset-slate-900 ring-white scale-110' : 'opacity-60 hover:opacity-100'
              }`}
            />
          ))}
        </div>
      )}

      {/* Batch assign bar */}
      {tickers.length > 0 && categories.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {!batchMode ? (
            <button
              onClick={() => setBatchMode(true)}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg border border-slate-700 text-xs text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-colors"
            >
              <ArrowRightLeft className="h-3.5 w-3.5" />
              Batch Assign
            </button>
          ) : (
            <div className="w-full flex items-center gap-2 flex-wrap p-3 bg-slate-900/50 border border-slate-800 rounded-lg">
              <span className="text-xs text-slate-400 font-medium">
                {selectedTickers.size} selected
              </span>
              <button onClick={selectAll} className="text-xs text-amber-500 hover:text-amber-400">Select all</button>
              <button onClick={clearSelection} className="text-xs text-slate-500 hover:text-slate-300">Clear</button>
              <div className="h-4 w-px bg-slate-700" />
              {/* Quick select by category */}
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => selectAllInCategory(cat.id)}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs ${getColorClasses(cat.color).badge} hover:opacity-80 transition-opacity`}
                >
                  <FolderOpen className="h-3 w-3" />
                  {cat.name}
                </button>
              ))}
              <button onClick={() => selectAllInCategory(null)} className="flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-slate-800 text-slate-400 hover:bg-slate-700 transition-colors">
                <Folder className="h-3 w-3" />
                Uncategorized
              </button>
              <div className="h-4 w-px bg-slate-700" />
              <select
                value={batchCategory}
                onChange={(e) => setBatchCategory(e.target.value)}
                className="px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-slate-100 focus:outline-none focus:border-amber-500/50"
              >
                <option value="">Move to...</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
                <option value="__none">⚠️ Remove from category</option>
              </select>
              <button
                onClick={handleBatchAssign}
                disabled={assigning || selectedTickers.size === 0 || !batchCategory}
                className="flex items-center gap-1 px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {assigning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Assign {selectedTickers.size > 0 ? `(${selectedTickers.size})` : ''}
              </button>
              <button
                onClick={() => { setBatchMode(false); clearSelection(); }}
                className="flex items-center gap-1 px-2 py-1 text-xs text-slate-500 hover:text-slate-300"
              >
                <X className="h-3 w-3" /> Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {/* Batch selection checkboxes overlay on tickers */}
      {batchMode && (
        <div className="flex items-center gap-1 flex-wrap p-2 bg-amber-500/5 border border-amber-500/20 rounded-lg">
          <span className="text-xs text-amber-400/70 mr-2">Click tickers to select:</span>
          {tickers.map((t) => {
            const isSelected = selectedTickers.has(t.ticker);
            const cat = categories.find((c) => c.id === t.categoryId);
            return (
              <button
                key={t.id}
                onClick={() => toggleTicker(t.ticker)}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all ${
                  isSelected
                    ? 'bg-amber-500 text-slate-950'
                    : cat
                      ? `${getColorClasses(cat.color).badge} hover:opacity-80`
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                {isSelected && <Check className="h-3 w-3" />}
                {t.ticker}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
