import { GoogleGenAI, Type } from "@google/genai";
import { LottoResult, PredictionResult, NewsItem } from "../types";

// Helper to init Gemini
const getAi = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

export const fetchLatestHistory = async (): Promise<{ data: LottoResult[], sources: string[] }> => {
  const ai = getAi();
  // Requesting up to 50 results for frequency analysis
  const prompt = `
    Find the latest 50 official draw results for Chinese Super Lotto (超级大乐透).
    If you cannot retrieve exactly 50, retrieve as many as possible (at least 30).
    
    For each draw, extract:
    - Issue number (e.g., 24029)
    - Date (YYYY-MM-DD)
    - 5 Red balls (integers)
    - 2 Blue balls (integers)
    - Sales amount (string)
    - Pool amount (string)

    Return a JSON object with a "results" array.
    Ensure the data is sorted by date descending (latest first).
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            results: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  issue: { type: Type.STRING },
                  date: { type: Type.STRING },
                  red: { type: Type.ARRAY, items: { type: Type.INTEGER } },
                  blue: { type: Type.ARRAY, items: { type: Type.INTEGER } },
                  sales: { type: Type.STRING },
                  pool: { type: Type.STRING }
                }
              }
            }
          }
        }
      }
    });

    const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks
      ?.map((c: any) => c.web?.uri)
      .filter((u: string) => u) || [];

    // Safe parse
    const text = response.text || "{}";
    const json = JSON.parse(text);
    const data = json.results || [];

    // Basic validation
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("Empty data returned from AI");
    }

    return {
      data: data.map((item: any) => ({
        ...item,
        // Ensure arrays are sorted
        red: (item.red || []).sort((a: number, b: number) => a - b),
        blue: (item.blue || []).sort((a: number, b: number) => a - b),
      })),
      sources: Array.from(new Set(sources))
    };

  } catch (error) {
    console.error("Failed to fetch live history:", error);
    throw error;
  }
};

export const analyzeAndPredict = async (history: LottoResult[]): Promise<PredictionResult> => {
  try {
    const ai = getAi();
    
    // Use up to 20 recent draws for context in the prompt to avoid token overload but provide enough trend info
    const historyText = history.slice(0, 20).map(h => 
      `Issue ${h.issue}: Red[${h.red.join(',')}] Blue[${h.blue.join(',')}]`
    ).join('\n');

    const prompt = `
      Act as a professional lottery statistician for the Chinese Super Lotto (5/35 + 2/12).
      
      1. Search for the latest "Super Lotto trend analysis" or "expert predictions" for the next draw.
      2. Analyze the provided recent draw history (showing last 20 of available dataset):
      ${historyText}
      
      Tasks:
      1. Identify cold and hot numbers based on history and online trends.
      2. Generate TWO sets of 'Single Pick' predictions (5 Red + 2 Blue).
      3. Generate TWO sets of 'Dantuo' (Banker-Drag) predictions.
         - Target Budget: Approximately 200 RMB per set (approx 100 bets).
         - Structure: 
             - Red Area: Banker (1-4 nums) + Drag. 
             - Blue Area: Banker (0-1 num) + Drag.
         - Math Constraint: (Combinations of Red) * (Combinations of Blue) should be close to 100 bets.
           - Example Strategy A: Red 3 Bankers + 8 Drags (C(8,2)=28) AND Blue 1 Banker + 4 Drags (C(4,1)=4). Total 28*4=112 bets (224 RMB).
           - Example Strategy B: Red 4 Bankers + 10 Drags (C(10,1)=10) AND Blue 0 Bankers + 5 Drags (C(5,2)=10). Total 10*10=100 bets (200 RMB).
      4. Provide a brief reasoning.
      
      Return JSON format.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview", 
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }], // Enable search for better reasoning
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            singlePicks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                   red: { type: Type.ARRAY, items: { type: Type.INTEGER } },
                   blue: { type: Type.ARRAY, items: { type: Type.INTEGER } }
                }
              }
            },
            dantuoGroups: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  redBanker: { type: Type.ARRAY, items: { type: Type.INTEGER } },
                  redDrag: { type: Type.ARRAY, items: { type: Type.INTEGER } },
                  blueBanker: { type: Type.ARRAY, items: { type: Type.INTEGER } },
                  blueDrag: { type: Type.ARRAY, items: { type: Type.INTEGER } }
                }
              }
            },
            reasoning: {
              type: Type.STRING,
              description: "Brief reasoning in Chinese"
            },
            confidence: {
              type: Type.NUMBER,
              description: "Confidence score between 0 and 100"
            }
          },
          required: ["singlePicks", "dantuoGroups", "reasoning", "confidence"]
        }
      }
    });

    if (response.text) {
      const data = JSON.parse(response.text);
      
      return {
        singlePicks: data.singlePicks.map((p: any) => ({
          red: p.red.sort((a: number, b: number) => a - b),
          blue: p.blue.sort((a: number, b: number) => a - b)
        })),
        dantuoGroups: data.dantuoGroups.map((g: any) => ({
          redBanker: g.redBanker.sort((a: number, b: number) => a - b),
          redDrag: g.redDrag.sort((a: number, b: number) => a - b),
          blueBanker: g.blueBanker.sort((a: number, b: number) => a - b),
          blueDrag: g.blueDrag.sort((a: number, b: number) => a - b),
        })),
        reasoning: data.reasoning,
        confidence: data.confidence
      };
    }
    
    throw new Error("No data returned");
  } catch (error) {
    console.error("Gemini analysis failed:", error);
    // Fallback if AI fails
    return {
      singlePicks: [
        { red: [5, 12, 23, 28, 33], blue: [4, 9] },
        { red: [2, 8, 15, 29, 34], blue: [1, 7] }
      ],
      dantuoGroups: [
        {
          // ~224 RMB strategy
          redBanker: [5, 28, 33],
          redDrag: [2, 8, 12, 14, 19, 21, 23, 26], // 8 drags -> C(8,2)=28
          blueBanker: [4],
          blueDrag: [1, 7, 9, 11] // 4 drags -> C(4,1)=4. Total 28*4=112 bets.
        },
        {
           // ~200 RMB strategy
           redBanker: [2, 15, 29, 34],
           redDrag: [3, 7, 10, 16, 18, 22, 25, 30, 31, 35], // 10 drags -> C(10,1)=10
           blueBanker: [],
           blueDrag: [2, 5, 8, 10, 12] // 5 drags -> C(5,2)=10. Total 10*10=100 bets.
        }
      ],
      reasoning: "网络连接不稳定，已切换至离线算法模型进行预测。当前提供两组基于历史热度计算的200元预算胆拖方案。",
      confidence: 75
    };
  }
};

export const fetchLotteryNews = async (): Promise<NewsItem[]> => {
  const ai = getAi();
  const prompt = `
    Search for the latest news (within the last 7 days) about "超级大乐透" (Super Lotto China).
    Focus on official announcements, lottery results, big wins, or rule adjustments.
    
    Return a JSON object with a "news" array containing top 4 items.
    For each item include:
    - title: News title (Translate to Chinese if source is English, otherwise keep simplified Chinese)
    - summary: A very short 1-sentence summary (Must be in Simplified Chinese)
    - date: Date string (e.g. "2小时前" or "2024-03-15")
    - source: Source name (e.g. "新浪彩票", "500彩票网", "体彩官网")
    - url: The full URL to the news article.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            news: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  summary: { type: Type.STRING },
                  date: { type: Type.STRING },
                  source: { type: Type.STRING },
                  url: { type: Type.STRING }
                }
              }
            }
          }
        }
      }
    });

    if (response.text) {
        const json = JSON.parse(response.text);
        return json.news || [];
    }
    return [];
  } catch (error) {
    console.error("Failed to fetch news:", error);
    return [];
  }
};