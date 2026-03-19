import { useEffect, useRef, useState } from 'react';
import DoughnutChart from './components/doughnut-chart';
import BarChart from './components/bar-chart';
import { MoonIcon, SunIcon } from './components/icons';
import './App.css'

const API_URL = import.meta.env.VITE_API_URL; 
const X_CUSTOM_HEADER = import.meta.env.VITE_CUSTOM_HEADER;
const periods = ['30m', '1h', '2h', '4h', '12h', '1d'];
const createInitialRatio = () => periods.reduce((acc, p) => { acc[p] = 50; return acc; }, {});

function App() {
  const [isDark, setIsDark] = useState(false);
  const [period, setPeriod] = useState(periods[0]);
  const [ratio, setRatio] = useState(createInitialRatio);
  const [trades, setTrades] = useState([0, 0, 0, 0, 0, 0]);
  const batchTrades = useRef([0, 0, 0, 0, 0, 0]);

  // 다크모드 토글
  const toggleDarkMode = () => {
    setIsDark((prevDark) => {
      const newDark = !prevDark;
      if (newDark) {
        document.documentElement.classList.add('dark');
        localStorage.setItem('theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', 'light');
      }
      return newDark;
    })
  }

  // 거래량별 데이터 조회
  const getAggregationData = async () => {
    try {
      const response = await fetch(`${API_URL}/aggregation-data/${period}`, {
        method: 'GET',
        headers: { 'X-Custom-Header': X_CUSTOM_HEADER },
      });
      const data = await response.json();
      if (response.ok) {
        setTrades(data);
      } else {
        if (response.status === 404) {
          console.error(data.error, response.status);
        } else if (response.status === 500) {
          console.error(data.error, response.status);
        } else {
          console.error('예상치 못한 에러.', response.status);
        }
      }
    } catch (error) {
      console.error("요청 실패.", error);
    }
  };

  // 기간별 롱/숏 비율 조회
  const getRatioData = async () => {
    try {
      const response = await fetch(`${API_URL}/taker-long-short-ratio`, {
        method: 'GET',
        headers: { 'X-Custom-Header': X_CUSTOM_HEADER },
      });
      const data = await response.json();
      if (response.ok) {
        setRatio(periods.reduce((acc, p) => {
          acc[p] = data[p] ?? 50; // 값 없으면 0으로 기본값
          return acc;
        }, {}));
      } else {
        console.error('기간별 롱/숏 비율 조회 오류:', response.status, data.error);
      }
    } catch (error) {
      console.error('기간별 롱/숏 비율 요청 오류.', error);
    }
  };

  useEffect(() => {
    // 1. 다크모드
    const newDark = localStorage.getItem('theme') === 'dark';
    setIsDark(newDark);

    // 2. 기간별 롱/숏 비율
    getRatioData(); // 최초 1회
    const longShortRatioIntervalId = setInterval(() => {
      getRatioData();
    }, 300000); // 5분
    
    // 3. 거래량별 데이터 SetState 처리
    const setTradeDataIntervalId = setInterval(() => {
      if (batchTrades.current.reduce((a, c) => a + c, 0) === 0) return;
      setTrades((prev) => {
        const next = [...prev];
        for (let i=0; i<6; i++) {
          next[i] += batchTrades.current[i];
        }
        batchTrades.current = [0, 0, 0, 0, 0, 0];
        return next;
      });
    }, 2000); // 2초
    
    return () => {
      clearInterval(longShortRatioIntervalId);
      clearInterval(setTradeDataIntervalId);
    }
  }, []);

  // 거래량별 데이터 조회
  useEffect(() => {
    getAggregationData();
  }, [period]);

  // BTCUSDT 선물 trade 스트림
  useEffect(() => {
    const wsUrl = 'wss://fstream.binance.com/stream?streams=btcusdt@trade';
    const socket = new WebSocket(wsUrl);
  
    socket.onopen = () => {
      console.log('Binance WS connected');
      setTrades([0, 0, 0, 0, 0, 0]);
    };
  
    socket.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      // 바이낸스 futures aggregate trade/individual trade 포맷에 맞게 파싱
      // 아래는 예시용 (실제 필드는 바이낸스 문서 참고)
      const trade = msg.data; // { p: price, q: qty, m: isBuyerMarketMaker ... }
      // 예시로 quoteVolume(= price * qty)와 side 판별
      const price = parseFloat(trade.p);
      const qty = parseFloat(trade.q);
      const quote = price * qty; // USDT 기준
      const usdtk = (quote / 1000) | 0;
      if (usdtk < 10) return; // 10K 미만 필터링
  
      const isSell = trade.m === true; // maker가 sell이면 taker는 buy (정확한 side 로직은 정책대로)
      if (isSell) {
        if (usdtk < 100) {
          batchTrades.current[0] += usdtk;
        } else if (usdtk < 1000) {
          batchTrades.current[2] += usdtk;
        } else {
          batchTrades.current[4] += usdtk;
        }
      } else {
        if (usdtk < 100) {
          batchTrades.current[1] += usdtk;
        } else if (usdtk < 1000) {
          batchTrades.current[3] += usdtk;
        } else {
          batchTrades.current[5] += usdtk;
        }
      }
    };
    // 연결 에러
    socket.onerror = (error) => {
      console.error('Binance WS error:', error);
    };
    // 언마운트 시 웹소켓 종료
    return () => {
      socket.close();
    };
  }, []);
  
  // 웹소켓
  // useEffect(() => {
  //   const socket = new WebSocket(`${WEBSOCKET_URL}`);
  //   // 웹소켓 연결
  //   socket.onopen = () => {
  //     console.log('WebSocket 연결 성공');
  //     setTrades([0, 0, 0, 0, 0, 0]);
  //   };
  //   // 메시지 수신
  //   socket.onmessage = (event) => {
  //     const data = JSON.parse(event.data);
  //     if (data.flag === 1) {  // watchFutureTrades()
  //       setTrades((prev) => {
  //         const next = [...prev];
  //         for (let i=0; i<6; i++) {
  //           next[i] += data.data[i];
  //         }
  //         return next;
  //       });
  //     } else if (data.flag === 0) {  // fetchTakerLongShortRatio()
  //       setRatio(periods.reduce((acc, period) => {
  //         acc[period] = data.data[period];
  //         return acc 
  //       }, {}));
  //     }
  //   };
  //   // 연결 에러
  //   socket.onerror = (error) => {
  //     console.error('WebSocket Error:', error);
  //   };
  //   // 언마운트 시 웹소켓 종료
  //   return () => {
  //     socket.close();
  //   };
  // }, []);

  return (
    <div className='flex flex-col'>
      {/* 헤더 */}
      <div className='sm:mt-1 flex items-center gap-x-2'>
        <h3 className='font-semibold'>Binance BTCUSDT</h3>
        <div className="cursor-pointer" onClick={toggleDarkMode}>
          {isDark ? <MoonIcon /> : <SunIcon />}
        </div>
      </div>
      {/* 시간별 */}
      <h1 className="ml-10 mt-8 font-bold text-left text-lg sm:mt-10 sm:text-xl">시간별</h1>
      <div className='px-2 sm:px-10 grid grid-cols-3 sm:grid-cols-6 gap-x-1 place-items-center'>
        {periods.map((period) => (
          <DoughnutChart key={period} period={period} ratio={ratio[period]} />
        ))}
      </div>
      {/* 거래량별 */}
      <h1 className="ml-10 mt-12 font-bold text-left text-lg sm:text-xl">거래량별</h1>
      <select
        value={period}
        onChange={(e) => setPeriod(e.target.value)}
        className='ml-auto py-1 px-2 border border-gray-400 rounded-sm bg-gray-50 dark:bg-gray-900'
      >
        {periods.map((period) => (
          <option key={period} value={period} className='dark:bg-gray-900'>{period}</option>
        ))}
      </select>
      <div className='mt-3 sm:mt-5 h-92'>
        <BarChart trades={trades} />
      </div>
    </div>
  );
};

export default App