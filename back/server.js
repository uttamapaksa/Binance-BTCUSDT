// -------------------------------------------------
// 선언부
// -------------------------------------------------

// Environment Variables
require('dotenv').config({ path: '../.env' });
const SERVER_URL = process.env.SERVER_URL;
const PORT = parseInt(process.env.PORT);
const GET_API_URL = process.env.GET_API_URL;
const DB_USERNAME = process.env.DB_USERNAME;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_APP_NAME = process.env.DB_APP_NAME;

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
const mongoURI = `mongodb+srv://${DB_USERNAME}:${DB_PASSWORD}@${DB_APP_NAME}.miw8w.mongodb.net/?retryWrites=true&w=majority&appName=${DB_APP_NAME}`;
mongoose.connect(mongoURI)  // DB connection
  .then(() => console.log('MongoDB가 연결되었습니다.'))
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
const periods = ["15m", "30m", "1h", "4h", "12h", "1d"];
const fetchTakerLongShortRatio = async () => {
  const promises = periods.map(async (period) => {
    try {
      const data = await getAggregationData(period);
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
  
  return {flag: 0, data};
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
      console.log(period, '데이터가 성공적으로 조회되었습니다!', result[0].resultArray);
      return result[0].resultArray;
    }
  } catch (err) {
    console.error(period, '데이터 조회 중 오류가 발생했습니다.', err);
  };
}


// 웹소켓 클라이언트 관리
wss.on('connection', (ws) => {
  if (clients.size > 10) {
    clients.clear();
  }
  console.log('클라이언트가 연결되었습니다.');
  clients.add(ws);
  
  ws.on('close', () => {
    console.log('클라이언트가 연결이 해제되었습니다.');
    clients.delete(ws);
  });
  
  ws.on('error', (err) => {
    console.error('웹소켓 에러가 발생했습니다.', err);
    clients.delete(ws);
  });
});



// -------------------------------------------------
// 실행부
// -------------------------------------------------

// 지정된 포트에서 서버 실행
server.listen(PORT, () => {
  console.log(`Server is running on ${SERVER_URL}:${PORT}`);
});


// 조회 API
app.get(`/${GET_API_URL}/:period`, async (req, res) => {
  const { period } = req.params; 
  if (!periods.includes(period)) {
    return res.status(400).json({error: '요청한 조회 기간 형식이 맞지 않습니다.'});
  }
  try {
    const data = await getAggregationData(period);
    if (data) {
      res.json(data);  // 성공적인 응답
    } else {
      res.status(404).json({ error: '해당 기간의 데이터가 없습니다.' });
    }
  } catch (error) {
    res.status(500).json({ error: '데이터 조회 오류가 발생했습니다.' });
  }
});


// 실시간으로 CCXT 라이브러리 선물 거래 데이터 수신
const watchFutureTrades = async () => {
  while (true) {
    if (!bssocket.has['watchTrades']) {
      console.error('watchTrades 기능을 지원하지 않습니다. 10초 후 재시도합니다.');
      await new Promise((resolve) => setTimeout(resolve, 10000));
      continue; 
    }
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
      console.error('CCXT 라이브러리 거래 데이터 수신 오류', e);
      await new Promise((resolve) => setTimeout(resolve, 5000)); // 5초 대기
    }
  }
};
watchFutureTrades();


// 5분마다 기간별 롱/숏 비율을 프론트엔드에 전송
const sendTakerLongShortRatio = async () =>{
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
    setTimeout(sendTakerLongShortRatio, 300000);
  }
}
sendTakerLongShortRatio();


// 30초마다 거래 데이터를 MongoDB에 저장
const saveTradeData = async () => {
  try {
    const data = [...batchDataMongo];
    if (batchDataMongo.reduce((a, c) => a + c, 0) === 0) {
      console.log('데이터가 없으므로 삽입을 건너뜁니다.');
      return;
    }
    const newTradeData = new TradeData({ data });
    await newTradeData.save();
    batchDataMongo = [0, 0, 0, 0, 0, 0];
    console.log('데이터가 성공적으로 삽입되었습니다!');
  } catch (err) {
    console.error('데이터 삽입 중 오류가 발생했습니다.', err);
  } finally {
    setTimeout(saveTradeData, 30000);
  }
}
saveTradeData();