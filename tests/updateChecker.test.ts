import { describe, it, expect } from '@jest/globals';

describe('Update Checker', () => {
  describe('version comparison logic', () => {
    it('should correctly identify when updates are needed', () => {
      // Test the version comparison logic independently
      const compareVersions = (current: string, latest: string): number => {
        const currentParts = current.split('.').map(Number);
        const latestParts = latest.split('.').map(Number);

        for (let i = 0; i < 3; i++) {
          if (currentParts[i] < latestParts[i]) return -1;
          if (currentParts[i] > latestParts[i]) return 1;
        }
        
        return 0;
      };

      expect(compareVersions('1.0.0', '2.0.0')).toBe(-1);
      expect(compareVersions('2.0.0', '1.0.0')).toBe(1);
      expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
      expect(compareVersions('1.0.0', '1.1.0')).toBe(-1);
      expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
      expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
      expect(compareVersions('1.0.29', '1.0.30')).toBe(-1);
      expect(compareVersions('1.0.29', '1.1.0')).toBe(-1);
      expect(compareVersions('1.0.29', '2.0.0')).toBe(-1);
    });
  });

  describe('update command format', () => {
    it('should format correct update commands', () => {
      // Test command formatting
      const formatGlobalCommand = (pkg: string) => `npm install -g ${pkg}@latest`;
      const formatLocalCommand = (pkg: string) => `npm install ${pkg}@latest`;
      
      expect(formatGlobalCommand('ccr-next')).toBe('npm install -g ccr-next@latest');
      expect(formatLocalCommand('ccr-next')).toBe('npm install ccr-next@latest');
    });
  });
});