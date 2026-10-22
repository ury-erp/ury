import { parseFrappeError } from './errors';

interface Case {
  label: string;
  run: () => boolean;
}

// Helper mirroring how Frappe encodes _server_messages: each entry is a
// JSON string of a message object, and the array itself is JSON-encoded.
const encodeServerMessages = (items: Record<string, unknown>[]): string =>
  JSON.stringify(items.map((item) => JSON.stringify(item)));

const cases: Case[] = [
  // Null / empty / primitive inputs
  {
    label: 'null error returns the caller fallback',
    run: () => parseFrappeError(null, 'fallback') === 'fallback',
  },
  {
    label: 'undefined error returns the default fallback',
    run: () => parseFrappeError(undefined) === 'An unexpected error occurred.',
  },
  {
    label: 'non-object primitive returns fallback',
    run: () => parseFrappeError(42, 'fallback') === 'fallback',
  },
  {
    label: 'plain string error is returned trimmed',
    run: () => parseFrappeError('  boom  ', 'fallback') === 'boom',
  },
  {
    label: 'empty string error falls back',
    run: () => parseFrappeError('   ', 'fallback') === 'fallback',
  },

  // Strategy 1: _server_messages
  {
    label: 'double-JSON-encoded _server_messages string yields the inner message',
    run: () =>
      parseFrappeError(
        { _server_messages: encodeServerMessages([{ message: 'Insufficient stock for Item A' }]) },
        'fallback',
      ) === 'Insufficient stock for Item A',
  },
  {
    label: '_server_messages as array of JSON strings is parsed',
    run: () =>
      parseFrappeError(
        { _server_messages: [JSON.stringify({ message: 'Payment mismatch' })] },
        'fallback',
      ) === 'Payment mismatch',
  },
  {
    label: '_server_messages as array of plain objects is parsed',
    run: () =>
      parseFrappeError(
        { _server_messages: [{ message: 'Missing mandatory field' }] },
        'fallback',
      ) === 'Missing mandatory field',
  },
  {
    label: 'multiple server messages are joined with newlines',
    run: () =>
      parseFrappeError(
        {
          _server_messages: [
            JSON.stringify({ message: 'First problem' }),
            JSON.stringify({ message: 'Second problem' }),
          ],
        },
        'fallback',
      ) === 'First problem\nSecond problem',
  },
  {
    label: 'custom title is preserved and prefixed to the message',
    run: () =>
      parseFrappeError(
        { _server_messages: [JSON.stringify({ message: 'Not allowed', title: 'Stock Check' })] },
        'fallback',
      ) === 'Stock Check: Not allowed',
  },
  {
    label: 'generic titles (Message/Error/Validation Error) are dropped',
    run: () =>
      parseFrappeError(
        {
          _server_messages: [
            JSON.stringify({ message: 'Real message', title: 'Validation Error' }),
          ],
        },
        'fallback',
      ) === 'Real message',
  },
  {
    label: 'msg field is used when message is absent',
    run: () =>
      parseFrappeError(
        { _server_messages: [JSON.stringify({ msg: 'Via msg key' })] },
        'fallback',
      ) === 'Via msg key',
  },
  {
    label: 'unparseable string entries are surfaced after HTML cleanup',
    run: () =>
      parseFrappeError({ _server_messages: ['<b>Raw notice</b>'] }, 'fallback') === 'Raw notice',
  },
  {
    label: '_server_messages nested under response is found',
    run: () =>
      parseFrappeError(
        { response: { _server_messages: encodeServerMessages([{ message: 'Nested hit' }]) } },
        'fallback',
      ) === 'Nested hit',
  },

  // cleanHtml tag stripping
  {
    label: 'HTML <br> tags become line breaks',
    run: () =>
      parseFrappeError(
        { _server_messages: [JSON.stringify({ message: 'line one<br>line two' })] },
        'fallback',
      ) === 'line one\nline two',
  },
  {
    label: 'paragraph and other tags are stripped cleanly',
    run: () =>
      parseFrappeError(
        { _server_messages: [JSON.stringify({ message: '<p>Hello <span>world</span></p>' })] },
        'fallback',
      ) === 'Hello world',
  },

  // Strategy 2: Python exception traces
  {
    label: 'frappe.exceptions trace message is extracted',
    run: () =>
      parseFrappeError(
        {
          exc: 'Traceback (most recent call last):\n  ...\nfrappe.exceptions.ValidationError: Payment entry does not match invoice total',
        },
        'fallback',
      ) === 'Payment entry does not match invoice total',
  },
  {
    label: 'bare <Name>Error trace line is extracted from exception field',
    run: () =>
      parseFrappeError({ exception: 'ValueError: bad value\nmore detail' }, 'fallback') ===
      'bad value',
  },
  {
    label: 'generic "There was an error." trace line is ignored',
    run: () =>
      parseFrappeError(
        { exc: 'frappe.exceptions.ValidationError: There was an error.' },
        'fallback',
      ) === 'fallback',
  },

  // Strategy 3-5: .message / _error_message / Error instance
  {
    label: 'top-level .message is cleaned and returned',
    run: () => parseFrappeError({ message: '<b>Stored message</b>' }, 'fallback') === 'Stored message',
  },
  {
    label: 'generic SDK wrapper message is ignored in favour of fallback',
    run: () =>
      parseFrappeError({ message: 'There was an error.' }, 'fallback') === 'fallback',
  },
  {
    label: '_error_message field is used when nothing else matches',
    run: () => parseFrappeError({ _error_message: 'Server side failure' }, 'fallback') === 'Server side failure',
  },
  {
    label: 'Error instance message is returned',
    run: () => parseFrappeError(new Error('Network down'), 'fallback') === 'Network down',
  },

  // Strategy 6: exc_type fallback
  {
    label: 'exc_type class name is split into words',
    run: () => parseFrappeError({ exc_type: 'frappe.exceptions.MandatoryError' }, 'fallback') === 'Mandatory Error',
  },
];

let failures = 0;
for (const { label, run } of cases) {
  const passed = run();
  if (!passed) {
    failures++;
    console.error(`FAIL: ${label}`);
  } else {
    console.log(`PASS: ${label}`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} test(s) failed.`);
  process.exit(1);
}
console.log('\nAll tests passed.');
