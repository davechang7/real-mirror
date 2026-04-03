import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  Image,
  Alert,
  ActivityIndicator,
  ScrollView,
  Modal,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PaywallModal } from '@/components/PaywallModal';
import { canScanToday, incrementDailyScanCount } from '@/services/paywall';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { C, GRAD } from '@/constants/theme';
import {
  analyzeAll,
  BrowAnalysisResult,
  FaceWorkoutResult,
} from '@/services/gemini';
import { saveScan, defaultScanName } from '@/services/storage';
import { skincareProducts, premiumSkincareProducts, eyebrowProducts } from '@/data/products';
import { ProductCard } from '@/components/ProductCard';

type FullResults = { skin: string; brows: BrowAnalysisResult; workout: FaceWorkoutResult };
type Section = 'skin' | 'brows' | 'workout';

export default function MirrorScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [mediaPermission, requestMediaPermission] = MediaLibrary.usePermissions();
  const [isRealMode, setIsRealMode] = useState(true);
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [fullResults, setFullResults] = useState<FullResults | null>(null);
  const [expanded, setExpanded] = useState<Section | null>('skin');
  const [flashOn, setFlashOn] = useState(false);
  const [isFlashing, setIsFlashing] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [consentVisible, setConsentVisible] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  useEffect(() => {
    AsyncStorage.getItem('@rm/ai_consent_given').then(val => {
      if (!val) setConsentVisible(true);
    });
  }, []);

  const triggerFlash = (cb: () => Promise<void>) => async () => {
    if (flashOn) {
      setIsFlashing(true);
      await new Promise(r => setTimeout(r, 120));
    }
    await cb();
    if (flashOn) setIsFlashing(false);
  };

  if (!permission) return <View style={styles.container} />;

  if (!permission.granted) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <View style={styles.permIconWrap}>
          <Ionicons name="camera-outline" size={40} color={C.gold} />
        </View>
        <Text style={styles.permTitle}>Camera Access Needed</Text>
        <Text style={styles.permText}>
          Real Mirror needs your camera to show you how others see you.
        </Text>
        <TouchableOpacity style={styles.permButton} onPress={requestPermission} activeOpacity={0.85}>
          <LinearGradient colors={GRAD.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.permButtonGrad}>
            <Text style={styles.permButtonText}>Allow Camera</Text>
          </LinearGradient>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const takePhoto = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9 });
      if (photo) setCapturedUri(photo.uri);
    } catch {
      Alert.alert('Error', 'Could not take photo. Please try again.');
    }
  };

  const savePhoto = async () => {
    if (!capturedUri) return;
    if (!mediaPermission?.granted) {
      const { granted } = await requestMediaPermission();
      if (!granted) {
        Alert.alert('Permission Needed', 'Allow photo library access to save photos.');
        return;
      }
    }
    await MediaLibrary.saveToLibraryAsync(capturedUri);
    Alert.alert('Saved!', 'Your photo has been saved to your camera roll.');
    setCapturedUri(null);
  };

  const fullScan = async () => {
    const camera = cameraRef.current;
    if (!camera) return;
    // Check daily scan limit
    const { allowed } = await canScanToday();
    if (!allowed) {
      setPaywallVisible(true);
      return;
    }
    try {
      setScanning(true);
      const photo = await camera.takePictureAsync({ quality: 0.7 });
      if (!photo?.uri) throw new Error('Could not capture photo. Please try again.');
      const base64 = await FileSystem.readAsStringAsync(photo.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      if (!base64) throw new Error('Could not process photo. Please try again.');
      await incrementDailyScanCount(); // only count after successful capture
      const results = await analyzeAll(base64);
      setFullResults(results);
      setExpanded('skin');
      // Prompt for name then save
      Alert.prompt(
        'Name this scan',
        'Add a name so you can find it later (e.g. "Dave" or leave as date)',
        [
          {
            text: 'Save',
            onPress: async (name: string | undefined) => {
              await saveScan({
                id: Date.now().toString(),
                name: name?.trim() || defaultScanName(),
                createdAt: new Date().toISOString(),
                ...results,
              });
            },
          },
          { text: 'Skip', style: 'cancel' },
        ],
        'plain-text',
        defaultScanName(),
      );
    } catch (e: unknown) {
      Alert.alert('Scan Failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setScanning(false);
    }
  };

  const toggle = (s: Section) => setExpanded(expanded === s ? null : s);

  // ─── Analyzing ───────────────────────────────────────────────────
  if (scanning) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={C.gold} style={{ marginBottom: 20 }} />
        <Text style={styles.analyzingTitle}>Analyzing your face…</Text>
        <Text style={styles.analyzingSubtitle}>Skin · Brows · Face Fitness</Text>
      </View>
    );
  }

  // ─── Full Scan Results ────────────────────────────────────────────
  if (fullResults) {
    const { skin, brows, workout } = fullResults;
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: C.bg }]}>
        <ScrollView contentContainerStyle={styles.resultsContent} showsVerticalScrollIndicator={false}>

          {/* Header */}
          <View style={styles.resultsHeader}>
            <Ionicons name="sparkles" size={14} color={C.gold} />
            <Text style={styles.resultsTitle}>FULL ANALYSIS</Text>
          </View>

          {/* ── Skin ── */}
          <TouchableOpacity style={styles.sectionCard} onPress={() => toggle('skin')} activeOpacity={0.8}>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionIcon}>🧴</Text>
              <Text style={styles.sectionTitle}>Skin Analysis</Text>
              <Ionicons name={expanded === 'skin' ? 'chevron-up' : 'chevron-down'} size={16} color={C.text3} />
            </View>
          </TouchableOpacity>
          {expanded === 'skin' && (
            <View style={styles.sectionBody}>
              {skin.split('\n').map((line, i) => (
                <Text key={i} style={[
                  styles.skinText,
                  line.startsWith('**') && styles.skinHeading,
                  line === '' && { marginBottom: 4 },
                ]}>
                  {line.replace(/\*\*/g, '')}
                </Text>
              ))}
            </View>
          )}

          {/* ── Brows ── */}
          <TouchableOpacity style={styles.sectionCard} onPress={() => toggle('brows')} activeOpacity={0.8}>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionIcon}>✏️</Text>
              <Text style={styles.sectionTitle}>Brow Analysis</Text>
              <Ionicons name={expanded === 'brows' ? 'chevron-up' : 'chevron-down'} size={16} color={C.text3} />
            </View>
          </TouchableOpacity>
          {expanded === 'brows' && (
            <View style={styles.sectionBody}>
              {/* Symmetry */}
              <View style={styles.symRow}>
                <Text style={styles.metaLabel}>SYMMETRY</Text>
                <View style={styles.symBar}>
                  <View style={[styles.symFill, { width: `${brows.symmetryScore}%` as any }]} />
                </View>
                <Text style={styles.symScore}>{brows.symmetryScore}%</Text>
              </View>
              {/* Traits */}
              <View style={styles.chipRow}>
                {[brows.naturalShape, `${brows.archHeight} arch`, brows.thickness, `${brows.spacing} set`].map((t) => (
                  <View key={t} style={styles.chip}><Text style={styles.chipText}>{t}</Text></View>
                ))}
              </View>
              <Text style={styles.browSummary}>{brows.summary}</Text>
              {brows.observations.map((o, i) => (
                <View key={i} style={styles.bulletRow}>
                  <Text style={styles.bullet}>·</Text>
                  <Text style={styles.bulletText}>{o}</Text>
                </View>
              ))}
            </View>
          )}

          {/* ── Face Fitness ── */}
          <TouchableOpacity style={styles.sectionCard} onPress={() => toggle('workout')} activeOpacity={0.8}>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionIcon}>💪</Text>
              <Text style={styles.sectionTitle}>Face Fitness</Text>
              <Ionicons name={expanded === 'workout' ? 'chevron-up' : 'chevron-down'} size={16} color={C.text3} />
            </View>
          </TouchableOpacity>
          {expanded === 'workout' && (
            <View style={styles.sectionBody}>
              <View style={styles.symRow}>
                <Text style={styles.metaLabel}>SYMMETRY</Text>
                <View style={styles.symBar}>
                  <View style={[styles.symFill, { width: `${workout.symmetryScore}%` as any }]} />
                </View>
                <Text style={styles.symScore}>{workout.symmetryScore}%</Text>
              </View>
              <View style={styles.chipRow}>
                {[...workout.primaryFocus, ...workout.secondaryFocus].map((f) => (
                  <View key={f} style={styles.chip}><Text style={styles.chipText}>{f}</Text></View>
                ))}
              </View>
              <Text style={styles.browSummary}>{workout.summary}</Text>
              {workout.insights.map((ins, i) => (
                <View key={i} style={styles.bulletRow}>
                  <Text style={styles.bullet}>·</Text>
                  <Text style={styles.bulletText}>{ins}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Skincare Products */}
          <Text style={styles.shopLabel}>SHOP — SKINCARE</Text>
          {skincareProducts.slice(0, 4).map((p) => <ProductCard key={p.id} product={p} />)}

          {/* Eyebrow Products */}
          <Text style={styles.shopLabel}>SHOP — BROWS</Text>
          {eyebrowProducts.slice(0, 3).map((p) => <ProductCard key={p.id} product={p} />)}

          <Text style={styles.disclaimer}>
            For cosmetic guidance only. Not medical advice. Results are AI-generated estimates and should not be used to diagnose or treat any condition.
          </Text>

          <TouchableOpacity style={styles.scanAgainBtn} onPress={() => setFullResults(null)} activeOpacity={0.8}>
            <Text style={styles.scanAgainText}>Scan Again</Text>
          </TouchableOpacity>

        </ScrollView>
      </SafeAreaView>
    );
  }

  // ─── Photo Preview ───────────────────────────────────────────────
  if (capturedUri) {
    return (
      <View style={styles.container}>
        <Image source={{ uri: capturedUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        <LinearGradient colors={['rgba(0,0,0,0.5)', 'transparent']} style={styles.previewTopFade} />
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.75)']} style={styles.previewBottomFade} />
        <SafeAreaView style={styles.previewOverlay}>
          <View style={styles.previewButtons}>
            <TouchableOpacity style={styles.retakeBtn} onPress={() => setCapturedUri(null)} activeOpacity={0.85}>
              <LinearGradient colors={['#1a8a5a', '#0f6b44']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.retakeBtnGrad}>
                <Ionicons name="refresh" size={18} color="#fff" />
                <Text style={styles.saveBtnText}>Retake</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={savePhoto} activeOpacity={0.85}>
              <LinearGradient colors={['#1a8a5a', '#0f6b44']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.saveBtnGrad}>
                <Ionicons name="download-outline" size={18} color="#fff" />
                <Text style={styles.saveBtnText}>Save Photo</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ─── Live Camera ─────────────────────────────────────────────────
  const acceptConsent = async () => {
    await AsyncStorage.setItem('@rm/ai_consent_given', 'true');
    setConsentVisible(false);
  };

  return (
    <View style={styles.container}>
      <PaywallModal
        visible={paywallVisible}
        reason="scan"
        onClose={() => setPaywallVisible(false)}
        onSubscribed={() => { setPaywallVisible(false); fullScan(); }}
      />

      {/* AI Data Consent Modal – shown once before first scan */}
      <Modal visible={consentVisible} transparent animationType="fade">
        <View style={styles.consentOverlay}>
          <View style={styles.consentCard}>
            <Text style={styles.consentTitle}>Before Your First Scan</Text>
            <Text style={styles.consentBody}>
              To analyze your face, Real Mirror captures a photo and sends it
              to <Text style={{ fontWeight: '700' }}>Google Gemini AI</Text> for
              processing.{'\n\n'}
              • Your photo is <Text style={{ fontWeight: '700' }}>not stored</Text> on any server{'\n'}
              • It is used only to generate your analysis{'\n'}
              • It is never shared for advertising or identification{'\n\n'}
              Results are for <Text style={{ fontStyle: 'italic' }}>cosmetic guidance only</Text> and are not medical advice.{'\n\n'}
              See our{' '}
              <Text style={{ color: C.gold }}>Privacy Policy</Text>{' '}
              for full details.
            </Text>
            <TouchableOpacity style={styles.consentBtn} onPress={acceptConsent} activeOpacity={0.85}>
              <LinearGradient colors={GRAD.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.consentBtnGrad}>
                <Text style={styles.consentBtnText}>I Understand & Agree</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setConsentVisible(false)} style={{ marginTop: 12 }}>
              <Text style={{ color: C.text3, fontSize: 13, textAlign: 'center' }}>Not now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      {/* Wrapper handles the flip so CameraView never re-initializes on mode toggle */}
      <View style={[StyleSheet.absoluteFill, isRealMode && { transform: [{ scaleX: -1 }] }]}>
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="front"
        />
      </View>

      {/* Screen flash overlay */}
      {isFlashing && <View style={styles.flashOverlay} />}

      {/* Top gradient + brand */}
      <LinearGradient colors={['rgba(0,0,0,0.55)', 'transparent']} style={styles.topGradient}>
        <SafeAreaView style={styles.topBar}>
          <Text style={styles.appName}>REAL  MIRROR</Text>
          <View style={styles.topRow}>
            <TouchableOpacity style={styles.flashBtn} onPress={() => setFlashOn(f => !f)} activeOpacity={0.8}>
              <Ionicons name={flashOn ? 'flash' : 'flash-outline'} size={20} color={flashOn ? '#FFD700' : 'rgba(255,255,255,0.6)'} />
            </TouchableOpacity>
          <View style={styles.toggle}>
            <TouchableOpacity
              style={[styles.toggleOption, !isRealMode && styles.toggleSelected]}
              onPress={() => setIsRealMode(false)}
              activeOpacity={0.8}
            >
              <Text style={[styles.toggleText, !isRealMode && styles.toggleTextSelected]}>Mirror</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleOption, isRealMode && styles.toggleSelected]}
              onPress={() => setIsRealMode(true)}
              activeOpacity={0.8}
            >
              <Text style={[styles.toggleText, isRealMode && styles.toggleTextSelected]}>Real</Text>
            </TouchableOpacity>
          </View>
          </View>
        </SafeAreaView>
      </LinearGradient>

      {/* Bottom gradient + buttons */}
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.7)']} style={styles.bottomGradient}>
        {/* Shutter button */}
        <TouchableOpacity style={styles.shutterWrap} onPress={triggerFlash(takePhoto)} activeOpacity={0.85}>
          <View style={[styles.shutterRing, isRealMode && styles.shutterRingGold]}>
            <View style={[styles.shutterInner, isRealMode && styles.shutterInnerGold]} />
          </View>
        </TouchableOpacity>

        {/* Full Scan CTA */}
        <TouchableOpacity style={styles.fullScanBtn} onPress={triggerFlash(fullScan)} activeOpacity={0.85}>
          <LinearGradient colors={['#1a8a5a', '#0f6b44']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.fullScanGrad}>
            <Ionicons name="sparkles" size={16} color="#fff" />
            <Text style={styles.fullScanText}>AI Face Scan for Analysis</Text>
          </LinearGradient>
        </TouchableOpacity>

        <View style={{ height: 24 }} />
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  centered:  { justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: C.bg },

  // Consent modal
  consentOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  consentCard: {
    backgroundColor: C.bg, borderRadius: 20, padding: 28,
    borderWidth: 1, borderColor: C.border, width: '100%', maxWidth: 380,
  },
  consentTitle: {
    color: C.text, fontSize: 20, fontWeight: '700',
    textAlign: 'center', marginBottom: 16,
  },
  consentBody: {
    color: C.text2, fontSize: 14, lineHeight: 22,
    marginBottom: 24,
  },
  consentBtn:      { borderRadius: 14, overflow: 'hidden' },
  consentBtnGrad:  { paddingVertical: 15, borderRadius: 14, alignItems: 'center' },
  consentBtnText:  { color: '#fff', fontWeight: '700', fontSize: 15, letterSpacing: 0.3 },

  // Permission screen
  permIconWrap: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: C.goldBg, borderWidth: 1, borderColor: C.goldBorder,
    justifyContent: 'center', alignItems: 'center', marginBottom: 28,
  },
  permTitle:       { color: C.text, fontSize: 22, fontWeight: '700', marginBottom: 12, textAlign: 'center' },
  permText:        { color: C.text2, fontSize: 15, textAlign: 'center', lineHeight: 23, marginBottom: 32 },
  permButton:      { borderRadius: 16, overflow: 'hidden' },
  permButtonGrad:  { paddingHorizontal: 40, paddingVertical: 16, borderRadius: 16 },
  permButtonText:  { color: '#fff', fontWeight: '700', fontSize: 16, letterSpacing: 0.3 },

  // Analyzing
  analyzingTitle:    { color: C.text, fontSize: 18, fontWeight: '700', marginBottom: 8 },
  analyzingSubtitle: { color: C.text3, fontSize: 14, letterSpacing: 1 },

  // Results
  resultsContent: { padding: 20, paddingBottom: 48 },
  resultsHeader:  { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 20 },
  resultsTitle:   { color: C.gold, fontSize: 11, fontWeight: '800', letterSpacing: 2 },

  sectionCard: {
    backgroundColor: C.card, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: C.border, marginBottom: 2,
  },
  sectionRow:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionIcon: { fontSize: 18 },
  sectionTitle: { flex: 1, color: C.text, fontSize: 15, fontWeight: '700' },

  sectionBody: {
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
    borderTopWidth: 0, borderBottomLeftRadius: 14, borderBottomRightRadius: 14,
    padding: 16, marginBottom: 12,
  },

  skinText:    { color: C.text2, fontSize: 14, lineHeight: 22 },
  skinHeading: { color: C.gold, fontSize: 14, fontWeight: '700', marginTop: 12, letterSpacing: 0.2 },

  symRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  metaLabel: { color: C.text3, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, width: 72 },
  symBar:   { flex: 1, height: 5, backgroundColor: C.border, borderRadius: 3, overflow: 'hidden' },
  symFill:  { height: '100%', backgroundColor: C.gold, borderRadius: 3 },
  symScore: { color: C.gold, fontSize: 13, fontWeight: '700', width: 36, textAlign: 'right' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip:     { backgroundColor: C.goldBg, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: C.goldBorder },
  chipText: { color: C.gold, fontSize: 12, fontWeight: '600' },

  browSummary: { color: C.text2, fontSize: 14, lineHeight: 21, marginBottom: 12, fontStyle: 'italic' },
  bulletRow:   { flexDirection: 'row', gap: 8, marginBottom: 6 },
  bullet:      { color: C.gold, fontSize: 16, lineHeight: 22 },
  bulletText:  { flex: 1, color: C.text2, fontSize: 14, lineHeight: 22 },

  shopLabel: {
    color: C.text3, fontSize: 10, fontWeight: '800',
    letterSpacing: 2, marginTop: 28, marginBottom: 12,
  },

  disclaimer: {
    marginTop: 20, marginBottom: 4, paddingHorizontal: 4,
    color: C.text3, fontSize: 11, lineHeight: 16, textAlign: 'center', fontStyle: 'italic',
  },
  scanAgainBtn: {
    marginTop: 16, borderRadius: 14, borderWidth: 1, borderColor: C.border,
    paddingVertical: 16, alignItems: 'center', backgroundColor: C.card,
  },
  scanAgainText: { color: C.text2, fontSize: 15, fontWeight: '600' },

  // Flash overlay
  flashOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#fff', zIndex: 999,
  },

  // Camera top
  topGradient: { position: 'absolute', top: 0, left: 0, right: 0, paddingBottom: 40 },
  topBar:      { alignItems: 'center', paddingTop: 4 },
  topRow:      { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flashBtn:    { padding: 6 },
  appName: {
    color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '700',
    letterSpacing: 4, marginBottom: 14,
  },
  toggle: {
    flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 26, padding: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  toggleOption:         { paddingHorizontal: 28, paddingVertical: 10, borderRadius: 22 },
  toggleSelected:       { backgroundColor: C.gold },
  toggleText:           { color: 'rgba(255,255,255,0.45)', fontWeight: '600', fontSize: 14 },
  toggleTextSelected:   { color: '#fff', letterSpacing: 0.2 },

  // Camera bottom
  bottomGradient: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingTop: 60, alignItems: 'center',
  },
  modeLabel: {
    color: 'rgba(255,255,255,0.55)', fontSize: 13,
    letterSpacing: 0.5, marginBottom: 28, fontWeight: '500',
  },
  shutterWrap: { alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  shutterRing: {
    width: 84, height: 84, borderRadius: 42,
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.7)',
    justifyContent: 'center', alignItems: 'center',
  },
  shutterRingGold:  { borderColor: C.gold },
  shutterInner:     { width: 68, height: 68, borderRadius: 34, backgroundColor: 'rgba(255,255,255,0.9)' },
  shutterInnerGold: { backgroundColor: C.gold },

  fullScanBtn: {
    borderRadius: 16, overflow: 'hidden',
    marginHorizontal: 32, marginBottom: 4,
  },
  fullScanGrad: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 16, paddingHorizontal: 24, borderRadius: 16,
  },
  fullScanText: { color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: 0.3 },


  // Preview
  previewTopFade:    { position: 'absolute', top: 0, left: 0, right: 0, height: 140 },
  previewBottomFade: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 220 },
  previewOverlay:    { flex: 1, justifyContent: 'space-between' },
  previewLabelWrap:  { alignItems: 'center', marginTop: 20 },
  previewLabel: {
    color: C.text, fontSize: 14, fontWeight: '600', letterSpacing: 0.5,
    backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 20, paddingVertical: 9,
    borderRadius: 22, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  previewButtons: {
    flexDirection: 'row', justifyContent: 'center',
    gap: 14, paddingBottom: 56, paddingHorizontal: 24,
  },
  retakeBtn:     { borderRadius: 16, overflow: 'hidden', flex: 1 },
  retakeBtnGrad: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 16,
  },
  saveBtn:       { borderRadius: 16, overflow: 'hidden', flex: 1 },
  saveBtnGrad: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 16,
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
