import React, { useEffect, useState } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import './App.css';

interface StockData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  timestamp: string;
  rsi?: number;
  bollingerUpper?: number;
  bollingerMiddle?: number;
  bollingerLower?: number;
}

const App: React.FC = () => {
  const [stocks, setStocks] = useState<StockData[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [selectedStock, setSelectedStock] = useState<string>('AAPL');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ws = new WebSocket(
      `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/market-stream`
    );

    ws.onopen = () => {
      console.log('Connected to market stream');
      ws.send(JSON.stringify({
        action: 'subscribe',
        symbols: ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA']
      }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'stock_update') {
        setStocks((prevStocks) => {
          const updated = prevStocks.filter(s => s.symbol !== data.symbol);
          return [...updated, data];
        });

        setChartData((prevData) => [
          ...prevData.slice(-59),
          { ...data, time: new Date().toLocaleTimeString() }
        ]);
      }
    };

    ws.onerror = (error) => console.error('WebSocket error:', error);
    setLoading(false);

    return () => ws.close();
  }, []);

  const getChangeColor = (change: number) => change >= 0 ? '#00cc44' : '#ff4444';

  if (loading) return <div style={{ padding: '20px', color: '#00ff00' }}>Loading...</div>;

  return (
    <div className="dashboard">
      <div className="header">
        <h1>📊 Market Monitor</h1>
      </div>

      <div className="main-content">
        <div className="ticker-section">
          <h2>Live Stocks</h2>
          <div className="ticker-list">
            {stocks.map((stock) => (
              <div
                key={stock.symbol}
                className={`ticker-item ${stock.change >= 0 ? 'up' : 'down'}`}
                onClick={() => setSelectedStock(stock.symbol)}
              >
                <div className="ticker-symbol">{stock.symbol}</div>
                <div className="ticker-price">${stock.price.toFixed(2)}</div>
                <div className="ticker-change" style={{ color: getChangeColor(stock.change) }}>
                  {stock.change >= 0 ? '▲' : '▼'} {stock.changePercent.toFixed(2)}%
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="chart-section">
          <h2>{selectedStock} Price</h2>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={chartData}>
              <CartesianGrid stroke="#333" />
              <XAxis dataKey="time" stroke="#999" />
              <YAxis stroke="#999" />
              <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #666' }} />
              <Line type="monotone" dataKey="price" stroke="#00ff00" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-section">
          <h2>Volume</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid stroke="#333" />
              <XAxis dataKey="time" stroke="#999" />
              <YAxis stroke="#999" />
              <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #666' }} />
              <Bar dataKey="volume" fill="#0088ff" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default App;
