import { describe, expect, it } from 'vitest';

import { matchAllowlist, normalizeAllowlistEntries } from '../../src/shared/allowlist';

describe('allowlist', () => {
  it('normalizes full origins, hostnames, and removes duplicates', () => {
    const result = normalizeAllowlistEntries([
      ' https://Staging.Example.com/path ',
      'localhost',
      'localhost',
      'bad rule!',
    ]);

    expect(result.rules).toEqual(['https://staging.example.com', 'localhost']);
    expect(result.invalidEntries).toEqual(['bad rule!']);
  });

  it('matches hostname rules against target URLs', () => {
    const result = matchAllowlist('http://localhost:3000/app', ['localhost', '*.dev.example.com']);

    expect(result).toEqual({ allowed: true, matchedRule: 'localhost' });
  });

  it('matches wildcard hostnames', () => {
    const result = matchAllowlist('https://ui.dev.example.com', ['*.dev.example.com']);

    expect(result).toEqual({ allowed: true, matchedRule: '*.dev.example.com' });
  });

  it('rejects non-matching targets', () => {
    const result = matchAllowlist('https://production.example.com', ['localhost']);

    expect(result).toEqual({ allowed: false, matchedRule: null });
  });
});
