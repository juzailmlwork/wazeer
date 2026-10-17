import { useState, useEffect } from 'react';

/**
 * True while the viewport is at or below `maxWidth`.
 *
 * For the cases where a phone needs different *markup*, not just different CSS — a side
 * panel that becomes a dialog, say. Anything that can be done with a media query in
 * index.css should be done there instead.
 *
 * The default matches the breakpoint where .split stops being two columns.
 */
export default function useIsNarrow(maxWidth = 900) {
  const query = `(max-width: ${maxWidth}px)`;

  // Read synchronously on first render so the correct layout paints immediately
  // rather than flipping after mount.
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = (e) => setNarrow(e.matches);
    setNarrow(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);

  return narrow;
}
