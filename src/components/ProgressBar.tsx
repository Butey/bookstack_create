import { motion } from 'motion/react';

interface ProgressBarProps {
  percent: number;
  label: string;
}

export function ProgressBar({ percent, label }: ProgressBarProps) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      className="mb-4 space-y-2"
    >
      <div className="flex justify-between text-[9px] font-bold uppercase tracking-widest text-editorial-text">
        <span>{label}</span>
        <span>{percent}%</span>
      </div>
      <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
        <motion.div 
          className="h-full bg-editorial-text"
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ type: 'spring', bounce: 0, duration: 0.5 }}
        />
      </div>
    </motion.div>
  );
}
