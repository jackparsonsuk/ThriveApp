import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, Stack } from 'expo-router';
import Markdown from 'react-native-markdown-display';
import { Asset } from 'expo-asset';
// Import legacy API to resolve deprecation warning
import * as FileSystem from 'expo-file-system/legacy';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radii } from '@/constants/theme';

export default function ChangelogScreen() {
    const router = useRouter();
    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];
    const [content, setContent] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadChangelog() {
            try {
                // Load the CHANGELOG.md file as an asset
                const asset = Asset.fromModule(require('../CHANGELOG.md'));
                await asset.downloadAsync();
                
                const uri = asset.localUri || asset.uri;
                
                if (uri) {
                    let fileContent = '';
                    if (Platform.OS === 'web') {
                        // On Web, fetching the URI directly is more reliable
                        const response = await fetch(uri);
                        fileContent = await response.text();
                    } else {
                        // On native, use the legacy FileSystem API
                        fileContent = await FileSystem.readAsStringAsync(uri);
                    }
                    setContent(fileContent);
                } else {
                    console.error('Failed to get URI for CHANGELOG.md');
                }
            } catch (error) {
                console.error('Error loading changelog:', error);
            } finally {
                setLoading(false);
            }
        }

        loadChangelog();
    }, []);

    const markdownStyles = StyleSheet.create({
        body: {
            color: theme.text,
            fontSize: 16,
            lineHeight: 24,
        },
        heading1: {
            color: theme.text,
            fontSize: 32,
            fontWeight: 'bold',
            marginBottom: 20,
        },
        heading2: {
            color: theme.text,
            fontSize: 24,
            fontWeight: 'bold',
            marginTop: 20,
            marginBottom: 10,
        },
        heading3: {
            color: theme.text,
            fontSize: 18,
            fontWeight: '600',
            marginTop: 15,
            marginBottom: 8,
        },
        hr: {
            backgroundColor: theme.border,
            height: 1,
            marginVertical: 20,
        },
        bullet_list: {
            marginBottom: 10,
        },
        list_item: {
            flexDirection: 'row',
            justifyContent: 'flex-start',
            alignItems: 'flex-start',
            marginBottom: 5,
        },
        bullet_list_icon: {
            color: theme.tint,
            fontSize: 20,
            marginRight: 10,
        },
        paragraph: {
            marginBottom: 10,
        },
    });

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
            <Stack.Screen options={{ 
                title: 'Changelog',
                headerShown: true,
                headerTransparent: false,
                headerStyle: { backgroundColor: theme.card },
                headerTintColor: theme.text,
                headerLeft: () => (
                    <TouchableOpacity onPress={() => router.back()} style={{ marginLeft: 15 }}>
                        <Ionicons name="chevron-back" size={24} color={theme.tint} />
                    </TouchableOpacity>
                ),
            }} />
            
            <ScrollView contentContainerStyle={styles.content}>
                <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    {loading ? (
                        <ActivityIndicator size="large" color={theme.tint} />
                    ) : content ? (
                        <Markdown style={markdownStyles}>
                            {content}
                        </Markdown>
                    ) : null}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    content: {
        padding: 20,
    },
    card: {
        padding: 20,
        borderRadius: Radii.xl,
        borderWidth: StyleSheet.hairlineWidth,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 2,
    },
});
