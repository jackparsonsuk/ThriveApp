import React, { useEffect, useMemo, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

/**
 * A short, decorative fireworks display for Bonfire Night. Rockets rise, burst and fade,
 * then it stops. Sits over its parent without catching touches, and doesn't play at all
 * when the device asks for reduced motion.
 */

const COLOURS = ['#F26122', '#FFB703', '#FF4D8D', '#9B5DE5', '#2EC4B6'];
const GLINT = '#FFD166';
const SPARKS_PER_BURST = 14;
const RISE_MS = 450;
const BURST_MS = 1100;

interface BurstSpec {
  x: number; // 0–1 across the area
  y: number; // 0–1 down the area
  delay: number;
  colour: string;
  radius: number;
}

const makeBursts = (count: number): BurstSpec[] =>
  Array.from({ length: count }, (_, i) => ({
    x: 0.12 + Math.random() * 0.76,
    y: 0.15 + Math.random() * 0.45,
    delay: i * 450 + Math.random() * 200,
    colour: COLOURS[i % COLOURS.length],
    radius: 38 + Math.random() * 26,
  }));

function Spark({ progress, angle, radius, colour }: { progress: SharedValue<number>; angle: number; radius: number; colour: string }) {
  const style = useAnimatedStyle(() => {
    // 0–1 is the rocket rising, 1–2 is the burst
    const t = Math.max(0, progress.value - 1);
    const dist = radius * (1 - Math.pow(1 - t, 3));
    return {
      opacity: progress.value < 1 ? 0 : 1 - t * t,
      transform: [
        { translateX: Math.cos(angle) * dist },
        { translateY: Math.sin(angle) * dist + 18 * t * t }, // a little gravity
        { scale: 1 - t * 0.5 },
      ],
    };
  });
  return <Animated.View style={[styles.spark, { backgroundColor: colour }, style]} />;
}

function Burst({ spec, width, height }: { spec: BurstSpec; width: number; height: number }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      spec.delay,
      withTiming(1, { duration: RISE_MS, easing: Easing.out(Easing.quad) }, () => {
        progress.value = withTiming(2, { duration: BURST_MS, easing: Easing.linear });
      }),
    );
  }, [progress, spec.delay]);

  const cx = spec.x * width;
  const cy = spec.y * height;
  const riseFrom = height - cy;

  const rocketStyle = useAnimatedStyle(() => ({
    opacity: progress.value > 0 && progress.value < 1 ? 1 : 0,
    transform: [{ translateY: riseFrom * (1 - Math.min(progress.value, 1)) }],
  }));

  const angles = useMemo(
    () => Array.from({ length: SPARKS_PER_BURST }, (_, i) => (i / SPARKS_PER_BURST) * Math.PI * 2 + Math.random() * 0.2),
    [],
  );

  return (
    <View style={[styles.burst, { left: cx, top: cy }]}>
      <Animated.View style={[styles.rocket, { backgroundColor: spec.colour }, rocketStyle]} />
      {angles.map((angle, i) => (
        <Spark key={i} progress={progress} angle={angle} radius={spec.radius} colour={i % 3 === 0 ? GLINT : spec.colour} />
      ))}
    </View>
  );
}

/** Change `playKey` to set the display off again. */
export function Fireworks({ playKey = 0, bursts = 5 }: { playKey?: number; bursts?: number }) {
  const reduceMotion = useReducedMotion();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const specs = useMemo(() => makeBursts(bursts), [bursts, playKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  };

  if (reduceMotion) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={onLayout} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {size.width > 0 && specs.map((spec, i) => (
        <Burst key={`${playKey}-${i}`} spec={spec} width={size.width} height={size.height} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  burst: { position: 'absolute', width: 0, height: 0 },
  spark: { position: 'absolute', width: 5, height: 5, borderRadius: 2.5, marginLeft: -2.5, marginTop: -2.5 },
  rocket: { position: 'absolute', width: 3, height: 10, borderRadius: 1.5, marginLeft: -1.5 },
});
