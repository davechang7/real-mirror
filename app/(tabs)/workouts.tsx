import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { CameraView, useCameraPermissions } from 'expo-camera';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { exercises, Exercise } from '@/data/workouts';
import { analyzeFaceForWorkouts, FaceWorkoutResult } from '@/services/gemini';
import { C, GRAD } from '@/constants/theme';

// ─── Storage keys ──────────────────────────────────────────────────
const LOG_KEY        = 'real-mirror-workout-logs';
const ASSESSMENT_KEY = 'real-mirror-workout-assessments';
const NOTIF_KEY      = 'real-mirror-workout-notif';

// ─── Notification handler (module-level) ──────────────────────────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ─── Types ─────────────────────────────────────────────────────────
interface WorkoutLog {
  date: string;          // 'YYYY-MM-DD'
  completedIds: string[];
}
interface SavedAssessment {
  id: string;
  date: string;
  symmetryScore: number;
  primaryFocus: string[];
  summary: string;
}
type FaceScreen = 'idle' | 'camera' | 'analyzing';

// ─── Helpers ───────────────────────────────────────────────────────
function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function calculateStreak(logs: WorkoutLog[]): number {
  const map = new Map(logs.map((l) => [l.date, l.completedIds.length > 0]));
  let streak = 0;
  const today = new Date();
  // Count from today backwards; today may or may not be done yet
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().split('T')[0];
    if (map.get(key)) {
      streak++;
    } else if (i === 0) {
      // Today not done yet — don't break streak, just skip
      continue;
    } else {
      break;
    }
  }
  return streak;
}

// ─── Constants ─────────────────────────────────────────────────────
const CATEGORIES = ['All', 'Jawline', 'Cheeks', 'Eyes', 'Forehead', 'Full Face'];
const CATEGORY_EMOJI: Record<string, string> = {
  All: '⚡', Jawline: '💪', Cheeks: '😊',
  Eyes: '👁️', Forehead: '🧠', 'Full Face': '✨',
};


// ─── Exercise Card ─────────────────────────────────────────────────
function ExerciseCard({
  exercise,
  completed,
  onComplete,
}: {
  exercise: Exercise;
  completed: boolean;
  onComplete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.exerciseCard}>
      <View style={styles.accentBar} />

      {/* Main tappable area — expand/collapse */}
      <TouchableOpacity
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.75}
        style={styles.cardTouchArea}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardLeft}>
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryBadgeText}>{exercise.category.toUpperCase()}</Text>
            </View>
            <Text style={styles.exerciseName}>{exercise.name}</Text>
            <Text style={styles.exerciseBenefit}>{exercise.benefit}</Text>
          </View>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16} color={C.text3}
            style={{ marginTop: 4 }}
          />
        </View>
      </TouchableOpacity>

      {/* Footer row — duration info + action buttons (no absolute positioning) */}
      <View style={styles.cardFooter}>
        <View style={styles.durationPill}>
          <Text style={styles.durationText}>{exercise.duration}</Text>
        </View>
        {exercise.reps && <Text style={styles.repsText}>{exercise.reps}</Text>}
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          style={[styles.completeBtn, completed && styles.completeBtnDone]}
          onPress={() => onComplete(exercise.id)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name={completed ? 'checkmark-circle' : 'radio-button-off-outline'}
            size={22}
            color={completed ? C.gold : C.text3}
          />
        </TouchableOpacity>
      </View>

      {/* Expanded step list */}
      {expanded && (
        <View style={styles.instructions}>
          <View style={styles.divider} />
          <Text style={styles.instructionsLabel}>HOW TO DO IT</Text>
          {exercise.instructions.map((step, i) => (
            <View key={i} style={styles.step}>
              <View style={styles.stepNum}>
                <Text style={styles.stepNumText}>{i + 1}</Text>
              </View>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
        </View>
      )}

    </View>
  );
}

// ─── AI Result Card ────────────────────────────────────────────────
function AIResultCard({
  result,
  justSaved,
  onRescan,
  onSave,
  onSelectCategory,
}: {
  result: FaceWorkoutResult;
  justSaved: boolean;
  onRescan: () => void;
  onSave: () => void;
  onSelectCategory: (cat: string) => void;
}) {
  return (
    <View style={styles.aiCard}>
      <View style={styles.aiCardHeader}>
        <View style={styles.aiCardHeaderLeft}>
          <Ionicons name="sparkles" size={13} color={C.gold} />
          <Text style={styles.aiCardHeaderText}>AI FACE ANALYSIS</Text>
        </View>
        <View style={styles.aiCardHeaderRight}>
          <TouchableOpacity style={styles.saveBtn} onPress={onSave}>
            <Ionicons name={justSaved ? 'bookmark' : 'bookmark-outline'} size={16}
              color={justSaved ? C.gold : C.text2} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.rescanBtn} onPress={onRescan}>
            <Ionicons name="camera-outline" size={13} color={C.gold} />
            <Text style={styles.rescanText}>Re-scan</Text>
          </TouchableOpacity>
        </View>
      </View>

      {justSaved && (
        <View style={styles.savedBanner}>
          <Ionicons name="checkmark-circle" size={12} color={C.gold} />
          <Text style={styles.savedBannerText}>Assessment saved</Text>
        </View>
      )}

      <Text style={styles.aiSummary}>{result.summary}</Text>

      {/* Symmetry bar */}
      <View style={styles.symRow}>
        <Text style={styles.symLabel}>SYMMETRY</Text>
        <View style={styles.symBarWrap}>
          <View style={[styles.symBarFill, { width: `${result.symmetryScore}%` as any }]} />
        </View>
        <Text style={styles.symScore}>{result.symmetryScore}%</Text>
      </View>

      {result.insights.map((insight, i) => (
        <View key={i} style={styles.insightRow}>
          <View style={styles.insightDot} />
          <Text style={styles.insightText}>{insight}</Text>
        </View>
      ))}

      <View style={styles.focusSection}>
        <Text style={styles.focusLabel}>FOCUS ON</Text>
        <View style={styles.focusPills}>
          {result.primaryFocus.map((cat) => (
            <TouchableOpacity key={cat} style={styles.focusPill}
              onPress={() => onSelectCategory(cat)} activeOpacity={0.75}>
              <Text style={styles.focusPillEmoji}>{CATEGORY_EMOJI[cat] ?? '💪'}</Text>
              <Text style={styles.focusPillText}>{cat}</Text>
            </TouchableOpacity>
          ))}
          {result.secondaryFocus.map((cat) => (
            <TouchableOpacity key={cat} style={styles.focusPillSecondary}
              onPress={() => onSelectCategory(cat)} activeOpacity={0.75}>
              <Text style={styles.focusPillTextSec}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
}

// ─── Scan Banner ───────────────────────────────────────────────────
function ScanBanner({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.scanBanner} onPress={onPress} activeOpacity={0.82}>
      <View style={styles.scanBannerLeft}>
        <View style={styles.scanIconWrap}>
          <Ionicons name="scan-outline" size={22} color={C.gold} />
        </View>
        <View style={styles.scanBannerText}>
          <Text style={styles.scanBannerTitle}>AI Face Analysis</Text>
          <Text style={styles.scanBannerSub}>
            Scan your face for personalized workout suggestions
          </Text>
        </View>
      </View>
      <LinearGradient colors={GRAD.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={styles.scanBannerBtn}>
        <Text style={styles.scanBannerBtnText}>Scan</Text>
        <Ionicons name="arrow-forward" size={13} color="#fff" />
      </LinearGradient>
    </TouchableOpacity>
  );
}

// ─── Main Screen ───────────────────────────────────────────────────
export default function WorkoutsScreen() {
  const [selected,     setSelected]     = useState('All');
  const [faceScreen,   setFaceScreen]   = useState<FaceScreen>('idle');
  const [faceResult,   setFaceResult]   = useState<FaceWorkoutResult | null>(null);
  const [justSaved,    setJustSaved]    = useState(false);
  const [savedList,    setSavedList]    = useState<SavedAssessment[]>([]);
  const [completedToday, setCompletedToday] = useState<Set<string>>(new Set());
  const [streak,       setStreak]       = useState(0);
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const filtered =
    selected === 'All' ? exercises : exercises.filter((e) => e.category === selected);

  // ── Load persisted data on mount ────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [logJson, assessJson, notifJson] = await Promise.all([
          AsyncStorage.getItem(LOG_KEY),
          AsyncStorage.getItem(ASSESSMENT_KEY),
          AsyncStorage.getItem(NOTIF_KEY),
        ]);
        if (logJson) {
          const logs: WorkoutLog[] = JSON.parse(logJson);
          const today = getTodayStr();
          const todayLog = logs.find((l) => l.date === today);
          if (todayLog) setCompletedToday(new Set(todayLog.completedIds));
          setStreak(calculateStreak(logs));
        }
        if (assessJson) setSavedList(JSON.parse(assessJson));
        if (notifJson)  setNotifEnabled(JSON.parse(notifJson) === true);
      } catch {}
    })();
  }, []);

  // ── Toggle exercise complete ────────────────────────────────────
  const toggleComplete = useCallback(async (id: string) => {
    const todayStr = getTodayStr();
    setCompletedToday((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      // Persist
      (async () => {
        try {
          const json = await AsyncStorage.getItem(LOG_KEY);
          const logs: WorkoutLog[] = json ? JSON.parse(json) : [];
          const idx = logs.findIndex((l) => l.date === todayStr);
          const ids = Array.from(next);
          if (idx >= 0) logs[idx].completedIds = ids;
          else logs.push({ date: todayStr, completedIds: ids });
          const recent = logs.slice(-90);
          await AsyncStorage.setItem(LOG_KEY, JSON.stringify(recent));
          setStreak(calculateStreak(recent));
        } catch {}
      })();
      return next;
    });
  }, []);

  // ── Save assessment ─────────────────────────────────────────────
  const saveAssessment = useCallback(async () => {
    if (!faceResult) return;
    const entry: SavedAssessment = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      symmetryScore: faceResult.symmetryScore,
      primaryFocus: faceResult.primaryFocus,
      summary: faceResult.summary,
    };
    const updated = [entry, ...savedList].slice(0, 20);
    setSavedList(updated);
    await AsyncStorage.setItem(ASSESSMENT_KEY, JSON.stringify(updated));
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2500);
  }, [faceResult, savedList]);

  // ── Notifications ───────────────────────────────────────────────
  const toggleNotifications = async () => {
    if (notifEnabled) {
      await Notifications.cancelAllScheduledNotificationsAsync();
      setNotifEnabled(false);
      await AsyncStorage.setItem(NOTIF_KEY, 'false');
      return;
    }
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Notifications blocked',
        'Enable notifications in Settings to get daily workout reminders.',
      );
      return;
    }
    await Notifications.cancelAllScheduledNotificationsAsync();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '🔥 Keep your streak going!',
        body: "Time for your daily face workout. Just 5 minutes makes a difference!",
        sound: true,
      },
      trigger: {
        hour: 20,
        minute: 0,
        repeats: true,
      } as any,
    });
    setNotifEnabled(true);
    await AsyncStorage.setItem(NOTIF_KEY, 'true');
  };

  // ── Open camera ─────────────────────────────────────────────────
  const openCamera = async () => {
    if (!cameraPermission?.granted) {
      const { granted } = await requestCameraPermission();
      if (!granted) {
        Alert.alert('Camera needed', 'Please allow camera access to analyze your face.');
        return;
      }
    }
    setFaceScreen('camera');
  };

  // ── Capture + analyze ───────────────────────────────────────────
  const analyzePhoto = async () => {
    if (!cameraRef.current) return;
    setFaceScreen('analyzing');
    try {
      const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.7 });
      if (!photo?.base64) throw new Error('Could not capture photo. Please try again.');
      const result = await analyzeFaceForWorkouts(photo.base64);
      setFaceResult(result);
      setJustSaved(false);
      if (result.primaryFocus.length > 0) setSelected(result.primaryFocus[0]);
    } catch (e: unknown) {
      Alert.alert('Analysis failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setFaceScreen('idle');
    }
  };

  // ── Camera screen ────────────────────────────────────────────────
  if (faceScreen === 'camera') {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="front" />
        <LinearGradient colors={['rgba(0,0,0,0.65)', 'transparent']} style={styles.cameraTopFade} />
        <LinearGradient colors={['transparent', 'rgba(0,44,42,0.97)']} style={styles.cameraBottomFade} />
        <SafeAreaView style={styles.cameraOverlay}>
          <TouchableOpacity style={styles.cameraBack} onPress={() => setFaceScreen('idle')}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={styles.faceGuide} />
          <View style={styles.cameraBottom}>
            <Text style={styles.cameraHint}>
              Center your face · Look straight ahead · Good lighting
            </Text>
            <TouchableOpacity onPress={analyzePhoto} activeOpacity={0.85} style={styles.analyzeWrap}>
              <LinearGradient colors={GRAD.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.analyzeBtn}>
                <Ionicons name="scan" size={20} color="#fff" />
                <Text style={styles.analyzeBtnText}>Analyze My Face</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ── Analyzing screen ─────────────────────────────────────────────
  if (faceScreen === 'analyzing') {
    return (
      <View style={[styles.container, styles.centered]}>
        <View style={styles.analyzingIconWrap}>
          <ActivityIndicator size="large" color={C.gold} />
        </View>
        <Text style={styles.analyzingTitle}>Analyzing your face…</Text>
        <Text style={styles.analyzingSubtitle}>
          Gemini AI is identifying areas to strengthen
        </Text>
      </View>
    );
  }

  // ── Main screen ──────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.eyebrow}>REAL MIRROR</Text>
        <Text style={styles.heading}>Face Workouts</Text>

        {/* Streak row */}
        <View style={styles.streakRow}>
          <View style={styles.streakLeft}>
            <Text style={styles.streakFire}>🔥</Text>
            <Text style={styles.streakCount}>{streak}</Text>
            <Text style={styles.streakLabel}>{streak === 1 ? 'day streak' : 'day streak'}</Text>
            {completedToday.size > 0 && (
              <>
                <Text style={styles.streakSep}>·</Text>
                <Text style={styles.todayCount}>{completedToday.size} done today</Text>
              </>
            )}
          </View>
          <TouchableOpacity
            style={[styles.notifBtn, notifEnabled && styles.notifBtnActive]}
            onPress={toggleNotifications}
            activeOpacity={0.75}
          >
            <Ionicons
              name={notifEnabled ? 'notifications' : 'notifications-outline'}
              size={14}
              color={notifEnabled ? C.gold : C.text3}
            />
            <Text style={[styles.notifBtnText, notifEnabled && styles.notifBtnTextActive]}>
              {notifEnabled ? 'Daily on' : 'Remind me'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Category pills */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={styles.filterScroll} contentContainerStyle={styles.filterContent}>
        {CATEGORIES.map((cat) => {
          const isPrimary   = faceResult?.primaryFocus.includes(cat);
          const isSecondary = faceResult?.secondaryFocus.includes(cat);
          return (
            <TouchableOpacity key={cat}
              style={[styles.pill, selected === cat && styles.pillActive]}
              onPress={() => setSelected(cat)} activeOpacity={0.75}>
              <Text style={styles.pillEmoji}>{CATEGORY_EMOJI[cat]}</Text>
              <Text style={[styles.pillText, selected === cat && styles.pillTextActive]}>{cat}</Text>
              {isPrimary   && <View style={styles.aiDotPrimary} />}
              {isSecondary && !isPrimary && <View style={styles.aiDotSecondary} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.content}>
        {/* AI card or scan banner */}
        {faceResult
          ? <AIResultCard result={faceResult} justSaved={justSaved}
              onRescan={openCamera} onSave={saveAssessment} onSelectCategory={setSelected} />
          : <ScanBanner onPress={openCamera} />
        }

        {/* Past saved assessments */}
        {savedList.length > 0 && (
          <View style={styles.historySection}>
            <Text style={styles.historyLabel}>PAST ASSESSMENTS</Text>
            {savedList.slice(0, 3).map((a) => (
              <View key={a.id} style={styles.historyCard}>
                <View style={styles.historyLeft}>
                  <Text style={styles.historyDate}>{formatDate(a.date)}</Text>
                  <Text style={styles.historySym}>{a.symmetryScore}% symmetric</Text>
                </View>
                <View style={styles.historyPills}>
                  {a.primaryFocus.map((f) => (
                    <View key={f} style={styles.historyPill}>
                      <Text style={styles.historyPillText}>{f}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.countText}>{filtered.length} EXERCISES</Text>
        {filtered.map((ex) => (
          <ExerciseCard
            key={ex.id}
            exercise={ex}
            completed={completedToday.has(ex.id)}
            onComplete={toggleComplete}
          />
        ))}
        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  centered:  { justifyContent: 'center', alignItems: 'center', padding: 32 },

  // Header
  header:    { paddingHorizontal: 22, paddingTop: 24, paddingBottom: 12 },
  eyebrow:   { color: C.gold, fontSize: 10, fontWeight: '700', letterSpacing: 2.5, marginBottom: 6 },
  heading:   { color: C.text, fontSize: 28, fontWeight: '800', marginBottom: 10, letterSpacing: -0.5 },

  // Streak row
  streakRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  streakLeft: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  streakFire:  { fontSize: 16 },
  streakCount: { color: C.text, fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  streakLabel: { color: C.text2, fontSize: 12, fontWeight: '500' },
  streakSep:   { color: C.text3, fontSize: 12, marginHorizontal: 2 },
  todayCount:  { color: C.gold, fontSize: 12, fontWeight: '600' },
  notifBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: C.card, borderRadius: 22,
    paddingHorizontal: 11, paddingVertical: 7,
    borderWidth: 1, borderColor: C.border,
  },
  notifBtnActive:     { backgroundColor: C.goldBg, borderColor: C.goldBorder },
  notifBtnText:       { color: C.text3, fontSize: 11, fontWeight: '600' },
  notifBtnTextActive: { color: C.gold },

  // Category pills
  filterScroll:  { height: 56, flexGrow: 0, flexShrink: 0 },
  filterContent: { paddingHorizontal: 18, gap: 8, flexDirection: 'row', alignItems: 'center', height: 56 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: C.card, borderRadius: 22,
    paddingHorizontal: 14, paddingVertical: 9,
    borderWidth: 1, borderColor: C.border,
    flexShrink: 0, flexGrow: 0,
  },
  pillActive:      { backgroundColor: C.goldBg, borderColor: C.goldBorder },
  pillEmoji:       { fontSize: 14 },
  pillText:        { color: C.text2, fontWeight: '600', fontSize: 13, flexShrink: 0 },
  pillTextActive:  { color: C.gold },
  aiDotPrimary:    { width: 6, height: 6, borderRadius: 3, backgroundColor: C.gold, marginLeft: 2 },
  aiDotSecondary:  { width: 5, height: 5, borderRadius: 2.5, backgroundColor: C.goldLight, marginLeft: 2, opacity: 0.75 },

  // Content
  content:   { paddingHorizontal: 18, paddingTop: 6 },
  countText: { color: C.text3, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 14 },

  // Scan banner
  scanBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: C.card, borderRadius: 20, padding: 16, marginBottom: 20,
    borderWidth: 1, borderColor: C.goldBorder,
  },
  scanBannerLeft:    { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  scanIconWrap: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: C.goldBg, justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: C.goldBorder,
  },
  scanBannerText:    { flex: 1 },
  scanBannerTitle:   { color: C.text, fontSize: 15, fontWeight: '700', marginBottom: 3, letterSpacing: -0.2 },
  scanBannerSub:     { color: C.text2, fontSize: 12, lineHeight: 17 },
  scanBannerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
  },
  scanBannerBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // AI card
  aiCard: {
    backgroundColor: C.card, borderRadius: 20, padding: 18, marginBottom: 18,
    borderWidth: 1, borderColor: C.goldBorder,
  },
  aiCardHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 12, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  aiCardHeaderLeft:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  aiCardHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  aiCardHeaderText:  { color: C.gold, fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  saveBtn: { padding: 4 },
  rescanBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: C.goldBg, borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: C.goldBorder,
  },
  rescanText: { color: C.gold, fontSize: 11, fontWeight: '700' },
  savedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: C.goldBg, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
    marginBottom: 12,
  },
  savedBannerText: { color: C.gold, fontSize: 11, fontWeight: '600' },
  aiSummary: { color: C.text2, fontSize: 13, lineHeight: 20, marginBottom: 14 },

  // Symmetry
  symRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  symLabel:  { color: C.text3, fontSize: 9, fontWeight: '700', letterSpacing: 1.2, width: 68 },
  symBarWrap: {
    flex: 1, height: 6, borderRadius: 3,
    backgroundColor: C.cardElev, overflow: 'hidden',
    borderWidth: 1, borderColor: C.borderMed,
  },
  symBarFill: { height: '100%', backgroundColor: C.gold, borderRadius: 3 },
  symScore:   { color: C.gold, fontSize: 13, fontWeight: '800', width: 38, textAlign: 'right' },

  // Insights
  insightRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  insightDot:  { width: 6, height: 6, borderRadius: 3, backgroundColor: C.gold, marginTop: 5, flexShrink: 0 },
  insightText: { flex: 1, color: C.text2, fontSize: 13, lineHeight: 19 },

  // Focus
  focusSection: { marginTop: 14 },
  focusLabel:   { color: C.text3, fontSize: 9, fontWeight: '700', letterSpacing: 1.3, marginBottom: 9 },
  focusPills:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  focusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: C.goldBg, borderRadius: 22,
    paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1, borderColor: C.goldBorder,
  },
  focusPillEmoji: { fontSize: 13 },
  focusPillText:  { color: C.gold, fontSize: 12, fontWeight: '700' },
  focusPillSecondary: {
    backgroundColor: C.cardElev, borderRadius: 22,
    paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1, borderColor: C.borderMed,
  },
  focusPillTextSec: { color: C.text2, fontSize: 12, fontWeight: '600' },

  // History
  historySection: { marginBottom: 20 },
  historyLabel: {
    color: C.text3, fontSize: 10, fontWeight: '700',
    letterSpacing: 1.5, marginBottom: 10,
  },
  historyCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: C.card, borderRadius: 14, padding: 14,
    marginBottom: 8, borderWidth: 1, borderColor: C.border,
  },
  historyLeft:     { gap: 2 },
  historyDate:     { color: C.gold, fontSize: 11, fontWeight: '600', letterSpacing: 0.2 },
  historySym:      { color: C.text2, fontSize: 12 },
  historyPills:    { flexDirection: 'row', gap: 6 },
  historyPill: {
    backgroundColor: C.cardElev, borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: C.borderMed,
  },
  historyPillText: { color: C.text2, fontSize: 11, fontWeight: '500' },

  // Exercise card
  exerciseCard: {
    backgroundColor: C.card, borderRadius: 18,
    marginBottom: 10, borderWidth: 1, borderColor: C.border,
    overflow: 'hidden',
  },
  accentBar: {
    position: 'absolute', left: 0, top: 14, bottom: 14,
    width: 3, backgroundColor: C.gold, borderRadius: 2,
  },
  cardTouchArea:   { paddingTop: 14, paddingBottom: 10, paddingHorizontal: 16, paddingLeft: 20 },
  cardHeader:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardLeft:        { flex: 1, marginRight: 10 },
  categoryBadge: {
    backgroundColor: C.goldBg, borderRadius: 5,
    paddingHorizontal: 7, paddingVertical: 3,
    alignSelf: 'flex-start', marginBottom: 8,
    borderWidth: 1, borderColor: C.goldBorder,
  },
  categoryBadgeText: { color: C.gold, fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  exerciseName:      { color: C.text, fontSize: 16, fontWeight: '700', marginBottom: 5, letterSpacing: -0.2 },
  exerciseBenefit:   { color: C.text2, fontSize: 13, lineHeight: 18 },

  // Footer row — duration info + demo/complete buttons (no absolute positioning)
  cardFooter: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingLeft: 20,
    paddingBottom: 12, gap: 8,
  },
  durationPill: {
    backgroundColor: C.cardElev, borderRadius: 8,
    paddingHorizontal: 9, paddingVertical: 4,
    borderWidth: 1, borderColor: C.borderMed,
  },
  durationText: { color: C.text, fontSize: 12, fontWeight: '600' },
  repsText:     { color: C.text3, fontSize: 11 },

  // Complete button
  completeBtn:     { padding: 4 },
  completeBtnDone: {},

  // Instructions
  instructions: { paddingHorizontal: 20, paddingBottom: 16 },
  divider:      { height: 1, backgroundColor: C.border, marginBottom: 14 },
  instructionsLabel: { color: C.gold, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 14 },

  // Regular step list
  step:       { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12, gap: 12 },
  stepNum: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: C.goldBg, borderWidth: 1, borderColor: C.goldBorder,
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  stepNumText: { color: C.gold, fontSize: 12, fontWeight: '800' },
  stepText:    { flex: 1, color: C.text2, fontSize: 14, lineHeight: 21 },

  // Camera screen
  cameraTopFade:    { position: 'absolute', top: 0, left: 0, right: 0, height: 160 },
  cameraBottomFade: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 280 },
  cameraOverlay:    { flex: 1, justifyContent: 'space-between' },
  cameraBack: {
    marginLeft: 18, marginTop: 8, width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  faceGuide: {
    width: 224, height: 284, borderRadius: 112,
    borderWidth: 1.5, borderColor: `${C.gold}80`,
    borderStyle: 'dashed', alignSelf: 'center',
  },
  cameraBottom:   { alignItems: 'center', paddingBottom: 56, paddingTop: 20 },
  cameraHint:     { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginBottom: 22, textAlign: 'center' },
  analyzeWrap:    { borderRadius: 18, overflow: 'hidden' },
  analyzeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 36, paddingVertical: 17, borderRadius: 18,
  },
  analyzeBtnText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },

  // Analyzing screen
  analyzingIconWrap: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: C.goldBg, borderWidth: 1, borderColor: C.goldBorder,
    justifyContent: 'center', alignItems: 'center', marginBottom: 28,
  },
  analyzingTitle:    { color: C.text, fontSize: 20, fontWeight: '700', marginBottom: 8, letterSpacing: -0.3 },
  analyzingSubtitle: { color: C.text2, fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
