import { useTranslation } from 'react-i18next';
import { Calendar, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DateItem {
  date: string;
  requests: number;
  tokens: number;
}

interface DateSidebarProps {
  dates: DateItem[];
  selectedDate?: string;
  onSelect: (date: string) => void;
  onSelectToday: () => void;
}

export function DateSidebar({ dates, selectedDate, onSelect, onSelectToday }: DateSidebarProps) {
  const { t, i18n } = useTranslation();

  // Always compute today's date in local time
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // Ensure today's date always appears in the list (even with 0 requests if not already present)
  const allDates: DateItem[] = [
    ...(dates.some(d => d.date === todayStr) ? [] : [{ date: todayStr, requests: 0, tokens: 0 }]),
    ...dates,
  ];

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

    if (dateStr === todayStr) return t('usage.today');
    if (dateStr === yesterdayStr) return t('usage.yesterday');

    return date.toLocaleDateString(i18n.language || 'zh-CN', {
      month: 'long',
      day: 'numeric',
    });
  };

  const formatDayOfWeek = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(i18n.language || 'zh-CN', { weekday: 'short' });
  };

  return (
    <div className="w-36 flex flex-col border-r bg-muted/30 h-full">
      {/* Header */}
      <div className="p-3 border-b">
        <div className="flex items-center gap-2 font-semibold">
          <Calendar className="w-4 h-4" />
          {t('usage.date_history')}
        </div>
      </div>

      {/* Today button — always shown so user can quickly jump to today */}
      <div className="p-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={onSelectToday}
        >
          {t('usage.today')}
        </Button>
      </div>

      {/* Date list */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-2 space-y-1">
          {allDates.map((item) => {
            const isSelected = selectedDate === item.date;
            return (
              <button
                key={item.date}
                onClick={() => onSelect(item.date)}
                className={`
                  w-full text-left p-2 rounded-lg transition-colors
                  flex items-center justify-between group
                  ${isSelected
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted'
                  }
                `}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">
                      {formatDate(item.date)}
                    </span>
                    <span className={`text-xs ${isSelected ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                      {formatDayOfWeek(item.date)}
                    </span>
                  </div>
                  <div className={`text-xs mt-0.5 ${isSelected ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                    {item.requests.toLocaleString()} {t('usage.requests')}
                  </div>
                </div>
                <ChevronRight className={`
                  w-4 h-4 flex-shrink-0
                  ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'}
                `} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
