import React from 'react';
import { Text } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { colors } from '@/theme';
import StudioHubScreen from '@/screens/StudioHubScreen';
import SettingsScreen from '@/screens/SettingsScreen';
import GenerateScreen from '@/screens/GenerateScreen';
import ProjectScreen from '@/screens/ProjectScreen';
import StoryboardScreen from '@/screens/StoryboardScreen';
import VoiceScreen from '@/screens/VoiceScreen';
import AssemblyScreen from '@/screens/AssemblyScreen';
import ThumbnailScreen from '@/screens/ThumbnailScreen';
import PublishScreen from '@/screens/PublishScreen';
import TopicBankScreen from '@/screens/TopicBankScreen';
import type { RootStackParamList, TabParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<TabParamList>();

const screenOptions = {
  headerStyle: { backgroundColor: colors.surface },
  headerTintColor: colors.text,
  headerTitleStyle: { fontWeight: '700' as const },
  contentStyle: { backgroundColor: colors.bg },
};

function TabsNavigator() {
  return (
    <Tabs.Navigator
      screenOptions={{
        ...screenOptions,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textFaint,
      }}
    >
      <Tabs.Screen
        name="Studio"
        component={StudioHubScreen}
        options={{
          title: 'Studio',
          headerShown: false,
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>🎬</Text>,
        }}
      />
      <Tabs.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: 'Settings',
          headerShown: false,
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>⚙️</Text>,
        }}
      />
    </Tabs.Navigator>
  );
}

export default function Navigation() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="Tabs" component={TabsNavigator} options={{ headerShown: false }} />
      <Stack.Screen name="Generate" component={GenerateScreen} options={{ title: 'New script' }} />
      <Stack.Screen name="Project" component={ProjectScreen} options={{ title: 'Project' }} />
      <Stack.Screen name="Storyboard" component={StoryboardScreen} options={{ title: 'Storyboard' }} />
      <Stack.Screen name="Voice" component={VoiceScreen} options={{ title: 'Voice' }} />
      <Stack.Screen name="Assembly" component={AssemblyScreen} options={{ title: 'Assembly' }} />
      <Stack.Screen name="Thumbnail" component={ThumbnailScreen} options={{ title: 'Thumbnail' }} />
      <Stack.Screen name="Publish" component={PublishScreen} options={{ title: 'Publish' }} />
      <Stack.Screen name="TopicBank" component={TopicBankScreen} options={{ title: 'Topic bank' }} />
    </Stack.Navigator>
  );
}
