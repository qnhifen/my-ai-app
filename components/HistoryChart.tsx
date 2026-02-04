import React, { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from 'recharts';
import { LottoResult } from '../types';

interface HistoryChartProps {
  data: LottoResult[];
}

type ChartType = 'sum' | 'red_freq' | 'blue_freq';

export const HistoryChart: React.FC<HistoryChartProps> = ({ data }) => {
  const [chartType, setChartType] = useState<ChartType>('sum');

  const chartData = useMemo(() => {
    // Limit to latest 50 for analysis if we have more
    const analysisData = data.slice(0, 50);

    if (chartType === 'sum') {
      return [...analysisData].reverse().map(item => ({
        name: item.issue,
        value: item.red.reduce((a, b) => a + b, 0),
        type: 'sum'
      }));
    } else if (chartType === 'red_freq') {
      const counts: Record<string, number> = {};
      for (let i = 1; i <= 35; i++) counts[i.toString().padStart(2, '0')] = 0;
      
      analysisData.forEach(draw => {
        draw.red.forEach(num => {
          const key = num.toString().padStart(2, '0');
          if (counts[key] !== undefined) counts[key]++;
        });
      });

      // Ensure strict order 01-35
      const result = [];
      for (let i = 1; i <= 35; i++) {
        const key = i.toString().padStart(2, '0');
        result.push({ name: key, value: counts[key], type: 'freq' });
      }
      return result;
    } else {
      const counts: Record<string, number> = {};
      for (let i = 1; i <= 12; i++) counts[i.toString().padStart(2, '0')] = 0;
      
      analysisData.forEach(draw => {
        draw.blue.forEach(num => {
          const key = num.toString().padStart(2, '0');
          if (counts[key] !== undefined) counts[key]++;
        });
      });

      // Ensure strict order 01-12
      const result = [];
      for (let i = 1; i <= 12; i++) {
         const key = i.toString().padStart(2, '0');
         result.push({ name: key, value: counts[key], type: 'freq' });
      }
      return result;
    }
  }, [data, chartType]);

  const tabs = [
    { id: 'sum', label: '和值走势' },
    { id: 'red_freq', label: '前区(A)热度' },
    { id: 'blue_freq', label: '后区(B)热度' },
  ];

  const renderSingleChart = (data: any[], color: string) => (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 5, right: 0, left: -25, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
        <XAxis 
            dataKey="name" 
            tick={{fontSize: 9, fill: '#9ca3af'}} 
            interval={0}
            tickFormatter={(val) => val}
        />
        <YAxis tick={{fontSize: 9, fill: '#9ca3af'}} />
        <Tooltip 
          cursor={{fill: '#f3f4f6'}}
          contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
          formatter={(value: number) => [value, chartType === 'sum' ? '和值' : '出现次数']}
        />
        <Bar dataKey="value" radius={[2, 2, 0, 0]}>
          {data.map((entry: any, index: number) => (
            <Cell 
                key={`cell-${index}`} 
                fill={color} 
                opacity={chartType !== 'sum' ? 0.8 : 1}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );

  const renderScrollableChart = (data: any[], color: string) => {
    // Check chart type to apply specific styles
    const isRedFreq = chartType === 'red_freq';
    
    // Config for Red Freq: thinner bars (8px), smaller gap/itemWidth (22px)
    // Default (Sum): itemWidth 35px, auto bar size
    const itemWidth = isRedFreq ? 22 : 35; 
    const barSize = isRedFreq ? 8 : undefined; 
    
    const minWidth = data.length * itemWidth;

    return (
        <div className="w-full h-full overflow-x-auto no-scrollbar relative">
             <div style={{ width: Math.max(minWidth, 300), height: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                        <XAxis 
                            dataKey="name" 
                            tick={{fontSize: 10, fill: '#64748b'}} 
                            interval={0}
                            height={30}
                        />
                        <YAxis tick={{fontSize: 10, fill: '#9ca3af'}} allowDecimals={false} />
                        <Tooltip 
                            cursor={{fill: '#f3f4f6'}}
                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            formatter={(value: number) => [value, chartType === 'sum' ? '和值' : '出现次数']}
                        />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={barSize}>
                            {data.map((entry: any, index: number) => (
                                <Cell key={`cell-${index}`} fill={color} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
             </div>
        </div>
    );
  };

  return (
    <div className="w-full bg-white p-4 rounded-xl shadow-sm border border-gray-100 transition-all duration-300">
      <div className="flex justify-between items-center mb-4">
         <h3 className="text-xs font-semibold text-gray-500">
            {chartType === 'sum' ? '近期红球和值 (可左右滑动)' : chartType === 'red_freq' ? '近50期前区号码出现次数 (可滑动)' : '近50期后区号码出现次数'}
         </h3>
         <div className="flex bg-gray-100 rounded-lg p-1">
            {tabs.map(tab => (
                <button
                    key={tab.id}
                    onClick={() => setChartType(tab.id as ChartType)}
                    className={`text-[10px] px-2 py-1 rounded-md transition-all ${
                        chartType === tab.id 
                        ? 'bg-white text-blue-600 shadow-sm font-bold' 
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                >
                    {tab.label}
                </button>
            ))}
         </div>
      </div>

      <div className="w-full h-48 transition-all duration-300">
        {chartType === 'red_freq' ? (
            renderScrollableChart(chartData, '#ef4444')
        ) : chartType === 'sum' ? (
            renderScrollableChart(chartData, '#3b82f6')
        ) : (
            renderSingleChart(chartData, '#3b82f6')
        )}
      </div>
    </div>
  );
};
