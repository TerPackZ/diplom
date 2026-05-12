import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../hooks/useAuth';

interface SocketContextValue {
  socket: Socket | null;
  connected: boolean;
  onlineUsers: Set<number>;
  isOnline: (userId: number) => boolean;
}

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  connected: false,
  onlineUsers: new Set(),
  isOnline: () => false
});

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!token) {
      setSocket(prev => { prev?.disconnect(); return null; });
      setConnected(false);
      setOnlineUsers(new Set());
      return;
    }

    const s = io('/', {
      auth: { token },
      transports: ['websocket', 'polling']
    });

    s.on('connect', () => {
      console.log('[socket] connected', s.id);
      setConnected(true);
    });
    s.on('disconnect', (reason) => {
      console.log('[socket] disconnected', reason);
      setConnected(false);
      setOnlineUsers(new Set());
    });
    s.on('connect_error', (err) => {
      console.error('[socket] connect_error:', err.message);
    });

    s.on('online_users', ({ userIds }: { userIds: number[] }) => {
      setOnlineUsers(new Set(userIds));
    });
    s.on('user_online', ({ userId }: { userId: number }) => {
      setOnlineUsers(prev => {
        const next = new Set(prev);
        next.add(userId);
        return next;
      });
    });
    s.on('user_offline', ({ userId }: { userId: number }) => {
      setOnlineUsers(prev => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    });

    setSocket(s);

    return () => {
      s.disconnect();
      setSocket(null);
      setConnected(false);
      setOnlineUsers(new Set());
    };
  }, [token]);

  const isOnline = (userId: number) => onlineUsers.has(userId);

  return (
    <SocketContext.Provider value={{ socket, connected, onlineUsers, isOnline }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
