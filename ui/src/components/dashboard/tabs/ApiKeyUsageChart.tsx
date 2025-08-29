import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card } from '../../ui/card';

interface UsageHistoryData {
  chartData: { timestamp: string; [key: string]: number | string }[];
  keyNames: string[];
}

// Function to generate a consistent color from a string
const stringToColor = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  let color = '#';
  for (let i = 0; i < 3; i++) {
    const value = (hash >> (i * 8)) & 0xFF;
    color += ('00' + value.toString(16)).substr(-2);
  }
  return color;
};

const ApiKeyUsageChart: React.FC = () => {
  const [data, setData] = useState<UsageHistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsageHistory = async () => {
    try {
      const response = await fetch('/api/keys/usage-history');
      const result = await response.json();

      if (result.success) {
        setData(result.data);
        setError(null);
      } else {
        throw new Error(result.error || 'Failed to fetch usage history');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsageHistory();
    const interval = setInterval(fetchUsageHistory, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <div className="text-center p-4">Loading chart...</div>;
  }

  if (error) {
    return <div className="p-4 bg-red-100 text-red-700 rounded">Error: {error}</div>;
  }

  if (!data || data.chartData.length === 0) {
    return (
      <Card className="p-4 text-center text-gray-500">
        No API usage data available yet. Make some requests to see the chart.
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <h3 className="text-lg font-semibold mb-4 text-center">API Key Usage (Last 60 Minutes)</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart
          data={data.chartData}
          margin={{
            top: 5,
            right: 30,
            left: 20,
            bottom: 5,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="timestamp" />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Legend />
          {data.keyNames.map(keyName => (
            <Line 
              key={keyName} 
              type="monotone" 
              dataKey={keyName} 
              stroke={stringToColor(keyName)} 
              strokeWidth={2}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
};

export default ApiKeyUsageChart;
