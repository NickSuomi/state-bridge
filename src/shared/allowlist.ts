const HOST_TOKEN_PATTERN = /^[\w*.\-:[\]]+$/;

function escapeRegex(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function globToRegex(glob: string): RegExp {
  return new RegExp(`^${glob.split('*').map(escapeRegex).join('.*')}$`, 'i');
}

export function normalizeAllowlistEntry(entry: string): string | null {
  const normalized = entry.trim().toLowerCase();

  if (normalized.length === 0) {
    return null;
  }

  if (normalized.includes('://')) {
    try {
      return new URL(normalized).origin.toLowerCase();
    } catch {
      return null;
    }
  }

  if (!HOST_TOKEN_PATTERN.test(normalized)) {
    return null;
  }

  return normalized;
}

export function normalizeAllowlistEntries(entries: string[]): {
  rules: string[];
  invalidEntries: string[];
} {
  const rules: string[] = [];
  const invalidEntries: string[] = [];

  for (const entry of entries) {
    const normalized = normalizeAllowlistEntry(entry);

    if (normalized === null) {
      if (entry.trim().length > 0) {
        invalidEntries.push(entry);
      }

      continue;
    }

    if (!rules.includes(normalized)) {
      rules.push(normalized);
    }
  }

  return { rules, invalidEntries };
}

function matchesRule(rule: string, url: URL): boolean {
  if (rule.includes('://')) {
    return url.origin.toLowerCase() === rule;
  }

  if (rule.includes(':')) {
    return globToRegex(rule).test(url.host.toLowerCase());
  }

  return globToRegex(rule).test(url.hostname.toLowerCase());
}

export function matchAllowlist(targetUrl: string, rules: string[]): {
  allowed: boolean;
  matchedRule: string | null;
} {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(targetUrl);
  } catch {
    return { allowed: false, matchedRule: null };
  }

  for (const rule of rules) {
    if (matchesRule(rule, parsedUrl)) {
      return { allowed: true, matchedRule: rule };
    }
  }

  return { allowed: false, matchedRule: null };
}
