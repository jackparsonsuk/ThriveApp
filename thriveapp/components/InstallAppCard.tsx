import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import { Card, SectionHeader, SegmentedControl, Button } from '@/components/ui';
import { canPromptInstall, isAppleMobile, isRunningAsInstalledApp, onInstallPromptChange, promptInstall } from '@/utils/installPrompt';

type Device = 'iphone' | 'android';

const STEPS: Record<Device, { icon: keyof typeof Ionicons.glyphMap; text: string }[]> = {
  iphone: [
    { icon: 'share-outline', text: 'In Safari, tap the Share button at the bottom of the screen.' },
    { icon: 'add-circle-outline', text: 'Scroll down and tap "Add to Home Screen".' },
    { icon: 'checkmark-circle-outline', text: 'Tap "Add" in the top corner.' },
  ],
  android: [
    { icon: 'ellipsis-vertical', text: 'In Chrome, tap the menu in the top-right corner.' },
    { icon: 'download-outline', text: 'Tap "Add to Home screen" or "Install app".' },
    { icon: 'checkmark-circle-outline', text: 'Tap "Install" to confirm.' },
  ],
};

const NOTES: Record<Device, string> = {
  iphone: 'Using Chrome on iPhone? Tap the Share button in the address bar instead, then Add to Home Screen.',
  android: 'Other browsers have the same option in their menu, sometimes called "Add to Home screen".',
};

/** Shows members how to add Thrive to their home screen. Web only, and hidden once it's installed. */
export default function InstallAppCard() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const [installed, setInstalled] = useState(isRunningAsInstalledApp);
  const [canPrompt, setCanPrompt] = useState(canPromptInstall);
  const [device, setDevice] = useState<Device>(() => (isAppleMobile() ? 'iphone' : 'android'));

  useEffect(() => onInstallPromptChange(() => setCanPrompt(canPromptInstall())), []);

  if (Platform.OS !== 'web' || installed) return null;

  const handleInstall = async () => {
    if (await promptInstall()) setInstalled(true);
  };

  return (
    <View style={styles.section}>
      <SectionHeader title="Get the App" />
      <Card>
        <Text style={[styles.intro, { color: theme.textSecondary }]}>
          Add Thrive to your home screen to open it like an app: full screen and one tap away.
        </Text>

        {canPrompt && (
          <Button variant="primary" icon="download-outline" label="Install app" onPress={handleInstall} style={styles.installButton} />
        )}

        <SegmentedControl
          options={[{ value: 'iphone', label: 'iPhone' }, { value: 'android', label: 'Android' }]}
          value={device}
          onChange={setDevice}
        />

        <View style={styles.steps}>
          {STEPS[device].map((step, i) => (
            <View key={step.text} style={styles.step}>
              <View style={[styles.stepNumber, { backgroundColor: theme.tintMuted }]}>
                <Text style={[styles.stepNumberText, { color: theme.tint }]}>{i + 1}</Text>
              </View>
              <Text style={[styles.stepText, { color: theme.text }]}>{step.text}</Text>
              <Ionicons name={step.icon} size={20} color={theme.icon} accessibilityElementsHidden importantForAccessibility="no" />
            </View>
          ))}
        </View>

        <Text style={[styles.note, { color: theme.textTertiary }]}>{NOTES[device]}</Text>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: Spacing.xxl,
  },
  intro: {
    ...Typography.subhead,
    fontWeight: '400',
    marginBottom: Spacing.lg,
  },
  installButton: {
    marginBottom: Spacing.lg,
  },
  steps: {
    marginTop: Spacing.lg,
    gap: Spacing.md,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: Radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    ...Typography.footnote,
    fontWeight: '700',
  },
  stepText: {
    ...Typography.subhead,
    fontWeight: '400',
    flex: 1,
  },
  note: {
    ...Typography.footnote,
    fontWeight: '400',
    marginTop: Spacing.lg,
  },
});
