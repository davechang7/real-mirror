import React, { useState, useRef } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  Image,
  Alert,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { C, GRAD } from '@/constants/theme';

export default function MirrorScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [mediaPermission, requestMediaPermission] = MediaLibrary.usePermissions();
  const [isRealMode, setIsRealMode] = useState(true);
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const cameraRef = useRef<CameraView>(null);

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

  // ─── Photo Preview ───────────────────────────────────────────────
  if (capturedUri) {
    return (
      <View style={styles.container}>
        <Image source={{ uri: capturedUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        <LinearGradient
          colors={['rgba(0,0,0,0.5)', 'transparent']}
          style={styles.previewTopFade}
        />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.75)']}
          style={styles.previewBottomFade}
        />
        <SafeAreaView style={styles.previewOverlay}>
          <View style={styles.previewLabelWrap}>
            <Text style={styles.previewLabel}>
              {isRealMode ? '✦  How others see you' : '◈  Mirror view'}
            </Text>
          </View>
          <View style={styles.previewButtons}>
            <TouchableOpacity style={styles.retakeBtn} onPress={() => setCapturedUri(null)} activeOpacity={0.8}>
              <Ionicons name="refresh" size={18} color={C.text} />
              <Text style={styles.retakeBtnText}>Retake</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={savePhoto} activeOpacity={0.85}>
              <LinearGradient colors={GRAD.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.saveBtnGrad}>
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
  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={[StyleSheet.absoluteFill, isRealMode && { transform: [{ scaleX: -1 }] }]}
        facing="front"
      />

      {/* Top gradient + brand */}
      <LinearGradient
        colors={['rgba(0,0,0,0.55)', 'transparent']}
        style={styles.topGradient}
      >
        <SafeAreaView style={styles.topBar}>
          <Text style={styles.appName}>REAL  MIRROR</Text>

          {/* Toggle */}
          <View style={styles.toggle}>
            <TouchableOpacity
              style={[styles.toggleOption, !isRealMode && styles.toggleSelected]}
              onPress={() => setIsRealMode(false)}
              activeOpacity={0.8}
            >
              <Text style={[styles.toggleText, !isRealMode && styles.toggleTextSelected]}>
                Mirror
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleOption, isRealMode && styles.toggleSelected]}
              onPress={() => setIsRealMode(true)}
              activeOpacity={0.8}
            >
              <Text style={[styles.toggleText, isRealMode && styles.toggleTextSelected]}>
                Real
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </LinearGradient>

      {/* Bottom gradient + shutter */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.7)']}
        style={styles.bottomGradient}
      >
        <Text style={styles.modeLabel}>
          {isRealMode ? '✦  How others see you' : '◈  Mirrored — how a mirror shows you'}
        </Text>

        <TouchableOpacity style={styles.shutterWrap} onPress={takePhoto} activeOpacity={0.85}>
          <View style={[styles.shutterRing, isRealMode && styles.shutterRingGold]}>
            <View style={[styles.shutterInner, isRealMode && styles.shutterInnerGold]} />
          </View>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  centered:  { justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: C.bg },

  // Permission screen
  permIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: C.goldBg,
    borderWidth: 1,
    borderColor: C.goldBorder,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 28,
  },
  permTitle: { color: C.text, fontSize: 22, fontWeight: '700', marginBottom: 12, textAlign: 'center' },
  permText: { color: C.text2, fontSize: 15, textAlign: 'center', lineHeight: 23, marginBottom: 32 },
  permButton: { borderRadius: 16, overflow: 'hidden' },
  permButtonGrad: { paddingHorizontal: 40, paddingVertical: 16, borderRadius: 16 },
  permButtonText: { color: '#fff', fontWeight: '700', fontSize: 16, letterSpacing: 0.3 },

  // Camera top
  topGradient: { position: 'absolute', top: 0, left: 0, right: 0, paddingBottom: 40 },
  topBar: { alignItems: 'center', paddingTop: 4 },
  appName: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 4,
    marginBottom: 14,
  },
  toggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 26,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  toggleOption: { paddingHorizontal: 28, paddingVertical: 10, borderRadius: 22 },
  toggleSelected: { backgroundColor: C.gold },
  toggleText: { color: 'rgba(255,255,255,0.45)', fontWeight: '600', fontSize: 14 },
  toggleTextSelected: { color: '#fff', letterSpacing: 0.2 },

  // Camera bottom
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 60,
    alignItems: 'center',
  },
  modeLabel: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    letterSpacing: 0.5,
    marginBottom: 28,
    fontWeight: '500',
  },
  shutterWrap: { alignItems: 'center', justifyContent: 'center' },
  shutterRing: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shutterRingGold: { borderColor: C.gold },
  shutterInner: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  shutterInnerGold: { backgroundColor: C.gold },

  // Preview
  previewTopFade: { position: 'absolute', top: 0, left: 0, right: 0, height: 140 },
  previewBottomFade: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 220 },
  previewOverlay: { flex: 1, justifyContent: 'space-between' },
  previewLabelWrap: { alignItems: 'center', marginTop: 20 },
  previewLabel: {
    color: C.text,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.5,
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  previewButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 14,
    paddingBottom: 56,
    paddingHorizontal: 24,
  },
  retakeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  retakeBtnText: { color: C.text, fontWeight: '600', fontSize: 15 },
  saveBtn: { borderRadius: 16, overflow: 'hidden', flex: 1 },
  saveBtnGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 16,
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
