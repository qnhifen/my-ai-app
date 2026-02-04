
export interface LottoResult {
  issue: string;
  date: string;
  red: number[];
  blue: number[];
  sales?: string;
  pool?: string;
}

export interface DantuoPrediction {
  redBanker: number[];
  redDrag: number[];
  blueBanker: number[];
  blueDrag: number[];
}

export interface PredictionResult {
  singlePicks: {
    red: number[];
    blue: number[];
  }[];
  dantuoGroups: DantuoPrediction[];
  reasoning: string;
  confidence: number;
}

export interface HighStakeBet {
  id: string;
  source: string; // e.g., "Station 10293", "Online Agent"
  numbers: string; // Format "01 02 03... + 01 02"
  multiplier: number; // 20-200
  timestamp: string;
}

export interface NewsItem {
  title: string;
  summary: string;
  date: string;
  source: string;
  url?: string;
}

export enum Tab {
  HOME = 'HOME',
  ANALYSIS = 'ANALYSIS',
  HIGH_STAKES = 'HIGH_STAKES',
  RULES = 'RULES',
  SETTINGS = 'SETTINGS'
}

export interface CrawlStatus {
  source: string;
  status: 'pending' | 'loading' | 'done' | 'error';
  progress: number;
}