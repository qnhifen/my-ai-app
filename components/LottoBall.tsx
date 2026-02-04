import React from 'react';

interface LottoBallProps {
  number: number;
  type: 'red' | 'blue';
  size?: 'sm' | 'md' | 'lg';
  animate?: boolean;
}

export const LottoBall: React.FC<LottoBallProps> = ({ number, type, size = 'md', animate = false }) => {
  const baseClasses = "rounded-full flex items-center justify-center font-bold text-white shadow-md border-2 border-white/30";
  
  const sizeClasses = {
    sm: "w-6 h-6 text-xs",
    md: "w-8 h-8 text-sm",
    lg: "w-10 h-10 text-base",
  };

  const colorClasses = type === 'red' 
    ? "bg-gradient-to-br from-red-500 to-red-700" 
    : "bg-gradient-to-br from-blue-500 to-blue-700";
    
  const animationClass = animate ? "animate-bounce" : "";

  return (
    <div className={`${baseClasses} ${sizeClasses[size]} ${colorClasses} ${animationClass}`}>
      {number.toString().padStart(2, '0')}
    </div>
  );
};
