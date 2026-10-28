/**
 * Read and save optional browser preferences without making storage a startup dependency.
 * Values belong to this origin/profile; they never enter backend or provider configuration.
 */

/**
 * Return the stored string, preserving an intentionally empty value.
 */
export function readPreference(key: string, fallback: string): string {
  try {
    return window.localStorage.getItem(key) ?? fallback
  } catch {
    // Restricted browser profiles may disable storage; defaults remain usable.
    return fallback
  }
}

/**
 * Save a value, or remove its key when null; retain session state if storage is blocked.
 */
export function savePreference(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch {
    // Persistence is optional. React state remains the current session's source of truth.
  }
}
