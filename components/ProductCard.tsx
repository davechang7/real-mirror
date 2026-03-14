import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Product } from '@/data/products';
import { C, GRAD } from '@/constants/theme';

// Category accent colors for the placeholder thumbnail
const CAT_COLOR: Record<string, string> = {
  Cleanser:        '#4ECDC4',
  Serum:           '#A78BFA',
  Essence:         '#818CF8',
  Moisturizer:     '#60A5FA',
  Sunscreen:       '#FBBF24',
  Exfoliant:       '#F87171',
  Treatment:       '#34D399',
  Mask:            '#38BDF8',
  Toner:           '#C084FC',
  Pencil:          '#D4A5A5',
  Kit:             '#C4A882',
  'Growth Serum':  '#6EE7B7',
  Tool:            '#9CA3AF',
  'Setting Gel':   '#93C5FD',
};

function ProductThumb({ product }: { product: Product }) {
  const [imgError, setImgError] = useState(false);
  const accentColor = CAT_COLOR[product.category] ?? '#888888';

  // Brand initials (up to 2 chars)
  const initials = product.brand
    .split(' ')
    .filter(w => w.length > 0)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('');

  // Category label (truncated)
  const catLabel = product.category.length > 9
    ? product.category.slice(0, 8) + '…'
    : product.category;

  if (product.imageUrl && !imgError) {
    return (
      <View style={styles.thumbFrame}>
        <Image
          source={{ uri: product.imageUrl }}
          style={styles.thumbImg}
          resizeMode="contain"
          onError={() => setImgError(true)}
        />
      </View>
    );
  }

  // Placeholder: category-colored initials on elevated card bg
  return (
    <View style={[styles.thumbFrame, styles.thumbPlaceholder]}>
      <Text style={[styles.thumbInitials, { color: accentColor }]}>{initials}</Text>
      <View style={[styles.thumbCatDot, { backgroundColor: accentColor + '55' }]} />
      <Text style={[styles.thumbCatLabel, { color: accentColor + 'BB' }]}>{catLabel}</Text>
    </View>
  );
}

function StarRating({ stars, reviews }: { stars: number; reviews: string }) {
  const full = Math.floor(stars);
  const half = stars % 1 >= 0.5;
  const empty = 5 - full - (half ? 1 : 0);

  return (
    <View style={styles.starRow}>
      {Array(full).fill(0).map((_, i) => (
        <Ionicons key={`f${i}`} name="star" size={11} color={C.star} />
      ))}
      {half && <Ionicons name="star-half" size={11} color={C.star} />}
      {Array(empty).fill(0).map((_, i) => (
        <Ionicons key={`e${i}`} name="star-outline" size={11} color={C.star} />
      ))}
      <Text style={styles.starScore}>{stars.toFixed(1)}</Text>
      <Text style={styles.reviewCount}>({reviews})</Text>
    </View>
  );
}

export function ProductCard({ product }: { product: Product }) {
  return (
    <View style={styles.card}>
      {/* Top row: thumbnail + header info */}
      <View style={styles.topRow}>
        <ProductThumb product={product} />

        <View style={styles.topContent}>
          {/* Brand + badge */}
          <View style={styles.brandRow}>
            <Text style={styles.brand} numberOfLines={1}>
              {product.brand.toUpperCase()}
            </Text>
            {product.badge && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{product.badge}</Text>
              </View>
            )}
          </View>

          {/* Product name */}
          <Text style={styles.name} numberOfLines={2}>{product.name}</Text>

          {/* Category pill + price */}
          <View style={styles.meta}>
            <View style={styles.categoryPill}>
              <Text style={styles.categoryText}>{product.category}</Text>
            </View>
            <Text style={styles.price}>{product.price}</Text>
          </View>

          {/* Stars */}
          {product.stars != null && (
            <StarRating stars={product.stars} reviews={product.reviews ?? ''} />
          )}
        </View>
      </View>

      {/* Description */}
      <Text style={styles.description}>{product.description}</Text>

      {/* Amazon button */}
      <TouchableOpacity
        onPress={() => Linking.openURL(product.url)}
        activeOpacity={0.85}
        style={styles.amazonWrap}
      >
        <LinearGradient
          colors={GRAD.amazon}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.amazonBtn}
        >
          <Ionicons name="logo-amazon" size={15} color="#0A0600" />
          <Text style={styles.amazonText}>View on Amazon</Text>
          <Ionicons name="arrow-forward" size={13} color="rgba(0,0,0,0.35)" />
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: C.border,
  },

  // ─── Top row ───────────────────────────────────────
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },

  // ─── Thumbnail ─────────────────────────────────────
  thumbFrame: {
    width: 76,
    height: 76,
    borderRadius: 12,
    overflow: 'hidden',
    flexShrink: 0,
    backgroundColor: '#F0EDE8', // warm off-white — suits beauty product photography
  },
  thumbImg: {
    width: 76,
    height: 76,
  },
  thumbPlaceholder: {
    backgroundColor: C.cardElev,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  thumbInitials: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -1,
  },
  thumbCatDot: {
    width: 20,
    height: 2,
    borderRadius: 1,
  },
  thumbCatLabel: {
    fontSize: 7.5,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },

  // ─── Header content (right of thumb) ───────────────
  topContent: { flex: 1 },
  brandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 3,
  },
  brand: {
    color: C.text3,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    flex: 1,
    marginRight: 8,
  },
  name: {
    color: C.text,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    letterSpacing: -0.2,
    marginBottom: 7,
  },

  badge: {
    backgroundColor: C.goldBg,
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: C.goldBorder,
    flexShrink: 0,
  },
  badgeText: { color: C.gold, fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },

  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  categoryPill: {
    backgroundColor: C.cardElev,
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: C.borderMed,
  },
  categoryText: { color: C.text2, fontSize: 10, fontWeight: '500' },
  price: { color: C.green, fontSize: 12, fontWeight: '700' },

  starRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  starScore: { color: C.star, fontSize: 11, fontWeight: '700', marginLeft: 2 },
  reviewCount: { color: C.text3, fontSize: 10, marginLeft: 1 },

  // ─── Body ───────────────────────────────────────────
  description: {
    color: C.text2,
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 14,
  },

  // ─── Amazon button ──────────────────────────────────
  amazonWrap: { borderRadius: 12, overflow: 'hidden' },
  amazonBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  amazonText: {
    color: '#0A0600',
    fontSize: 14,
    fontWeight: '800',
    flex: 1,
    letterSpacing: 0.1,
  },
});
