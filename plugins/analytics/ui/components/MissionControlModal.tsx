import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MissionControlTab } from './dashboard/tabs/MissionControlTab';
import { useTranslation } from 'react-i18next';

interface MissionControlModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showToast?: (message: string, type: 'success' | 'error' | 'warning') => void;
}

export const MissionControlModal: React.FC<MissionControlModalProps> = ({
  open,
  onOpenChange,
  showToast
}) => {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setIsVisible(true);
      setTimeout(() => setIsAnimating(true), 10);
    } else {
      setIsAnimating(false);
      setTimeout(() => setIsVisible(false), 300);
    }
  }, [open]);

  if (!isVisible && !open) return null;

  return (
    <>
      {/* Backdrop - exact same as LogViewer */}
      {(isVisible || open) && (
        <div
          className={`fixed inset-0 z-50 transition-all duration-300 ease-out ${
            isAnimating && open ? 'bg-black/50 opacity-100' : 'bg-black/0 opacity-0 pointer-events-none'
          }`}
          onClick={() => onOpenChange(false)}
        />
      )}

      {/* Modal container - exact same structure as LogViewer */}
      <div
        ref={containerRef}
        className={`fixed bottom-0 left-0 right-0 z-50 flex flex-col bg-white shadow-2xl transition-all duration-300 ease-out transform ${
          isAnimating && open ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{
          height: '100vh',
          maxHeight: '100vh'
        }}
      >
        {/* Header - same style as LogViewer */}
        <div className="flex items-center justify-between border-b p-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Mission Control Dashboard</h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            className="h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        
        {/* Content container - full height with scrolling */}
        <div className="flex-1 overflow-hidden">
          <div className="h-full overflow-auto">
            <MissionControlTab />
          </div>
        </div>
      </div>
    </>
  );
};

export default MissionControlModal;
