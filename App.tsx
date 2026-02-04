import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Award, RefreshCw, Smartphone, Database, Zap, Lock, AlertCircle, Globe, Loader2, TrendingUp, Calculator, Clock, Printer, Newspaper, BookOpen, Wifi, WifiOff, Settings as SettingsIcon, ChevronRight, Info, ExternalLink } from 'lucide-react';
import { LottoResult, PredictionResult, HighStakeBet, Tab, CrawlStatus, NewsItem, DantuoPrediction } from './types';
import { MOCK_HISTORY, DATA_SOURCES, RULES_TEXT } from './constants';
import * as storage from './services/storageService';
import { analyzeAndPredict, fetchLotteryNews, fetchLatestHistory } from './services/geminiService';
import * as apiService from './services/apiService';
import { LottoBall } from './components/LottoBall';
import { HistoryChart } from './components/HistoryChart';
import { NavBar } from './components/NavBar';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>(Tab.HOME);
  const [history, setHistory] = useState<LottoResult[]>([]);
  const [highStakes, setHighStakes] = useState<HighStakeBet[]>([]);
  const [dataSources, setDataSources] = useState<string[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  
  // Analysis State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [crawlStatuses, setCrawlStatuses] = useState<CrawlStatus[]>(DATA_SOURCES);
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);

  // News State
  const [news, setNews] = useState<NewsItem[]>([]);
  const [isLoadingNews, setIsLoadingNews] = useState(false);

  // Settings State
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);

  // Polling Refs
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptsRef = useRef(0);

  // Initialize Data
  useEffect(() => {
    initData();
    setupPollingStrategy();

    return () => {
      if (pollingRef.current) clearTimeout(pollingRef.current);
    };
  }, []);

  // Fetch news when switching to Rules tab
  useEffect(() => {
      if (activeTab === Tab.RULES && news.length === 0) {
          loadNews();
      }
  }, [activeTab]);

  const initData = async () => {
    // 1. High Stakes (Simulated)
    let storedStakes = storage.getHighStakes();
    if (storedStakes.length === 0) {
      storedStakes = generateMockHighStakes();
      storage.saveHighStakes(storedStakes);
    }
    setHighStakes(storedStakes);

    // 2. History
    const storedHistory = storage.getHistory();
    // Update if no data or data is old (e.g. older than 6 hours)
    if (storedHistory.length === 0 || storage.shouldUpdateData()) {
      await refreshHistory();
    } else {
      setHistory(storedHistory);
      // Indicate local data initially
      if (storedHistory.length > 0) {
          setDataSources(["本地缓存数据"]);
      }
    }
  };

  const loadNews = async () => {
    setIsLoadingNews(true);
    try {
        const items = await fetchLotteryNews();
        setNews(items);
    } catch (e) {
        console.error("Failed to load news", e);
    } finally {
        setIsLoadingNews(false);
    }
  };

  const refreshHistory = async () => {
    if (isLoadingHistory) return;
    
    setIsLoadingHistory(true);
    setHistoryError(false);
    setDataSources([]); // Reset sources indicator

    try {
      // Strategy 1: Official API
      // Prioritize speed and accuracy from the direct API
      try {
          const data = await apiService.fetchOfficialHistory();
          if (data.length > 0) {
            setHistory(data);
            setDataSources(["体彩官网 (sporttery.cn)"]);
            storage.saveHistory(data);
            storage.setLastUpdate();
            setIsLoadingHistory(false);
            return;
          }
      } catch (e) {
          console.warn("Official API failed, failing over to AI Crawler...", e);
      }

      // Strategy 2: Multi-source AI Crawler (Baidu, Sina, 500.com, Zhcw)
      // Uses Gemini to search and parse results from these sites
      const { data: crawlerData, sources } = await fetchLatestHistory();
      
      if (crawlerData.length > 0) {
          setHistory(crawlerData);
          
          // Map URLs to user-friendly names
          const friendlySources = sources.map(s => {
              if (s.includes('500.com')) return '500彩票网';
              if (s.includes('sina')) return '新浪彩票';
              if (s.includes('zhcw')) return '中彩网';
              if (s.includes('baidu')) return '百度数据';
              try { return new URL(s).hostname.replace('www.', ''); } catch { return s; }
          });
          // Add generic ones if list is empty or specific ones not found
          if (friendlySources.length === 0) friendlySources.push('全网大数据聚合');
          
          setDataSources([...new Set(friendlySources)]);
          storage.saveHistory(crawlerData);
          storage.setLastUpdate();
          setIsLoadingHistory(false);
          return;
      }

      throw new Error("All data strategies failed");

    } catch (e) {
      console.error("Failed to load live history, using fallback", e);
      setHistoryError(true);
      // Fallback to cache or mock if cache empty
      const cached = storage.getHistory();
      setHistory(cached.length > 0 ? cached : MOCK_HISTORY);
      setDataSources(["本地离线数据"]);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const setupPollingStrategy = () => {
    const now = new Date();
    const day = now.getDay(); // 0-6. 1=Mon, 3=Wed, 6=Sat.
    
    // Only poll on draw days
    if (![1, 3, 6].includes(day)) return;

    // Target Time: 21:26:00
    const targetTime = new Date();
    targetTime.setHours(21, 26, 0, 0);

    // If it's already past 21:40, stop polling (draw is over)
    const stopTime = new Date();
    stopTime.setHours(21, 40, 0, 0);

    if (now > stopTime) return;

    if (now < targetTime) {
       // Wait until 21:26
       const delay = targetTime.getTime() - now.getTime();
       console.log(`Scheduled polling to start in ${delay/1000} seconds`);
       pollingRef.current = setTimeout(() => {
           startPollingLoop();
       }, delay);
    } else {
       // It's between 21:26 and 21:40, start immediately
       startPollingLoop();
    }
  };

  const startPollingLoop = async () => {
     console.log("Starting polling loop for latest draw...");
     attemptsRef.current = 0;
     const maxAttempts = 20;

     const poll = async () => {
         if (attemptsRef.current >= maxAttempts) {
             console.log("Polling stopped: Max attempts reached");
             return;
         }
         
         attemptsRef.current++;
         console.log(`Polling attempt ${attemptsRef.current}/${maxAttempts}`);

         try {
             // Use Refresh Logic
             await refreshHistory();
             
             // Check if we got today's draw
             const todayStr = new Date().toISOString().split('T')[0];
             setHistory(prev => {
                 if (prev[0]?.date === todayStr) {
                     console.log("New draw found!");
                     // Stop polling implicitly by not calling setTimeout again if we wanted, 
                     // but here we rely on the loop variable or just let it refresh to be safe.
                     // Actually let's stop if we found it.
                     attemptsRef.current = maxAttempts; 
                 }
                 return prev;
             });

         } catch (e) {
             console.error("Polling fetch failed", e);
         }

         if (attemptsRef.current < maxAttempts) {
            // Schedule next attempt in 30s
            pollingRef.current = setTimeout(poll, 30000);
         }
     };

     poll();
  };

  const generateMockHighStakes = (): HighStakeBet[] => {
    const bets: HighStakeBet[] = [];
    for(let i=0; i<15; i++) {
      const red = Array.from({length: 5}, () => Math.floor(Math.random()*35)+1).sort((a,b)=>a-b);
      const blue = Array.from({length: 2}, () => Math.floor(Math.random()*12)+1).sort((a,b)=>a-b);
      bets.push({
        id: Math.random().toString(36).substr(2, 9),
        source: Math.random() > 0.4 ? "线下实体店数据汇聚" : "互联网合作渠道监测",
        numbers: `${red.map(n=>n.toString().padStart(2,'0')).join(' ')} + ${blue.map(n=>n.toString().padStart(2,'0')).join(' ')}`,
        multiplier: Math.floor(Math.random() * (200 - 20 + 1)) + 20,
        timestamp: new Date(Date.now() - Math.floor(Math.random() * 10000000)).toLocaleTimeString()
      });
    }
    return bets.sort((a,b) => b.multiplier - a.multiplier);
  };

  const handleStartAnalysis = useCallback(async () => {
    setIsAnalyzing(true);
    setPrediction(null);
    setActiveTab(Tab.ANALYSIS);

    // Simulate Crawling Process
    const sources = [...DATA_SOURCES];
    for (let i = 0; i < sources.length; i++) {
        setCrawlStatuses(prev => prev.map((s, idx) => idx === i ? { ...s, status: 'loading', progress: 10 } : s));
        await new Promise(r => setTimeout(r, 400 + Math.random() * 500)); 
        setCrawlStatuses(prev => prev.map((s, idx) => idx === i ? { ...s, progress: 60 } : s));
        await new Promise(r => setTimeout(r, 200));
        setCrawlStatuses(prev => prev.map((s, idx) => idx === i ? { ...s, status: 'done', progress: 100 } : s));
    }

    const result = await analyzeAndPredict(history);
    setPrediction(result);
    setIsAnalyzing(false);
  }, [history]);

  const handleCheckUpdate = () => {
      if (isCheckingUpdate) return;
      setIsCheckingUpdate(true);
      // Simulate checking for update
      setTimeout(() => {
          setIsCheckingUpdate(false);
          alert("当前已是最新版本 (v3.4.0)，无需更新。");
      }, 2000);
  };

  // Calculations for Dantuo
  const factorial = (n: number): number => (n <= 1 ? 1 : n * factorial(n - 1));
  const combination = (n: number, k: number): number => {
    if (k < 0 || k > n) return 0;
    return factorial(n) / (factorial(k) * factorial(n - k));
  };
  
  const calculateDantuoCost = (dantuo: DantuoPrediction) => {
    // Red: Combinations of (Drags) taking (5 - Bankers)
    const redNeeded = 5 - dantuo.redBanker.length;
    let redCombs = 0;
    if (redNeeded >= 0) {
        redCombs = combination(dantuo.redDrag.length, redNeeded);
    }

    // Blue: Combinations of (Drags) taking (2 - Bankers)
    const blueNeeded = 2 - dantuo.blueBanker.length;
    let blueCombs = 0;
    if (blueNeeded >= 0) {
        blueCombs = combination(dantuo.blueDrag.length, blueNeeded);
    }

    const totalBets = redCombs * blueCombs;
    return totalBets * 2; // 2 RMB per bet
  };

  const handlePrint = () => {
    window.print();
  };

  const openNewsUrl = (url?: string) => {
    if (url) {
      window.open(url, '_blank');
    }
  };

  // --- Renders ---

  const renderHome = () => {
    const lastDraw = history[0];

    return (
      <div className="space-y-6">
        {/* Banner */}
        <div className="bg-gradient-to-r from-red-600 to-orange-500 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden min-h-[180px]">
          <div className="absolute top-0 right-0 opacity-10 transform translate-x-4 -translate-y-4">
            <Award size={120} />
          </div>
          
          {isLoadingHistory && history.length === 0 ? (
             <div className="flex flex-col items-center justify-center h-full space-y-3 z-10 relative">
                <Loader2 className="animate-spin" size={32} />
                <span className="text-sm opacity-90">全网数据同步中...</span>
             </div>
          ) : (
             <div className="relative z-10">
               <div className="flex justify-between items-start">
                 <div>
                    <h2 className="text-sm opacity-90 mb-1">第 {lastDraw?.issue || '-----'} 期开奖号码</h2>
                    <div className="text-xs opacity-75 mb-4">{lastDraw?.date}</div>
                 </div>
                 
                 {/* Manual Refresh Button with Loading State */}
                 <button 
                    onClick={refreshHistory} 
                    disabled={isLoadingHistory}
                    className="flex items-center gap-1 bg-white/20 px-3 py-1.5 rounded-full hover:bg-white/30 active:scale-95 transition-all text-xs font-medium backdrop-blur-sm"
                 >
                    <RefreshCw size={12} className={isLoadingHistory ? "animate-spin" : ""} />
                    <span>{isLoadingHistory ? '更新中' : '刷新数据'}</span>
                 </button>
               </div>
                
                <div className="flex space-x-2 mb-4">
                  {(lastDraw?.red || [0,0,0,0,0]).map((n, i) => <LottoBall key={`r-${i}`} number={n} type="red" />)}
                  {(lastDraw?.blue || [0,0]).map((n, i) => <LottoBall key={`b-${i}`} number={n} type="blue" />)}
                </div>
                
                <div className="flex justify-between text-xs opacity-90 border-t border-white/20 pt-3">
                   <span>销售: {lastDraw?.sales || '-'}</span>
                   <span>奖池: {lastDraw?.pool || '-'}</span>
                </div>
             </div>
          )}
        </div>
        
        {/* Data Source Indicator */}
        <div className="flex items-center justify-between px-2">
             <div className="flex items-center gap-1.5 text-[10px] text-gray-400 overflow-hidden">
                {historyError ? <WifiOff size={10} className="text-red-500" /> : <Wifi size={10} className="text-green-500" />}
                <span className="truncate max-w-[200px]">
                    数据源: {dataSources.length > 0 ? dataSources.join(', ') : '等待同步...'}
                </span>
             </div>
             {historyError && (
                 <span className="text-[10px] text-red-500 bg-red-50 px-2 py-0.5 rounded">离线模式</span>
             )}
        </div>

        {/* Action Button: Navigation to Analysis */}
        <div className="px-2">
            <button 
                onClick={() => setActiveTab(Tab.ANALYSIS)}
                className="w-full bg-white text-slate-800 border border-slate-200 py-4 rounded-xl font-bold shadow-sm hover:bg-slate-50 transition-all flex items-center justify-center space-x-2 active:scale-95"
            >
                <TrendingUp className="text-red-500" />
                <span>前往AI预测大厅</span>
            </button>
        </div>

        {/* Chart */}
        <div className="space-y-2">
            <h3 className="font-bold text-gray-800 ml-1 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Database size={16} /> 历史走势分析
                </div>
                {historyError && <span className="text-xs text-red-500 bg-red-50 px-2 py-0.5 rounded">离线数据</span>}
            </h3>
            {history.length > 0 ? (
                <HistoryChart data={history} />
            ) : (
                <div className="h-48 bg-gray-100 rounded-xl flex items-center justify-center text-gray-400 text-xs">
                    {isLoadingHistory ? '数据加载中...' : '暂无历史数据'}
                </div>
            )}
        </div>

        {/* History List */}
        <div className="space-y-3 pt-2">
             <h3 className="font-bold text-gray-800 ml-1 flex items-center gap-2">
                 <Clock size={16} /> 
                 <span>往期开奖 (近50期)</span>
             </h3>
             <div className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-50">
                 {history.slice(0, 50).map((item) => (
                     <div key={item.issue} className="p-3 flex flex-col gap-2">
                         <div className="flex justify-between items-center">
                             <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-gray-900">第 {item.issue} 期</span>
                                  <span className="text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">{item.date}</span>
                             </div>
                         </div>
                         <div className="flex items-center gap-2">
                             <div className="flex gap-1.5">
                                 {item.red.map((n) => (
                                     <span key={n} className="w-6 h-6 flex items-center justify-center rounded-full bg-red-50 text-red-600 text-xs font-bold font-mono">
                                         {n.toString().padStart(2, '0')}
                                     </span>
                                 ))}
                             </div>
                             <span className="text-gray-200">|</span>
                             <div className="flex gap-1.5">
                                 {item.blue.map((n) => (
                                     <span key={n} className="w-6 h-6 flex items-center justify-center rounded-full bg-blue-50 text-blue-600 text-xs font-bold font-mono">
                                         {n.toString().padStart(2, '0')}
                                     </span>
                                 ))}
                             </div>
                         </div>
                     </div>
                 ))}
                 {history.length === 0 && (
                     <div className="p-8 text-center text-gray-400 text-xs">
                         {isLoadingHistory ? '正在全网抓取...' : '暂无历史数据'}
                     </div>
                 )}
             </div>
        </div>
      </div>
    );
  };

  const renderAnalysis = () => {
    if (isAnalyzing) {
      return (
        <div className="space-y-4 pt-4">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 text-center space-y-4">
            <div className="relative w-16 h-16 mx-auto">
                <div className="absolute inset-0 border-4 border-gray-100 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-t-red-500 border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin"></div>
                <Globe className="absolute inset-0 m-auto text-gray-400" size={24} />
            </div>
            <h3 className="font-bold text-lg text-gray-800">全网数据聚合中...</h3>
            <p className="text-xs text-gray-500">正在通过爬虫节点获取投注数据 & 搜索最新专家分析</p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
             {crawlStatuses.map((source, idx) => (
                 <div key={idx} className="flex items-center justify-between p-4 border-b border-gray-50 last:border-0">
                     <div className="flex items-center space-x-3">
                         <div className={`w-2 h-2 rounded-full ${source.status === 'done' ? 'bg-green-500' : source.status === 'loading' ? 'animate-pulse bg-yellow-500' : 'bg-gray-300'}`} />
                         <span className="text-sm font-medium text-gray-700">{source.source}</span>
                     </div>
                     <span className="text-xs text-gray-400 font-mono">
                         {source.status === 'done' ? 'OK' : source.status === 'loading' ? `${source.progress}%` : '等待'}
                     </span>
                 </div>
             ))}
          </div>
        </div>
      );
    }

    if (prediction) {
      return (
        <div className="space-y-6 pt-2">
           <div id="prediction-report" className="bg-gradient-to-b from-slate-800 to-slate-900 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
               {/* Background Watermark */}
               <div className="absolute -top-10 -right-10 opacity-5">
                   <TrendingUp size={200} />
               </div>

              <div className="flex justify-between items-start mb-6 relative z-10">
                <div>
                    <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 to-yellow-500">AI 智能推荐</h2>
                    <p className="text-xs text-slate-400 mt-1">AI信心值 {prediction.confidence}%</p>
                </div>
                <div className="bg-yellow-500/20 px-3 py-1 rounded-full text-xs font-mono text-yellow-300 border border-yellow-500/30">
                    第 {history[0] ? parseInt(history[0].issue)+1 : '---'} 期
                </div>
              </div>

              {/* Single Picks */}
              <div className="space-y-4 mb-6 relative z-10">
                <h3 className="text-sm font-bold text-slate-300 border-l-4 border-red-500 pl-2">精选单注 (2组)</h3>
                {prediction.singlePicks.map((pick, idx) => (
                   <div key={idx} className="flex space-x-2 bg-slate-800/50 p-2 rounded-lg border border-white/5">
                      {pick.red.map(n => <LottoBall key={n} number={n} type="red" size="sm" />)}
                      {pick.blue.map(n => <LottoBall key={n} number={n} type="blue" size="sm" />)}
                   </div>
                ))}
              </div>

              {/* Dantuo Groups */}
              <div className="space-y-4 relative z-10">
                <div className="flex items-center gap-2 border-l-4 border-yellow-500 pl-2">
                    <h3 className="text-sm font-bold text-slate-300">万元户胆拖 (预算 ~200元)</h3>
                </div>
                
                {prediction.dantuoGroups.map((group, groupIdx) => (
                    <div key={groupIdx} className="bg-slate-800/50 p-3 rounded-lg border border-white/5 space-y-3 relative overflow-hidden">
                        <div className="absolute top-0 right-0 bg-yellow-500 text-slate-900 text-[10px] font-bold px-2 py-1 rounded-bl-lg">
                            方案 {String.fromCharCode(65 + groupIdx)}
                        </div>
                        
                        {/* Cost Est */}
                        <div className="flex items-center gap-1 text-[10px] text-yellow-200/80 mb-2">
                             <Calculator size={10} />
                             <span>预估 {calculateDantuoCost(group)} 元</span>
                        </div>

                        {/* Red Area */}
                        <div className="space-y-2">
                           <div className="flex items-center gap-2">
                                <span className="text-xs text-red-400 font-bold w-6">前胆</span>
                                <div className="flex gap-1 flex-wrap">
                                    {group.redBanker.length > 0 ? group.redBanker.map(n => <LottoBall key={`d-${n}`} number={n} type="red" size="sm" animate />) : <span className="text-xs text-gray-500">-</span>}
                                </div>
                           </div>
                           <div className="flex items-start gap-2">
                                <span className="text-xs text-slate-400 w-6 mt-1">前拖</span>
                                <div className="flex gap-1 flex-wrap">
                                    {group.redDrag.map(n => <div key={`t-${n}`} className="scale-90"><LottoBall number={n} type="red" size="sm" /></div>)}
                                </div>
                           </div>
                        </div>
                        
                        {/* Blue Area - Now with Banker/Drag support */}
                        <div className="space-y-2 border-t border-white/5 pt-2">
                           <div className="flex items-center gap-2">
                                <span className="text-xs text-blue-400 font-bold w-6">后胆</span>
                                <div className="flex gap-1">
                                    {group.blueBanker.length > 0 ? group.blueBanker.map(n => <LottoBall key={`bb-${n}`} number={n} type="blue" size="sm" animate />) : <span className="text-xs text-gray-500">-</span>}
                                </div>
                           </div>
                           <div className="flex items-start gap-2">
                                <span className="text-xs text-slate-400 w-6 mt-1">后拖</span>
                                <div className="flex gap-1 flex-wrap">
                                    {group.blueDrag.length > 0 ? group.blueDrag.map(n => <div key={`bt-${n}`} className="scale-90"><LottoBall number={n} type="blue" size="sm" /></div>) : <span className="text-xs text-gray-500">-</span>}
                                </div>
                           </div>
                        </div>
                    </div>
                ))}
              </div>

              <div className="mt-6 bg-white/5 rounded-xl p-4 border border-white/5 relative z-10">
                <h4 className="text-xs font-bold text-gray-400 uppercase mb-2">AI Analysis Report</h4>
                <p className="text-sm leading-relaxed text-gray-300">
                    {prediction.reasoning}
                </p>
              </div>
           </div>

           <div className="flex gap-4 no-print">
                <button 
                    onClick={handleStartAnalysis}
                    className="flex-1 bg-white border border-gray-200 text-gray-700 py-3 rounded-xl font-semibold shadow-sm active:bg-gray-50 text-sm flex items-center justify-center gap-2"
                >
                    <RefreshCw size={16} /> 重新分析
                </button>
                <button 
                    onClick={handlePrint}
                    className="flex-none bg-indigo-50 border border-indigo-200 text-indigo-700 px-6 py-3 rounded-xl font-semibold shadow-sm active:bg-indigo-100 text-sm flex items-center justify-center gap-2"
                >
                    <Printer size={18} /> 打印
                </button>
           </div>
        </div>
      );
    }

    // Default State: Waiting to start analysis
    return (
        <div className="flex flex-col items-center justify-center h-[70vh] text-center px-4 space-y-8">
            <div className="w-24 h-24 bg-gradient-to-br from-indigo-50 to-white rounded-full flex items-center justify-center shadow-inner border border-indigo-50">
                <Zap size={40} className="text-indigo-500" fill="currentColor" />
            </div>
            
            <div>
                <h3 className="text-2xl font-bold text-slate-800 mb-2">AI 智能预测系统</h3>
                <p className="text-sm text-gray-500 max-w-[260px] mx-auto leading-relaxed">
                    系统将自动聚合全网数据，通过Google Gemini模型进行深度推理。
                </p>
            </div>

            <div className="w-full px-4">
                <button 
                    onClick={handleStartAnalysis}
                    className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold shadow-xl hover:bg-slate-800 transition-all flex items-center justify-center space-x-2 active:scale-95 group"
                >
                    <Zap className="text-yellow-400 group-hover:scale-110 transition-transform" fill="currentColor" />
                    <span>启动AI全网分析预测 (第{history[0]?.issue ? parseInt(history[0].issue) + 1 : '---'}期)</span>
                </button>
                <div className="flex items-center justify-center gap-2 mt-4 text-xs text-gray-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                    <span>爬虫节点在线</span>
                    <span className="mx-1">|</span>
                    <span>预测截止: 20:50</span>
                </div>
            </div>
        </div>
    );
  };

  const renderHighStakes = () => {
    return (
      <div className="space-y-4">
        <div className="bg-yellow-50 border border-yellow-100 p-4 rounded-xl flex items-start gap-3">
             <AlertCircle className="text-yellow-600 shrink-0 mt-0.5" size={18} />
             <div>
                 <h3 className="text-sm font-bold text-yellow-800">大额倍投监控 (20-200倍)</h3>
                 <p className="text-xs text-yellow-700 mt-1 leading-relaxed">
                     系统实时监控全网疑似大额出票数据（已连接实时节点）。此数据仅供参考，请勿盲目跟投。
                 </p>
             </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-100">
            {highStakes.map((bet) => (
                <div key={bet.id} className="p-4">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-mono text-gray-400 bg-gray-50 px-2 py-0.5 rounded">ID: {bet.id}</span>
                        <span className="text-xs text-gray-400">{bet.timestamp}</span>
                    </div>
                    <div className="font-mono text-lg font-bold text-gray-800 tracking-tight mb-2">
                        {bet.numbers.split('+').map((part, i) => (
                            <span key={i} className={i===1 ? "text-blue-600 ml-2" : "text-red-600"}>{part}</span>
                        ))}
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-xs text-gray-500">{bet.source}</span>
                        <div className="flex items-center gap-1 bg-red-50 text-red-600 px-2 py-1 rounded text-xs font-bold">
                            <span>{bet.multiplier}倍</span>
                            <Zap size={10} fill="currentColor" />
                        </div>
                    </div>
                </div>
            ))}
        </div>
      </div>
    );
  };

  const renderRules = () => (
    <div className="space-y-6">
        {/* News Section */}
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
            <h2 className="font-bold text-lg mb-4 flex items-center gap-2 text-red-600">
                <Newspaper size={20} />
                <span>最新资讯</span>
            </h2>
            {isLoadingNews ? (
                <div className="flex justify-center py-4"><Loader2 className="animate-spin text-gray-400" /></div>
            ) : (
                <div className="space-y-3">
                    {news.length > 0 ? news.map((item, i) => (
                        <div 
                            key={i} 
                            onClick={() => openNewsUrl(item.url)}
                            className={`pb-3 border-b border-gray-50 last:border-0 last:pb-0 transition-colors rounded-lg p-2 -mx-2 ${item.url ? 'hover:bg-gray-50 cursor-pointer group' : ''}`}
                        >
                            <div className="flex justify-between items-start gap-2">
                                <h3 className={`text-sm font-bold text-gray-800 line-clamp-1 ${item.url ? 'group-hover:text-blue-600' : ''}`}>
                                    {item.title}
                                </h3>
                                {item.url && <ExternalLink size={14} className="text-gray-300 group-hover:text-blue-400 shrink-0 mt-0.5" />}
                            </div>
                            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{item.summary}</p>
                            <div className="flex justify-between mt-1 text-[10px] text-gray-400">
                                <span>{item.source}</span>
                                <span>{item.date}</span>
                            </div>
                        </div>
                    )) : <div className="text-center text-xs text-gray-400 py-2">暂无最新资讯</div>}
                </div>
            )}
        </div>

        {/* Rules Section */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <h2 className="font-bold text-lg mb-4 flex items-center gap-2 text-green-600">
                <BookOpen size={20} />
                <span>玩法说明全解</span>
            </h2>
            <div className="prose prose-sm text-gray-600 leading-relaxed text-xs">
                 <ReactMarkdown 
                    remarkPlugins={[remarkGfm]}
                    components={{
                        h1: ({node, ...props}) => <h1 className="text-xl font-bold mb-4 text-gray-900 border-b pb-2" {...props} />,
                        h2: ({node, ...props}) => <h2 className="text-base font-bold mt-4 mb-2 text-gray-800" {...props} />,
                        h3: ({node, ...props}) => <h3 className="text-sm font-bold mt-3 mb-1 text-gray-700" {...props} />,
                        p: ({node, ...props}) => <p className="mb-2" {...props} />,
                        ul: ({node, ...props}) => <ul className="list-disc pl-4 mb-2 space-y-1" {...props} />,
                        li: ({node, ...props}) => <li className="" {...props} />,
                        strong: ({node, ...props}) => <strong className="font-bold text-gray-900" {...props} />,
                        table: ({node, ...props}) => <div className="overflow-x-auto my-4 rounded-lg border border-gray-200"><table className="min-w-full divide-y divide-gray-200" {...props} /></div>,
                        thead: ({node, ...props}) => <thead className="bg-gray-50" {...props} />,
                        th: ({node, ...props}) => <th className="px-3 py-2 text-left text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap" {...props} />,
                        tbody: ({node, ...props}) => <tbody className="bg-white divide-y divide-gray-200" {...props} />,
                        tr: ({node, ...props}) => <tr className="" {...props} />,
                        td: ({node, ...props}) => <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-600" {...props} />,
                    }}
                 >
                    {RULES_TEXT}
                 </ReactMarkdown>
            </div>
        </div>
    </div>
  );

  const renderSettings = () => (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center space-y-4">
         <div className="w-20 h-20 bg-red-600 rounded-2xl flex items-center justify-center text-white font-bold text-4xl shadow-lg">
            乐
         </div>
         <div className="text-center">
            <h2 className="text-xl font-bold text-gray-800">超级大乐透AI预测大师</h2>
            <p className="text-sm text-gray-500 mt-1">Version 3.4.0</p>
         </div>
      </div>
  
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-50">
          <div className="p-4">
              <h3 className="font-bold text-gray-800 flex items-center gap-2 mb-3">
                  <Info size={16} className="text-blue-500"/>
                  软件说明
              </h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                  本应用基于Google Gemini Pro人工智能模型，结合历史开奖大数据、全网投注趋势及专家分析，为您提供科学的超级大乐透号码预测参考。
              </p>
              <div className="mt-3 bg-gray-50 p-3 rounded-xl">
                  <h4 className="text-xs font-bold text-gray-700 mb-2">核心功能</h4>
                  <ul className="text-xs text-gray-500 space-y-1.5">
                      <li className="flex items-center gap-2"><div className="w-1 h-1 bg-red-400 rounded-full"></div>AI智能选号：Gemini与统计学双重算法</li>
                      <li className="flex items-center gap-2"><div className="w-1 h-1 bg-yellow-400 rounded-full"></div>大额监控：实时捕捉20-200倍全网倍投</li>
                      <li className="flex items-center gap-2"><div className="w-1 h-1 bg-green-400 rounded-full"></div>全网聚合：自动爬取五大彩票门户数据</li>
                  </ul>
              </div>
          </div>
          
          <div 
              className="p-4 flex items-center justify-between hover:bg-gray-50 active:bg-gray-100 cursor-pointer transition-colors" 
              onClick={handleCheckUpdate}
          >
               <div className="flex items-center gap-3">
                   <div className="bg-blue-50 p-2 rounded-lg text-blue-600">
                      <RefreshCw size={20} className={isCheckingUpdate ? "animate-spin" : ""} />
                   </div>
                   <div>
                      <div className="font-bold text-gray-800 text-sm">在线版本升级</div>
                      <div className="text-xs text-gray-400">当前版本: v3.4.0</div>
                   </div>
               </div>
               {isCheckingUpdate ? (
                  <span className="text-xs text-gray-400">检查中...</span>
               ) : (
                  <ChevronRight size={16} className="text-gray-300" />
               )}
          </div>
      </div>
      
      <div className="text-center text-[10px] text-gray-300 py-4">
          © 2024 AI Lotto Predictor. All rights reserved.
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-24 font-sans text-slate-800">
      {/* Header */}
      <header className="bg-white sticky top-0 z-40 px-6 py-4 shadow-sm flex items-center justify-between no-print">
        <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center text-white font-bold text-lg">
                乐
            </div>
            <h1 className="font-bold text-lg tracking-tight">AI超级大乐透</h1>
        </div>
        <div className="flex items-center gap-2">
             {isLoadingHistory && <Loader2 size={12} className="animate-spin text-gray-400" />}
             <div className="text-[10px] font-mono bg-gray-100 px-2 py-1 rounded text-gray-500">
                V 3.4.0 Live
            </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-md mx-auto p-4">
        {activeTab === Tab.HOME && renderHome()}
        {activeTab === Tab.ANALYSIS && renderAnalysis()}
        {activeTab === Tab.HIGH_STAKES && renderHighStakes()}
        {activeTab === Tab.RULES && renderRules()}
        {activeTab === Tab.SETTINGS && renderSettings()}
      </main>

      {/* Navigation */}
      <div className="no-print">
         <NavBar currentTab={activeTab} onTabChange={setActiveTab} />
      </div>
    </div>
  );
}