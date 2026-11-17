const { test } = require('node:test');
const assert = require('node:assert/strict');
const { check } = require('./audit-ci.cjs');
const allowed = { name: 'picomatch', dependency: 'picomatch', url: 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf', severity: 'high' };
const report = (vulnerabilities) => ({ auditReportVersion: 2, vulnerabilities });
test('allows only the specified advisory and its dependents', () => {
  assert.deepEqual(check(report({ picomatch: { severity: 'high', via: [allowed] }, vite: { severity: 'high', via: ['picomatch'] } })), []);
});
test('blocks another advisory even on the same package', () => {
  assert.deepEqual(check(report({ picomatch: { severity: 'high', via: [allowed, { ...allowed, url: 'https://example.com/other' }] } })), ['picomatch']);
});
test('blocks mixed causes, unknown dependencies, cycles, and critical advisories', () => {
  const v = { picomatch: { severity: 'high', via: [allowed] }, vite: { severity: 'high', via: ['picomatch', 'missing'] }, cycle: { severity: 'high', via: ['cycle'] }, critical: { severity: 'critical', via: [{ ...allowed, severity: 'critical' }] } };
  assert.deepEqual(check(report(v)), ['vite', 'cycle', 'critical']);
});
test('fails closed on invalid reports', () => {
  assert.throws(() => check({ error: {}, auditReportVersion: 2, vulnerabilities: {} }));
  assert.throws(() => check({}));
});
