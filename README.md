# LocalTube

Watch YouTube videos together with friends on your local network. Synchronized playback, real-time chat, and no lag.

![LocalTube](https://img.shields.io/badge/LocalTube-v1.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## ✨ Features

### 🎥 Synchronized Video Playback
- **Real-time sync**: All users watch the same video at the same time
- **Admin controls**: Room admin can play, pause, seek, and skip videos
- **Client sync**: Non-admin users automatically sync with admin's playback state
- **Queue system**: Build a playlist of videos to watch together

### 💬 Real-time Chat
- **Live messaging**: Chat with everyone in the room
- **User presence**: See who's online with live user count
- **Unread notifications**: Badge indicators for new messages

### 🎛️ Admin Features
- **Video search**: Search YouTube directly from the app
- **Paste URL**: Load videos by pasting YouTube links
- **Queue management**: Reorder and remove videos from the queue
- **Skip videos**: Jump to the next video in the queue
- **User management**: Kick users or grant admin privileges
- **Room PIN**: Set a 6-digit PIN to protect your room

### 🔒 Security & Privacy
- **Room passwords**: Optional 6-digit PIN protection
- **Session persistence**: Automatic reconnection with saved credentials
- **Admin restoration**: Admins can rejoin and regain control
- **IP whitelisting**: Localhost protection built-in

### 📱 Responsive Design
- **Mobile-friendly**: Optimized for phones and tablets
- **Desktop experience**: Full-featured interface for larger screens
- **QR code sharing**: Easy room joining via QR code

## 🚀 Getting Started

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/cigrocean/LocalTube.git
cd LocalTube
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open your browser and navigate to:
```
http://localhost:5173
```

## 📖 Usage

### Creating a Room

1. Enter your display name on the landing page
2. (Optional) Set a 6-digit PIN to protect your room
3. Click **Create Room**
4. Share the room link or QR code with friends

### Joining a Room

1. Enter your display name
2. Enter the Room ID or click a shared link
3. If the room has a PIN, enter it when prompted
4. Click **Join Room**

### Admin Controls

As the room admin, you can:

- **Search Videos**: Click "Search Videos" to find YouTube content
- **Paste URL**: Click "Paste URL" to load a specific YouTube link
- **Queue**: View and manage the video queue
  - Reorder videos with up/down arrows
  - Remove videos with the X button
- **Skip**: Jump to the next video in the queue
- **Manage Users**: 
  - Click the user count to see online users
  - Grant admin privileges to other users
  - Kick users from the room
- **Set PIN**: Protect your room with a 6-digit PIN

### Client Features

As a non-admin user, you can:

- **Watch**: Videos automatically sync with the admin
- **Chat**: Send messages to everyone in the room
- **View Queue**: See what videos are coming up next
- **Independent pause**: Pause your own playback without affecting others

## 🛠️ Tech Stack

### Frontend
- **React** - UI framework
- **Vite** - Build tool and dev server
- **Socket.IO Client** - Real-time communication
- **Lucide React** - Icon library
- **React Router** - Navigation
- **React QR Code** - QR code generation

### Backend
- **Node.js** - Runtime environment
- **Express** - Web server
- **Socket.IO** - WebSocket server
- **ytsr** - YouTube search functionality
- **UUID** - Unique room ID generation

## 📁 Project Structure

```
LocalTube/
├── src/
│   ├── components/
│   │   ├── Room.jsx          # Main room component
│   │   ├── VideoPlayer.jsx   # YouTube player wrapper
│   │   └── VideoSearch.jsx   # Search interface
│   ├── hooks/
│   │   └── useSocket.js      # Socket.IO hook
│   ├── utils/
│   │   └── search.js         # YouTube search utility
│   ├── App.jsx               # App entry point
│   ├── main.jsx              # React entry point
│   └── index.css             # Global styles
├── server.js                 # Express + Socket.IO server
├── package.json
└── README.md
```

## 🎨 Features in Detail

### Video Queue System
- Add videos to queue while watching
- Automatic playback of next video when current ends
- Visual queue display with thumbnails
- Admin-only reordering and removal

### Real-time Synchronization
- Play/pause sync across all users
- Seek position sync
- Video change sync
- Queue updates broadcast to all users

### User Management
- Admin can grant privileges to other users
- Admin can kick users from the room
- User list shows admin with crown icon 👑
- Admin always pinned to top of user list

### Room Persistence
- Sessions saved in localStorage
- Automatic admin restoration on rejoin
- Room cleanup after 60 seconds of inactivity

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📝 License

This project is open source and available under the MIT License.

## 👨‍💻 Author

**Ocean LITMERS**

- GitHub: [@cigrocean](https://github.com/cigrocean)
- Other Projects:
  - [Cigro Meeting Rooms Booking](https://cigromeetingroomsbooking.vercel.app/)
  - [SwaggerNav](https://github.com/cigrocean/SwaggerNav)

## 🙏 Acknowledgments

- Powered by [Antigravity](https://antigravity.google/)
- Built with ❤️ using React and Socket.IO

## 📞 Support

If you encounter any issues or have questions, please [open an issue](https://github.com/cigrocean/LocalTube/issues) on GitHub.

---

**Enjoy watching videos together with LocalTube! 🎬**
