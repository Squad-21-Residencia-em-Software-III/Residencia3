const { spawnSync } = require('node:child_process');

// Temporary exception: remove after a patched picomatch release is available.
const exception = 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf';
const severe = new Set(['high', 'critical']);

function check(report) {
  if (report?.auditReportVersion !== 2 || !report.vulnerabilities || report.error) {
    throw new Error('Invalid or incomplete npm audit report');
  }
  const vulnerabilities = report.vulnerabilities;
  function onlyExcepted(name, visiting = new Set()) {
    const entry = vulnerabilities[name];
    if (!entry || !Array.isArray(entry.via) || entry.via.length === 0 || visiting.has(name)) return false;
    const next = new Set(visiting).add(name);
    return entry.via.every((cause) => {
      if (typeof cause === 'string') return onlyExcepted(cause, next);
      return cause && cause.name === 'picomatch' && cause.dependency === 'picomatch' && cause.url === exception && cause.severity === 'high';
    });
  }
  return Object.entries(vulnerabilities)
    .filter(([, entry]) => severe.has(entry.severity))
    .filter(([name]) => !onlyExcepted(name))
    .map(([name]) => name);
}

if (require.main === module) {
  const result = spawnSync('npm', ['audit', '--audit-level=high', '--json'], {
    encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 20 * 1024 * 1024,
  });
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.stdout) process.stdout.write(result.stdout);
  try {
    if (result.error || ![0, 1].includes(result.status)) throw new Error('npm audit could not complete');
    const report = JSON.parse(result.stdout);
    const blocked = check(report);
    if (blocked.length) throw new Error(`Unexcepted high or critical vulnerabilities: ${blocked.join(', ')}`);
    if (result.status === 1 && Object.keys(report.vulnerabilities).length === 0) throw new Error('Inconsistent npm audit result');
    console.log(`CI exception applied only to ${exception}; remove it after a fix is published.`);
  } catch (error) {
    console.error(`Security audit failed: ${error.message}`);
    process.exitCode = 1;
  }
}
module.exports = { check };
