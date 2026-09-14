import { useEffect, useRef } from 'react';

/**
 * Tracks whether the component is still mounted.
 *
 * Network work here regularly outlives the screen that started it — a script
 * generation or an upload keeps running if you navigate away. Writing state
 * after that point leaks the render tree and, for anything holding a native
 * handle, can touch a released object.
 */
export function useMounted(): { readonly current: boolean } {
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  return mounted;
}
