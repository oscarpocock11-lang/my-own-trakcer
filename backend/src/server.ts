import express from 'express';
import http from 'http';
import WebSocket from 'ws';
import axios from 'axios';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8080;
const ALPHA_VANTAGE_KEY = process.env.ALPHA_VANTAGE_KEY || 'demo';

class TechnicalIndicators {
  static calculateRSI(prices: number[], period: number = 14): number {
    if (prices.length < period + 1) return 0;
    let gains = 0;
    let losses = 0;
    for (let i = prices.length - period; i < prices.length; i++) {
      const difference = prices[i] - prices[i - 1];
      if (difference > 0) gains += difference;
      else losses += Math.abs(difference);
    }
    const averageGain = gains / period;
    const averageLoss = losses / period;
    const rs = averageGain / averageLoss;
    const rsi = 100 - 100 / (1 + rs);
    return isNaN(rsi) ? 50 : rsi;
  }
}

const priceHistory = new Map<string, number[]>();
interface ClientData {
  symbols: string[];
}
const clientSessions = new Map<WebSocket, ClientData>();
const stockCache = new Map<string, any>();

async function fetchStockDataWithIndicators(symbol: string) {
  try {
    const response = await axios.get(
      `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${ALPHA_VANTAGE_KEY}`
    );
    const quote = response.data['Global Quote'];
    if (!quote || !quote['05. price']) return null;

    const price = parseFloat(quote['05. price']);
    if (!priceHistory.has(symbol)) priceHistory.set(symbol, []);
    const history = priceHistory.get(symbol)!;
    history.push(price);
    if (history.length > 500) history.shift();

    const rsi = TechnicalIndicators.calculateRSI(history);

    return {
      symbol,
      price,
      change: parseFloat(quote['09. change'] || 0),
      changePercent: parseFloat((quote['10. change percent'] || '0%').replace('%', '')),
      volume: parseInt(quote['06. volume'] || 0),
      timestamp: new Date().toISOString(),
      rsi,
    };
  } catch (error) {
    console.error(`Error fetching ${symbol}:`, error);
    return null;
  }
}

wss.on('connection', (ws: WebSocket) => {
  console.log('New client connected');
  clientSessions.set(ws, { symbols: [] });

  ws.on('message', async (message: string) => {
    try {
      const data = JSON.parse(message);
      const clientData = clientSessions.get(ws);

      if (data.action === 'subscribe') {
        if (clientData) clientData.symbols = data.symbols;
        for (const symbol of data.symbols) {
          const stockData = await fetchStockDataWithIndicators(symbol);
          if (stockData) {
            stockCache.set(symbol, stockData);
            ws.send(JSON.stringify({ type: 'stock_update', ...stockData }));
          }
        }
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });

  ws.on('close', () => {
    clientSessions.delete(ws);
  });
});

setInterval(async () => {
  const activeSymbols = new Set<string>();
  clientSessions.forEach((client) => {
    client.symbols.forEach((symbol: string) => activeSymbols.add(symbol));
  });

  for (const symbol of activeSymbols) {
    const stockData = await fetchStockDataWithIndicators(symbol);
    if (stockData) {
      stockCache.set(symbol, stockData);
      clientSessions.forEach((client, ws) => {
        if (client.symbols.includes(symbol) && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'stock_update', ...stockData }));
        }
      });
    }
  }
}, 5000);

app.get('/api/market-snapshot', async (req, res) => {
  const symbols = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA'];
  const stocks = [];
  for (const symbol of symbols) {
    const cached = stockCache.get(symbol);
    if (cached) {
      stocks.push(cached);
    } else {
      const data = await fetchStockDataWithIndicators(symbol);
      if (data) {
        stocks.push(data);
        stockCache.set(symbol, data);
      }
    }
  }
  res.json({ stocks, indices: [], historicalData: [] });
});

const frontendPath = path.join(__dirname, '../../frontend/build');
app.use(express.static(frontendPath));
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

server.listen(PORT, () => {
  console.log(`🚀 Stock Monitor running on port ${PORT}`);
});
