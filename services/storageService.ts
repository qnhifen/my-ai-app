import { LottoResult, HighStakeBet } from '../types';

const KEYS = {
  HISTORY: 'lotto_history',
  HIGH_STAKES: 'lotto_high_stakes',
  LAST_UPDATE: 'lotto_last_update'
};

export const getHistory = (): LottoResult[] => {
  const data = localStorage.getItem(KEYS.HISTORY);
  return data ? JSON.parse(data) : [];
};

export const saveHistory = (history: LottoResult[]) => {
  localStorage.setItem(KEYS.HISTORY, JSON.stringify(history));
};

export const getHighStakes = (): HighStakeBet[] => {
  const data = localStorage.getItem(KEYS.HIGH_STAKES);
  return data ? JSON.parse(data) : [];
};

export const saveHighStakes = (bets: HighStakeBet[]) => {
  localStorage.setItem(KEYS.HIGH_STAKES, JSON.stringify(bets));
};

export const shouldUpdateData = (): boolean => {
  const lastUpdate = localStorage.getItem(KEYS.LAST_UPDATE);
  if (!lastUpdate) return true;
  
  const now = new Date();
  const last = new Date(parseInt(lastUpdate));
  
  // Update if data is older than 6 hours
  return (now.getTime() - last.getTime()) > 6 * 60 * 60 * 1000;
};

export const setLastUpdate = () => {
  localStorage.setItem(KEYS.LAST_UPDATE, Date.now().toString());
};
