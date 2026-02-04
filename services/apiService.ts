import { LottoResult } from '../types';

const API_URL = 'https://webapi.sporttery.cn/gateway/lottery/getHistoryPageListV1.qry?gameNo=85&provinceId=0&pageSize=30&isVerify=1&pageNo=1';

const formatMoney = (amount: string): string => {
  if (!amount) return '-';
  const num = parseFloat(amount.replace(/,/g, ''));
  if (isNaN(num)) return amount;
  return (num / 100000000).toFixed(2) + "亿";
};

export const fetchOfficialHistory = async (): Promise<LottoResult[]> => {
  try {
    const response = await fetch(API_URL, {
       method: 'GET',
       headers: {
         // Note: In a browser environment, standard CORS rules apply.
         // 'User-Agent' and 'Referer' headers are typically restricted by the browser.
         // These are included per specification for environments that support them.
         'Accept': 'application/json, text/plain, */*',
         'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36',
         'Referer': 'https://www.lottery.gov.cn/'
       }
    });

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    const json = await response.json();
    
    if (json.success && json.value && json.value.list) {
        return json.value.list.map((item: any) => ({
            issue: item.lotteryDrawNum,
            date: item.lotteryDrawTime,
            red: item.lotteryDrawResult.split(' ').slice(0, 5).map(Number).sort((a:number, b:number) => a-b),
            blue: item.lotteryDrawResult.split(' ').slice(5).map(Number).sort((a:number, b:number) => a-b),
            sales: formatMoney(item.totalSaleAmount),
            pool: formatMoney(item.poolBalanceAfterdraw)
        }));
    }
    return [];
  } catch (error) {
    console.error("Fetch official history failed:", error);
    throw error;
  }
};
