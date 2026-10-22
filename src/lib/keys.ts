/** The launcher's shortcut as this keyboard writes it: ⌘K on Apple devices, Ctrl K everywhere else */
export const LAUNCH_KEY = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘K' : 'Ctrl K'

/**
 * ⌘K or Ctrl K with no other modifier: the one key that opens and closes the launcher from
 * anywhere, dialogs included. The modifiers go first because some autofill keydowns carry no key.
 */
export function isLaunchKey(e: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>): boolean {
  return (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k'
}
