import { useEffect, useRef } from 'react';

/**
 * useKeepAlive
 * Creates a silent Web Audio API oscillator to preventing the browser
 * from throttling the tab when in the background.
 */
export const useKeepAlive = (enable = false) => {
    const audioContextRef = useRef(null);
    const oscillatorRef = useRef(null);
    
    useEffect(() => {
        if (!enable) {
            // Cleanup if disabled
            if (oscillatorRef.current) {
                try {
                    oscillatorRef.current.stop();
                    oscillatorRef.current.disconnect();
                } catch(e) {}
                oscillatorRef.current = null;
            }
            if (audioContextRef.current) {
                audioContextRef.current.close().catch(() => {});
                audioContextRef.current = null;
            }
            return;
        }
        
        const initAudio = () => {
            // Only create if not exists
            if (audioContextRef.current && audioContextRef.current.state === 'running') return;
            
            try {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                if (!AudioContext) return;
                
                const ctx = new AudioContext();
                audioContextRef.current = ctx;
                
                // Create silent oscillator
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                
                // Set gain to almost zero (not 0, to avoid optimization?) 0.001
                gain.gain.value = 0.001; 
                
                osc.connect(gain);
                gain.connect(ctx.destination);
                
                osc.start();
                oscillatorRef.current = osc;
                
                console.log('[KeepAlive] Silent audio started to prevent throttling.');
            } catch (err) {
                console.error('[KeepAlive] Failed to start:', err);
            }
        };
        
        // Browsers require user interaction to start AudioContext
        // We attempt to start it, but might need a click listener if it fails/is suspended
        const handleInteraction = () => {
            if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
                audioContextRef.current.resume().then(() => {
                    console.log('[KeepAlive] AudioContext resumed.');
                });
            } else if (!audioContextRef.current) {
                initAudio();
            }
        };
        
        window.addEventListener('click', handleInteraction);
        window.addEventListener('touchstart', handleInteraction);
        window.addEventListener('keydown', handleInteraction);
        
        // Try initial start
        initAudio();
        
        return () => {
            window.removeEventListener('click', handleInteraction);
            window.removeEventListener('touchstart', handleInteraction);
            window.removeEventListener('keydown', handleInteraction);
            
            if (oscillatorRef.current) {
                try { 
                    oscillatorRef.current.stop(); 
                    oscillatorRef.current.disconnect();
                } catch(e) {}
            }
            if (audioContextRef.current) {
                audioContextRef.current.close().catch(() => {});
            }
        };
    }, [enable]);
};
