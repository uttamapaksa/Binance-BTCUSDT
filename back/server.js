// Environment Variables
require('dotenv').config({ path: '../.env' });
const PORT = parseInt(process.env.PORT);
const MONGODB_USERNAME = process.env.MONGODB_USERNAME;
const MONGODB_PASSWORD = process.env.MONGODB_PASSWORD;

// Express
const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);

// Websocket
const WebSocket = require('ws');
const wss = new WebSocket.Server({ server });

// MongoDB
const mongoose = require('mongoose');
const mongoURI = `mongodb+srv://${MONGODB_USERNAME}:${MONGODB_PASSWORD}@uttama-binance-btcusdt.miw8w.mongodb.net/?retryWrites=true&w=majority&appName=uttama-binance-btcusdt`;
mongoose.connect(mongoURI)  // DB connection
  .then(() => console.log('MongoDB Connected'))
  .catch((err) => console.log(err));
const tradeDataSchema = new mongoose.Schema({  // schema
  tradeTime: { type: Date, default: Date.now, index: true, expires: 259200 },  // TTL: 3 days
  data: [Number],
});
const TradeData = mongoose.model('TradeData', tradeDataSchema);
  
// CCXT Library
const ccxtpro = require('ccxt').pro;
const bssocket = new ccxtpro.binance({
  'enableRateLimit': true,
  'options': {
    'defaultType': 'future',
  }
})
const symbol = 'BTC/USDT';
const clients = new Set();

// Binance API
const axios = require('axios');
const url = 'https://fapi.binance.com/futures/data/takerlongshortRatio';
const periods = ["5m", "15m", "1h", "4h", "1d"];

// batch updated data
let batchDataCount = 0;
let batchDataSocket = [0, 0, 0, 0, 0, 0];
let batchDataMongo = [0, 0, 0, 0, 0, 0];


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
        batchDataMongo[0] += usdtk;
      } else if (usdtk < 1000) {
        batchDataSocket[2] += usdtk;
        batchDataMongo[2] += usdtk;
      } else {
        batchDataSocket[4] += usdtk;
        batchDataMongo[4] += usdtk;
      }
    } else if (side === 'buy') {
      if (usdtk < 100) {
        batchDataSocket[1] += usdtk;
        batchDataMongo[1] += usdtk;
      } else if (usdtk < 1000) {
        batchDataSocket[3] += usdtk;
        batchDataMongo[3] += usdtk;
      } else {
        batchDataSocket[5] += usdtk;
        batchDataMongo[5] += usdtk;
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
    const ratio = Number(result.data?.[0]?.buySellRatio || 0);
    data[result.period] = Number.isFinite(ratio) ? Math.trunc((ratio / (1 + ratio)) * 100) : 0;;
  });

  return {flag: 0, data};
};


// 30초마다 거래 데이터를 MongoDB에 저장
async function saveTradeData() {
  try {
    const newTradeData = new TradeData({ data: [...batchDataMongo] });
    await newTradeData.save();
    batchDataMongo = [0, 0, 0, 0, 0, 0];
    console.log('데이터가 성공적으로 삽입되었습니다!');
  } catch (err) {
    console.error('데이터 삽입 중 오류 발생:', err);
  } finally {
    setTimeout(saveTradeData, 30000);
  }
}


// 15초마다 롱/숏 비율을 프론트엔드에 전송
async function sendTakerLongShortRatio() {
  try {
    const data = await fetchTakerLongShortRatio();
    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(data));
    }});
    console.log('데이터가 성공적으로 전송되었습니다!');
  } catch (err) {
    console.error('데이터 전송 중 오류 발생:', err);
  } finally {
    setTimeout(sendTakerLongShortRatio, 15000);
  }
}


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


// watchFutureTrades() 실행
watchFutureTrades();

// sendTakerLongShortRatio() 실행
sendTakerLongShortRatio();

// saveTradeData() 실행
saveTradeData();

// 지정된 포트에서 서버 실행
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

// // Express route example 
// app.get('/', (req, res) => {
//   res.send('WebSocket server is running!');
// });

const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
setInterval(async() => {
  try {
    const data = await TradeData.find({ tradeTime: { $gte: oneHourAgo } }, { _id: 0, data: 1 });
    console.log('1시간 전의 거래 데이터:', data);
  } catch (err) {
    console.error('데이터 조회 오류:', err);
  }
}, 30000);