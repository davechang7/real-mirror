/**
 * Real Mirror — Design System
 * Tiffany: clean white canvas with iconic blue-green teal accents
 */

// ── Backgrounds (light, airy) ──
// ── Tiffany teal accent system ──
// ── Text (high-contrast on white) ──
// ── Semantic ──
export const C = {
  bg:       '#FFFFFF',   // Pure white — main canvas
  surface:  '#F2FDFC',   // Barely-tinted teal surface
  card:     '#FFFFFF',   // Cards (defined by border, not fill)
  cardElev: '#E6F9F7',   // Tinted — inputs, elevated elements

  border:       'rgba(10, 186, 181, 0.12)',
  borderMed:    'rgba(10, 186, 181, 0.24)',
  borderStrong: 'rgba(10, 186, 181, 0.45)',

  // Tiffany teal (maps onto all former "gold" keys)
  gold:       '#0ABAB5',
  goldLight:  '#5DD6D2',
  goldDeep:   '#07908C',
  goldBg:     'rgba(10, 186, 181, 0.08)',
  goldBorder: 'rgba(10, 186, 181, 0.22)',

  text:  '#142423',   // Near-black with teal warmth
  text2: '#4A7A77',   // Readable mid-teal
  text3: '#8ABAB7',   // Muted — labels, placeholders

  green: '#2AADAA',
  red:   '#DC7070',
  star:  '#F0B840',
} as const;

// Gradient pairs for expo-linear-gradient
export const GRAD = {
  gold:   ['#0ABAB5', '#07908C'] as [string, string],
  amazon: ['#FFC040', '#E88800'] as [string, string],
};

// Legacy stubs — keep Expo boilerplate files happy
export const Colors = {
  light: { text: C.text,  background: C.bg, tint: C.gold, icon: C.text2, tabIconDefault: C.text3, tabIconSelected: C.gold },
  dark:  { text: C.text,  background: C.bg, tint: C.gold, icon: C.text2, tabIconDefault: C.text3, tabIconSelected: C.gold },
};
export const Fonts = { regular: 'System', bold: 'System', rounded: 'System', mono: 'System' };
