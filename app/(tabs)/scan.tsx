import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { analyzeSkin, askFollowUp } from '@/services/gemini';
import { skincareProducts, premiumSkincareProducts } from '@/data/products';
import { ProductCard } from '@/components/ProductCard';
import { C, GRAD } from '@/constants/theme';

const STORAGE_KEY = 'real-mirror-assessments';

type Screen = 'home' | 'questionnaire' | 'od-results' | 'ai-camera' | 'analyzing' | 'ai-results';
type Answers = Record<string, string>;

interface SavedAssessment {
  id: string;
  date: string;
  mode: 'ai' | 'on-device';
  summary: string;
  aiResult?: string;   // full Gemini analysis text (AI mode)
  answers?: Answers;   // questionnaire answers (on-device mode)
}

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

const QUESTIONS = [
  {
    id: 'type',
    question: 'How does your skin feel a few hours after washing?',
    options: [
      { label: 'Tight or flaky', emoji: '🏜️', value: 'dry' },
      { label: 'Normal and comfortable', emoji: '✅', value: 'normal' },
      { label: 'Shiny in T-zone only', emoji: '⚡', value: 'combination' },
      { label: 'Shiny all over', emoji: '💧', value: 'oily' },
    ],
  },
  {
    id: 'concern',
    question: "What's your #1 skin concern?",
    options: [
      { label: 'Acne & breakouts', emoji: '😤', value: 'acne' },
      { label: 'Dark spots or uneven tone', emoji: '🎭', value: 'dark_spots' },
      { label: 'Dryness & tightness', emoji: '🥵', value: 'dryness' },
      { label: 'Aging & fine lines', emoji: '⏳', value: 'aging' },
    ],
  },
  {
    id: 'sensitivity',
    question: 'How sensitive is your skin?',
    options: [
      { label: 'Very sensitive — reacts easily', emoji: '🌸', value: 'very' },
      { label: 'Somewhat sensitive', emoji: '🌿', value: 'some' },
      { label: 'Not very sensitive', emoji: '💪', value: 'low' },
    ],
  },
];

const SKIN_TYPE_LABELS: Record<string, string> = {
  dry: 'Dry Skin', normal: 'Normal Skin', combination: 'Combination Skin', oily: 'Oily Skin',
};
const CONCERN_LABELS: Record<string, string> = {
  acne: '🔴 Acne & Breakouts',
  dark_spots: '🟤 Dark Spots & Uneven Tone',
  dryness: '🏜️ Dryness & Tightness',
  aging: '⏳ Aging & Fine Lines',
};

function getRecommendedProducts(answers: Answers) {
  return skincareProducts
    .filter((p) => {
      if (!p.forSkinTypes) return true;
      if (p.forSkinTypes.includes('all')) return true;
      return p.forSkinTypes.includes(answers.type || 'normal');
    })
    .slice(0, 6);
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ScanScreen() {
  const [screen, setScreen] = useState<Screen>('home');
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [aiResult, setAiResult] = useState('');
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [savedAssessments, setSavedAssessments] = useState<SavedAssessment[]>([]);
  const [justSaved, setJustSaved] = useState(false);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => { loadAssessments(); }, []);

  const loadAssessments = async () => {
    try {
      const json = await AsyncStorage.getItem(STORAGE_KEY);
      if (json) setSavedAssessments(JSON.parse(json));
    } catch {}
  };

  const saveAssessment = async (assessment: SavedAssessment) => {
    try {
      const updated = [assessment, ...savedAssessments].slice(0, 20);
      setSavedAssessments(updated);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
    } catch {}
  };

  const deleteAssessment = async (id: string) => {
    const updated = savedAssessments.filter((a) => a.id !== id);
    setSavedAssessments(updated);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  const loadAssessment = (a: SavedAssessment) => {
    setJustSaved(false);
    setChatMessages([]);
    setChatInput('');
    if (a.mode === 'ai' && a.aiResult) {
      setAiResult(a.aiResult);
      setScreen('ai-results');
    } else if (a.mode === 'on-device' && a.answers) {
      setAnswers(a.answers);
      setScreen('od-results');
    }
  };

  const reset = () => {
    setScreen('home');
    setQuestionIndex(0);
    setAnswers({});
    setAiResult('');
    setJustSaved(false);
    setChatMessages([]);
    setChatInput('');
  };

  const handleAnswer = (questionId: string, value: string) => {
    const updated = { ...answers, [questionId]: value };
    setAnswers(updated);
    if (questionIndex < QUESTIONS.length - 1) {
      setQuestionIndex((i) => i + 1);
    } else {
      setScreen('od-results');
    }
  };

  const startAIScan = async () => {
    if (!cameraPermission?.granted) {
      const { granted } = await requestCameraPermission();
      if (!granted) {
        Alert.alert('Camera needed', 'Please allow camera access to use AI Scan.');
        return;
      }
    }
    setScreen('ai-camera');
  };

  const takeAndAnalyze = async () => {
    if (!cameraRef.current) return;
    try {
      setScreen('analyzing');
      const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.7 });
      if (!photo?.base64) {
        Alert.alert('Error', 'Could not capture photo. Please try again.');
        setScreen('ai-camera');
        return;
      }
      const result = await analyzeSkin(photo.base64);
      setAiResult(result);
      setChatMessages([]);
      setScreen('ai-results');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      Alert.alert('Analysis Failed', message);
      setScreen('ai-camera');
    }
  };

  const sendFollowUp = async () => {
    const question = chatInput.trim();
    if (!question || chatLoading) return;
    const userMsg: ChatMessage = { role: 'user', text: question };
    const updated = [...chatMessages, userMsg];
    setChatMessages(updated);
    setChatInput('');
    setChatLoading(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    try {
      const answer = await askFollowUp(aiResult, question);
      setChatMessages([...updated, { role: 'assistant', text: answer }]);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      setChatMessages([...updated, { role: 'assistant', text: `Sorry, I couldn't answer that. ${message}` }]);
    } finally {
      setChatLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
    }
  };

  // ─── HOME ────────────────────────────────────────────────────────
  if (screen === 'home') {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.homeContent}>
          <Text style={styles.eyebrow}>REAL MIRROR</Text>
          <Text style={styles.heading}>Skin Scan</Text>
          <Text style={styles.subheading}>Choose your analysis method</Text>

          {/* On-Device card */}
          <TouchableOpacity style={styles.modeCard} onPress={() => setScreen('questionnaire')} activeOpacity={0.8}>
            <View style={styles.modeIconWrap}>
              <Text style={styles.modeEmoji}>🔒</Text>
            </View>
            <View style={styles.modeText}>
              <Text style={styles.modeTitle}>On-Device</Text>
              <Text style={styles.modeMeta}>PRIVATE · OFFLINE · NO DATA SENT</Text>
              <Text style={styles.modeDesc}>Answer a few quick questions about your skin</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.text3} />
          </TouchableOpacity>

          {/* AI card */}
          <TouchableOpacity style={[styles.modeCard, styles.modeCardAI]} onPress={startAIScan} activeOpacity={0.8}>
            <View style={[styles.modeIconWrap, styles.modeIconAI]}>
              <Text style={styles.modeEmoji}>✨</Text>
            </View>
            <View style={styles.modeText}>
              <Text style={styles.modeTitle}>Full AI Analysis</Text>
              <Text style={[styles.modeMeta, { color: C.gold }]}>GOOGLE GEMINI · REQUIRES INTERNET</Text>
              <Text style={styles.modeDesc}>Take a photo for a personalized skin analysis</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.text3} />
          </TouchableOpacity>

          <Text style={styles.disclaimer}>
            🔒  AI photos are sent to Google Gemini for analysis and are not stored by Real Mirror.
          </Text>

          {/* Saved assessments */}
          {savedAssessments.length > 0 && (
            <View style={styles.historySection}>
              <Text style={styles.historyLabel}>PAST ASSESSMENTS</Text>
              {savedAssessments.map((a) => (
                <TouchableOpacity
                  key={a.id}
                  style={styles.historyCard}
                  onPress={() => loadAssessment(a)}
                  activeOpacity={0.75}
                >
                  <View style={styles.historyIconWrap}>
                    <Text style={{ fontSize: 18 }}>{a.mode === 'ai' ? '✨' : '🔒'}</Text>
                  </View>
                  <View style={styles.historyText}>
                    <Text style={styles.historyDate}>{formatDate(a.date)}</Text>
                    <Text style={styles.historySummary} numberOfLines={2}>{a.summary}</Text>
                  </View>
                  <View style={styles.historyActions}>
                    <Ionicons name="chevron-forward" size={16} color={C.text3} />
                    <TouchableOpacity
                      onPress={(e) => { e.stopPropagation(); deleteAssessment(a.id); }}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      style={{ marginLeft: 6 }}
                    >
                      <Ionicons name="close-circle" size={18} color={C.text3} />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ─── QUESTIONNAIRE ───────────────────────────────────────────────
  if (screen === 'questionnaire') {
    const q = QUESTIONS[questionIndex];
    const progress = ((questionIndex + 1) / QUESTIONS.length) * 100;
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.navRow}>
          <TouchableOpacity onPress={reset} style={styles.navBack}>
            <Ionicons name="arrow-back" size={20} color={C.text} />
          </TouchableOpacity>
          <Text style={styles.navTitle}>{questionIndex + 1} of {QUESTIONS.length}</Text>
          <View style={{ width: 36 }} />
        </View>

        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress}%` as any }]} />
        </View>

        <ScrollView contentContainerStyle={styles.questionContent}>
          <Text style={styles.questionEyebrow}>QUESTION {questionIndex + 1}</Text>
          <Text style={styles.questionText}>{q.question}</Text>
          {q.options.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={styles.optionCard}
              onPress={() => handleAnswer(q.id, opt.value)}
              activeOpacity={0.75}
            >
              <View style={styles.optionIconWrap}>
                <Text style={styles.optionEmoji}>{opt.emoji}</Text>
              </View>
              <Text style={styles.optionLabel}>{opt.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={C.text3} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ─── ON-DEVICE RESULTS ───────────────────────────────────────────
  if (screen === 'od-results') {
    const skinType = SKIN_TYPE_LABELS[answers.type] || 'Normal Skin';
    const products = getRecommendedProducts(answers);
    const summary = `${skinType} · ${CONCERN_LABELS[answers.concern] ?? ''}`;
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.navRow}>
          <TouchableOpacity onPress={reset} style={styles.navBack}>
            <Ionicons name="arrow-back" size={20} color={C.text} />
          </TouchableOpacity>
          <Text style={styles.navTitle}>Your Results</Text>
          <TouchableOpacity
            onPress={() => saveAssessment({ id: Date.now().toString(), date: new Date().toISOString(), mode: 'on-device', summary, answers })}
            style={styles.navAction}
          >
            <Ionicons name={justSaved ? 'bookmark' : 'bookmark-outline'} size={20} color={justSaved ? C.gold : C.text2} />
          </TouchableOpacity>
        </View>

        {justSaved && (
          <View style={styles.savedBanner}>
            <Ionicons name="checkmark-circle" size={14} color={C.gold} />
            <Text style={styles.savedBannerText}>Assessment saved</Text>
          </View>
        )}

        <ScrollView contentContainerStyle={styles.resultsContent}>
          <View style={styles.skinTypeBadge}>
            <View style={styles.skinTypeIconWrap}>
              <Text style={{ fontSize: 32 }}>🧬</Text>
            </View>
            <View>
              <Text style={styles.skinTypeEyebrow}>SKIN TYPE</Text>
              <Text style={styles.skinTypeLabel}>{skinType}</Text>
            </View>
          </View>

          {answers.concern && (
            <View style={styles.concernCard}>
              <Text style={styles.concernEyebrow}>PRIMARY CONCERN</Text>
              <Text style={styles.concernValue}>{CONCERN_LABELS[answers.concern]}</Text>
            </View>
          )}

          <Text style={styles.sectionLabel}>RECOMMENDED PRODUCTS</Text>
          <Text style={styles.sectionSub}>Best value picks for your skin type</Text>
          {products.map((p) => <ProductCard key={p.id} product={p} />)}

          <TouchableOpacity style={styles.resetBtn} onPress={reset} activeOpacity={0.75}>
            <Text style={styles.resetText}>Start Over</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ─── AI CAMERA ───────────────────────────────────────────────────
  if (screen === 'ai-camera') {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="front" />
        <LinearGradient colors={['rgba(0,0,0,0.6)', 'transparent']} style={styles.cameraTopFade} />
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.8)']} style={styles.cameraBottomFade} />
        <SafeAreaView style={styles.cameraOverlay}>
          <TouchableOpacity style={styles.cameraBack} onPress={reset}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={styles.faceGuide} />
          <View style={styles.cameraBottom}>
            <Text style={styles.cameraHint}>
              Center your face · Good lighting improves accuracy
            </Text>
            <TouchableOpacity onPress={takeAndAnalyze} activeOpacity={0.85} style={styles.analyzeWrap}>
              <LinearGradient colors={GRAD.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.analyzeBtn}>
                <Ionicons name="scan" size={20} color="#fff" />
                <Text style={styles.analyzeBtnText}>Analyze My Skin</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ─── ANALYZING ───────────────────────────────────────────────────
  if (screen === 'analyzing') {
    return (
      <View style={[styles.container, styles.centered]}>
        <View style={styles.analyzingIconWrap}>
          <ActivityIndicator size="large" color={C.gold} />
        </View>
        <Text style={styles.analyzingTitle}>Analyzing your skin…</Text>
        <Text style={styles.analyzingSubtitle}>Google Gemini is reviewing your photo</Text>
      </View>
    );
  }

  // ─── AI RESULTS ──────────────────────────────────────────────────
  if (screen === 'ai-results') {
    const firstLine = aiResult.split('\n').find((l) => l.trim()) ?? 'AI skin analysis';
    const summary = firstLine.replace(/\*\*/g, '').trim();
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.navRow}>
          <TouchableOpacity onPress={reset} style={styles.navBack}>
            <Ionicons name="arrow-back" size={20} color={C.text} />
          </TouchableOpacity>
          <Text style={styles.navTitle}>AI Analysis</Text>
          <TouchableOpacity
            onPress={() => saveAssessment({ id: Date.now().toString(), date: new Date().toISOString(), mode: 'ai', summary, aiResult })}
            style={styles.navAction}
          >
            <Ionicons name={justSaved ? 'bookmark' : 'bookmark-outline'} size={20} color={justSaved ? C.gold : C.text2} />
          </TouchableOpacity>
        </View>

        {justSaved && (
          <View style={styles.savedBanner}>
            <Ionicons name="checkmark-circle" size={14} color={C.gold} />
            <Text style={styles.savedBannerText}>Assessment saved</Text>
          </View>
        )}

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView ref={scrollRef} contentContainerStyle={styles.resultsContent}>

            {/* AI result card */}
            <View style={styles.aiResultCard}>
              <View style={styles.aiResultHeader}>
                <Ionicons name="sparkles" size={14} color={C.gold} />
                <Text style={styles.aiResultHeaderText}>GEMINI ANALYSIS</Text>
              </View>
              {aiResult.split('\n').map((line, i) => (
                <Text key={i} style={[
                  styles.aiResultText,
                  line.startsWith('**') && styles.aiResultHeading,
                  line === '' && { marginBottom: 4 },
                ]}>
                  {line.replace(/\*\*/g, '')}
                </Text>
              ))}
            </View>

            {/* Follow-up chat */}
            <View style={styles.chatHeader}>
              <Ionicons name="chatbubble-outline" size={14} color={C.gold} />
              <Text style={styles.chatHeaderText}>ASK A FOLLOW-UP</Text>
            </View>

            {chatMessages.map((msg, i) => (
              <View key={i} style={[styles.chatBubble, msg.role === 'user' ? styles.chatUser : styles.chatAssistant]}>
                <Text style={[styles.chatText, msg.role === 'assistant' && styles.chatTextAssistant]}>
                  {msg.text}
                </Text>
              </View>
            ))}
            {chatLoading && (
              <View style={[styles.chatBubble, styles.chatAssistant]}>
                <ActivityIndicator size="small" color={C.gold} />
              </View>
            )}

            {/* Products */}
            <Text style={[styles.sectionLabel, { marginTop: 28 }]}>RECOMMENDED PRODUCTS</Text>
            <Text style={styles.sectionSub}>Best value picks for your routine</Text>
            {skincareProducts.slice(0, 6).map((p) => <ProductCard key={p.id} product={p} />)}

            {/* Premium / Korean skincare */}
            <View style={styles.premiumHeader}>
              <View style={styles.premiumHeaderRow}>
                <Ionicons name="sparkles" size={13} color={C.gold} />
                <Text style={styles.premiumHeaderLabel}>BEST OF THE BEST</Text>
              </View>
              <Text style={styles.premiumHeaderSub}>
                Premium & Korean skincare — real quality worth investing in
              </Text>
            </View>
            {premiumSkincareProducts.map((p) => <ProductCard key={p.id} product={p} />)}

            <TouchableOpacity style={styles.resetBtn} onPress={reset} activeOpacity={0.75}>
              <Text style={styles.resetText}>Scan Again</Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Fixed chat input */}
          <View style={styles.chatInputRow}>
            <TextInput
              style={styles.chatInput}
              placeholder="Ask about your skin…"
              placeholderTextColor={C.text3}
              value={chatInput}
              onChangeText={setChatInput}
              onSubmitEditing={sendFollowUp}
              returnKeyType="send"
              editable={!chatLoading}
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!chatInput.trim() || chatLoading) && styles.sendBtnDisabled]}
              onPress={sendFollowUp}
              disabled={!chatInput.trim() || chatLoading}
            >
              <LinearGradient
                colors={(!chatInput.trim() || chatLoading) ? ['#C8E8E6', '#C8E8E6'] : GRAD.gold}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.sendBtnGrad}
              >
                <Ionicons name="send" size={16} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  centered: { justifyContent: 'center', alignItems: 'center', padding: 32 },

  // Home
  homeContent: { padding: 22, paddingTop: 30 },
  eyebrow: { color: C.gold, fontSize: 10, fontWeight: '700', letterSpacing: 2.5, marginBottom: 8 },
  heading: { color: C.text, fontSize: 28, fontWeight: '800', marginBottom: 6, letterSpacing: -0.5 },
  subheading: { color: C.text2, fontSize: 15, marginBottom: 28 },

  modeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    gap: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  modeCardAI: { borderColor: C.goldBorder },
  modeIconWrap: {
    width: 50,
    height: 50,
    borderRadius: 14,
    backgroundColor: C.cardElev,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.borderMed,
  },
  modeIconAI: { backgroundColor: C.goldBg, borderColor: C.goldBorder },
  modeEmoji: { fontSize: 24 },
  modeText: { flex: 1 },
  modeTitle: { color: C.text, fontSize: 16, fontWeight: '700', marginBottom: 3, letterSpacing: -0.2 },
  modeMeta: { color: C.text3, fontSize: 9, fontWeight: '700', letterSpacing: 1, marginBottom: 5 },
  modeDesc: { color: C.text2, fontSize: 13, lineHeight: 18 },

  disclaimer: { color: C.text3, fontSize: 12, textAlign: 'center', marginTop: 6, lineHeight: 18 },

  // History
  historySection: { marginTop: 36 },
  historyLabel: { color: C.text3, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 14 },
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    gap: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  historyIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: C.cardElev,
    justifyContent: 'center',
    alignItems: 'center',
  },
  historyText: { flex: 1 },
  historyDate: { color: C.gold, fontSize: 11, fontWeight: '600', marginBottom: 3, letterSpacing: 0.3 },
  historySummary: { color: C.text2, fontSize: 12, lineHeight: 17 },
  historyActions: { flexDirection: 'row', alignItems: 'center' },

  // Nav
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  navBack: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: C.card,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  navTitle: { color: C.text, fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },
  navAction: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: C.card,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },

  // Saved banner
  savedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: C.goldBg,
    borderBottomWidth: 1,
    borderBottomColor: C.goldBorder,
    paddingVertical: 8,
  },
  savedBannerText: { color: C.gold, fontSize: 13, fontWeight: '600' },

  // Progress
  progressBar: { height: 2, backgroundColor: C.surface },
  progressFill: { height: 2, backgroundColor: C.gold },

  // Questionnaire
  questionContent: { padding: 22, paddingTop: 30 },
  questionEyebrow: { color: C.gold, fontSize: 10, fontWeight: '700', letterSpacing: 2, marginBottom: 10 },
  questionText: { color: C.text, fontSize: 22, fontWeight: '700', marginBottom: 28, lineHeight: 30, letterSpacing: -0.4 },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    gap: 14,
    borderWidth: 1,
    borderColor: C.border,
  },
  optionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: C.cardElev,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionEmoji: { fontSize: 22 },
  optionLabel: { flex: 1, color: C.text, fontSize: 15, fontWeight: '500', lineHeight: 20 },

  // Results
  resultsContent: { padding: 20, paddingTop: 22, paddingBottom: 24 },
  skinTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: C.goldBorder,
  },
  skinTypeIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: C.goldBg,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.goldBorder,
  },
  skinTypeEyebrow: { color: C.text3, fontSize: 9, fontWeight: '700', letterSpacing: 1.5, marginBottom: 4 },
  skinTypeLabel: { color: C.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },

  concernCard: {
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 18,
    marginBottom: 26,
    borderWidth: 1,
    borderColor: C.border,
  },
  concernEyebrow: { color: C.text3, fontSize: 9, fontWeight: '700', letterSpacing: 1.5, marginBottom: 8 },
  concernValue: { color: C.text, fontSize: 16, fontWeight: '600' },

  sectionLabel: { color: C.text3, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 6 },
  sectionSub: { color: C.text2, fontSize: 13, marginBottom: 16 },

  premiumHeader: {
    marginTop: 32,
    marginBottom: 14,
    backgroundColor: C.goldBg,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: C.goldBorder,
  },
  premiumHeaderRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6,
  },
  premiumHeaderLabel: {
    color: C.gold, fontSize: 11, fontWeight: '800', letterSpacing: 1.8,
  },
  premiumHeaderSub: {
    color: C.text2, fontSize: 13, lineHeight: 19,
  },

  resetBtn: {
    backgroundColor: C.card,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  resetText: { color: C.text2, fontSize: 15, fontWeight: '600' },

  // AI Camera
  cameraTopFade: { position: 'absolute', top: 0, left: 0, right: 0, height: 150 },
  cameraBottomFade: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 260 },
  cameraOverlay: { flex: 1, justifyContent: 'space-between' },
  cameraBack: {
    marginLeft: 18,
    marginTop: 8,
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  faceGuide: {
    width: 224,
    height: 284,
    borderRadius: 112,
    borderWidth: 1.5,
    borderColor: `${C.gold}80`,
    borderStyle: 'dashed',
    alignSelf: 'center',
  },
  cameraBottom: { alignItems: 'center', paddingBottom: 56, paddingTop: 24 },
  cameraHint: { color: 'rgba(255,255,255,0.5)', fontSize: 13, marginBottom: 22, letterSpacing: 0.3 },
  analyzeWrap: { borderRadius: 18, overflow: 'hidden' },
  analyzeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 36,
    paddingVertical: 17,
    borderRadius: 18,
  },
  analyzeBtnText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },

  // Analyzing
  analyzingIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: C.goldBg,
    borderWidth: 1,
    borderColor: C.goldBorder,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 28,
  },
  analyzingTitle: { color: C.text, fontSize: 20, fontWeight: '700', marginBottom: 8, letterSpacing: -0.3 },
  analyzingSubtitle: { color: C.text2, fontSize: 14 },

  // AI Result card
  aiResultCard: {
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 20,
    marginBottom: 22,
    borderWidth: 1,
    borderColor: C.goldBorder,
  },
  aiResultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  aiResultHeaderText: { color: C.gold, fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  aiResultText: { color: C.text2, fontSize: 14, lineHeight: 22 },
  aiResultHeading: { color: C.gold, fontSize: 14, fontWeight: '700', marginTop: 12, letterSpacing: 0.2 },

  // Chat
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
  },
  chatHeaderText: { color: C.text3, fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  chatBubble: {
    borderRadius: 16,
    padding: 13,
    marginBottom: 8,
    maxWidth: '88%',
  },
  chatUser: {
    backgroundColor: C.gold,
    alignSelf: 'flex-end',
    borderBottomRightRadius: 5,
  },
  chatAssistant: {
    backgroundColor: C.card,
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 5,
    borderWidth: 1,
    borderColor: C.border,
  },
  chatText: { color: '#fff', fontSize: 14, lineHeight: 21 },
  chatTextAssistant: { color: C.text },

  // Chat input bar
  chatInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: C.border,
    backgroundColor: C.bg,
  },
  chatInput: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 11,
    color: C.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: C.border,
  },
  sendBtn: { borderRadius: 22, overflow: 'hidden' },
  sendBtnGrad: {
    width: 42,
    height: 42,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
});
