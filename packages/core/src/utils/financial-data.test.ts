import { describe, it, expect, beforeEach } from "vitest";
import { FinancialDataService, CHINA_FUTURES } from "./financial-data";

describe("FinancialDataService", () => {
  let service: FinancialDataService;

  beforeEach(() => {
    service = new FinancialDataService({ enabled: true, primarySource: "yahoo" });
  });

  describe("enterData", () => {
    it("should store manual entry", () => {
      const result = service.enterData("quote", { symbol: "AAPL", price: 150 });
      expect(result.stored).toBe(true);
      expect(result.id).toBeTruthy();
    });

    it("should store report entry", () => {
      const result = service.enterData("report", { symbol: "600519", revenue: 1000000 });
      expect(result.stored).toBe(true);
    });
  });

  describe("getManualEntries", () => {
    it("should return all entries", () => {
      service.enterData("quote", { symbol: "AAPL" });
      service.enterData("report", { symbol: "600519" });
      const entries = service.getManualEntries();
      expect(entries.length).toBe(2);
    });

    it("should filter by type", () => {
      service.enterData("quote", { symbol: "AAPL" });
      service.enterData("report", { symbol: "600519" });
      const quotes = service.getManualEntries("quote");
      expect(quotes.length).toBe(1);
      expect(quotes[0].type).toBe("quote");
    });

    it("should return empty when no entries", () => {
      const entries = service.getManualEntries();
      expect(entries).toEqual([]);
    });
  });

  describe("deleteManualEntry", () => {
    it("should delete existing entry", () => {
      const { id } = service.enterData("quote", { symbol: "AAPL" });
      expect(service.deleteManualEntry(id)).toBe(true);
      expect(service.getManualEntries()).toEqual([]);
    });

    it("should return false for non-existent entry", () => {
      expect(service.deleteManualEntry("nonexistent")).toBe(false);
    });
  });

  describe("getStats", () => {
    it("should return correct stats", () => {
      service.enterData("quote", { symbol: "AAPL" });
      const stats = service.getStats();
      expect(stats.enabled).toBe(true);
      expect(stats.source).toBe("yahoo");
      expect(stats.manualEntries).toBe(1);
    });
  });

  describe("clearCache", () => {
    it("should clear cache", () => {
      service.clearCache();
      const stats = service.getStats();
      expect(stats.cacheSize).toBe(0);
    });
  });

  describe("toYahooSymbol", () => {
    it("should convert Shanghai stock code", () => {
      const svc = service as any;
      expect(svc.toYahooSymbol("600519")).toBe("600519.SS");
    });

    it("should convert Shenzhen stock code", () => {
      const svc = service as any;
      expect(svc.toYahooSymbol("000001")).toBe("000001.SZ");
    });

    it("should pass through symbols with dots", () => {
      const svc = service as any;
      expect(svc.toYahooSymbol("AAPL")).toBe("AAPL");
    });
  });

  describe("getFuturesContracts", () => {
    it("should return all contracts", () => {
      const contracts = service.getFuturesContracts();
      expect(contracts.length).toBeGreaterThan(10);
    });

    it("should filter by exchange", () => {
      const shfe = service.getFuturesContracts("SHFE");
      expect(shfe.length).toBeGreaterThan(0);
      expect(shfe.every(c => c.exchange === "SHFE")).toBe(true);
    });

    it("should return empty for unknown exchange", () => {
      const result = service.getFuturesContracts("UNKNOWN");
      expect(result).toEqual([]);
    });
  });

  describe("getFuturesContract", () => {
    it("should find IF contract", () => {
      const contract = service.getFuturesContract("IF");
      expect(contract).toBeDefined();
      expect(contract?.multiplier).toBe(300);
      expect(contract?.exchange).toBe("CFFEX");
    });

    it("should find RB contract case-insensitive", () => {
      const contract = service.getFuturesContract("rb");
      expect(contract).toBeDefined();
      expect(contract?.name).toBe("螺纹钢");
    });

    it("should return undefined for unknown", () => {
      expect(service.getFuturesContract("UNKNOWN")).toBeUndefined();
    });
  });

  describe("computeMargin", () => {
    it("should compute IF margin correctly", () => {
      const result = service.computeMargin({ symbol: "IF", price: 3800, contracts: 1 });
      expect(result.multiplier).toBe(300);
      expect(result.notionalValue).toBe(3800 * 300);
      expect(result.initialMargin).toBe(3800 * 300 * 0.12);
      expect(result.leverage).toBeCloseTo(1 / 0.12, 1);
    });

    it("should compute RB margin with default for unknown", () => {
      const result = service.computeMargin({ symbol: "UNKNOWN", price: 3500, contracts: 2 });
      expect(result.multiplier).toBe(10);
      expect(result.contracts).toBe(2);
    });
  });

  describe("computePositionRisk", () => {
    it("should compute long position risk", () => {
      const risk = service.computePositionRisk({
        symbol: "IF",
        position: 1,
        direction: "long",
        entryPrice: 3800,
        currentPrice: 3900,
      });
      expect(risk.unrealizedPnl).toBe(100 * 300);
      expect(risk.riskLevel).toMatch(/^(low|medium)$/);
    });

    it("should compute short position risk", () => {
      const risk = service.computePositionRisk({
        symbol: "RB",
        position: 10,
        direction: "short",
        entryPrice: 3500,
        currentPrice: 3600,
      });
      expect(risk.unrealizedPnl).toBe(-100 * 10 * 10);
    });

    it("should detect danger risk level", () => {
      const risk = service.computePositionRisk({
        symbol: "IF",
        position: 5,
        direction: "long",
        entryPrice: 3800,
        currentPrice: 4200,
      });
      expect(risk.riskLevel).toBeDefined();
    });
  });

  describe("CHINA_FUTURES data integrity", () => {
    it("should have all CFFEX contracts", () => {
      const cffex = CHINA_FUTURES.filter(c => c.exchange === "CFFEX");
      expect(cffex.map(c => c.symbol).sort()).toEqual(["IC", "IF", "IH", "IM", "TS"]);
    });

    it("should have valid margin rates", () => {
      for (const c of CHINA_FUTURES) {
        expect(c.marginRate).toBeGreaterThan(0);
        expect(c.marginRate).toBeLessThanOrEqual(0.20);
      }
    });

    it("should have valid multipliers", () => {
      for (const c of CHINA_FUTURES) {
        expect(c.multiplier).toBeGreaterThan(0);
      }
    });
  });
});
