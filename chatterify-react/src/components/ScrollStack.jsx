import { useLayoutEffect, useRef, useCallback } from 'react';
import './ScrollStack.css';

export const ScrollStackItem = ({ children, itemClassName = '' }) => (
  <div className={`scroll-stack-card ${itemClassName}`.trim()}>{children}</div>
);

const ScrollStack = ({
  children,
  className = '',
  itemDistance = 100,
  itemScale = 0.03,
  itemStackDistance = 30,
  stackPosition = '20%',
  scaleEndPosition = '10%',
  baseScale = 0.85,
  scaleDuration = 0.5,
  rotationAmount = 0,
  blurAmount = 0,
  useWindowScroll = false,
  onStackComplete
}) => {
  const scrollerRef = useRef(null);
  const stackCompletedRef = useRef(false);
  const animationFrameRef = useRef(null);
  const lenisRef = useRef(null);
  const cardsRef = useRef([]);
  const cardOffsetsRef = useRef([]);
  const endOffsetRef = useRef(0);
  const targetsRef = useRef([]);
  const currentsRef = useRef([]);
  const rafActiveRef = useRef(false);
  const lastTransformsRef = useRef(new Map());
  const isUpdatingRef = useRef(false);

  const calculateProgress = useCallback((scrollTop, start, end) => {
    if (scrollTop < start) return 0;
    if (scrollTop > end) return 1;
    return (scrollTop - start) / (end - start);
  }, []);

  const parsePercentage = useCallback((value, containerHeight) => {
    if (typeof value === 'string' && value.includes('%')) {
      return (parseFloat(value) / 100) * containerHeight;
    }
    return parseFloat(value);
  }, []);

  const getScrollData = useCallback(() => {
    if (useWindowScroll) {
      return {
        scrollTop: window.scrollY,
        containerHeight: window.innerHeight,
        scrollContainer: document.documentElement
      };
    } else {
      const scroller = scrollerRef.current;
      return {
        scrollTop: scroller.scrollTop,
        containerHeight: scroller.clientHeight,
        scrollContainer: scroller
      };
    }
  }, [useWindowScroll]);

  const getElementOffset = useCallback(
    element => {
      if (useWindowScroll) {
        const rect = element.getBoundingClientRect();
        return rect.top + window.scrollY;
      } else {
        return element.offsetTop;
      }
    },
    [useWindowScroll]
  );

  const updateCardTransforms = useCallback(() => {
    if (!cardsRef.current.length || isUpdatingRef.current) return;

    isUpdatingRef.current = true;

    const { scrollTop, containerHeight } = getScrollData();
    const stackPositionPx = parsePercentage(stackPosition, containerHeight);
    const scaleEndPositionPx = parsePercentage(scaleEndPosition, containerHeight);

    const endElementTop = endOffsetRef.current;

    cardsRef.current.forEach((card, i) => {
      if (!card) return;

      const cardTop = cardOffsetsRef.current[i];
      const triggerStart = cardTop - stackPositionPx - itemStackDistance * i;
      const triggerEnd = cardTop - scaleEndPositionPx;
      const pinStart = cardTop - stackPositionPx - itemStackDistance * i;
      const pinEnd = endElementTop - stackPositionPx - itemStackDistance * (cardsRef.current.length - 1);

      const scaleProgress = calculateProgress(scrollTop, triggerStart, triggerEnd);
      const targetScale = baseScale + i * itemScale;
      const scale = 1 - scaleProgress * (1 - targetScale);
      const rotation = rotationAmount ? i * rotationAmount * scaleProgress : 0;

      let blur = 0;
      if (blurAmount) {
        let topCardIndex = 0;
        for (let j = 0; j < cardsRef.current.length; j++) {
          const jCardTop = cardOffsetsRef.current[j];
          const jTriggerStart = jCardTop - stackPositionPx - itemStackDistance * j;
          if (scrollTop >= jTriggerStart) {
            topCardIndex = j;
          }
        }

        if (i < topCardIndex) {
          const depthInStack = topCardIndex - i;
          blur = Math.max(0, depthInStack * blurAmount);
        }
      }

      const isPinned = scrollTop >= pinStart && scrollTop <= pinEnd;

      card.style.transform = `scale(${scale}) rotate(${rotation}deg)`;
      card.style.filter = blur > 0 ? `blur(${blur}px)` : '';

      if (i === cardsRef.current.length - 1) {
        const isInView = scrollTop >= pinStart && scrollTop <= pinEnd;
        if (isInView && !stackCompletedRef.current) {
          stackCompletedRef.current = true;
          onStackComplete?.();
        } else if (!isInView && stackCompletedRef.current) {
          stackCompletedRef.current = false;
        }
      }
    });

    isUpdatingRef.current = false;
  }, [
    itemScale,
    itemStackDistance,
    stackPosition,
    scaleEndPosition,
    baseScale,
    rotationAmount,
    blurAmount,
    useWindowScroll,
    onStackComplete,
    calculateProgress,
    parsePercentage,
    getScrollData,
    getElementOffset
  ]);

  const startRaf = useCallback(() => {
    if (rafActiveRef.current) return;
    rafActiveRef.current = true;
    const lerp = 0.18;
    const tick = () => {
      const cards = cardsRef.current;
      const targets = targetsRef.current;
      const currents = currentsRef.current;
      let stillMoving = false;
      for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        const t = targets[i];
        if (!card || !t) continue;
        let c = currents[i];
        if (!c) {
          c = { translateY: 0, scale: 1, rotation: 0, blur: 0 };
          currents[i] = c;
        }
        c.translateY += (t.translateY - c.translateY) * lerp;
        c.scale += (t.scale - c.scale) * lerp;
        c.rotation += (t.rotation - c.rotation) * lerp;
        c.blur += (t.blur - c.blur) * lerp;

        if (
          Math.abs(t.translateY - c.translateY) > 0.05 ||
          Math.abs(t.scale - c.scale) > 0.0005 ||
          Math.abs(t.rotation - c.rotation) > 0.05 ||
          Math.abs(t.blur - c.blur) > 0.05
        ) stillMoving = true;

        card.style.transform = `translate3d(0, ${c.translateY}px, 0) scale(${c.scale}) rotate(${c.rotation}deg)`;
        card.style.filter = c.blur > 0.1 ? `blur(${c.blur}px)` : '';
      }
      if (stillMoving) {
        animationFrameRef.current = requestAnimationFrame(tick);
      } else {
        rafActiveRef.current = false;
      }
    };
    animationFrameRef.current = requestAnimationFrame(tick);
  }, []);

  const measureOffsets = useCallback(() => {
    const cards = cardsRef.current;
    const prevTransforms = cards.map(c => c.style.transform);
    cards.forEach(c => { c.style.transform = ''; });

    cardOffsetsRef.current = cards.map(c => {
      const rect = c.getBoundingClientRect();
      return useWindowScroll
        ? rect.top + window.scrollY
        : c.offsetTop;
    });

    const endEl = useWindowScroll
      ? document.querySelector('.scroll-stack-end')
      : scrollerRef.current?.querySelector('.scroll-stack-end');
    if (endEl) {
      const r = endEl.getBoundingClientRect();
      endOffsetRef.current = useWindowScroll ? r.top + window.scrollY : endEl.offsetTop;
    }

    cards.forEach((c, i) => { c.style.transform = prevTransforms[i] || ''; });
  }, [useWindowScroll]);

  const tickingRef = useRef(false);
  const handleScroll = useCallback(() => {
    if (tickingRef.current) return;
    tickingRef.current = true;
    requestAnimationFrame(() => {
      updateCardTransforms();
      tickingRef.current = false;
    });
  }, [updateCardTransforms]);

  const handleResize = useCallback(() => {
    measureOffsets();
    updateCardTransforms();
  }, [measureOffsets, updateCardTransforms]);

  const setupLenis = useCallback(() => {
    const target = useWindowScroll ? window : scrollerRef.current;
    if (!target) return;
    target.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize, { passive: true });
    window.addEventListener('load', handleResize, { passive: true });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => handleResize());
    }
    return () => {
      target.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('load', handleResize);
    };
  }, [handleScroll, handleResize, useWindowScroll]);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const cards = Array.from(
      useWindowScroll
        ? document.querySelectorAll('.scroll-stack-card')
        : scroller.querySelectorAll('.scroll-stack-card')
    );

    cardsRef.current = cards;
    const transformsCache = lastTransformsRef.current;

    const containerHeight = useWindowScroll ? window.innerHeight : (scrollerRef.current?.clientHeight || 0);
    const stickyBase = typeof stackPosition === 'string' && stackPosition.includes('%')
      ? (parseFloat(stackPosition) / 100) * containerHeight
      : parseFloat(stackPosition);

    cards.forEach((card, i) => {
      if (i < cards.length - 1) {
        card.style.marginBottom = `${itemDistance}px`;
      }
      card.style.position = 'sticky';
      card.style.top = `${stickyBase + itemStackDistance * i}px`;
      card.style.willChange = 'transform, filter';
      card.style.transformOrigin = 'top center';
      card.style.backfaceVisibility = 'hidden';
    });

    measureOffsets();
    const cleanupListeners = setupLenis();

    updateCardTransforms();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (cleanupListeners) cleanupListeners();
      stackCompletedRef.current = false;
      cardsRef.current = [];
      transformsCache.clear();
      isUpdatingRef.current = false;
    };
  }, [
    itemDistance,
    itemScale,
    itemStackDistance,
    stackPosition,
    scaleEndPosition,
    baseScale,
    scaleDuration,
    rotationAmount,
    blurAmount,
    useWindowScroll,
    onStackComplete,
    setupLenis,
    measureOffsets,
    updateCardTransforms
  ]);

  return (
    <div className={`scroll-stack-scroller ${className}`.trim()} ref={scrollerRef}>
      <div className="scroll-stack-inner">
        {children}
        <div className="scroll-stack-end" />
      </div>
    </div>
  );
};

export default ScrollStack;
