type YamlValue = string | number | boolean | null | YamlValue[] | { [key: string]: YamlValue };

class MinimalYamlParser {
  private lines: string[] = [];
  private pos = 0;

  parse(input: string): any {
    this.lines = input.split('\n');
    this.pos = 0;
    return this.parseBlock(-1);
  }

  private isEmpty(): boolean {
    if (this.pos >= this.lines.length) return true;
    const trimmed = this.lines[this.pos].trim();
    return trimmed === '' || trimmed.startsWith('#');
  }

  private skipEmpty(): void {
    while (this.pos < this.lines.length && this.isEmpty()) {
      this.pos++;
    }
  }

  private getIndent(): number {
    if (this.pos >= this.lines.length) return -1;
    const line = this.lines[this.pos];
    let count = 0;
    for (const ch of line) {
      if (ch === ' ') count++;
      else break;
    }
    return count;
  }

  private parseBlock(parentIndent: number): YamlValue {
    this.skipEmpty();
    if (this.pos >= this.lines.length) return null;

    const line = this.lines[this.pos];
    const trimmed = line.trim();

    if (trimmed.startsWith('- ') || trimmed === '-') {
      return this.parseListBlock(parentIndent);
    }

    return this.parseMapBlock(parentIndent);
  }

  private parseMapBlock(parentIndent: number): Record<string, YamlValue> | null {
    const obj: Record<string, YamlValue> = {};

    while (this.pos < this.lines.length) {
      this.skipEmpty();
      if (this.pos >= this.lines.length) break;

      const indent = this.getIndent();
      if (indent <= parentIndent) break;

      const trimmed = this.lines[this.pos].trim();
      if (trimmed === '' || trimmed.startsWith('#')) continue;
      if (trimmed.startsWith('- ') || trimmed === '-') break;

      const colonIdx = this.findColon(trimmed);
      if (colonIdx === -1) break;

      const key = trimmed.substring(0, colonIdx);
      const afterColon = trimmed.substring(colonIdx + 1);

      const valuePart = afterColon.replace(/#.*$/, '').trim();

      if (valuePart === '') {
        this.pos++;
        this.skipEmpty();
        const childIndent = this.pos < this.lines.length ? this.getIndent() : -1;
        if (childIndent > indent) {
          obj[key] = this.parseBlock(indent);
        } else {
          obj[key] = null;
        }
      } else {
        obj[key] = this.parseValueLiteral(valuePart);
        this.pos++;
      }
    }

    return Object.keys(obj).length > 0 ? obj : null;
  }

  private parseListBlock(parentIndent: number): YamlValue[] {
    const arr: YamlValue[] = [];
    const listIndent = this.getIndent();

    while (this.pos < this.lines.length) {
      this.skipEmpty();
      if (this.pos >= this.lines.length) break;

      const indent = this.getIndent();
      if (indent < listIndent) break;

      const trimmed = this.lines[this.pos].trim();
      if (!trimmed.startsWith('- ') && trimmed !== '-') break;

      const afterDash = trimmed.startsWith('- ') ? trimmed.substring(2) : '';

      if (afterDash === '') {
        this.pos++;
        this.skipEmpty();
        const childIndent = this.pos < this.lines.length ? this.getIndent() : -1;
        if (childIndent > indent) {
          arr.push(this.parseBlock(indent));
        } else {
          arr.push(null);
        }
      } else if (this.findColon(afterDash) !== -1 && !afterDash.startsWith('[')) {
        arr.push(this.parseInlineMapListItem(afterDash, indent));
      } else {
        arr.push(this.parseValueLiteral(afterDash));
        this.pos++;
      }
    }

    return arr;
  }

  private parseInlineMapListItem(firstLine: string, dashIndent: number): Record<string, YamlValue> {
    const obj: Record<string, YamlValue> = {};

    const colonIdx = this.findColon(firstLine);
    const key = firstLine.substring(0, colonIdx);
    const afterColon = firstLine.substring(colonIdx + 1).replace(/#.*$/, '').trim();

    if (afterColon === '') {
      obj[key] = null;
    } else {
      obj[key] = this.parseValueLiteral(afterColon);
    }
    this.pos++;

    while (this.pos < this.lines.length) {
      this.skipEmpty();
      if (this.pos >= this.lines.length) break;

      const indent = this.getIndent();
      if (indent <= dashIndent) break;

      const trimmed = this.lines[this.pos].trim();
      if (trimmed.startsWith('- ') || trimmed === '-') break;

      const ci = this.findColon(trimmed);
      if (ci === -1) break;

      const k = trimmed.substring(0, ci);
      const ac = trimmed.substring(ci + 1).replace(/#.*$/, '').trim();

      if (ac === '') {
        this.pos++;
        this.skipEmpty();
        const childIndent = this.pos < this.lines.length ? this.getIndent() : -1;
        if (childIndent > indent) {
          obj[k] = this.parseBlock(indent);
        } else {
          obj[k] = null;
        }
      } else {
        obj[k] = this.parseValueLiteral(ac);
        this.pos++;
      }
    }

    return obj;
  }

  private findColon(s: string): number {
    let depth = 0;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === '[' || ch === '{') depth++;
      else if (ch === ']' || ch === '}') depth--;
      else if (ch === ':' && depth === 0 && i > 0) {
        const next = i + 1 < s.length ? s[i + 1] : '';
        if (next === ' ' || next === '' || next === '#') return i;
      }
    }
    return -1;
  }

  private parseValueLiteral(s: string): YamlValue {
    s = s.trim();
    if (s === '' || s === '~' || s === 'null') return null;
    if (s === 'true') return true;
    if (s === 'false') return false;

    if (s.startsWith('[')) {
      const end = s.indexOf(']');
      if (end !== -1) {
        const inner = s.substring(1, end);
        if (inner.trim() === '') return [];
        return inner.split(',').map(v => this.parseScalar(v.trim()));
      }
    }

    if (s.startsWith('{')) {
      const end = s.indexOf('}');
      if (end !== -1) {
        const inner = s.substring(1, end);
        const obj: Record<string, YamlValue> = {};
        if (inner.trim() === '') return obj;
        for (const pair of inner.split(',')) {
          const ci = pair.indexOf(':');
          if (ci !== -1) {
            obj[pair.substring(0, ci).trim()] = this.parseScalar(pair.substring(ci + 1).trim());
          }
        }
        return obj;
      }
    }

    return this.parseScalar(s);
  }

  private parseScalar(s: string): string | number | boolean | null {
    if (s === '' || s === '~' || s === 'null') return null;
    if (s === 'true') return true;
    if (s === 'false') return false;
    if (/^-?\d+$/.test(s)) return parseInt(s, 10);
    if (/^-?\d+\.\d+$/.test(s)) return parseFloat(s);
    if ((s.startsWith('"') && s.endsWith('"')) ||
        (s.startsWith("'") && s.endsWith("'"))) {
      return s.slice(1, -1);
    }
    return s;
  }
}

export function parseYaml(input: string): any {
  return new MinimalYamlParser().parse(input);
}

export function generateCcrConfig(yamlContent: string): Record<string, any> {
  const parsed = parseYaml(yamlContent);

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      HOST: '127.0.0.1',
      PORT: 3456,
      APIKEY: '',
      LOG: true,
      LOG_LEVEL: 'info',
      API_TIMEOUT_MS: 600000,
    };
  }

  const config: Record<string, any> = {};

  if (parsed.server) {
    config.HOST = parsed.server.host || '127.0.0.1';
    config.PORT = parsed.server.port || 3456;
    config.APIKEY = parsed.server.api_key || '';
    config.LOG = parsed.server.log ?? true;
    config.LOG_LEVEL = parsed.server.log_level || 'info';
    config.API_TIMEOUT_MS = parsed.server.timeout_ms || 600000;
  } else {
    config.HOST = '127.0.0.1';
    config.PORT = 3456;
    config.APIKEY = '';
    config.LOG = true;
    config.LOG_LEVEL = 'info';
    config.API_TIMEOUT_MS = 600000;
  }

  if (parsed.providers && Array.isArray(parsed.providers)) {
    config.Providers = parsed.providers.map((p: any) => {
      const provider: Record<string, any> = {
        name: p.name,
        api_base_url: p.api_base_url,
        api_key: p.api_key,
        models: p.models || [],
      };

      if (p.transformer || p.model_transformers) {
        const transformer: Record<string, any> = {};
        if (p.transformer && Array.isArray(p.transformer) && p.transformer.length > 0) {
          transformer.use = p.transformer;
        }
        if (p.model_transformers && typeof p.model_transformers === 'object') {
          for (const [model, transformers] of Object.entries(p.model_transformers)) {
            if (Array.isArray(transformers)) {
              transformer[model] = { use: transformers };
            }
          }
        }
        if (Object.keys(transformer).length > 0) {
          provider.transformer = transformer;
        }
      }

      if (p.priority != null) provider.priority = p.priority;
      if (p.cost_tier) provider.cost_tier = p.cost_tier;
      if (p.max_tokens != null) provider.max_tokens = p.max_tokens;
      if (p.concurrency != null) provider.concurrency_limit = p.concurrency;
      if (p.enabled != null) provider.enabled = p.enabled;
      if (p.metadata) provider.metadata = p.metadata;

      return provider;
    });
  }

  if (parsed.routing) {
    config.Router = { ...parsed.routing };
  }

  if (parsed.model_mapping) {
    config.ModelMapping = { ...parsed.model_mapping };
  }

  if (parsed.fallback) {
    config.fallback = { ...parsed.fallback };
  }

  if (parsed.concurrency) {
    config.Concurrency = {
      global: parsed.concurrency.global || 10,
      providers: parsed.concurrency.providers || {},
      queueTimeoutMs: parsed.concurrency.queue_timeout_ms || 120000,
    };
  }

  return config;
}
