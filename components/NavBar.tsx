import React from 'react';
import { Home, TrendingUp, AlertCircle, BookOpen, Settings } from 'lucide-react';
import { Tab } from '../types';

interface NavBarProps {
  currentTab: Tab;
  onTabChange: (tab: Tab) => void;
}

export const NavBar: React.FC<NavBarProps> = ({ currentTab, onTabChange }) => {
  const navItems = [
    { id: Tab.HOME, label: '首页', icon: Home },
    { id: Tab.ANALYSIS, label: 'AI预测', icon: TrendingUp },
    { id: Tab.HIGH_STAKES, label: '倍投监控', icon: AlertCircle },
    { id: Tab.RULES, label: '规则', icon: BookOpen },
    { id: Tab.SETTINGS, label: '设置', icon: Settings }, // Placed last to be on the Bottom Right
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 pb-safe pt-2 px-6 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-50">
      <div className="flex justify-between items-center max-w-md mx-auto">
        {navItems.map((item) => {
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`flex flex-col items-center space-y-1 w-12 transition-colors duration-200 ${
                isActive ? 'text-red-600' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <item.icon size={22} strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[10px] font-medium scale-90">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};