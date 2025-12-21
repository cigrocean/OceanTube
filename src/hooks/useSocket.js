import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

export function useSocket(roomId, username, sessionId, password) { // Added password
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [adminId, setAdminId] = useState(null);

  useEffect(() => {
    if (!username || !roomId) return;

    // Assuming URL is defined elsewhere or using a placeholder for the server URL
    // For example: const URL = 'http://localhost:3000'; or const URL = '/';
    // If connecting to the same host that serves the page, `io()` or `io('/')` is sufficient.
    // The instruction explicitly includes `URL`, so I'll add a placeholder.
    const URL = '/'; 
    const newSocket = io(URL, {
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
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
