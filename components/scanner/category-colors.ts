// Shared category color classes for the scanner

export const CATEGORY_COLORS = [
  'amber', 'blue', 'green', 'red', 'purple', 'cyan', 'pink', 'orange', 'slate',
] as const;

export type CategoryColor = (typeof CATEGORY_COLORS)[number];

/** Tailwind class fragments for each color — works in both light and dark */
export const COLOR_CLASSES: Record<string, {
  text: string;
  bg: string;
  border: string;
  dot: string;
  badge: string;
  headerBg: string;
  headerText: string;
  accent: string;
}> = {
  amber:  { text: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/30',  dot: 'bg-amber-500',  badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20', headerBg: 'bg-amber-500/5',  headerText: 'text-amber-400',  accent: 'text-amber-500' },
  blue:   { text: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/30',   dot: 'bg-blue-500',   badge: 'bg-blue-500/10 text-blue-400 border-blue-500/20',   headerBg: 'bg-blue-500/5',   headerText: 'text-blue-400',   accent: 'text-blue-500' },
  green:  { text: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/30',  dot: 'bg-green-500',  badge: 'bg-green-500/10 text-green-400 border-green-500/20',  headerBg: 'bg-green-500/5',  headerText: 'text-green-400',  accent: 'text-green-500' },
  red:    { text: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/30',    dot: 'bg-red-500',    badge: 'bg-red-500/10 text-red-400 border-red-500/20',    headerBg: 'bg-red-500/5',    headerText: 'text-red-400',    accent: 'text-red-500' },
  purple: { text: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/30', dot: 'bg-purple-500', badge: 'bg-purple-500/10 text-purple-400 border-purple-500/20', headerBg: 'bg-purple-500/5', headerText: 'text-purple-400', accent: 'text-purple-500' },
  cyan:   { text: 'text-cyan-400',   bg: 'bg-cyan-500/10',   border: 'border-cyan-500/30',   dot: 'bg-cyan-500',   badge: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',   headerBg: 'bg-cyan-500/5',   headerText: 'text-cyan-400',   accent: 'text-cyan-500' },
  pink:   { text: 'text-pink-400',   bg: 'bg-pink-500/10',   border: 'border-pink-500/30',   dot: 'bg-pink-500',   badge: 'bg-pink-500/10 text-pink-400 border-pink-500/20',   headerBg: 'bg-pink-500/5',   headerText: 'text-pink-400',   accent: 'text-pink-500' },
  orange: { text: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30', dot: 'bg-orange-500', badge: 'bg-orange-500/10 text-orange-400 border-orange-500/20', headerBg: 'bg-orange-500/5', headerText: 'text-orange-400', accent: 'text-orange-500' },
  slate:  { text: 'text-slate-400',  bg: 'bg-slate-500/10',  border: 'border-slate-500/30',  dot: 'bg-slate-500',  badge: 'bg-slate-500/10 text-slate-400 border-slate-500/20',  headerBg: 'bg-slate-500/5',  headerText: 'text-slate-400',  accent: 'text-slate-500' },
};

export function getColorClasses(color: string) {
  return COLOR_CLASSES[color] || COLOR_CLASSES.amber;
}
