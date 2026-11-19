import assert from 'node:assert/strict';
import { parseFrappeError } from './pos-opening-api';

const serverError = {
  _server_messages: JSON.stringify([
    JSON.stringify({ message: 'POS Profile <strong>Salama POS</strong> is already open.' }),
  ]),
};

assert.equal(parseFrappeError(serverError), 'POS Profile Salama POS is already open.');
assert.equal(parseFrappeError(new Error('Please <strong>close the shift</strong>.')), 'Please close the shift.');
assert.equal(parseFrappeError({ _server_messages: 'invalid JSON' }), null);
console.log('PASS: opening errors reuse readable, HTML-free Frappe messages (3 assertions).');
