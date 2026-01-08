
import { useState, useEffect } from 'react';

// Server-backed replacement for client-side localStorage hook.
// Uses /api/storage/:key GET/POST endpoints to persist data in SQLite.
export function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(initialValue);

  // Load from server on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const resp = await fetch(`/api/storage/${encodeURIComponent(key)}`, { credentials: 'include' });
        if (!mounted) return;
        if (resp.ok) {
          const wrapper = await resp.json();
          // `success` response wrapper returns { success: true, data: ... }
          const data = wrapper && wrapper.data !== undefined ? wrapper.data : wrapper;
          if (data !== null && data !== undefined) setStoredValue(data as T);
        }
      } catch (e) {
        // network errors or auth issues: silently fall back to initialValue
        console.warn('useLocalStorage: failed to load from server', e && (e.message || e));
      }
    })();
    return () => { mounted = false; };
  }, [key]);

  // Persist to server whenever value changes
  useEffect(() => {
    (async () => {
      try {
        await fetch(`/api/storage/${encodeURIComponent(key)}`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(storedValue)
        });
      } catch (e) {
        console.warn('useLocalStorage: failed to save to server', e && (e.message || e));
      }
    })();
  }, [key, storedValue]);

  return [storedValue, setStoredValue] as const;
}
