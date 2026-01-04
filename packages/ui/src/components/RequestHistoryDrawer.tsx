import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { History, Trash2, Clock, X } from 'lucide-react';
import { requestHistoryDB, type RequestHistoryItem } from '@/lib/db';

interface RequestHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectRequest: (request: RequestHistoryItem) => void;
}

export function RequestHistoryDrawer({ isOpen, onClose, onSelectRequest }: RequestHistoryDrawerProps) {
  const [requests, setRequests] = useState<RequestHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      loadRequests();
    }
  }, [isOpen]);

  const loadRequests = async () => {
    try {
      setLoading(true);
      const history = await requestHistoryDB.getRequests();
      setRequests(history);
    } catch (error) {
      console.error('Failed to load request history:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      await requestHistoryDB.deleteRequest(id);
      setRequests(prev => prev.filter(req => req.id !== id));
    } catch (error) {
      console.error('Failed to delete request:', error);
    }
  };

  const handleClearAll = async () => {
    if (window.confirm('确定要清空所有请求历史吗？')) {
      try {
        await requestHistoryDB.clearAllRequests();
        setRequests([]);
      } catch (error) {
        console.error('Failed to clear request history:', error);
      }
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)}小时前`;
    return date.toLocaleDateString();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* 遮罩层 */}
      <div 
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={onClose}
      />
      
      {/* 抽屉 */}
      <div className="absolute right-0 top-0 h-full w-96 bg-white shadow-xl flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5" />
            <h2 className="text-lg font-semibold">请求历史</h2>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleClearAll}
              disabled={requests.length === 0}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              清空
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-gray-500">
              加载中...
            </div>
          ) : requests.length > 0 ? (
            <div className="space-y-2">
              {requests.map((item) => (
                <div
                  key={item.id}
                  className="p-3 bg-gray-50 rounded-lg border cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => {
                    onSelectRequest(item);
                    onClose();
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs bg-gray-200 px-2 py-1 rounded">
                        {item.method}
                      </span>
                      <span className="text-sm font-medium truncate flex-1">
                        {item.url}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => handleDelete(item.id, e)}
                      className="h-6 w-6 p-0"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <div className="flex items-center gap-2">
                      <span className={`font-mono px-1 rounded ${
                        item.status >= 200 && item.status < 300 
                          ? 'bg-green-100 text-green-800' 
                          : item.status >= 400 
                          ? 'bg-red-100 text-red-800' 
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {item.status}
                      </span>
                      <span>{item.responseTime}ms</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>{formatTime(item.timestamp)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-gray-500 py-8">
              <History className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>暂无请求历史</p>
              <p className="text-sm mt-2">发送请求后会在此显示历史记录</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}