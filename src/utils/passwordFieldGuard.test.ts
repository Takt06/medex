import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isBlockedPasswordKeyCombo,
  preventProtectedClipboardEvent,
} from './passwordFieldGuard';

test('isBlockedPasswordKeyCombo blocks copy, cut, select-all, and keyboard selection shortcuts', () => {
  assert.equal(isBlockedPasswordKeyCombo({ key: 'c', ctrlKey: true }), true);
  assert.equal(isBlockedPasswordKeyCombo({ key: 'C', metaKey: true }), true);
  assert.equal(isBlockedPasswordKeyCombo({ key: 'x', ctrlKey: true }), true);
  assert.equal(isBlockedPasswordKeyCombo({ key: 'X', metaKey: true }), true);
  assert.equal(isBlockedPasswordKeyCombo({ key: 'a', ctrlKey: true }), true);
  assert.equal(isBlockedPasswordKeyCombo({ key: 'A', metaKey: true }), true);
  assert.equal(isBlockedPasswordKeyCombo({ key: 'Insert', ctrlKey: true }), true);
  assert.equal(isBlockedPasswordKeyCombo({ key: 'Delete', shiftKey: true }), true);
  assert.equal(isBlockedPasswordKeyCombo({ key: 'ArrowLeft', shiftKey: true }), true);
  assert.equal(isBlockedPasswordKeyCombo({ key: 'ArrowRight', shiftKey: true, ctrlKey: true }), true);
  assert.equal(isBlockedPasswordKeyCombo({ key: 'Home', shiftKey: true }), true);
  assert.equal(isBlockedPasswordKeyCombo({ key: 'End', shiftKey: true }), true);
});

test('isBlockedPasswordKeyCombo permits normal typing, editing, navigation, and password-manager paste', () => {
  assert.equal(isBlockedPasswordKeyCombo({ key: 'a' }), false);
  assert.equal(isBlockedPasswordKeyCombo({ key: 'A', shiftKey: true }), false);
  assert.equal(isBlockedPasswordKeyCombo({ key: '@', shiftKey: true }), false);
  assert.equal(isBlockedPasswordKeyCombo({ key: 'Backspace' }), false);
  assert.equal(isBlockedPasswordKeyCombo({ key: 'Delete' }), false);
  assert.equal(isBlockedPasswordKeyCombo({ key: 'ArrowLeft' }), false);
  assert.equal(isBlockedPasswordKeyCombo({ key: 'Enter' }), false);
  assert.equal(isBlockedPasswordKeyCombo({ key: 'Tab' }), false);
  assert.equal(isBlockedPasswordKeyCombo({ key: 'v', ctrlKey: true }), false);
  assert.equal(isBlockedPasswordKeyCombo({ key: 'V', metaKey: true }), false);
});

test('preventProtectedClipboardEvent cancels event and clears plain clipboard data', () => {
  let prevented = false;
  let stopped = false;
  let writtenType = '';
  let writtenValue = 'unchanged';

  preventProtectedClipboardEvent({
    preventDefault: () => {
      prevented = true;
    },
    stopPropagation: () => {
      stopped = true;
    },
    clipboardData: {
      setData: (type, value) => {
        writtenType = type;
        writtenValue = value;
      },
    },
  });

  assert.equal(prevented, true);
  assert.equal(stopped, true);
  assert.equal(writtenType, 'text/plain');
  assert.equal(writtenValue, '');
});
