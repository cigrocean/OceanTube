import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

export function useSocket(roomId, username, sessionId, password) { // Added password
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [adminId, setAdminId] = useState(null);

  useEffect(() => {
    if (!username || !roomId) return;

    // Use environment variable for backend URL (production) or localhost (development)
    const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000';
    
    const newSocket = io(SOCKET_URL, {
        reconnection: true,
        reconnectionAttempts: Infinity, // Keep trying until server wakes up
        reconnectionDelay: 2000,
        timeout: 20000, // 20s timeout for cold starts
    });

    setSocket(newSocket);

    function onConnect() {
      setIsConnected(true);
      console.log('Connected to server');
      // Emit password if provided
      newSocket.emit('join_room', { roomId, username, sessionId, password }); 
    }

    function onDisconnect() {
      setIsConnected(false);
      console.log('Disconnected from server');
    }

    function onRoomState(state) {
        if (state.admin) {
            setAdminId(state.admin);
        }
    }

    newSocket.on('connect', onConnect);
    newSocket.on('disconnect', onDisconnect);
    newSocket.on('sync_state', onRoomState);
    newSocket.on('user_left', (data) => {
        if (data.admin) setAdminId(data.admin);
    });
    
    newSocket.on('admin_changed', (data) => {
        if (data.newAdminId) setAdminId(data.newAdminId);
    });

    return () => {
      newSocket.off('connect', onConnect);
      newSocket.off('disconnect', onDisconnect);
      newSocket.off('sync_state', onRoomState);
      newSocket.disconnect();
    };
  }, [roomId, username, sessionId, password]); // dependable on password

  return { socket, isConnected, adminId };
}
