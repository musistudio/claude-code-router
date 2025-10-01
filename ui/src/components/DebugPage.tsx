import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Send, Copy, Square, History, Maximize } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import MonacoEditor from '@monaco-editor/react';
import { RequestHistoryDrawer } from './RequestHistoryDrawer';
import { requestHistoryDB } from '@/lib/db';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function DebugPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [requestData, setRequestData] = useState({
    url: '',
    method: 'POST',
    headers: '{}',
    body: '{}'
  });
  const [responseData, setResponseData] = useState({
    status: 0,
    responseTime: 0,
    body: '',
    headers: '{}'
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);
  const [fullscreenEditor, setFullscreenEditor] = useState<'headers' | 'body' | null>(null);
  const headersEditorRef = useRef<any>(null);
  const bodyEditorRef = useRef<any>(null);

  // 切换全屏模式
  const toggleFullscreen = (editorType: 'headers' | 'body') => {
    const isEnteringFullscreen = fullscreenEditor !== editorType;
    setFullscreenEditor(isEnteringFullscreen ? editorType : null);

    // 延迟触发Monaco编辑器的重新布局，等待DOM更新完成
    setTimeout(() => {
      if (headersEditorRef.current) {
        headersEditorRef.current.layout();
      }
      if (bodyEditorRef.current) {
        bodyEditorRef.current.layout();
      }
    }, 300);
  };

  // 从URL参数中解析日志数据
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const logDataParam = params.get('logData');

    if (logDataParam) {
      try {
        const parsedData = JSON.parse(decodeURIComponent(logDataParam));

        // 解析URL - 支持多种字段名
        const url = parsedData.url || parsedData.requestUrl || parsedData.endpoint || '';

        // 解析Method - 支持多种字段名和大小写
        const method = (parsedData.method || parsedData.requestMethod || 'POST').toUpperCase();

        // 解析Headers - 支持多种格式
        let headers: Record<string, string> = {};
        if (parsedData.headers) {
          if (typeof parsedData.headers === 'string') {
            try {
              headers = JSON.parse(parsedData.headers);
            } catch {
              // 如果是字符串格式，尝试解析为键值对
              const headerLines = parsedData.headers.split('\n');
              headerLines.forEach((line: string) => {
                const [key, ...values] = line.split(':');
                if (key && values.length > 0) {
                  headers[key.trim()] = values.join(':').trim();
                }
              });
            }
          } else {
            headers = parsedData.headers;
          }
        }

        // 解析Body - 支持多种格式和嵌套结构
        let body: Record<string, unknown> = {};
        let bodyData = null;

        // 支持多种字段名和嵌套结构
        if (parsedData.body) {
          bodyData = parsedData.body;
        } else if (parsedData.request && parsedData.request.body) {
          bodyData = parsedData.request.body;
        }

        if (bodyData) {
          if (typeof bodyData === 'string') {
            try {
              // 尝试解析为JSON对象
              const parsed = JSON.parse(bodyData);
              body = parsed;
            } catch {
              // 如果不是JSON，检查是否是纯文本
              const trimmed = bodyData.trim();
              if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                // 看起来像JSON但解析失败，作为字符串保存
                body = { raw: bodyData };
              } else {
                // 普通文本，直接保存
                body = { content: bodyData };
              }
            }
          } else if (typeof bodyData === 'object') {
            // 已经是对象，直接使用
            body = bodyData;
          } else {
            // 其他类型，转换为字符串
            body = { content: String(bodyData) };
          }
        }

        // 预填充请求表单
        setRequestData({
          url,
          method,
          headers: JSON.stringify(headers, null, 2),
          body: JSON.stringify(body, null, 2)
        });

        console.log('Log data parsed successfully:', { url, method, headers, body });
      } catch (error) {
        console.error('Failed to parse log data:', error);
        console.error('Raw log data:', logDataParam);
      }
    }
  }, [location.search]);

  // 发送请求
  const sendRequest = async () => {
    try {
      setIsLoading(true);

      const headers = JSON.parse(requestData.headers);
      const body = JSON.parse(requestData.body);

      const startTime = Date.now();

      const response = await fetch(requestData.url, {
        method: requestData.method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        body: requestData.method !== 'GET' ? JSON.stringify(body) : undefined
      });

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      const responseText = await response.text();
      let responseBody = responseText;

      // 尝试解析JSON响应
      try {
        const jsonResponse = JSON.parse(responseText);
        responseBody = JSON.stringify(jsonResponse, null, 2);
      } catch {
        // 如果不是JSON，保持原样
      }

      const responseHeadersString = JSON.stringify(responseHeaders, null, 2);

      setResponseData({
        status: response.status,
        responseTime,
        body: responseBody,
        headers: responseHeadersString
      });

      // 保存到IndexedDB
      await requestHistoryDB.saveRequest({
        url: requestData.url,
        method: requestData.method,
        headers: requestData.headers,
        body: requestData.body,
        status: response.status,
        responseTime,
        responseBody,
        responseHeaders: responseHeadersString
      });

    } catch (error) {
      console.error('Request failed:', error);
      setResponseData({
        status: 0,
        responseTime: 0,
        body: `请求失败: ${error instanceof Error ? error.message : '未知错误'}`,
        headers: '{}'
      });
    } finally {
      setIsLoading(false);
    }
  };

  // 从历史记录中选择请求
  const handleSelectRequest = (request: import('@/lib/db').RequestHistoryItem) => {
    setRequestData({
      url: request.url,
      method: request.method,
      headers: request.headers,
      body: request.body
    });

    setResponseData({
      status: request.status,
      responseTime: request.responseTime,
      body: request.responseBody,
      headers: request.responseHeaders
    });
  };

  // 复制cURL命令
  const copyCurl = () => {
    try {
      const headers = JSON.parse(requestData.headers);
      const body = JSON.parse(requestData.body);

      let curlCommand = `curl -X ${requestData.method} "${requestData.url}"`;

      // 添加headers
      Object.entries(headers).forEach(([key, value]) => {
        curlCommand += ` \\\n  -H "${key}: ${value}"`;
      });

      // 添加body
      if (requestData.method !== 'GET' && Object.keys(body).length > 0) {
        curlCommand += ` \\\n  -d '${JSON.stringify(body)}'`;
      }

      navigator.clipboard.writeText(curlCommand);
      alert('cURL命令已复制到剪贴板');
    } catch (error) {
      console.error('Failed to copy cURL:', error);
      alert('复制cURL命令失败');
    }
  };


  return (
    <div className="h-screen bg-gray-50 font-sans">
      {/* 头部 */}
      <header className="flex h-16 items-center justify-between border-b bg-white px-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回
          </Button>
          <h1 className="text-xl font-semibold text-gray-800">HTTP 调试器</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setIsHistoryDrawerOpen(true)}>
            <History className="h-4 w-4 mr-2" />
            历史记录
          </Button>
          <Button variant="outline" onClick={copyCurl}>
            <Copy className="h-4 w-4 mr-2" />
            复制 cURL
          </Button>
        </div>
      </header>

      {/* 主要内容 */}
      <main className="flex h-[calc(100vh-4rem)] flex-col gap-4 p-4 overflow-hidden">
        {/* 上部分：请求参数配置 - 上中下布局 */}
        <div className="h-1/2 flex flex-col gap-4">
          <div className="bg-white rounded-lg border p-4 flex-1 flex flex-col">
            <h3 className="font-medium mb-4">请求参数配置</h3>
            <div className="flex flex-col gap-4 flex-1">
              {/* 上：Method、URL和发送请求按钮配置 */}
              <div className="flex gap-4 items-end">
                <div className="w-32">
                  <label className="block text-sm font-medium mb-1">Method</label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                    value={requestData.method}
                    onChange={(e) => setRequestData(prev => ({ ...prev, method: e.target.value }))}
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="DELETE">DELETE</option>
                    <option value="PATCH">PATCH</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1">URL</label>
                  <input
                    type="text"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                    value={requestData.url}
                    onChange={(e) => setRequestData(prev => ({ ...prev, url: e.target.value }))}
                    placeholder="https://api.example.com/endpoint"
                  />
                </div>
                <Button
                  variant={isLoading ? "destructive" : "default"}
                  onClick={isLoading ? () => {} : sendRequest}
                  disabled={isLoading || !requestData.url.trim()}
                >
                  {isLoading ? (
                    <>
                      <Square className="h-4 w-4 mr-2" />
                      请求中...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      发送请求
                    </>
                  )}
                </Button>
              </div>

              {/* Headers和Body配置 - 使用tab布局 */}
              <div className="flex-1">
                <Tabs defaultValue="headers" className="h-full flex flex-col">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="headers">Headers</TabsTrigger>
                    <TabsTrigger value="body">Body</TabsTrigger>
                  </TabsList>

                  <TabsContent value="headers" className="flex-1 mt-2">
                    <div
                      className={`${fullscreenEditor === 'headers' ? '' : 'h-full'} flex flex-col ${
                        fullscreenEditor === 'headers' ? 'fixed bg-white w-[100vw] h-[100vh] z-[9999] top-0 left-0 p-4' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium">Headers (JSON)</label>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleFullscreen('headers')}
                        >
                          <Maximize className="h-4 w-4 mr-1" />
                          {fullscreenEditor === 'headers' ? '退出全屏' : '全屏'}
                        </Button>
                      </div>
                      <div
                        id="fullscreen-headers"
                        className={`${fullscreenEditor === 'headers' ? 'h-full' : 'flex-1'} border border-gray-300 rounded-md overflow-hidden relative`}
                      >
                        <MonacoEditor
                          height="100%"
                          language="json"
                          value={requestData.headers}
                          onChange={(value) => setRequestData(prev => ({ ...prev, headers: value || '{}' }))}
                          onMount={(editor) => {
                            headersEditorRef.current = editor;
                          }}
                          options={{
                            minimap: { enabled: fullscreenEditor === 'headers' },
                            scrollBeyondLastLine: false,
                            fontSize: 14,
                            lineNumbers: 'on',
                            wordWrap: 'on',
                            automaticLayout: true,
                            formatOnPaste: true,
                            formatOnType: true,
                          }}
                        />
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="body" className="flex-1 mt-2">
                    <div
                      className={`${fullscreenEditor === 'body' ? '' : 'h-full'} flex flex-col ${
                        fullscreenEditor === 'body' ? 'fixed bg-white w-[100vw] h-[100vh] z-[9999] top-0 left-0 p-4' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium">Body (JSON)</label>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleFullscreen('body')}
                        >
                          <Maximize className="h-4 w-4 mr-1" />
                          {fullscreenEditor === 'body' ? '退出全屏' : '全屏'}
                        </Button>
                      </div>
                      <div
                        id="fullscreen-body"
                        className={`${fullscreenEditor === 'body' ? 'h-full' : 'flex-1'} border border-gray-300 rounded-md overflow-hidden relative`}
                      >
                        <MonacoEditor
                          height="100%"
                          language="json"
                          value={requestData.body}
                          onChange={(value) => setRequestData(prev => ({ ...prev, body: value || '{}' }))}
                          onMount={(editor) => {
                            bodyEditorRef.current = editor;
                          }}
                          options={{
                            minimap: { enabled: fullscreenEditor === 'body' },
                            scrollBeyondLastLine: false,
                            fontSize: 14,
                            lineNumbers: 'on',
                            wordWrap: 'on',
                            automaticLayout: true,
                            formatOnPaste: true,
                            formatOnType: true,
                          }}
                        />
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          </div>
        </div>

        {/* 下部分：响应信息查看 */}
        <div className="h-1/2 flex flex-col gap-4">
          <div className="flex-1 bg-white rounded-lg border p-4 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium">响应信息</h3>
              {responseData.status > 0 && (
                <div className="flex items-center gap-4 text-sm">
                  <span className="flex items-center gap-1">
                    状态码: <span className={`font-mono px-2 py-1 rounded ${
                      responseData.status >= 200 && responseData.status < 300 
                        ? 'bg-green-100 text-green-800' 
                        : responseData.status >= 400 
                        ? 'bg-red-100 text-red-800' 
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {responseData.status}
                    </span>
                  </span>
                  <span>
                    响应时间: <span className="font-mono">{responseData.responseTime}ms</span>
                  </span>
                </div>
              )}
            </div>

            {responseData.body ? (
              <div className="flex-1">
                <Tabs defaultValue="body" className="h-full flex flex-col">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="body">响应体</TabsTrigger>
                    <TabsTrigger value="headers">响应头</TabsTrigger>
                  </TabsList>

                  <TabsContent value="body" className="flex-1 mt-2">
                    <div className="bg-gray-50 border rounded-md p-3 h-full overflow-auto">
                      <pre className="text-sm whitespace-pre-wrap">
                        {responseData.body}
                      </pre>
                    </div>
                  </TabsContent>

                  <TabsContent value="headers" className="flex-1 mt-2">
                    <div className="bg-gray-50 border rounded-md p-3 h-full overflow-auto">
                      <pre className="text-sm">
                        {responseData.headers}
                      </pre>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-500">
                {isLoading ? '发送请求中...' : '发送请求后将在此显示响应'}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* 请求历史抽屉 */}
      <RequestHistoryDrawer
        isOpen={isHistoryDrawerOpen}
        onClose={() => setIsHistoryDrawerOpen(false)}
        onSelectRequest={handleSelectRequest}
      />
    </div>
  );
}
