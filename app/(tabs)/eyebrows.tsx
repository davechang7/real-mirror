import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
  Modal,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { CameraView, useCameraPermissions } from 'expo-camera';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { G, Ellipse, Circle, Line, Text as SvgText } from 'react-native-svg';
import { eyebrowShapes, eyebrowTips, EyebrowShape, EyebrowTip } from '@/data/eyebrows';
import { eyebrowProducts } from '@/data/products';
import { ProductCard } from '@/components/ProductCard';
import { analyzeBrows, BrowAnalysisResult } from '@/services/gemini';
import { C, GRAD } from '@/constants/theme';

type Tab = 'try-on' | 'tips' | 'products' | 'shapes';
type TipCategory = EyebrowTip['category'];
const TIP_CATEGORIES: TipCategory[] = ['Shaping', 'Filling', 'Growth', 'Tools', 'Care'];

// Products to surface in each tip category
const TIP_CATEGORY_PRODUCTS: Record<TipCategory, string[]> = {
  Shaping: ['eb-6'],
  Filling: ['eb-1', 'eb-2', 'eb-4'],
  Growth:  ['eb-5'],
  Tools:   ['eb-6', 'eb-3'],
  Care:    ['eb-7'],
};
const BROW_KEY = 'real-mirror-brow-assessments';

// ─── Helpers ─────────────────────────────────────────────────────

function getProductEmoji(type: string): string {
  const t = type.toLowerCase();
  if (t.includes('pencil') || t.includes('liner'))              return '✏️';
  if (t.includes('pomade'))                                      return '🎨';
  if (t.includes('gel'))                                         return '💧';
  if (t.includes('powder') || t.includes('shadow'))             return '🌫️';
  if (t.includes('serum') || t.includes('oil') || t.includes('growth')) return '🌿';
  if (t.includes('spoolie') || t.includes('brush'))             return '🪥';
  if (t.includes('soap'))                                        return '🧼';
  if (t.includes('tint') || t.includes('dye') || t.includes('henna')) return '🎨';
  if (t.includes('thread') || t.includes('wax') || t.includes('strip')) return '✂️';
  return '✨';
}

function traitIsPositive(key: string, val: string): boolean {
  if (key === 'spacing')   return val === 'ideal';
  if (key === 'thickness') return val === 'thick' || val === 'medium';
  return true;
}

// ─── Pencil Mapping lines for one brow ───────────────────────────
// xs = x at START, xa = x at ARCH, xe = x at END
function BrowMappingLines({
  xs, xa, xe, nostrilX, nostrilY, browY,
}: {
  xs: number; xa: number; xe: number;
  nostrilX: number; nostrilY: number; browY: number;
}) {
  const tickTop = browY - 36;
  const tickBot = browY + 16;
  const labelY  = browY - 44;
  const teal  = C.gold;
  const white = 'rgba(255,255,255,0.85)';

  return (
    <G>
      {/* Guide lines from nostril — more visible for close-up use */}
      <Line x1={nostrilX} y1={nostrilY} x2={xs} y2={tickTop}
        stroke="rgba(255,255,255,0.22)" strokeWidth={1.5} strokeDasharray="6 5" />
      <Line x1={nostrilX} y1={nostrilY} x2={xa} y2={tickTop}
        stroke="rgba(255,255,255,0.22)" strokeWidth={1.5} strokeDasharray="6 5" />
      <Line x1={nostrilX} y1={nostrilY} x2={xe} y2={tickTop}
        stroke="rgba(255,255,255,0.22)" strokeWidth={1.5} strokeDasharray="6 5" />

      {/* Brow baseline */}
      <Line
        x1={Math.min(xs, xe)} y1={browY}
        x2={Math.max(xs, xe)} y2={browY}
        stroke="rgba(255,255,255,0.32)" strokeWidth={2} strokeDasharray="4 3"
      />

      {/* START */}
      <Line x1={xs} y1={tickBot} x2={xs} y2={tickTop}
        stroke={teal} strokeWidth={4.5} strokeLinecap="round" />
      <Circle cx={xs} cy={browY} r={5.5} fill={teal} />
      <SvgText x={xs} y={labelY} fill={teal} fontSize={11} fontWeight="800"
        textAnchor="middle">START</SvgText>

      {/* ARCH */}
      <Line x1={xa} y1={tickBot} x2={xa} y2={tickTop}
        stroke={white} strokeWidth={3} strokeLinecap="round" strokeDasharray="5 3" />
      <Circle cx={xa} cy={browY} r={4} fill={white} />
      <SvgText x={xa} y={labelY} fill={white} fontSize={11} fontWeight="800"
        textAnchor="middle">ARCH</SvgText>

      {/* END */}
      <Line x1={xe} y1={tickBot} x2={xe} y2={tickTop}
        stroke={teal} strokeWidth={4.5} strokeLinecap="round" />
      <Circle cx={xe} cy={browY} r={5.5} fill={teal} />
      <SvgText x={xe} y={labelY} fill={teal} fontSize={11} fontWeight="800"
        textAnchor="middle">END</SvgText>
    </G>
  );
}

// ─── Brow AI Result Sheet ─────────────────────────────────────────
function BrowResultSheet({
  result, justSaved, onClose, onSave, onRescan,
}: {
  result: BrowAnalysisResult;
  justSaved: boolean;
  onClose: () => void;
  onSave: () => void;
  onRescan: () => void;
}) {
  const traits = [
    { key: 'naturalShape', label: result.naturalShape },
    { key: 'archHeight',   label: `${result.archHeight} arch` },
    { key: 'thickness',    label: result.thickness },
    { key: 'spacing',      label: `${result.spacing} set` },
  ];

  return (
    <View style={brs.sheet}>
      <View style={brs.handle} />
      <ScrollView showsVerticalScrollIndicator={false} bounces={false}>

        {/* Header */}
        <View style={brs.header}>
          <View style={brs.headerLeft}>
            <Ionicons name="sparkles" size={12} color={C.gold} />
            <Text style={brs.headerLabel}>AI BROW ANALYSIS</Text>
          </View>
          <View style={brs.headerRight}>
            <TouchableOpacity onPress={onSave} style={brs.iconBtn}>
              <Ionicons
                name={justSaved ? 'bookmark' : 'bookmark-outline'}
                size={17}
                color={justSaved ? C.gold : C.text2}
              />
            </TouchableOpacity>
            <TouchableOpacity onPress={onRescan} style={brs.rescanBtn}>
              <Ionicons name="camera-outline" size={13} color={C.gold} />
              <Text style={brs.rescanText}>Re-scan</Text>
            </TouchableOpacity>
          </View>
        </View>

        {justSaved && (
          <View style={brs.savedBanner}>
            <Ionicons name="checkmark-circle" size={13} color={C.gold} />
            <Text style={brs.savedBannerText}>Analysis saved</Text>
          </View>
        )}

        {/* Summary */}
        <Text style={brs.summary}>{result.summary}</Text>

        {/* Symmetry bar */}
        <View style={brs.symRow}>
          <Text style={brs.symLabel}>SYMMETRY</Text>
          <View style={brs.symBarWrap}>
            <View style={[brs.symBarFill, { width: `${result.symmetryScore}%` as any }]} />
          </View>
          <Text style={brs.symScore}>{result.symmetryScore}%</Text>
        </View>

        {/* Trait chips */}
        <View style={brs.traitRow}>
          {traits.map((t) => {
            const good = traitIsPositive(t.key, t.label.split(' ')[0]);
            return (
              <View key={t.key} style={[brs.traitChip, good ? brs.traitChipPos : brs.traitChipNeu]}>
                <Text style={[brs.traitText, good ? brs.traitTextPos : brs.traitTextNeu]}>
                  {t.label.charAt(0).toUpperCase() + t.label.slice(1)}
                </Text>
              </View>
            );
          })}
        </View>

        <View style={brs.divider} />

        {/* What I notice */}
        <Text style={brs.sectionLabel}>WHAT I NOTICE</Text>
        {result.observations.map((obs, i) => (
          <View key={i} style={brs.obsRow}>
            <View style={brs.obsDot} />
            <Text style={brs.obsText}>{obs}</Text>
          </View>
        ))}

        <View style={brs.divider} />

        {/* Recommended shape */}
        <Text style={brs.sectionLabel}>RECOMMENDED SHAPE</Text>
        <View style={brs.shapeBox}>
          <Ionicons name="sparkles" size={15} color={C.gold} />
          <Text style={brs.shapeBoxText}>{result.recommendedShape}</Text>
        </View>

        <View style={brs.divider} />

        {/* Products */}
        <Text style={brs.sectionLabel}>PRODUCTS TO TRY</Text>
        {result.products.map((p, i) => (
          <View key={i} style={brs.productCard}>
            <Text style={brs.productEmoji}>{getProductEmoji(p.type)}</Text>
            <View style={brs.productInfo}>
              <Text style={brs.productType}>{p.type}</Text>
              <Text style={brs.productReason}>{p.reason}</Text>
            </View>
          </View>
        ))}

        <View style={brs.divider} />

        {/* Pro tips */}
        <Text style={brs.sectionLabel}>PRO TIPS</Text>
        {result.tips.map((tip, i) => (
          <View key={i} style={brs.tipRow}>
            <View style={brs.tipNum}>
              <Text style={brs.tipNumText}>{i + 1}</Text>
            </View>
            <Text style={brs.tipText}>{tip}</Text>
          </View>
        ))}

        <TouchableOpacity style={brs.doneBtn} onPress={onClose} activeOpacity={0.85}>
          <Text style={brs.doneBtnText}>Done</Text>
        </TouchableOpacity>
        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

// ─── Try On Screen ────────────────────────────────────────────────
function TryOnScreen({ onBack }: { onBack: () => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const { width, height } = useWindowDimensions();
  const [browOffset, setBrowOffset]   = useState(0);
  const [scanning, setScanning]       = useState(false);
  const [browResult, setBrowResult]   = useState<BrowAnalysisResult | null>(null);
  const [showResult, setShowResult]   = useState(false);
  const [justSaved, setJustSaved]     = useState(false);
  const cameraRef = useRef<CameraView>(null);

  // ── Face / brow geometry ──────────────────────────────────────
  // Larger oval — sized for close-up selfie (face fills most of frame)
  const ovalW   = Math.min(width * 0.82, 320);
  const ovalH   = ovalW * 1.35;
  const ovalCX  = width  / 2;
  const ovalCY  = height * 0.42;   // slightly lower — face is more centred when close-up
  const eyeSep  = ovalW  * 0.46;
  const eyeY    = ovalCY - ovalH * 0.11;
  const browY   = eyeY   - eyeSep * 0.24 + browOffset;
  const nostrilY = ovalCY + ovalH * 0.16;

  // Brow landmark positions — spread wider for close-up
  const lNostrilX = ovalCX - ovalW * 0.10;
  const lXs = ovalCX - ovalW * 0.10;   // START: inner brow, above nostril
  const lXa = ovalCX - eyeSep * 0.52;  // ARCH: above outer iris edge
  const lXe = ovalCX - eyeSep * 0.70;  // END: above outer eye corner

  const rNostrilX = ovalCX + ovalW * 0.10;
  const rXs = ovalCX + ovalW * 0.10;
  const rXa = ovalCX + eyeSep * 0.52;
  const rXe = ovalCX + eyeSep * 0.70;

  // ── Scan + save ──────────────────────────────────────────────
  const scanBrows = async () => {
    if (!cameraRef.current) return;
    setScanning(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.7 });
      if (!photo?.base64) throw new Error('Could not capture photo. Please try again.');
      const result = await analyzeBrows(photo.base64);
      setBrowResult(result);
      setJustSaved(false);
      setShowResult(true);
    } catch (e: unknown) {
      Alert.alert('Analysis failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setScanning(false);
    }
  };

  const saveAnalysis = async () => {
    if (!browResult) return;
    try {
      const entry = { id: Date.now().toString(), date: new Date().toISOString(), ...browResult };
      const json = await AsyncStorage.getItem(BROW_KEY);
      const list: object[] = json ? JSON.parse(json) : [];
      const updated = [entry, ...list].slice(0, 20);
      await AsyncStorage.setItem(BROW_KEY, JSON.stringify(updated));
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
    } catch {}
  };

  // ── Permission gate ───────────────────────────────────────────
  if (!permission) return <View style={styles.container} />;

  if (!permission.granted) {
    return (
      <View style={[styles.container, styles.centered]}>
        <View style={styles.permIconWrap}>
          <Text style={{ fontSize: 38 }}>👁️</Text>
        </View>
        <Text style={styles.permTitle}>Camera Access Needed</Text>
        <Text style={styles.permText}>
          Allow camera access to overlay brow mapping guides on your face.
        </Text>
        <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
          <LinearGradient colors={GRAD.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.permBtnGrad}>
            <Text style={styles.permBtnText}>Allow Camera</Text>
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity style={styles.permBack} onPress={onBack}>
          <Text style={styles.permBackText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Try On view ──────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {/* Camera */}
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="front" mirror={false} />

      {/* Gradient fades */}
      <LinearGradient colors={['rgba(0,44,42,0.72)', 'transparent']} style={styles.tryOnTopFade} />
      <LinearGradient colors={['transparent', 'rgba(0,44,42,0.97)']} style={styles.tryOnBottomFade} />

      {/* SVG pencil-mapping overlay */}
      <Svg style={StyleSheet.absoluteFill} width={width} height={height}>
        <Ellipse
          cx={ovalCX} cy={ovalCY}
          rx={ovalW / 2} ry={ovalH / 2}
          stroke={`${C.gold}44`} strokeWidth={1.2}
          strokeDasharray="7 5" fill="none"
        />
        <BrowMappingLines
          xs={lXs} xa={lXa} xe={lXe}
          nostrilX={lNostrilX} nostrilY={nostrilY}
          browY={browY}
        />
        <BrowMappingLines
          xs={rXs} xa={rXa} xe={rXe}
          nostrilX={rNostrilX} nostrilY={nostrilY}
          browY={browY}
        />
      </Svg>

      {/* Top bar */}
      <SafeAreaView style={styles.tryOnTopBar}>
        <TouchableOpacity style={styles.tryOnBack} onPress={onBack}>
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>

        <View style={{ alignItems: 'center', gap: 4 }}>
          <Text style={styles.tryOnTitle}>Brow Mapping</Text>
          <Text style={styles.noFaceText}>Align face with oval</Text>
        </View>

        <View style={styles.posAdjuster}>
          <TouchableOpacity style={styles.posBtn}
            onPress={() => setBrowOffset((v) => Math.max(v - 5, -60))}>
            <Ionicons name="chevron-up" size={16} color="rgba(255,255,255,0.75)" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.posBtn}
            onPress={() => setBrowOffset((v) => Math.min(v + 5, 60))}>
            <Ionicons name="chevron-down" size={16} color="rgba(255,255,255,0.75)" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Analyzing overlay */}
      {scanning && (
        <View style={styles.analyzingOverlay}>
          <View style={styles.analyzingCard}>
            <ActivityIndicator size="large" color={C.gold} />
            <Text style={styles.analyzingText}>Analyzing your brows…</Text>
            <Text style={styles.analyzingSubText}>
              Studying shape, symmetry &amp; care needs
            </Text>
          </View>
        </View>
      )}

      {/* Bottom controls */}
      <View style={styles.tryOnControls}>

        {/* AI Scan button */}
        <TouchableOpacity
          style={[styles.scanBrowsBtn, scanning && { opacity: 0.5 }]}
          onPress={browResult ? () => setShowResult(true) : scanBrows}
          disabled={scanning}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={GRAD.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={styles.scanBrowsBtnGrad}
          >
            <Ionicons name="sparkles" size={15} color="#fff" />
            <Text style={styles.scanBrowsBtnText}>
              {browResult ? 'View AI Analysis' : 'AI Brow Analysis'}
            </Text>
            {!browResult && <Ionicons name="arrow-forward" size={14} color="#fff" />}
          </LinearGradient>
        </TouchableOpacity>

        {/* Legend */}
        <Text style={styles.mappingTitle}>Pencil Mapping Method</Text>
        <Text style={styles.mappingDesc}>
          Hold a straight edge from your nostril to find each point. Use these lines as your guide.
        </Text>
        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendLine, { backgroundColor: C.gold }]} />
            <Text style={styles.legendLabel}>Start</Text>
            <Text style={styles.legendSub}>Nostril → up</Text>
          </View>
          <View style={styles.legendDivider} />
          <View style={styles.legendItem}>
            <View style={[styles.legendLine, { backgroundColor: 'rgba(255,255,255,0.65)' }]} />
            <Text style={styles.legendLabel}>Arch</Text>
            <Text style={styles.legendSub}>Through pupil</Text>
          </View>
          <View style={styles.legendDivider} />
          <View style={styles.legendItem}>
            <View style={[styles.legendLine, { backgroundColor: C.gold }]} />
            <Text style={styles.legendLabel}>End</Text>
            <Text style={styles.legendSub}>Outer corner</Text>
          </View>
        </View>
      </View>

      {/* AI Result Modal */}
      {browResult && (
        <Modal
          visible={showResult}
          transparent
          animationType="slide"
          onRequestClose={() => setShowResult(false)}
        >
          <View style={styles.resultOverlay}>
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              onPress={() => setShowResult(false)}
              activeOpacity={1}
            />
            <BrowResultSheet
              result={browResult}
              justSaved={justSaved}
              onClose={() => setShowResult(false)}
              onSave={saveAnalysis}
              onRescan={() => { setShowResult(false); setTimeout(scanBrows, 400); }}
            />
          </View>
        </Modal>
      )}
    </View>
  );
}

// ─── Shape card ───────────────────────────────────────────────────
function ShapeCard({ shape }: { shape: EyebrowShape }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <TouchableOpacity
      style={styles.shapeCard}
      onPress={() => setExpanded((v) => !v)}
      activeOpacity={0.8}
    >
      <View style={styles.shapeHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.shapeName}>{shape.name}</Text>
          <Text style={styles.shapeBestFor}>Best for {shape.bestFor.join(', ')} face</Text>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={C.text3} />
      </View>
      {expanded && (
        <View style={styles.shapeBody}>
          <View style={styles.shapeDiv} />
          <Text style={styles.shapeDesc}>{shape.description}</Text>
          <View style={styles.shapeTipRow}>
            <View style={[styles.tipChip, styles.tipChipDo]}>
              <Ionicons name="checkmark" size={12} color={C.green} />
              <Text style={[styles.tipChipText, { color: C.green }]}>HOW TO ACHIEVE</Text>
            </View>
            <Text style={styles.shapeTipText}>{shape.howTo}</Text>
          </View>
          <View style={styles.shapeTipRow}>
            <View style={[styles.tipChip, styles.tipChipAvoid]}>
              <Ionicons name="close" size={12} color={C.red} />
              <Text style={[styles.tipChipText, { color: C.red }]}>WHAT TO AVOID</Text>
            </View>
            <Text style={styles.shapeTipText}>{shape.avoid}</Text>
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Tip card ─────────────────────────────────────────────────────
function TipCard({ tip }: { tip: EyebrowTip }) {
  return (
    <View style={styles.tipCard}>
      <View style={styles.tipIconWrap}>
        <Text style={styles.tipIcon}>{tip.icon}</Text>
      </View>
      <View style={styles.tipContent}>
        <Text style={styles.tipTitle}>{tip.title}</Text>
        <Text style={styles.tipDesc}>{tip.description}</Text>
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────
export default function EyebrowsScreen() {
  const [tab, setTab] = useState<Tab>('try-on');
  const [tipCategory, setTipCategory] = useState<TipCategory>('Shaping');
  const filteredTips = eyebrowTips.filter((t) => t.category === tipCategory);
  const categoryProducts = eyebrowProducts.filter((p) =>
    TIP_CATEGORY_PRODUCTS[tipCategory]?.includes(p.id)
  );

  if (tab === 'try-on') {
    return <TryOnScreen onBack={() => setTab('tips')} />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.eyebrowLabel}>REAL MIRROR</Text>
        <Text style={styles.heading}>Eyebrow Guide</Text>
        <Text style={styles.subheading}>Shape, care &amp; grow your brows</Text>
      </View>

      {/* Tab bar */}
      <View style={styles.tabRow}>
        {(['try-on', 'tips', 'products', 'shapes'] as Tab[]).map((t) => {
          // After the early return above, `tab` is narrowed to exclude 'try-on'.
          // Use a cast so TypeScript allows the full Tab comparison here.
          const isActive = (tab as Tab) === t;
          return (
            <TouchableOpacity key={t} style={styles.tabBtn} onPress={() => setTab(t)} activeOpacity={0.7}>
              {t === 'try-on' ? (
                <>
                  <View style={styles.tryOnTabInner}>
                    <Ionicons name="camera-outline" size={12} color={isActive ? C.gold : C.text3} />
                    <Text style={[styles.tabText, isActive && styles.tabTextActive]}>Try On</Text>
                  </View>
                  {isActive && <View style={styles.tabUnderline} />}
                </>
              ) : (
                <>
                  <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                    {t === 'shapes' ? 'Shapes' : t === 'tips' ? 'Tips' : 'Products'}
                  </Text>
                  {isActive && <View style={styles.tabUnderline} />}
                </>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {tab === 'shapes' && (
          <>
            <Text style={styles.sectionNote}>Tap a shape to learn how to achieve it.</Text>
            {eyebrowShapes.map((s) => <ShapeCard key={s.id} shape={s} />)}
          </>
        )}
        {tab === 'tips' && (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              style={styles.catScroll} contentContainerStyle={styles.catContent}>
              {TIP_CATEGORIES.map((cat) => (
                <TouchableOpacity key={cat}
                  style={[styles.catPill, tipCategory === cat && styles.catPillActive]}
                  onPress={() => setTipCategory(cat)} activeOpacity={0.75}>
                  <Text style={[styles.catText, tipCategory === cat && styles.catTextActive]}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {filteredTips.map((tip) => <TipCard key={tip.id} tip={tip} />)}
            {categoryProducts.length > 0 && (
              <View style={styles.tipProductSection}>
                <View style={styles.tipProductHeader}>
                  <Ionicons name="sparkles" size={11} color={C.gold} />
                  <Text style={styles.tipProductLabel}>
                    RECOMMENDED FOR {tipCategory.toUpperCase()}
                  </Text>
                </View>
                {categoryProducts.map((p) => <ProductCard key={p.id} product={p} />)}
              </View>
            )}
          </>
        )}
        {tab === 'products' && (
          <>
            <Text style={styles.sectionNote}>Best value picks for every brow need.</Text>
            {eyebrowProducts.map((p) => <ProductCard key={p.id} product={p} />)}
          </>
        )}
        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Main Styles ──────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  centered:  { justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: C.bg },

  header: { paddingHorizontal: 22, paddingTop: 24, paddingBottom: 10 },
  eyebrowLabel: { color: C.gold, fontSize: 10, fontWeight: '700', letterSpacing: 2.5, marginBottom: 6 },
  heading:      { color: C.text, fontSize: 28, fontWeight: '800', marginBottom: 5, letterSpacing: -0.5 },
  subheading:   { color: C.text2, fontSize: 14, lineHeight: 20 },

  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    marginBottom: 4,
  },
  tabBtn:    { flex: 1, alignItems: 'center', paddingBottom: 12, paddingTop: 4 },
  tabText:   { color: C.text3, fontWeight: '600', fontSize: 12 },
  tabTextActive: { color: C.text, fontWeight: '700' },
  tabUnderline: {
    position: 'absolute', bottom: 0, left: '10%', right: '10%',
    height: 2, borderRadius: 1, backgroundColor: C.gold,
  },
  tryOnTabInner: { flexDirection: 'row', alignItems: 'center', gap: 4 },

  content: { paddingHorizontal: 18, paddingTop: 14 },
  sectionNote: { color: C.text2, fontSize: 13, marginBottom: 18, lineHeight: 19 },

  shapeCard: {
    backgroundColor: C.card, borderRadius: 18, padding: 18, marginBottom: 10,
    borderWidth: 1, borderColor: C.border,
  },
  shapeHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  shapeName:   { color: C.text, fontSize: 17, fontWeight: '700', marginBottom: 3, letterSpacing: -0.2 },
  shapeBestFor:{ color: C.gold, fontSize: 12, fontWeight: '500' },
  shapeBody:   { marginTop: 4 },
  shapeDiv:    { height: 1, backgroundColor: C.border, marginVertical: 16 },
  shapeDesc:   { color: C.text2, fontSize: 14, lineHeight: 21, marginBottom: 16 },
  shapeTipRow: { marginBottom: 14 },
  tipChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
    alignSelf: 'flex-start', marginBottom: 8,
  },
  tipChipDo:    { backgroundColor: 'rgba(42,173,170,0.1)', borderWidth: 1, borderColor: 'rgba(42,173,170,0.2)' },
  tipChipAvoid: { backgroundColor: 'rgba(220,112,112,0.1)', borderWidth: 1, borderColor: 'rgba(220,112,112,0.2)' },
  tipChipText:  { fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  shapeTipText: { color: C.text2, fontSize: 13, lineHeight: 20 },

  tipProductSection: {
    marginTop: 8,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  tipProductHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginBottom: 14,
  },
  tipProductLabel: {
    color: C.gold, fontSize: 10, fontWeight: '700', letterSpacing: 1.5,
  },

  catScroll: { flexGrow: 0, marginBottom: 16 },
  catContent:{ gap: 8, paddingVertical: 2 },
  catPill: {
    backgroundColor: C.card, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 9,
    borderWidth: 1, borderColor: C.border,
  },
  catPillActive: { backgroundColor: C.goldBg, borderColor: C.goldBorder },
  catText:       { color: C.text2, fontWeight: '600', fontSize: 13 },
  catTextActive: { color: C.gold },

  tipCard: {
    flexDirection: 'row', backgroundColor: C.card, borderRadius: 16, padding: 16,
    marginBottom: 10, gap: 14, alignItems: 'flex-start', borderWidth: 1, borderColor: C.border,
  },
  tipIconWrap: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: C.cardElev,
    justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.borderMed,
  },
  tipIcon:    { fontSize: 22 },
  tipContent: { flex: 1 },
  tipTitle:   { color: C.text, fontSize: 15, fontWeight: '700', marginBottom: 6, letterSpacing: -0.2 },
  tipDesc:    { color: C.text2, fontSize: 13, lineHeight: 20 },

  // ─── Try On ───────────────────────────────────────────────────
  tryOnTopFade:    { position: 'absolute', top: 0, left: 0, right: 0, height: 170 },
  tryOnBottomFade: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 300 },

  tryOnTopBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingTop: 6, paddingBottom: 12,
  },
  tryOnBack: {
    width: 38, height: 38, borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  tryOnTitle: { color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },
  noFaceText: { color: 'rgba(255,255,255,0.35)', fontSize: 9, fontWeight: '500', letterSpacing: 0.4 },

  posAdjuster: { flexDirection: 'column', gap: 3 },
  posBtn: {
    width: 34, height: 30, borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
  },

  // Analyzing overlay
  analyzingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.80)',
    justifyContent: 'center', alignItems: 'center',
    zIndex: 99,
  },
  analyzingCard: {
    backgroundColor: '#fff', borderRadius: 24,
    padding: 32, alignItems: 'center', width: 280,
    borderWidth: 1, borderColor: C.border,
  },
  analyzingText: {
    color: C.text, fontSize: 17, fontWeight: '700',
    marginTop: 20, marginBottom: 8, letterSpacing: -0.2,
  },
  analyzingSubText: {
    color: C.text2, fontSize: 12, textAlign: 'center', lineHeight: 18,
  },

  // Scan button
  scanBrowsBtn: { borderRadius: 16, overflow: 'hidden', marginBottom: 14 },
  scanBrowsBtnGrad: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, paddingHorizontal: 20, borderRadius: 16,
  },
  scanBrowsBtnText: { color: '#fff', fontSize: 14, fontWeight: '800', letterSpacing: 0.2 },

  // Result modal overlay
  resultOverlay: {
    flex: 1, justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.50)',
  },

  tryOnControls: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 24, paddingBottom: 46, paddingTop: 20,
  },
  mappingTitle: {
    color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: -0.3, marginBottom: 5,
  },
  mappingDesc: {
    color: 'rgba(255,255,255,0.45)', fontSize: 11, lineHeight: 17, marginBottom: 14,
  },
  legendRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 16,
    paddingVertical: 14, paddingHorizontal: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  legendItem: { flex: 1, alignItems: 'center', gap: 5 },
  legendLine: { width: 24, height: 3, borderRadius: 2 },
  legendLabel: { color: '#fff', fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
  legendSub: { color: 'rgba(255,255,255,0.38)', fontSize: 9, fontWeight: '500', textAlign: 'center' },
  legendDivider: { width: 1, height: 44, backgroundColor: 'rgba(255,255,255,0.08)', marginTop: 4 },

  // Permission
  permIconWrap: {
    width: 90, height: 90, borderRadius: 26,
    backgroundColor: C.goldBg, borderWidth: 1, borderColor: C.goldBorder,
    justifyContent: 'center', alignItems: 'center', marginBottom: 28,
  },
  permTitle:    { color: C.text, fontSize: 20, fontWeight: '700', marginBottom: 12, textAlign: 'center' },
  permText:     { color: C.text2, fontSize: 14, textAlign: 'center', lineHeight: 21, marginBottom: 30 },
  permBtn:      { borderRadius: 16, overflow: 'hidden', marginBottom: 16 },
  permBtnGrad:  { paddingHorizontal: 40, paddingVertical: 15, borderRadius: 16 },
  permBtnText:  { color: '#fff', fontWeight: '700', fontSize: 15, letterSpacing: 0.3 },
  permBack:     { paddingVertical: 10 },
  permBackText: { color: C.text2, fontSize: 14, fontWeight: '500' },
});

// ─── Brow Result Sheet Styles ─────────────────────────────────────
const brs = StyleSheet.create({
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 22, paddingTop: 12,
    borderTopWidth: 1, borderColor: C.border,
    maxHeight: '88%',
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: C.border, alignSelf: 'center', marginBottom: 18,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 12, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  headerLeft:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerLabel: { color: C.gold, fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  iconBtn:     { padding: 4 },
  rescanBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: C.goldBg, borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: C.goldBorder,
  },
  rescanText: { color: C.gold, fontSize: 11, fontWeight: '700' },
  savedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.goldBg, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 7, marginBottom: 12,
    borderWidth: 1, borderColor: C.goldBorder,
  },
  savedBannerText: { color: C.gold, fontSize: 12, fontWeight: '600' },
  summary: { color: C.text2, fontSize: 14, lineHeight: 21, marginBottom: 16 },

  // Symmetry
  symRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  symLabel:  { color: C.text3, fontSize: 9, fontWeight: '700', letterSpacing: 1.2, width: 70 },
  symBarWrap: {
    flex: 1, height: 6, borderRadius: 3,
    backgroundColor: C.cardElev, overflow: 'hidden',
    borderWidth: 1, borderColor: C.borderMed,
  },
  symBarFill: { height: '100%', backgroundColor: C.gold, borderRadius: 3 },
  symScore:   { color: C.gold, fontSize: 13, fontWeight: '800', width: 38, textAlign: 'right' },

  // Traits
  traitRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  traitChip:    { borderRadius: 22, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1 },
  traitChipPos: { backgroundColor: C.goldBg, borderColor: C.goldBorder },
  traitChipNeu: { backgroundColor: C.cardElev, borderColor: C.borderMed },
  traitText:    { fontSize: 12, fontWeight: '600' },
  traitTextPos: { color: C.gold },
  traitTextNeu: { color: C.text2 },

  divider:      { height: 1, backgroundColor: C.border, marginVertical: 16 },
  sectionLabel: { color: C.text3, fontSize: 9, fontWeight: '700', letterSpacing: 1.5, marginBottom: 12 },

  // Observations
  obsRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  obsDot:  { width: 6, height: 6, borderRadius: 3, backgroundColor: C.gold, marginTop: 5, flexShrink: 0 },
  obsText: { flex: 1, color: C.text2, fontSize: 13, lineHeight: 19 },

  // Shape box
  shapeBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: C.goldBg, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: C.goldBorder,
  },
  shapeBoxText: { flex: 1, color: C.gold, fontSize: 15, fontWeight: '700', lineHeight: 22 },

  // Products
  productCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 14,
    backgroundColor: C.card, borderRadius: 14, padding: 14,
    marginBottom: 8, borderWidth: 1, borderColor: C.border,
  },
  productEmoji:  { fontSize: 26, lineHeight: 32 },
  productInfo:   { flex: 1 },
  productType:   { color: C.text, fontSize: 14, fontWeight: '700', marginBottom: 4 },
  productReason: { color: C.text2, fontSize: 12, lineHeight: 18 },

  // Tips
  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  tipNum: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: C.goldBg, borderWidth: 1, borderColor: C.goldBorder,
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  tipNumText: { color: C.gold, fontSize: 12, fontWeight: '800' },
  tipText:    { flex: 1, color: C.text2, fontSize: 13, lineHeight: 19 },

  // Done button
  doneBtn: {
    backgroundColor: C.gold, borderRadius: 16,
    paddingVertical: 16, alignItems: 'center', marginTop: 8,
  },
  doneBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
