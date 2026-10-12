'use client';
import { useEffect, useRef, useState } from 'react';
import { GameConnection, browserTransport, type ConnectionState } from './connection';
const initial: ConnectionState = { game: null, id: '', name: '', code: '', connected: false, busy: false, restoring: false, pending: false, lastSync: null, latency: null, lastError: '', error: '' };
export function useGameConnection() {
  const controller = useRef<GameConnection | null>(null);
  const [state, setState] = useState(initial);
  useEffect(() => {
    const instance = new GameConnection({ storage: localStorage, transport: browserTransport, uuid: () => crypto.randomUUID(), now: () => Date.now(), schedule: (fn, delay) => setTimeout(fn, delay), cancel: timer => clearTimeout(timer) });
    controller.current = instance;
    const unsubscribe = instance.subscribe(setState);
    instance.start(new URLSearchParams(location.search).get('room'));
    const online = () => instance.connectivity(navigator.onLine);
    const visibility = () => instance.visibility(document.visibilityState === 'visible');
    const focus = () => instance.wake();
    online(); visibility();
    window.addEventListener('online', online); window.addEventListener('offline', online);
    window.addEventListener('focus', focus); window.addEventListener('pageshow', focus);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      unsubscribe(); instance.stop();
      window.removeEventListener('online', online); window.removeEventListener('offline', online);
      window.removeEventListener('focus', focus); window.removeEventListener('pageshow', focus);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  return { ...state, send: (type: string, name: string, code: string, extra?: Record<string, any>) => controller.current?.send(type, name, code, extra), leave: () => controller.current?.leave(), wake: () => controller.current?.wake(), dismissError: () => controller.current?.dismissError() };
}
