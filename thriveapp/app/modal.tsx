import { Link } from 'expo-router';
import Head from 'expo-router/head';
import { StyleSheet, Text, View } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Typography } from '@/constants/theme';

export default function ModalScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Head>
        <title>Settings | Thrive Collective</title>
      </Head>
      <Text style={[styles.title, { color: theme.text }]}>This is a modal</Text>
      <Link href="/" dismissTo style={styles.link}>
        <Text style={[styles.linkText, { color: theme.tint }]}>Go to home screen</Text>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  title: {
    ...Typography.headline,
  },
  link: {
    marginTop: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  linkText: {
    ...Typography.footnote,
  },
});
