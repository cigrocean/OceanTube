import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useParams, Navigate, useSearchParams } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { Play, Zap, Calendar, Compass } from 'lucide-react';
import { Room } from './components/Room';

function Landing() {
  const [username, setUsername] = useState(localStorage.getItem('localtube_username') || '');
  const [searchParams] = useSearchParams();
  const [joinInput, setJoinInput] = useState(searchParams.get('join') || '');
  const [errors, setErrors] = useState({ name: '', room: '', password: '' });
  const [password, setPassword] = useState(''); // New password state
  const navigate = useNavigate();
  
  // Effect to update join input if URL changes (e.g. redirect)
  useEffect(() => {
    const joinParam = searchParams.get('join');
    if (joinParam) {
        setJoinInput(joinParam);
    }
  }, [searchParams]);

  const handleCreate = () => {
    if (!username.trim()) {
        setErrors(p => ({ ...p, name: 'Please enter a display name first' }));
        return;
    }
    if (password && !/^\d{6}$/.test(password)) {
        setErrors(p => ({ ...p, password: 'PIN must be exactly 6 digits (0-9)' }));
        return;
    }
    setErrors({ name: '', room: '', password: '' });
    localStorage.setItem('localtube_username', username.trim());
    const roomId = uuidv4().slice(0, 8);
    // Pass password in state so Room.jsx can use it for initial join
    navigate(`/room/${roomId}`, { state: { password } });
  };

  const handleJoin = (e) => {
    e.preventDefault();
    let hasError = false;
    const newErrors = { name: '', room: '' };
    if (!username.trim()) {
        newErrors.name = 'Please enter a display name first';
        hasError = true;
    }
    if (!joinInput.trim()) {
        newErrors.room = 'Please enter a Room ID';
        hasError = true;
    }
    setErrors(newErrors);
    if (hasError) return;

    localStorage.setItem('localtube_username', username.trim());
    navigate(`/room/${joinInput.trim()}`, { state: { password } });
  };

  return (
    <div className="landing">
       <div className="landing-content">
          <div className="landing-header">
            <div className="landing-logo-box">
                <Play size={40} fill="white" color="white" />
            </div>
            <h1 className="landing-title">LocalTube</h1>
          </div>
          
          <p className="landing-description">
            Watch YouTube videos together with friends on your local network. 
            Synchronized playback, real-time chat, and no lag.
          </p>

          <div className="landing-form-container">
             <div className="input-wrapper">
                 <label className="input-label">Display Name</label>
                 <input 
                    type="text" 
                    placeholder="Enter your name..." 
                    value={username}
                    onChange={e => { setUsername(e.target.value); setErrors(p => ({ ...p, name: '' })); }}
                    className={`styled-input ${errors.name ? 'error' : ''}`}
                 />
                 {errors.name && (
                    <div className="error-msg">
                        {errors.name}
                    </div>
                 )}
             </div>

             {!searchParams.get('join') && (
                 <div className="input-wrapper">
                     <label className="input-label">Room PIN (Optional)</label>
                     <input 
                        type="text" 
                        placeholder="Set 6-digit PIN" 
                        value={password}
                        maxLength={6}
                        onChange={e => { 
                            const val = e.target.value.replace(/\D/g, ''); // Only numbers
                            setPassword(val); 
                            setErrors(p => ({ ...p, password: '' })); 
                        }}
                        className={`styled-input ${errors.password ? 'error' : ''}`}
                        style={{ letterSpacing: '4px' }}
                     />
                     {errors.password && (
                        <div className="error-msg">
                            {errors.password}
                        </div>
                     )}
                     <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem', opacity: 0.7 }}>
                        Leave blank for an open room
                     </div>
                 </div>
             )}

             {joinInput && searchParams.get('join') ? (
                 <div className="join-overlay-card">
                     <h2 style={{ fontSize: '1.5rem', textAlign: 'center', margin: 0 }}>Join Room</h2>
                     <p style={{ textAlign: 'center', color: 'var(--text-secondary)', margin: 0 }}>
                         You are joining room <span style={{ color: 'var(--accent-primary)', fontFamily: 'monospace' }}>{joinInput}</span>
                     </p>
                     
                     <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
                        <input 
                        type="text" 
                        placeholder="Room ID" 
                        value={joinInput}
                        readOnly // Lock it if from link
                        className={`styled-input ${errors.room ? 'error' : ''}`}
                        style={{ cursor: 'not-allowed', fontSize: '1.2rem' }}
                        />
                        <button type="submit" className="btn-primary" style={{ width: '100%', padding: '1rem', fontSize: '1.1rem', borderRadius: '12px' }}>Join Now</button>
                    </form>
                    
                    <button 
                        className="btn-link" 
                        onClick={() => { setJoinInput(''); navigate('/', { replace: true }); }}
                        style={{ 
                            background: 'none', 
                            border: 'none', 
                            color: 'var(--text-secondary)', 
                            cursor: 'pointer', 
                            textDecoration: 'underline',
                            fontSize: '0.9rem'
                        }}
                    >
                        Cancel and go back
                    </button>
                 </div>
             ) : (
                <div className="action-grid">
                    <button className="btn-primary create-room-btn" onClick={handleCreate}>
                        <div style={{ background: 'rgba(255,255,255,0.2)', padding: '1rem', borderRadius: '50%' }}>
                            <Play size={32} fill="currentColor" />
                        </div>
                        <span style={{ fontWeight: 600, fontSize: '1.1rem' }}>Create Room</span>
                    </button>
                    
                    <div className="join-card">
                        <label style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', fontWeight: 500, textAlign: 'center' }}>Join Existing</label>
                        <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', width: '100%' }}>
                            <input 
                            type="text" 
                            placeholder="Room ID" 
                            value={joinInput}
                            onChange={e => { setJoinInput(e.target.value); setErrors(p => ({ ...p, room: '' })); }}
                            className={`styled-input ${errors.room ? 'error' : ''}`}
                            style={{ fontSize: '1rem' }}
                            />
                            <button type="submit" className="btn-secondary" style={{ width: '100%', padding: '0.8rem', fontSize: '1rem', borderRadius: '12px' }}>Join Room</button>
                        </form>
                    </div>
                </div>
             )}
          </div>
       </div>
       
       {/* Footer Section */}
       <footer style={{
         marginTop: 'auto',
         padding: '2rem 1rem',
         borderTop: '1px solid var(--border-color)',
         background: 'var(--bg-secondary)',
         width: '100%'
       }}>
         <div style={{
           maxWidth: '1200px',
           margin: '0 auto',
           display: 'flex',
           flexDirection: 'column',
           gap: '1.5rem',
           alignItems: 'center',
           textAlign: 'center'
         }}>
           {/* Product Credit */}
           <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
             A product by <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>Ocean LITMERS</span>
           </div>
           
           {/* Powered By & GitHub */}
           <div style={{
             display: 'flex',
             gap: '2rem',
             flexWrap: 'wrap',
             justifyContent: 'center',
             alignItems: 'center'
           }}>
             <a 
               href="https://antigravity.google/" 
               target="_blank" 
               rel="noopener noreferrer"
               style={{
                 color: 'var(--text-secondary)',
                 textDecoration: 'none',
                 fontSize: '0.85rem',
                 display: 'flex',
                 alignItems: 'center',
                 gap: '0.5rem',
                 transition: 'color 0.2s'
               }}
               onMouseEnter={e => e.target.style.color = 'var(--accent-primary)'}
               onMouseLeave={e => e.target.style.color = 'var(--text-secondary)'}
             >
               <Zap size={16} /> Powered by <span style={{ fontWeight: 600 }}>Antigravity</span>
             </a>
             
             <a 
               href="https://github.com/cigrocean/LocalTube" 
               target="_blank" 
               rel="noopener noreferrer"
               style={{
                 color: 'var(--text-secondary)',
                 textDecoration: 'none',
                 fontSize: '0.85rem',
                 display: 'flex',
                 alignItems: 'center',
                 gap: '0.5rem',
                 transition: 'color 0.2s'
               }}
               onMouseEnter={e => e.target.style.color = 'var(--accent-primary)'}
               onMouseLeave={e => e.target.style.color = 'var(--text-secondary)'}
             >
               <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                 <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
               </svg>
               GitHub
             </a>
           </div>
           
           {/* Other Projects */}
           <div style={{
             display: 'flex',
             flexDirection: 'column',
             gap: '0.75rem',
             width: '100%',
             maxWidth: '600px'
           }}>
             <div style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', fontWeight: 500 }}>
               Check my other projects:
             </div>
             <div style={{
               display: 'flex',
               gap: '1rem',
               flexWrap: 'wrap',
               justifyContent: 'center'
             }}>
               <a 
                 href="https://cigromeetingroomsbooking.vercel.app/" 
                 target="_blank" 
                 rel="noopener noreferrer"
                 style={{
                   padding: '0.5rem 1rem',
                   background: 'var(--bg-tertiary)',
                   borderRadius: '8px',
                   color: 'var(--text-primary)',
                   textDecoration: 'none',
                   fontSize: '0.85rem',
                   transition: 'all 0.2s',
                   border: '1px solid var(--border-color)',
                   display: 'flex',
                   alignItems: 'center',
                   gap: '0.5rem'
                 }}
                 onMouseEnter={e => {
                   e.target.style.background = 'var(--accent-primary)';
                   e.target.style.borderColor = 'var(--accent-primary)';
                 }}
                 onMouseLeave={e => {
                   e.target.style.background = 'var(--bg-tertiary)';
                   e.target.style.borderColor = 'var(--border-color)';
                 }}
               >
                 <Calendar size={16} style={{ flexShrink: 0 }} /> Cigro Meeting Rooms Booking
               </a>
               
               <a 
                 href="https://github.com/cigrocean/SwaggerNav" 
                 target="_blank" 
                 rel="noopener noreferrer"
                 style={{
                   padding: '0.5rem 1rem',
                   background: 'var(--bg-tertiary)',
                   borderRadius: '8px',
                   color: 'var(--text-primary)',
                   textDecoration: 'none',
                   fontSize: '0.85rem',
                   transition: 'all 0.2s',
                   border: '1px solid var(--border-color)',
                   display: 'flex',
                   alignItems: 'center',
                   gap: '0.5rem'
                 }}
                 onMouseEnter={e => {
                   e.target.style.background = 'var(--accent-primary)';
                   e.target.style.borderColor = 'var(--accent-primary)';
                 }}
                 onMouseLeave={e => {
                   e.target.style.background = 'var(--bg-tertiary)';
                   e.target.style.borderColor = 'var(--border-color)';
                 }}
               >
                 <Compass size={16} style={{ flexShrink: 0 }} /> SwaggerNav
               </a>
             </div>
           </div>
         </div>
       </footer>
    </div>
  );
}

import { useLocation } from 'react-router-dom'; // Add import

function RoomWrapper() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const location = useLocation(); // Hook for state
  const username = localStorage.getItem('localtube_username');
  const initialPassword = location.state?.password || null;

  // Redirect if no username, but keep the room ID as a query param
  if (!username) {
     return <Navigate to={`/?join=${roomId}`} replace />;
  }

  return <Room roomId={roomId} username={username} initialPassword={initialPassword} onLeave={() => navigate('/')} />;
}

function App() {
  return (
    <BrowserRouter>
      <div className="app-container">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/room/:roomId" element={<RoomWrapper />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
