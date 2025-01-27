import { useEffect, useRef, useState } from 'react';
import useThrottling from './utils/useThrottling';
import "./App.css"

const periods = ["15m", "30m", "1h", "4h", "12h", "1d"];

function App() {
  const periodRef = useRef(periods[0]);
  const [ratio, setRatio] = useState(periods.reduce((acc, period) => { acc[period] = 50; return acc }, {}));
  const [trades, setTrades] = useState([0, 0, 0, 0, 0, 0]);
  const [bars, seTBars] = useState([0, 0, 0, 0, 0, 0]);
  const [startTime, setStartTime] = useState('');

  const initStartTime = () => {
    setStartTime(new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }));
  };

  // 데이터 조회
  const getAggregationData = async () => {
    const period = periodRef.current.value;
    try {
      const response = await fetch(`http://localhost:4000/aggregation-data/${period}`, {
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

  const buttonClick = useThrottling(getAggregationData, 500);

  // 그래프
  useEffect(() => {
    seTBars(() => {
      const [as, al, ss, sl, ws, wl] = [...trades];
      const next = [
        ((as * 300) / (as + al || 1) | 0),  // 0으로 나누는 경우 방지
        ((al * 300) / (as + al || 1) | 0),
        ((ss * 300) / (ss + sl || 1) | 0),
        ((sl * 300) / (ss + sl || 1) | 0),
        ((ws * 300) / (ws + wl || 1) | 0),
        ((wl * 300) / (ws + wl || 1) | 0),
      ]
      return next;
    })
  }, [trades]);

  useEffect(() => {
    const socket = new WebSocket('ws://localhost:4000');
    
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
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{display: 'flex', gap: '10px'}}>
        <select ref={periodRef}>
          {periods.map((period) => (
            <option key={period} value={period}>{period}</option>
          ))}
        </select>
        <button onClick={buttonClick}>조회</button>
      </div>
      <div style={{ marginLeft: 'auto', padding: '10px' }} >연결 시각: {startTime}</div>
      <div style={{ margin: '15px', display: 'flex', justifyContent: 'space-between'}}>
        {periods.map((period) => (
          <div key={period} className='ratio'>
            <span>{period}: {ratio[period]}%</span><span className={ratio[period] < 50 ? 'redDot' : 'greenDot'} />
          </div>
        ))}
      </div>
      <div style={{display: 'flex'}}>
        <div className='container'>
          <h3>ant</h3>
          <div className='graph'> 
            <div className='redBar' style={{ height: `${bars[0]}px` }}>{trades[0] | 0}</div>
            <div className='greenBar' style={{ height: `${bars[1]}px` }}>{trades[1] | 0}</div>
          </div>
        </div>
        <div className='container'>
          <h3>shark</h3>
          <div className='graph'> 
            <div className='redBar' style={{ height: `${bars[2]}px` }}>{trades[2] | 0}</div>
            <div className='greenBar' style={{ height: `${bars[3]}px` }}>{trades[3] | 0}</div>
          </div>
        </div>
        <div className='container'>
          <h3>whale</h3>
          <div className='graph'> 
            <div className='redBar' style={{ height: `${bars[4]}px` }}>{trades[4] | 0}</div>
            <div className='greenBar' style={{ height: `${bars[5]}px` }}>{trades[5] | 0}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App