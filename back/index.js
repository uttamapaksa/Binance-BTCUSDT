// import
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const ccxtpro = require('ccxt').pro;
const axios = require('axios');

// express
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const PORT = 4000;

// ccxt library
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

// binance api
const url = 'https://fapi.binance.com/futures/data/takerlongshortRatio';
const periods = ["5m", "15m", "1h", "4h", "1d"];

// batch updated data
let batchDataCount = 0;
let batchDataSocket = [0, 0, 0, 0, 0, 0];
let batchDataRedis = [0, 0, 0, 0, 0, 0];


// 실시간 선물 거래 데이터 필터링 및 집계 
const aggregateTrades = (trades) => {
  for (const trade of trades) {
    const { cost, side, amount } = trade;
    const usdtk = (cost / 1000) | 0;
    if (usdtk < 10) continue;  // 10K($) 미만 필터링
    batchDataCount++;
    if (side === 'sell') {
      if (usdtk < 100) {
        batchDataSocket[0] += usdtk;
      } else if (usdtk < 1000) {
        batchDataSocket[2] += usdtk;
      } else {
        batchDataSocket[4] += usdtk;
      }
    } else if (side === 'buy') {
      if (usdtk < 100) {
        batchDataSocket[1] += usdtk;
      } else if (usdtk < 1000) {
        batchDataSocket[3] += usdtk;
      } else {
        batchDataSocket[5] += usdtk;
      }
    }
  }
};


// CCXT 라이브러리로 실시간 선물 거래 데이터 수신
const watchFutureTrades = async () => {
  if (bssocket.has['watchTrades']) {
    try {
      while (true) {
        const trades = await bssocket.watchTrades(symbol);
        aggregateTrades(trades);
        if (batchDataCount >= 3) {
          const data = {flag: 1, data: [...batchDataSocket]};
          batchDataCount = 0;
          batchDataSocket = [0, 0, 0, 0, 0, 0];
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


// 바이낸스 API로 기간별 Long/Short Ratio 조회
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


// 웹소켓 클라이언트 관리
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


// 실행부

// watchFutureTrades() 실행
watchFutureTrades();

// 15초마다 fetchTakerLongShortRatio() 실행
setInterval(async () => {
  const data = await fetchTakerLongShortRatio();
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
  }});
}, 15000);

// 지정된 포트에서 서버 실행
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

// // Express route example 
// app.get('/', (req, res) => {
//   res.send('WebSocket server is running!');
// });