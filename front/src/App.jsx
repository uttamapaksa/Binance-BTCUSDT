import { useEffect, useState } from 'react';
import DoughnutChart from './components/doughnut-chart';
import BarChart from './components/bar-chart';
import './App.css'
import conIcon from './assets/check-circle.svg';
import disconIcon from './assets/x-circle.svg';

const SERVEL_URL = import.meta.env.VITE_SERVEL_URL;
const WEBSOCKET_URL = import.meta.env.VITE_WEBSOCKET_URL;
const periods = ['30m', '1h', '2h', '4h', '12h', '1d'];

function App() {
  const [period, setPeriod] = useState('');
  const [ratio, setRatio] = useState(periods.reduce((acc, period) => { acc[period] = 50; return acc }, {}));
  const [trades, setTrades] = useState([0, 0, 0, 0, 0, 0]);
  const [startTime, setStartTime] = useState('');

  const initStartTime = () => setStartTime(new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }));

  // 데이터 조회
  const getAggregationData = async () => {
    if (period === '') return;
    try {
      const response = await fetch(`${SERVEL_URL}/aggregation-data/${period}`, {
        method: 'GET',
      });
      const data = await response.json();
      if (response.ok) {
        setTrades(data);
        initStartTime();
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

  useEffect(() => {
    getAggregationData();
  }, [period]);

  useEffect(() => {
    const socket = new WebSocket(`${WEBSOCKET_URL}`);
    
    // 웹소켓 연결
    socket.onopen = () => {
      console.log('WebSocket 연결 성공');
      setTrades([0, 0, 0, 0, 0, 0]);
      initStartTime()
    };
  
    // 메시지 수신
    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.flag === 1) {  // watchFutureTrades()
        setTrades((prev) => {
          const next = [...prev];
          for (let i=0; i<6; i++) {
            next[i] += data.data[i];
          }
          return next;
        });
      } else if (data.flag === 0) {  // fetchTakerLongShortRatio()
        setRatio(periods.reduce((acc, period) => {
          acc[period] = data.data[period];
          return acc 
        }, {}));
      }
    };

    // 연결 에러
    socket.onerror = (error) => {
      console.error('WebSocket Error:', error);
    };

    // 언마운트 시 웹소켓 종료
    return () => {
      socket.close();
    };
  }, []);

  return (
    <div className='flex flex-col'>
      {/* 연결시각 */}
      <div className='sm:mt-1 flex justify-between items-center'>
        <div className='flex items-center font-semibold gap-x-1'>
          Binance BTCUSDT
          <img src={startTime? conIcon : disconIcon}  alt="connecion status" className='size-4' />
        </div>
      </div>
      <div className='mr-auto text-xs sm:text-sm'>{startTime}</div>
      {/* 시간별 */}
      <h1 className="ml-10 mt-8 font-bold text-left text-gray-800 text-lg sm:text-xl">시간별</h1>
      <div className='px-2 sm:px-10 grid grid-cols-3 sm:grid-cols-6 gap-x-1 place-items-center'>
        {periods.map((period) => (
          <DoughnutChart key={period} period={period} ratio={ratio[period]} />
        ))}
      </div>
      {/* 거래량별 */}
      <h1 className="ml-10 mt-12 font-bold text-left text-gray-800 text-lg sm:text-xl">거래량별</h1>
      <select
        onChange={(e) => setPeriod(e.target.value)}
        className='ml-auto py-1 px-2 border border-gray-400 rounded-sm'
      >
        {periods.map((period) => (
          <option key={period} value={period}>{period}</option>
        ))}
      </select>
      <div className='mt-3 sm:mt-5 h-92'>
        <BarChart trades={trades} />
      </div>
    </div>
  );
};

export default App