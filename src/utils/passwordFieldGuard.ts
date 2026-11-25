export interface PasswordKeyEventLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

const SELECTION_KEYS = new Set([
  'arrowleft',
  'arrowright',
  'arrowup',
  'arrowdown',
  'home',
  'end',
]);

/**
 * Returns true when a keyboard shortcut attempts to select, copy, or cut
 * text from a protected password input, while allowing normal typing,
 * editing, caret navigation, Enter submission, and Ctrl/Cmd+V autofill paste.
 */
export function isBlockedPasswordKeyCombo(event: PasswordKeyEventLike): boolean {
  const key = (event.key || '').toLowerCase();
  const hasPrimaryModifier = Boolean(event.ctrlKey || event.metaKey);

  if (hasPrimaryModifier && (key === 'c' || key === 'x' || key === 'a' || key === 'insert')) {
    return true;
  }

  if (event.shiftKey && SELECTION_KEYS.has(key)) {
    return true;
  }

  if (event.shiftKey && key === 'delete') {
    return true;
  }

  return false;
}

/**
 * Collapses any non-empty character range selection inside an HTMLInputElement
 * without disrupting single-caret placement for typing or deleting.
 */
export function collapseInputSelection(input: HTMLInputElement | null | undefined): void {
  if (!input) return;
  try {
    const start = input.selectionStart;
    const end = input.selectionEnd;
    if (start !== null && end !== null && start !== end) {
      input.setSelectionRange(end, end);
    }
  } catch {
    // Ignore browsers that throw on setSelectionRange for masked inputs
  }
  try {
    if (typeof window !== 'undefined' && typeof window.getSelection === 'function') {
      const sel = window.getSelection();
      if (sel && sel.type === 'Range') {
        sel.removeAllRanges();
      }
    }
  } catch {
    // Ignore selection cleanup failures
  }
}

export interface ClipboardEventLike {
  preventDefault: () => void;
  stopPropagation?: () => void;
  clipboardData?: Pick<DataTransfer, 'setData'> | null;
}

/**
 * Blocks copy/cut clipboard actions on protected password fields without
 * exposing or logging the password value.
 */
export function preventProtectedClipboardEvent(event: ClipboardEventLike): void {
  event.preventDefault();
  event.stopPropagation?.();
  try {
    event.clipboardData?.setData('text/plain', '');
  } catch {
    // Ignore read-only clipboardData errors
  }
}
