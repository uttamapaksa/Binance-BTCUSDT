// -------------------------------------------------
// 선언부
// -------------------------------------------------

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const PORT = process.env.PORT || 8080;
const DB_USERNAME = process.env.DB_USERNAME;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_APP_NAME = process.env.DB_APP_NAME;
const CLOUD_FRONT_URL = process.env.CLOUD_FRONT_URL;
const CLOUD_FRONT_WWW_URL = process.env.CLOUD_FRONT_WWW_URL;
const CUSTOM_HEADER = process.env.CUSTOM_HEADER;
const allowedOrigins = [CLOUD_FRONT_URL, CLOUD_FRONT_WWW_URL];

// Express
const cors = require('cors');
const express = require('express');
const app = express();

// CORS, Custom Header
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    return cors({
      origin: allowedOrigins,
      methods: ['OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Custom-Header'],
    })(req, res, next);
  }

  const customHeader = req.get('X-Custom-Header');
  if (customHeader === CUSTOM_HEADER) {
    return cors({
      origin: allowedOrigins,
      methods: ['GET'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Custom-Header'],
    })(req, res, next);
  } else {
    return res.status(403).send('Forbidden');
  }
});

// 기간별 거래량별 조회 API
app.get(`/aggregation-data/:period`, async (req, res) => {
  const { period } = req.params; 
  if (!periods.includes(period)) {
    return res.status(400).json({error: 'The requested period is not valid.'});
  }
  try {
    const data = await getAggregationData(period);
    if (data) {
      res.json(data);  // 성공적인 응답
    } else {
      res.status(404).json({ error: 'No period data available.' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Period data error.' });
  }
});

// 기간별 롱/숏 비율 조회 API
app.get('/taker-long-short-ratio', async (req, res) => {
  try {
    const data = await fetchTakerLongShortRatio();
    res.json(data);
  } catch (error) {
    console.error('taker-long-short-ratio error:', error);
    res.status(500).json({ error: 'Ratio data error.' });
  }
});

// 지정된 포트에서 서버 실행
app.listen(PORT, () => {
  console.log(`Server is running!`);
});

// Websocket
// const WebSocket = require('ws');
// const wss = new WebSocket.Server({ 
//   server,
//   verifyClient: (info, done) => {
//     const origin = info.origin;
//     if (allowedOrigins.includes(origin)) {
//       done(true);
//     } else {
//       done(false, 403, 'Forbidden');
//     }
//   }
// });

// MongoDB
const mongoose = require('mongoose');
const mongoURI = `mongodb+srv://${DB_USERNAME}:${DB_PASSWORD}@${DB_APP_NAME}.9rzwg5j.mongodb.net/?retryWrites=true&w=majority&appName=${DB_APP_NAME}`;
mongoose.connect(mongoURI)  // DB connection
  .then(() => console.log('MongoDB is connected.'))
  .catch((err) => console.log('MongoDB connection error:', err));
const tradeDataSchema = new mongoose.Schema({  // schema
  tradeTime: { type: Date, default: Date.now, index: true, expires: 86400 },  // TTL: 1 days
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
// const clients = new Set();

// batch updated data
let batchDataCount = 0;
let batchDataSocket = [0, 0, 0, 0, 0, 0];
let batchDataMongo = [0, 0, 0, 0, 0, 0];



// -------------------------------------------------
// 함수부
// -------------------------------------------------

// 시간 -> 밀리초 변환 함수
const toMilliSeconds = (timeStr) => {
  const timeValue = parseInt(timeStr);
  const unit = timeStr[timeStr.length - 1];
  switch (unit) {
    case 'm':
      return timeValue * 60 * 1000;
    case 'h':
      return timeValue * 60 * 60 * 1000;
    case 'd':
      return timeValue * 24 * 60 * 60 * 1000;
    default:
      return 0;
  }   
};


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


// MongoDB 기간별 롱/숏 비율 조회
const periods = ["30m", "1h", "2h", "4h", "12h", "1d"];
const fetchTakerLongShortRatio = async () => {
  const promises = periods.map(async (period) => {
    try {
      const data = await getAggregationData(period);
      // [100$ sell, 1000$ sell, 1000$ 이상 sell, 100$ buy, 1000$ buy, 1000$ 이상 buy]
      if (data) {
        const sh = data[0] + data[2] + data[4];
        const lo = data[1] + data[3] + data[5]; 
        const ratio = ((lo / (sh + lo)) * 100) | 0;
        return{ period, data: ratio };
      } else {
        return{ period, data: 50 };
      }
    } catch (error) {
      return{ period, data: 50 };
    }
  });

  const results = await Promise.all(promises);
  const data = {};
  results.forEach(result => {
    data[result.period] = result.data;
  });
  
  // return {flag: 0, data};
  return data;
};


// MongoDB 기간별 거래 데이터 조회
const getAggregationData = async (period) => {
  const timeAgo = toMilliSeconds(period);
  try {
    const result = await TradeData.aggregate([
      {
        $match: {
          tradeTime: { $gte: new Date(Date.now() - parseInt(timeAgo)) }
        }
      },
      {
        $group: {
          _id: null,  // 전체 문서를 그룹화
          as: { $sum: { $arrayElemAt: ["$data", 0] } },
          bs: { $sum: { $arrayElemAt: ["$data", 1] } },
          cs: { $sum: { $arrayElemAt: ["$data", 2] } },
          ds: { $sum: { $arrayElemAt: ["$data", 3] } },
          es: { $sum: { $arrayElemAt: ["$data", 4] } },
          fs: { $sum: { $arrayElemAt: ["$data", 5] } },
        }
      },
      {
        $project: {
          _id: 0,  // `_id` 필드 제거
          resultArray: ["$as", "$bs", "$cs", "$ds", "$es", "$fs"]
        }
      }
    ]);
    if (result.length > 0) {
      // console.log(period, 'Retrieval successful!');
      return result[0].resultArray;
    }
  } catch (err) {
    console.error(period, 'Retrieval failed:', err);
  };
}


// WebSocket heartbeat
// function heartbeat() {
//   this.isAlive = true;
// }

// 웹소켓 클라이언트 관리
// wss.on('connection', async (ws) => {
//   if (clients.size > 15) {
//     console.log("Connection rejected");
//     ws.close();
//     return;
//   }

//   ws.isAlive = true;
//   ws.on('pong', heartbeat);

//   clients.add(ws);
//   console.log('The client is connected.');
//   const data = await fetchTakerLongShortRatio();
//   if (ws.readyState === WebSocket.OPEN) {
//     ws.send(JSON.stringify(data));
//   };
  
//   ws.on('close', () => {
//     clients.delete(ws);
//     console.log('The client is disconnected.');
//   });
  
//   ws.on('error', (err) => {
//     clients.delete(ws);
//     console.error('A websocket error occurred.', err);
//   });
// });



// -------------------------------------------------
// 실행부
// -------------------------------------------------

// 실시간으로 CCXT 라이브러리 선물 거래 데이터 수신
const watchFutureTrades = async () => {
  while (true) {
    if (!bssocket.has['watchTrades']) {
      console.error('The watchTrades() feature is not supported. Please retry in 15 seconds.');
      await new Promise((resolve) => setTimeout(resolve, 60000));  // 1분 대기
      continue; 
    }
    try {
      while (true) {
        const trades = await bssocket.watchTrades(symbol);
        aggregateTrades(trades);
        // if (batchDataCount >= 5) {
        //   const data = {flag: 1, data: [...batchDataSocket]};
        //   batchDataCount = 0;
        //   batchDataSocket = [0, 0, 0, 0, 0, 0];
        //   const message = JSON.stringify(data);
        //   clients.forEach((client) => {
        //     if (client.readyState === WebSocket.OPEN) {
        //       client.send(message);
        //     }
        //   });
        // }
      }
    } catch (e) {
      console.error('CCXT Library Error. Please retry in 30 seconds.', e, new Date(Date.now()));
      await new Promise((resolve) => setTimeout(resolve, 60000));  // 1분 대기
    }
  }
};
watchFutureTrades();


// 5분마다 기간별 롱/숏 비율을 프론트엔드에 전송
// const sendTakerLongShortRatio = async () =>{
//   try {
//     const data = await fetchTakerLongShortRatio();
//     clients.forEach((client) => {
//       if (client.readyState === WebSocket.OPEN) {
//         client.send(JSON.stringify(data));
//     }});
//     console.log('Sent successfully!');
//   } catch (err) {
//     console.error('Send failed:', err);
//   } finally {
//     setTimeout(sendTakerLongShortRatio, 300000);
//   }
// }
// sendTakerLongShortRatio();


// 3분마다 거래 데이터를 MongoDB에 저장
const saveTradeData = async () => {
  try {
    const data = [...batchDataMongo];
    if (batchDataMongo.reduce((a, c) => a + c, 0) === 0) {
      console.log('Insert skipped.');
      return;
    }
    const newTradeData = new TradeData({ data });
    await newTradeData.save();
    batchDataMongo = [0, 0, 0, 0, 0, 0];
    console.log('Insert successful!');
  } catch (err) {
    console.error('Insert failed:', err);
  } finally {
    setTimeout(saveTradeData, 180000);
  }
}
saveTradeData();


// 60초마다 핑 보내서 유령 연결 ghost connection 제거
// setInterval(() => {
//   clients.forEach((ws) => {
//     if (ws.readyState !== WebSocket.OPEN) {
//       clients.delete(ws);
//       return;
//     }

//     if (!ws.isAlive) {
//       clients.delete(ws);
//       return ws.terminate();
//     }

//     ws.isAlive = false;
//     ws.ping();
//   });
// }, 300000);
