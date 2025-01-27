import { useRef } from 'react';

export default function useThrottling(callback, delay = 500) {
  const timerFlag = useRef(null);

  return (...args) => {
    if (timerFlag.current) {
      callback(...args);
      timerFlag.current = setTimeout(() => {
        timerFlag.current = null;
      }, delay);
    }
  };
}
