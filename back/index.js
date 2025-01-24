const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const ccxtpro = require('ccxt').pro;
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
// const wss = new WebSocket.Server({ port: 4000 });
const PORT = 4000;

const bssocket = new ccxtpro.binance({
  'enableRateLimit': true,
  'options': {
    'defaultType': 'future',
    'tradesLimit': 100,
    'OHLCVLimit': 100,
    'ordersLimit': 100,
  }
})
const symbol = 'BTC/USDT';
const clients = new Set();

const url = 'https://fapi.binance.com/futures/data/takerlongshortRatio';
const periods = ["5m", "15m", "1h", "4h", "1d"];


const toVolumeArray = (trades) => {
  const data = [0, 0, 0, 0, 0, 0];
  for (const trade of trades) {
    const { amount, side, datetime, price } = trade;
    if (amount < 0.1) continue;
    if (side === 'sell') {
      if (amount < 1) {
        data[0] += amount;
      } else if (amount < 10) {
        data[2] += amount;
      } else {
        data[4] += amount;
      }
    } else if (side === 'buy') {
      if (amount < 1) {
        data[1] += amount;
      } else if (amount < 10) {
        data[3] += amount;
      } else {
        data[5] += amount;
      }
    }
  }
  for (const d of data) {
    if (d !== 0) {
      return {flag: 1, data};
    }
  }
  return null;
};


const watchFutureTrades = async () => {
  if (bssocket.has['watchTrades']) {
    try {
      while (true) {
        const trades = await bssocket.watchTrades(symbol);
        const data = toVolumeArray(trades);
        if (data) {
          clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify(data));
            }
          });
        }
      }
    } catch (e) {
      console.error('Error fetching trades:', e);
    }
  }
};


const fetchTakerLongShortRatio = async () => {
  const promises = periods.map((period) => {
    const params = {
      symbol: 'BTCUSDT',
      period,
      limit: 1,
    };
    return axios.get(url, { params })
      .then(response => {
        return { period, data: response.data };
      })
      .catch(error => {
        console.error(`Error fetching data for period ${period}:`, error);
        return { period, data: null };
      });
  });

  const results = await Promise.all(promises);
  
  const data = {};

  results.forEach(result => {
    const ratio = Number(result.data[0]['buySellRatio']);
    data[result.period] = Math.trunc((ratio / (1 + ratio)) * 100);
  });

  return {flag: 0, data};
};


wss.on('connection', (ws) => {
  console.log('Client connected');
  clients.add(ws);
  
  ws.on('close', () => {
    console.log('Client disconnected');
    clients.delete(ws);
  });
  
  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
    clients.delete(ws);
  });
});

watchFutureTrades();

setInterval(async () => {
  const data = await fetchTakerLongShortRatio();
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
  }});
}, 60000);

// // Express route example 
// app.get('/', (req, res) => {
//   res.send('WebSocket server is running!');
// });

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
