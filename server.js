import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);

// CORS configuration for production deployment
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',') 
  : ['http://localhost:5173'];

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST'],
  credentials: true
}));

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Health check endpoint for Render
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});


// Search Proxy Endpoint
// Proxies requests to Piped/Invidious instances to avoid CORS issues in the browser
// Search Proxy Endpoint
import { YouTube } from 'youtube-sr';

app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: 'Missing query' });

  try {
      // Use youtube-sr for reliable search
      const videos = await YouTube.search(query, { 
          limit: 20,
          type: 'video',
          safeSearch: false
      });

      if (!videos || videos.length === 0) {
           return res.json([]);
      }

      const results = videos.map(video => ({
          id: video.id,
          title: video.title,
          author: video.channel ? video.channel.name : 'Unknown',
          thumbnail: video.thumbnail ? video.thumbnail.url : null,
          duration: video.duration ? Math.floor(video.duration / 1000) : 0 // Convert ms to seconds
      }));
      
      return res.json(results);
  } catch (err) {
      console.error('YouTube Search Failed:', err);
      res.status(500).json({ error: `Search failed: ${err.message}` });
  }
});

// Helper to parse "MM:SS" or "HH:MM:SS" to seconds


app.use(express.static(path.join(__dirname, 'dist')));

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

// Room state: { roomId: { videoId, playing, sentiment, users: [{id, name, sessionId}], admin: string, adminSessionId: string } }
const rooms = {};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join_room', ({ roomId, username, sessionId, password }) => { // Accept password
    const room = roomId;
    const name = username || `User ${socket.id.substring(0, 4)}`; // Default name if not provided
    
    // Create room if doesn't exist
    if (!rooms[room]) {
      // Admin session logic (first user)
      const adminSessionId = sessionId;
      rooms[room] = { 
        videoId: 'dQw4w9WgXcQ', 
        playing: false, 
        timestamp: 0,
        users: [],
        admin: socket.id, // Creator is admin
        adminSessionId: adminSessionId,
        password: password || null, // Set initial password if provided
        queue: [] // Video Queue
      };
      console.log(`Room ${room} created by ${name}${password ? ' (Protected)' : ''}`);
    } else {
        // Clear cleanup timer if exists (User Reconnected)
        if (rooms[room].cleanupTimer) {
             console.log(`Room ${room} deletion cancelled (User joined).`);
             clearTimeout(rooms[room].cleanupTimer);
             rooms[room].cleanupTimer = null;
        }

        // Room exists determine admin via session
        if (rooms[room].users.length === 0) {
             // If room exists but all users left, the current user becomes admin
             rooms[room].admin = socket.id;
             rooms[room].adminSessionId = sessionId;
             console.log(`Room ${room} re-initialized with new admin ${name}`);
        } else if (sessionId && rooms[room].adminSessionId === sessionId) {
             // Restore admin status if session matches
             rooms[room].admin = socket.id;
             io.to(room).emit('admin_changed', { newAdminId: socket.id, newAdminName: name });
             console.log(`Admin restored for session ${sessionId} in room ${room}`);
        }
        
        if (rooms[room].password) { // If room has a password set
             // Check if the user is already in the room (reconnecting with same socket.id)
             const isExistingUser = rooms[room].users.some(u => u.id === socket.id);
             
             // Check if this is a known session (e.g. admin reloading)
             const isKnownSession = rooms[room].users.find(u => u.sessionId === sessionId);
             const isAdminSession = rooms[room].adminSessionId === sessionId;

             // If not existing user AND not known session AND not admin session -> require password
             if (!password && !isExistingUser && !isKnownSession && !isAdminSession) {
                  socket.emit('password_required', { roomId: room });
                  return;
             } else if (password && rooms[room].password !== password && !isExistingUser && !isKnownSession && !isAdminSession) { 
                  socket.emit('invalid_password', { roomId: room, message: 'Incorrect Room PIN' });
                  return;
             }
        }
    }

    socket.join(room);
    
    const newUser = { 
      id: socket.id, 
      name: name,
      sessionId: sessionId
    };
    rooms[roomId].users.push(newUser); // Add user to room
    
    io.to(roomId).emit('user_joined', { user: newUser, count: rooms[roomId].users.length, admin: rooms[roomId].admin });
    
    // Send full state to the new user so they know if they are admin, current video, etc.
    socket.emit('sync_state', rooms[roomId]);
  });

  socket.on('update_name', ({ roomId, name }) => {
     if (!rooms[roomId]) return;
     const user = rooms[roomId].users.find(u => u.id === socket.id);
     if (user) {
         user.name = name;
         io.to(roomId).emit('user_updated', user);
         // Also resend full list just in case is easier for clients
         io.to(roomId).emit('sync_state', rooms[roomId]); // Or just rely on user_updated
     }
  });

  socket.on('disconnecting', () => {
    for (const room of socket.rooms) {
      if (rooms[room]) {
        const userIndex = rooms[room].users.findIndex(u => u.id === socket.id);
        const leaverName = userIndex !== -1 ? rooms[room].users[userIndex].name : 'Unknown';
        
        rooms[room].users = rooms[room].users.filter(u => u.id !== socket.id);
        
         // Admin Reassignment
        if (rooms[room].admin === socket.id) {
            rooms[room].admin = rooms[room].users[0]?.id || null; // Next user becomes admin
        }
        
        io.to(room).emit('user_left', { 
            userId: socket.id, 
            count: rooms[room].users.length,
            admin: rooms[room].admin
        });
        
        // Announce user left
        if (leaverName !== 'Unknown') {
            io.to(room).emit('chat_message', {
                type: 'system',
                content: `${leaverName} left the room.`,
                timestamp: new Date().toISOString()
            });
        }
        
        if (rooms[room].users.length === 0) {
           // We don't delete immediately if persistence is needed? 
           // But here we do.
           // PRESERVE Room for short time to allow reload
           console.log(`Room ${room} is empty. Scheduling cleanup in 60s...`);
           if (rooms[room].cleanupTimer) clearTimeout(rooms[room].cleanupTimer);
           
           rooms[room].cleanupTimer = setTimeout(() => {
               if (rooms[room] && rooms[room].users.length === 0) {
                   console.log(`Room ${room} cleanup executed.`);
                   delete rooms[room];
               }
           }, 60000); // 1 minute persistence
        }
      }
    }
  });

  socket.on('set_password', ({ roomId, password }) => {
      // Validate Admin
      if (!rooms[roomId]) return;
      if (rooms[roomId].admin !== socket.id) {
          socket.emit('error', 'Only admin can set password');
          return;
      }
      
      // Validate format
      if (password && !/^\d{6}$/.test(password)) {
           socket.emit('error', 'Password must be exactly 6 digits');
           return;
      }
      
      rooms[roomId].password = password;
      
      io.to(roomId).emit('chat_message', {
          type: 'system',
          content: password ? 'Room is now password protected.' : 'Room password removed.',
          timestamp: new Date().toISOString()
      });
      
      // Sync state so clients know password status (and admin gets the saved PIN back)
      io.to(roomId).emit('sync_state', rooms[roomId]);
  });

  // Sync events
  socket.on('sync_action', ({ roomId, type, payload }) => {
    // type: 'play', 'pause', 'seek', 'change_video'
    if (!rooms[roomId]) return;
    
    // Permission check
    if (rooms[roomId].admin !== socket.id) {
        console.log(`Unauthorized sync attempt by ${socket.id} in room ${roomId}`);
        return;
    }
    
    const room = rooms[roomId];
    if (type === 'play') room.playing = true;
    if (type === 'pause') room.playing = false;
    if (type === 'seek') room.timestamp = payload;
    
    // For video change, we want to update EVERYONE including the admin/sender
    if (type === 'change_video') {
       room.videoId = payload;
       room.playing = true;
       room.timestamp = 0;
       io.to(roomId).emit('sync_action', { type, payload, sender: socket.id });
    } else {
       // For other actions (play/pause/seek), sender updates locally instantly, so only notify others
       socket.to(roomId).emit('sync_action', { type, payload, sender: socket.id });
    }
  });

  // Advanced Resync Protocol
  // 1. Client requests sync
  socket.on('request_sync', (roomId) => {
     if (!rooms[roomId]) return;
     const adminId = rooms[roomId].admin;
     if (adminId) {
         io.to(adminId).emit('get_time', { requesterId: socket.id });
     }
  });

  // 2. Admin reports time
  socket.on('time_report', ({ requesterId, time, playing }) => {
      // 3. Send to requester
      io.to(requesterId).emit('sync_exact', { time, playing });
  });

  socket.on('chat_message', ({ roomId, message }) => {
     // Find sender name
     const room = rooms[roomId];
     const user = room?.users.find(u => u.id === socket.id);
     const name = user ? user.name : 'Unknown';
     io.to(roomId).emit('chat_message', { userId: socket.id, name, message, timestamp: new Date().toISOString() });
  });

  // Admin Management
  socket.on('grant_admin', ({ roomId, targetUserId }) => {
      if (!rooms[roomId]) return;
      
      // Validate requester is current admin
      if (rooms[roomId].admin !== socket.id) {
          console.log(`Unauthorized grant_admin attempt by ${socket.id} in room ${roomId}`);
          return;
      }
      
      // Validate target user exists in room
      const targetUser = rooms[roomId].users.find(u => u.id === targetUserId);
      if (!targetUser) {
          console.log(`Target user ${targetUserId} not found in room ${roomId}`);
          return;
      }
      
      // Update admin
      rooms[roomId].admin = targetUserId;
      
      // Store the new admin's session ID
      rooms[roomId].adminSessionId = targetUser.sessionId;
      
      // Broadcast admin change to all users
      io.to(roomId).emit('admin_changed', { 
          newAdminId: targetUserId,
          newAdminName: targetUser.name
      });
  });

  socket.on('kick_user', ({ roomId, targetUserId }) => {
      if (!rooms[roomId]) return;
      
      // Validate requester is current admin
      if (rooms[roomId].admin !== socket.id) {
          console.log(`Unauthorized kick_user attempt by ${socket.id} in room ${roomId}`);
          return;
      }
      
      // Cannot kick yourself
      if (targetUserId === socket.id) {
          console.log(`Admin ${socket.id} tried to kick themselves`);
          return;
      }
      
      // Validate target user exists in room
      const targetUser = rooms[roomId].users.find(u => u.id === targetUserId);
      if (!targetUser) {
          console.log(`Target user ${targetUserId} not found in room ${roomId}`);
          return;
      }
      
      // Remove user from room
      rooms[roomId].users = rooms[roomId].users.filter(u => u.id !== targetUserId);
      
      // Notify the kicked user
      io.to(targetUserId).emit('kicked', { 
          roomId,
          reason: 'You were removed from the room by the admin'
      });

      // Announce kick to room
      io.to(roomId).emit('chat_message', {
          type: 'system',
          content: `${targetUser.name} was kicked by the admin.`,
          timestamp: new Date().toISOString()
      });
      
      // Force disconnect the kicked user from the room
      const targetSocket = io.sockets.sockets.get(targetUserId);
      if (targetSocket) {
          targetSocket.leave(roomId);
      }
      
      // Notify remaining users
      io.to(roomId).emit('user_left', {
          userId: targetUserId,
          count: rooms[roomId].users.length,
          admin: rooms[roomId].admin,
          kicked: true
      });
  });


  // Client requests full state sync
  socket.on('get_state', (roomId) => {
      if (!rooms[roomId]) return;
      socket.emit('sync_state', {
          videoId: rooms[roomId].videoId,
          playing: rooms[roomId].playing,
          timestamp: rooms[roomId].timestamp,
          users: rooms[roomId].users,
          password: rooms[roomId].password,
          queue: rooms[roomId].queue || [] // Send Queue
      });
  });

  // --- Video Queue Handlers ---

  socket.on('queue_add', ({ roomId, video }) => {
      console.log(`[Queue] Adding video to room ${roomId}:`, video?.title);
      if (!rooms[roomId]) {
          console.error(`[Queue] Room ${roomId} not found!`);
          return;
      }
      
      // video: { id, title, thumbnail, addedBy }
      if (!rooms[roomId].queue) rooms[roomId].queue = []; // Ensure queue exists
      rooms[roomId].queue.push(video);
      
      console.log(`[Queue] Updated queue length: ${rooms[roomId].queue.length}`);
      io.to(roomId).emit('queue_updated', rooms[roomId].queue);
  });

  socket.on('queue_remove', ({ roomId, index }) => {
      if (!rooms[roomId]) return;
      if (rooms[roomId].admin !== socket.id) return; // Only admin can remove
      
      if (index >= 0 && index < rooms[roomId].queue.length) {
          rooms[roomId].queue.splice(index, 1);
          io.to(roomId).emit('queue_updated', rooms[roomId].queue);
      }
  });

  socket.on('play_next', ({ roomId }) => {
      if (!rooms[roomId]) return;
      if (rooms[roomId].admin !== socket.id) return; // Only admin can trigger
      
      if (rooms[roomId].queue.length > 0) {
          const nextVideo = rooms[roomId].queue.shift(); // Remove first
          
          rooms[roomId].videoId = nextVideo.id;
          rooms[roomId].playing = true;
          
          // Broadcast both the video change and the queue update
          io.to(roomId).emit('sync_action', { 
              type: 'change_video', 
              payload: nextVideo.id, 
              sender: 'Queue' 
          });
          io.to(roomId).emit('queue_updated', rooms[roomId].queue);
      }
  });

  socket.on('queue_reorder', ({ roomId, fromIndex, toIndex }) => {
      if (!rooms[roomId]) return;
      if (rooms[roomId].admin !== socket.id) return; // Only admin can reorder
      
      const queue = rooms[roomId].queue;
      if (fromIndex < 0 || fromIndex >= queue.length || toIndex < 0 || toIndex >= queue.length) {
          return; // Invalid indices
      }
      
      // Remove item from fromIndex and insert at toIndex
      const [movedItem] = queue.splice(fromIndex, 1);
      queue.splice(toIndex, 0, movedItem);
      
      console.log(`[Queue] Reordered in room ${roomId}: moved from ${fromIndex} to ${toIndex}`);
      io.to(roomId).emit('queue_updated', rooms[roomId].queue);
  });
});

// SPA Catch-all for non-production environments or if not caught by static middleware
if (process.env.NODE_ENV !== 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
