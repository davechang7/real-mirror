export interface EyebrowShape {
  id: string;
  name: string;
  bestFor: string[];
  description: string;
  howTo: string;
  avoid: string;
}

export interface EyebrowTip {
  id: string;
  category: 'Shaping' | 'Filling' | 'Growth' | 'Tools' | 'Care';
  title: string;
  description: string;
  icon: string;
}

export const eyebrowShapes: EyebrowShape[] = [
  {
    id: 'grace-kelly',
    name: 'Grace Kelly',
    bestFor: ['Oval', 'Heart', 'Oblong'],
    description:
      'The Refined Soft Arch — inspired by Grace Kelly\'s timeless elegance. A gentle, perfectly tapered curve that softens features without drama. The most universally flattering brow shape ever worn on screen.',
    howTo:
      'Follow your natural brow bone. Place the arch peak about 2/3 of the way from the start of the brow, directly above the outer edge of your iris. The tail should end at a slight downward angle toward the outer corner of your eye.',
    avoid:
      'Avoid making the arch too sharp — keep the angle gradual and soft for Grace Kelly\'s signature gentle curve.',
  },
  {
    id: 'audrey-hepburn',
    name: 'Audrey Hepburn',
    bestFor: ['Round', 'Oval', 'Long'],
    description:
      'The Bold Classic Straight — Audrey Hepburn\'s signature brow that defined Hollywood glamour. Thick, graphic, and nearly horizontal with a subtle upward angle. Strong without being severe — a statement in simplicity.',
    howTo:
      'Keep the brow straight and bold from head to tail with just a gentle upward tilt. Fill in fully and evenly across the entire length to create a thick, intentional appearance. Taper slightly at the tail.',
    avoid:
      'Avoid over-arching — the power of this shape is its bold straightness. Keep the arch minimal and the body thick.',
  },
  {
    id: 'brooke-shields',
    name: 'Brooke Shields',
    bestFor: ['Oval', 'Round', 'Square'],
    description:
      'The Full Natural Power Brow — Brooke Shields redefined beauty standards in the 1980s with brows that were unapologetically full and untamed. This look celebrates natural growth and confident volume.',
    howTo:
      'Let your brows grow naturally for 6-8 weeks. Use a clear or tinted gel to set hairs upward and outward. Fill in only truly sparse areas with light, hair-like strokes. Embrace natural fullness.',
    avoid:
      'Avoid over-grooming or heavy plucking — the natural fullness is the whole point. Resist thinning them out.',
  },
  {
    id: 'elizabeth-taylor',
    name: 'Elizabeth Taylor',
    bestFor: ['Round', 'Square', 'Heart'],
    description:
      'The Dramatic High Arch — Elizabeth Taylor\'s iconic brows were a statement of old Hollywood power. A soaring arch that elongates the eye area and adds commanding definition. Timeless and unforgettable.',
    howTo:
      'Place the arch peak high above the brow bone, directly above the outer edge of your iris. Keep the inner brow relatively flat, then sweep sharply up to the peak. Taper the tail cleanly and precisely.',
    avoid:
      'Avoid this shape if you have a naturally long face — the high arch can make the face appear even more elongated.',
  },
  {
    id: 'cara-delevingne',
    name: 'Cara Delevingne',
    bestFor: ['Square', 'Angular', 'Strong'],
    description:
      'The Modern Full Brow — Cara Delevingne\'s thick, rounded, bushy brows sparked a global trend toward natural fullness. A smooth, consistent curve that softens angular features with effortless cool-girl energy.',
    howTo:
      'Create a gentle, consistent curve following your natural brow bone. No sharp peaks or angles — the curve should flow evenly from start to tail. Fill in to maximize fullness.',
    avoid:
      'Avoid any sharp corners or pointed peaks — Cara\'s brow gets its power from the smooth, rounded curve.',
  },
];

export const eyebrowTips: EyebrowTip[] = [
  // SHAPING
  {
    id: 'shape-1',
    category: 'Shaping',
    title: 'The Pencil Mapping Method',
    description:
      'Hold a pencil vertically at the side of your nose — this marks where your brow should START. Angle it to the outer edge of your iris for the ARCH point. Angle to the outer corner of your eye for where the TAIL should end. Mark these three points lightly before shaping.',
    icon: '✏️',
  },
  {
    id: 'shape-2',
    category: 'Shaping',
    title: 'Go Professional First',
    description:
      "If you've never shaped your brows before, get them professionally threaded or waxed first. Then simply maintain the shape at home by only removing hairs that grow outside the established line. This prevents common self-shaping mistakes.",
    icon: '💈',
  },
  {
    id: 'shape-3',
    category: 'Shaping',
    title: 'Tweeze After a Warm Shower',
    description:
      'Pluck hairs right after a warm shower when pores are open and skin is warm. This makes tweezing less painful, allows more precise removal, and reduces redness.',
    icon: '🚿',
  },
  {
    id: 'shape-4',
    category: 'Shaping',
    title: 'Remove One Hair at a Time',
    description:
      'Step back from the mirror every few hairs to assess symmetry. It\'s very easy to over-pluck when you\'re too close. Use a regular mirror, not a magnifying one.',
    icon: '🔍',
  },
  // FILLING
  {
    id: 'fill-1',
    category: 'Filling',
    title: 'Choose the Right Shade',
    description:
      'For dark hair, choose a product one shade LIGHTER than your hair color. For blonde or light hair, go one shade darker. For gray hair, use taupe or cool light brown. Matching exactly often looks too heavy.',
    icon: '🎨',
  },
  {
    id: 'fill-2',
    category: 'Filling',
    title: 'Use Short, Upward Strokes',
    description:
      "Mimic natural hairs by using short, feathery upward strokes with your pencil or powder brush. Never fill brows in as a solid block — it looks unnatural and ages you. Think 'hair' not 'fill'.",
    icon: '🖊️',
  },
  {
    id: 'fill-3',
    category: 'Filling',
    title: 'Light at the Front, Defined at the Tail',
    description:
      "The inner third of your brow (closest to the nose) should always be the lightest. Apply product there last and with the lightest touch. The arch and tail can be more defined. This creates a natural, gradient effect.",
    icon: '🌅',
  },
  {
    id: 'fill-4',
    category: 'Filling',
    title: 'Brush Through After Every Step',
    description:
      'Use a spoolie to brush through your brows after each layer of product. This blends everything together and softens any harsh lines for a more realistic result.',
    icon: '🪥',
  },
  // GROWTH
  {
    id: 'grow-1',
    category: 'Growth',
    title: 'Castor Oil — The Natural Solution',
    description:
      'Apply a small amount of cold-pressed castor oil to brows every night using a clean mascara wand or fingertip. Rich in ricinoleic acid, it can help stimulate follicles. Be consistent for 6-8 weeks to see results.',
    icon: '🌱',
  },
  {
    id: 'grow-2',
    category: 'Growth',
    title: 'Stop Over-Plucking Now',
    description:
      'Repeatedly plucking the same hairs can permanently damage follicles over time. If you have over-plucked areas, give them at least 8-12 weeks completely untouched. Many hairs will return.',
    icon: '🛑',
  },
  {
    id: 'grow-3',
    category: 'Growth',
    title: 'Peptide Brow Serums Work',
    description:
      'Peptide and biotin-based brow serums (like RapidBrow) can visibly improve thickness and fullness over 4-8 weeks. Apply nightly to completely clean, dry brows for best absorption.',
    icon: '💧',
  },
  // TOOLS
  {
    id: 'tool-1',
    category: 'Tools',
    title: 'The Spoolie Is Your Most Important Tool',
    description:
      "A spoolie (mascara-wand shaped brush) is more important than any brow product. Use it to brush hairs upward before shaping, blend product after filling, and soften any harsh lines. If you only buy one thing, buy this.",
    icon: '🪥',
  },
  {
    id: 'tool-2',
    category: 'Tools',
    title: 'Slanted Tweezers Only',
    description:
      'Slanted tweezers give the most control and precision. Pointed tweezers are harder to control and more likely to cause over-plucking. Tweezerman is the gold standard — their free sharpening service makes them last a lifetime.',
    icon: '🔧',
  },
  {
    id: 'tool-3',
    category: 'Tools',
    title: 'Brow Pencil vs. Powder vs. Pomade',
    description:
      'Pencil: most precise, best for filling in gaps with hair-like strokes. Powder: most natural, best for full brows that need subtle filling. Pomade: most long-lasting, best for dramatic definition or sparse brows.',
    icon: '📦',
  },
  // CARE
  {
    id: 'care-1',
    category: 'Care',
    title: 'Healthy Skin = Healthy Brow Growth',
    description:
      'Gently exfoliate the brow area once a week to remove dead skin that can clog follicles and inhibit growth. Use a soft washcloth or mild chemical exfoliant — never scrub aggressively near the brow area.',
    icon: '✨',
  },
  {
    id: 'care-2',
    category: 'Care',
    title: 'Set with Clear Gel Every Day',
    description:
      'A clear brow gel keeps hairs in place all day without adding color or stiffness. Apply as the last step in your brow routine, brushing hairs upward and slightly outward for a lifted, modern look.',
    icon: '💎',
  },
  {
    id: 'care-3',
    category: 'Care',
    title: 'Remove Makeup Gently',
    description:
      'Always remove brow makeup gently with a cotton pad soaked in micellar water or oil cleanser. Harsh rubbing or pulling at the brow area can cause hairs to fall out over time. Be gentle — these hairs grow slowly.',
    icon: '🌸',
  },
];
