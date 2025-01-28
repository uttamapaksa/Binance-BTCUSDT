import { useRef } from 'react';

export default function useDebounce(callback, delay=500) {
  const timer = useRef(null);

  return (...args) => {
    if (timer.current) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(() => {
      callback(...args);
    }, delay);
  };
}
