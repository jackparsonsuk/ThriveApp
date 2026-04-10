import { useRef, useCallback, useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * A hook that enables "click and drag" scrolling for ScrollView or FlatList on Web.
 * This simulates touch scrolling using mouse events.
 */
export const useMouseDragScroll = (ref: any) => {
  // Only apply logic on Web
  if (Platform.OS !== 'web') return {};

  const isDown = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);
  const currentScrollX = useRef(0);
  const hasMoved = useRef(false);

  // Track current scroll position to know where to start dragging from
  const onScroll = useCallback((e: any) => {
    currentScrollX.current = e.nativeEvent.contentOffset.x;
  }, []);

  const onMouseDown = (e: any) => {
    isDown.current = true;
    startX.current = e.pageX;
    scrollLeft.current = currentScrollX.current;
    hasMoved.current = false;
  };

  const onMouseMove = (e: any) => {
    if (!isDown.current) return;
    
    const x = e.pageX;
    const walk = (x - startX.current);
    
    // threshold to distinguish click from drag
    if (Math.abs(walk) > 5) {
        hasMoved.current = true;
        e.preventDefault();
    }

    if (hasMoved.current && ref.current) {
        const newOffset = scrollLeft.current - walk;
        
        // ScrollView uses scrollTo, FlatList uses scrollToOffset (usually)
        // But FlatList ref actually has a getScrollResponder or internal methods.
        // On Web, FlatList's ref often points to the ScrollView component.
        const scrollResponder = ref.current.getScrollResponder ? ref.current.getScrollResponder() : ref.current;
        
        if (scrollResponder.scrollToOffset) {
            scrollResponder.scrollToOffset({ offset: newOffset, animated: false });
        } else if (scrollResponder.scrollTo) {
            scrollResponder.scrollTo({ x: newOffset, animated: false });
        }
    }
  };

  const onMouseUp = () => {
    isDown.current = false;
  };

  const onMouseLeave = () => {
    isDown.current = false;
  };

  return {
    onScroll,
    // These props should be spread onto the container View or the FlatList itself
    dragProps: {
      onMouseDown,
      onMouseMove,
      onMouseUp,
      onMouseLeave,
    }
  };
};
