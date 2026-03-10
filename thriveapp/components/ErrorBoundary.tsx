import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Platform } from 'react-native';
import { logErrorToFirestore } from '../services/errorService';
import { Colors } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorId: string | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorId: null };
  }

  static getDerivedStateFromError(_: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, errorId: null };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log the error to Firestore
    logErrorToFirestore(error).then((id) => {
      this.setState({ errorId: id });
    });
    
    // Also log to console for development
    console.error("Uncaught error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, errorId: null });
    // Note: In an Expo/React Native app, you might want to use router.replace('/')
    // or similar to reset the app state.
  };

  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={styles.container}>
          <View style={styles.content}>
            <View style={styles.iconContainer}>
              <Ionicons name="alert-circle-outline" size={80} color={Colors.light.tint} />
            </View>
            
            <Text style={styles.title}>Oops! Something went wrong.</Text>
            <Text style={styles.message}>
              We've experienced an unexpected problem. Our team has been notified.
            </Text>
            
            <View style={styles.errorIdContainer}>
              <Text style={styles.errorIdLabel}>Error Reference ID:</Text>
              <Text style={styles.errorIdValue}>{this.state.errorId || 'Loading...'}</Text>
            </View>

            <Text style={styles.instruction}>
              Please send this ID to the IT team if the problem persists.
            </Text>

            <TouchableOpacity 
              style={styles.button} 
              onPress={() => {
                if (Platform.OS === 'web') {
                  window.location.reload();
                } else {
                  this.handleReset();
                }
              }}
            >
              <Text style={styles.buttonText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    width: '85%',
    alignItems: 'center',
    padding: 24,
    borderRadius: 16,
    backgroundColor: '#f9f9f9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  iconContainer: {
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#333',
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  errorIdContainer: {
    backgroundColor: '#eee',
    padding: 12,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
    marginBottom: 16,
  },
  errorIdLabel: {
    fontSize: 12,
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  errorIdValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.light.tint,
  },
  instruction: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginBottom: 30,
  },
  button: {
    backgroundColor: Colors.light.tint,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ErrorBoundary;
