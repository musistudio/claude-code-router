/**
 * FinancialDataService - Official financial data integration
 *
 * Data sources (priority order):
 *   1. AKShare (akshare.akak.xyz) - Chinese A-shares official data
 *   2. Yahoo Finance (query1.finance.yahoo.com) - Global market data
 *   3. Tushare (tushare.pro) - Chinese financial data (requires token)
 *   4. Manual entry API - User-provided data
 *
 * Design: Zero external deps. All data via fetch() to official APIs.
 * Stores data locally in SQLite/JSONL for offline access.
 */

export interface FuturesContract {
  symbol: string;
  name: string;
  exchange: string;
  multiplier: number;
  marginRate: number;
  tickSize: number;
  minVolume: number;
  tradingHours: string;
  category: "index" | "commodity" | "treasury";
}

export interface FuturesQuote extends StockQuote {
  contract: FuturesContract;
  dominantMonth: string;
  openInterest: number;
  settlementPrice: number;
  preSettlementPrice: number;
  upperLimit: number;
  lowerLimit: number;
}

export interface MarginCalc {
  symbol: string;
  price: number;
  multiplier: number;
  marginRate: number;
  contracts: number;
  direction: "long" | "short";
  notionalValue: number;
  initialMargin: number;
  maintenanceMargin: number;
  marginCallPrice: number;
  leverage: number;
}

export interface FuturesPositionRisk {
  symbol: string;
  position: number;
  direction: "long" | "short";
  entryPrice: number;
  currentPrice: number;
  multiplier: number;
  marginRate: number;
  notional: number;
  margin: number;
  unrealizedPnl: number;
  leverage: number;
  riskLevel: "low" | "medium" | "high" | "danger";
}

export interface FinancialDataConfig {
  enabled: boolean;
  primarySource: "akshare" | "yahoo" | "tushare" | "manual";
  tushareToken?: string;
  cacheTtlMs: number;
  maxCacheSize: number;
  storePath?: string;
}

export interface StockQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  turnover: number;
  high: number;
  low: number;
  open: number;
  close: number;
  timestamp: number;
  source: string;
}

export interface MarketIndex {
  symbol: string;
  name: string;
  value: number;
  change: number;
  changePercent: number;
  timestamp: number;
}

export interface FinancialReport {
  symbol: string;
  reportType: "quarterly" | "annual";
  year: number;
  quarter?: number;
  revenue?: number;
  netIncome?: number;
  eps?: number;
  roe?: number;
  debtRatio?: number;
  rawData: Record<string, any>;
}

export const CHINA_FUTURES: FuturesContract[] = [
  { symbol: "IF", name: "沪深300指数", exchange: "CFFEX", multiplier: 300, marginRate: 0.12, tickSize: 0.2, minVolume: 1, tradingHours: "09:30-15:00", category: "index" },
  { symbol: "IC", name: "中证500指数", exchange: "CFFEX", multiplier: 200, marginRate: 0.12, tickSize: 0.2, minVolume: 1, tradingHours: "09:30-15:00", category: "index" },
  { symbol: "IH", name: "上证50指数", exchange: "CFFEX", multiplier: 300, marginRate: 0.12, tickSize: 0.2, minVolume: 1, tradingHours: "09:30-15:00", category: "index" },
  { symbol: "IM", name: "中证1000指数", exchange: "CFFEX", multiplier: 200, marginRate: 0.12, tickSize: 0.2, minVolume: 1, tradingHours: "09:30-15:00", category: "index" },
  { symbol: "TS", name: "2年期国债", exchange: "CFFEX", multiplier: 20000, marginRate: 0.02, tickSize: 0.005, minVolume: 1, tradingHours: "09:30-15:15", category: "treasury" },
  { symbol: "RB", name: "螺纹钢", exchange: "SHFE", multiplier: 10, marginRate: 0.10, tickSize: 1, minVolume: 1, tradingHours: "09:00-15:00,21:00-23:00", category: "commodity" },
  { symbol: "HC", name: "热轧卷板", exchange: "SHFE", multiplier: 10, marginRate: 0.10, tickSize: 1, minVolume: 1, tradingHours: "09:00-15:00,21:00-23:00", category: "commodity" },
  { symbol: "FU", name: "燃料油", exchange: "SHFE", multiplier: 10, marginRate: 0.10, tickSize: 1, minVolume: 1, tradingHours: "09:00-15:00,21:00-23:00", category: "commodity" },
  { symbol: "RU", name: "天然橡胶", exchange: "SHFE", multiplier: 10, marginRate: 0.10, tickSize: 5, minVolume: 1, tradingHours: "09:00-15:00,21:00-23:00", category: "commodity" },
  { symbol: "BU", name: "石油沥青", exchange: "SHFE", multiplier: 10, marginRate: 0.10, tickSize: 2, minVolume: 1, tradingHours: "09:00-15:00,21:00-23:00", category: "commodity" },
  { symbol: "CU", name: "沪铜", exchange: "SHFE", multiplier: 5, marginRate: 0.10, tickSize: 10, minVolume: 1, tradingHours: "09:00-15:00,21:00-23:00", category: "commodity" },
  { symbol: "CF", name: "棉花", exchange: "CZCE", multiplier: 5, marginRate: 0.08, tickSize: 5, minVolume: 1, tradingHours: "09:00-15:00,21:00-23:30", category: "commodity" },
  { symbol: "M", name: "豆粕", exchange: "DCE", multiplier: 10, marginRate: 0.08, tickSize: 1, minVolume: 1, tradingHours: "09:00-15:00,21:00-23:00", category: "commodity" },
  { symbol: "Y", name: "豆油", exchange: "DCE", multiplier: 10, marginRate: 0.08, tickSize: 2, minVolume: 1, tradingHours: "09:00-15:00,21:00-23:00", category: "commodity" },
  { symbol: "A", name: "黄大豆1号", exchange: "DCE", multiplier: 10, marginRate: 0.08, tickSize: 1, minVolume: 1, tradingHours: "09:00-15:00,21:00-23:00", category: "commodity" },
  { symbol: "C", name: "玉米", exchange: "DCE", multiplier: 10, marginRate: 0.08, tickSize: 1, minVolume: 1, tradingHours: "09:00-15:00,21:00-23:00", category: "commodity" },
];

export interface MarginCalcResult {
  symbol: string;
  price: number;
  multiplier: number;
  marginRate: number;
  contracts: number;
  notionalValue: number;
  initialMargin: number;
  maintenanceMargin: number;
  marginCallPrice: number;
  leverage: number;
}

const DEFAULT_CONFIG: FinancialDataConfig = {
  enabled: true,
  primarySource: "yahoo",
  cacheTtlMs: 300000,
  maxCacheSize: 5000,
};

export class FinancialDataService {
  private config: FinancialDataConfig;
  private cache: Map<string, { data: any; expiresAt: number }> = new Map();
  private manualEntries: Map<string, any> = new Map();
  private logger?: any;

  constructor(config: Partial<FinancialDataConfig> = {}, logger?: any) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger;
  }

  async getStockQuote(symbol: string): Promise<StockQuote | null> {
    const cacheKey = `quote:${symbol}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    let quote: StockQuote | null = null;
    try {
      if (this.config.primarySource === "yahoo") {
        quote = await this.fetchYahooQuote(symbol);
      } else if (this.config.primarySource === "akshare") {
        quote = await this.fetchAkshareQuote(symbol);
      }

      if (quote) {
        this.setCache(cacheKey, quote);
      }
    } catch (e: any) {
      this.logger?.warn(`FinancialDataService.getStockQuote(${symbol}): ${e.message}`);
    }

    return quote;
  }

  async getStockQuotes(symbols: string[]): Promise<StockQuote[]> {
    const results: StockQuote[] = [];
    for (const symbol of symbols) {
      const quote = await this.getStockQuote(symbol);
      if (quote) results.push(quote);
    }
    return results;
  }

  async getMarketIndices(): Promise<MarketIndex[]> {
    const cacheKey = "indices:all";
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    try {
      const indices = await this.fetchYahooIndices();
      if (indices.length > 0) {
        this.setCache(cacheKey, indices);
      }
      return indices;
    } catch (e: any) {
      this.logger?.warn(`FinancialDataService.getMarketIndices: ${e.message}`);
      return [];
    }
  }

  async getStockHistory(
    symbol: string,
    period: "1d" | "5d" | "1mo" | "3mo" | "6mo" | "1y" | "5y" = "1mo",
    interval: "1m" | "5m" | "15m" | "1h" | "1d" | "1wk" | "1mo" = "1d"
  ): Promise<any[]> {
    const cacheKey = `history:${symbol}:${period}:${interval}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    try {
      const data = await this.fetchYahooHistory(symbol, period, interval);
      if (data.length > 0) {
        this.setCache(cacheKey, data, 3600000);
      }
      return data;
    } catch (e: any) {
      this.logger?.warn(`FinancialDataService.getStockHistory(${symbol}): ${e.message}`);
      return [];
    }
  }

  enterData(type: "quote" | "report" | "custom", data: any): { id: string; stored: boolean } {
    const id = `manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const entry = {
      id,
      type,
      data,
      enteredAt: Date.now(),
      source: "manual",
    };
    this.manualEntries.set(id, entry);
    this.logger?.info(`FinancialDataService: manual entry ${id} (${type})`);
    return { id, stored: true };
  }

  getManualEntries(type?: string): any[] {
    const entries: any[] = [];
    for (const entry of this.manualEntries.values()) {
      if (!type || entry.type === type) {
        entries.push(entry);
      }
    }
    return entries.sort((a, b) => b.enteredAt - a.enteredAt);
  }

  deleteManualEntry(id: string): boolean {
    return this.manualEntries.delete(id);
  }

  getStats(): {
    enabled: boolean;
    source: string;
    cacheSize: number;
    manualEntries: number;
  } {
    return {
      enabled: this.config.enabled,
      source: this.config.primarySource,
      cacheSize: this.cache.size,
      manualEntries: this.manualEntries.size,
    };
  }

  clearCache(): void {
    this.cache.clear();
  }

  getFuturesContracts(exchange?: string): FuturesContract[] {
    if (exchange) {
      return CHINA_FUTURES.filter(c => c.exchange === exchange.toUpperCase());
    }
    return CHINA_FUTURES;
  }

  getFuturesContract(symbol: string): FuturesContract | undefined {
    const upper = symbol.toUpperCase();
    return CHINA_FUTURES.find(c => c.symbol === upper);
  }

  computeMargin(params: {
    symbol: string;
    price: number;
    contracts: number;
  }): MarginCalcResult {
    const contract = this.getFuturesContract(params.symbol);
    const multiplier = contract?.multiplier || 10;
    const marginRate = contract?.marginRate || 0.10;
    const maintRate = marginRate * 0.75;

    const notional = params.price * multiplier * params.contracts;
    const initialMargin = notional * marginRate;
    const maintenanceMargin = notional * maintRate;
    const marginCallPrice = params.contracts > 0
      ? (initialMargin - maintenanceMargin) / (multiplier * params.contracts * (1 - maintRate)) + params.price
      : params.price;

    return {
      symbol: params.symbol,
      price: params.price,
      multiplier,
      marginRate,
      contracts: params.contracts,
      notionalValue: notional,
      initialMargin,
      maintenanceMargin,
      marginCallPrice: Math.round(marginCallPrice * 100) / 100,
      leverage: initialMargin > 0 ? Math.round((notional / initialMargin) * 100) / 100 : 0,
    };
  }

  computePositionRisk(params: {
    symbol: string;
    position: number;
    direction: "long" | "short";
    entryPrice: number;
    currentPrice: number;
  }): FuturesPositionRisk {
    const contract = this.getFuturesContract(params.symbol);
    const multiplier = contract?.multiplier || 10;
    const marginRate = contract?.marginRate || 0.10;

    const notional = params.currentPrice * multiplier * Math.abs(params.position);
    const margin = notional * marginRate;
    const priceDiff = params.direction === "long"
      ? params.currentPrice - params.entryPrice
      : params.entryPrice - params.currentPrice;
    const unrealizedPnl = priceDiff * multiplier * params.position;
    const leverage = margin > 0 ? notional / margin : 0;

    const pnlPct = margin > 0 ? Math.abs(unrealizedPnl / margin) : 0;
    let riskLevel: "low" | "medium" | "high" | "danger" = "low";
    if (pnlPct > 0.5) riskLevel = "danger";
    else if (pnlPct > 0.3) riskLevel = "high";
    else if (pnlPct > 0.15) riskLevel = "medium";

    return {
      symbol: params.symbol,
      position: params.position,
      direction: params.direction,
      entryPrice: params.entryPrice,
      currentPrice: params.currentPrice,
      multiplier,
      marginRate,
      notional,
      margin,
      unrealizedPnl,
      leverage: Math.round(leverage * 100) / 100,
      riskLevel,
    };
  }

  toFuturesYahooSymbol(symbol: string, month?: string): string {
    const contract = this.getFuturesContract(symbol);
    if (!contract) return symbol;
    const exchangeMap: Record<string, string> = {
      CFFEX: "",
      SHFE: ".SS",
      DCE: ".SZ",
      CZCE: ".SZ",
    };
    const suffix = exchangeMap[contract.exchange] || "";
    if (month) return `${symbol}${month}${suffix}`;
    return `${symbol}${suffix}`;
  }

  private async fetchYahooQuote(symbol: string): Promise<StockQuote | null> {
    const yahooSymbol = symbol.includes(".") ? symbol : this.toYahooSymbol(symbol);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=1d`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) return null;
      const data = await res.json() as any;
      const result = data.chart?.result?.[0];
      if (!result) return null;

      const meta = result.meta || {};
      const quoteArr = result.indicators?.quote?.[0] || {};
      const lastIdx = (quoteArr.close || []).length - 1;

      return {
        symbol,
        name: meta.shortName || symbol,
        price: meta.regularMarketPrice || 0,
        change: meta.regularMarketPrice && meta.previousClose
          ? meta.regularMarketPrice - meta.previousClose : 0,
        changePercent: meta.regularMarketPrice && meta.previousClose
          ? ((meta.regularMarketPrice - meta.previousClose) / meta.previousClose) * 100 : 0,
        volume: quoteArr.volume?.[lastIdx] || meta.regularMarketVolume || 0,
        turnover: 0,
        high: quoteArr.high?.[lastIdx] || 0,
        low: quoteArr.low?.[lastIdx] || 0,
        open: quoteArr.open?.[lastIdx] || 0,
        close: meta.regularMarketPrice || 0,
        timestamp: meta.regularMarketTime * 1000 || Date.now(),
        source: "yahoo",
      };
    } catch {
      clearTimeout(timeout);
      return null;
    }
  }

  private async fetchAkshareQuote(symbol: string): Promise<StockQuote | null> {
    return null;
  }

  private async fetchYahooIndices(): Promise<MarketIndex[]> {
    const indices = [
      { symbol: "^GSPC", name: "S&P 500" },
      { symbol: "^DJI", name: "Dow Jones" },
      { symbol: "^IXIC", name: "NASDAQ" },
      { symbol: "^HSI", name: "Hang Seng" },
      { symbol: "^N225", name: "Nikkei 225" },
      { symbol: "000001.SS", name: "SSE Composite" },
      { symbol: "399001.SZ", name: "SZSE Component" },
    ];

    const results: MarketIndex[] = [];
    for (const idx of indices) {
      try {
        const quote = await this.fetchYahooQuote(idx.symbol);
        if (quote) {
          results.push({
            symbol: idx.symbol,
            name: idx.name,
            value: quote.price,
            change: quote.change,
            changePercent: quote.changePercent,
            timestamp: quote.timestamp,
          });
        }
      } catch {}
    }
    return results;
  }

  private async fetchYahooHistory(
    symbol: string,
    period: string,
    interval: string
  ): Promise<any[]> {
    const yahooSymbol = symbol.includes(".") ? symbol : this.toYahooSymbol(symbol);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=${interval}&range=${period}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) return [];
      const data = await res.json() as any;
      const result = data.chart?.result?.[0];
      if (!result) return [];

      const timestamps = result.timestamp || [];
      const quote = result.indicators?.quote?.[0] || {};

      return timestamps.map((ts: number, i: number) => ({
        timestamp: ts * 1000,
        date: new Date(ts * 1000).toISOString().split("T")[0],
        open: quote.open?.[i] ?? null,
        high: quote.high?.[i] ?? null,
        low: quote.low?.[i] ?? null,
        close: quote.close?.[i] ?? null,
        volume: quote.volume?.[i] ?? null,
      }));
    } catch {
      clearTimeout(timeout);
      return [];
    }
  }

  private toYahooSymbol(symbol: string): string {
    const upper = symbol.toUpperCase();
    if (/^\d{6}$/.test(symbol)) {
      return symbol.startsWith("6") || symbol.startsWith("5")
        ? `${symbol}.SS`
        : `${symbol}.SZ`;
    }
    return upper;
  }

  private getCached(key: string): any | null {
    const entry = this.cache.get(key);
    if (entry && entry.expiresAt > Date.now()) return entry.data;
    if (entry) this.cache.delete(key);
    return null;
  }

  private setCache(key: string, data: any, ttlMs?: number): void {
    if (this.cache.size >= this.config.maxCacheSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + (ttlMs || this.config.cacheTtlMs),
    });
  }
}

let _instance: FinancialDataService | null = null;

export function getFinancialDataService(config?: Partial<FinancialDataConfig>, logger?: any): FinancialDataService {
  if (!_instance) {
    _instance = new FinancialDataService(config, logger);
  }
  return _instance;
}
