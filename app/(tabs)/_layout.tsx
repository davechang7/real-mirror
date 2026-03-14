import { Tabs } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HapticTab } from '@/components/haptic-tab';
import { C } from '@/constants/theme';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon({ name, color, focused }: { name: IoniconsName; color: string; focused: boolean }) {
  return (
    <View style={{ alignItems: 'center', paddingTop: 2 }}>
      <Ionicons name={name} size={24} color={color} />
      {focused && (
        <View style={{
          width: 22, height: 2.5, borderRadius: 2,
          backgroundColor: C.gold, marginTop: 4,
          shadowColor: C.gold, shadowOpacity: 0.5,
          shadowRadius: 4, shadowOffset: { width: 0, height: 0 },
        }} />
      )}
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: C.gold,
        tabBarInactiveTintColor: C.text2,
        tabBarStyle: {
          backgroundColor: C.bg,
          borderTopWidth: 1,
          borderTopColor: C.border,
          height: 74,
          paddingBottom: 12,
          paddingTop: 8,
          shadowColor: C.gold,
          shadowOpacity: 0.06,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: -2 },
          elevation: 4,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          letterSpacing: 0.4,
          marginTop: -4,
        },
        headerShown: false,
        tabBarButton: HapticTab,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Mirror',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="camera-reverse-outline" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: 'Skin Scan',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="scan-outline" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="workouts"
        options={{
          title: 'Workouts',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="body-outline" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="eyebrows"
        options={{
          title: 'Eyebrows',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="eye-outline" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen name="explore" options={{ href: null }} />
    </Tabs>
  );
}
