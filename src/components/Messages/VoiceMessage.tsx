import { useRef, useState, useMemo } from 'react';
import { useSttStore } from '../../store/sttStore';
import './VoiceMessage.css';

interface VoiceMessageProps {
    fileSrc: string;
    filePath: string;
    chatId: number;
    messageId: number;
}

export const VoiceMessage = ({ fileSrc, filePath, chatId, messageId }: VoiceMessageProps) => {
    const transcriptions = useSttStore((s) => s.transcriptions);
    const transcribing = useSttStore((s) => s.transcribing);
    const transcribe = useSttStore((s) => s.transcribe);

    const audioRef = useRef<HTMLAudioElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);

    const key = `${chatId}_${messageId}`;
    const text = transcriptions[key];
    const isTranscribing = transcribing.has(key);

    const formattedTime = useMemo(() => {
        const time = isPlaying || currentTime > 0 ? currentTime : duration;
        const mins = Math.floor(time / 60);
        const secs = Math.floor(time % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }, [currentTime, duration, isPlaying]);

    // Generate fake waveform bars once
    const bars = useMemo(() => {
        return Array.from({ length: 30 }, () => 20 + Math.random() * 60); // height 20-80%
    }, []);

    const togglePlay = () => {
        if (!audioRef.current) return;
        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play();
        }
        setIsPlaying(!isPlaying);
    };

    const handleTranscribe = () => {
        if (text || isTranscribing) return;
        transcribe(chatId, messageId, filePath);
    };

    const handleTimeUpdate = () => {
        if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
        }
    };

    const handleEnded = () => {
        setIsPlaying(false);
        setCurrentTime(0);
    };

    const handleLoadedMetadata = () => {
        if (audioRef.current) {
            setDuration(audioRef.current.duration);
        }
    };

    // Determine active bars based on progress
    const activeBarsCount = duration > 0 ? Math.floor((currentTime / duration) * bars.length) : 0;

    return (
        <div className="voice-message">
            <audio
                ref={audioRef}
                src={fileSrc}
                onTimeUpdate={handleTimeUpdate}
                onEnded={handleEnded}
                onLoadedMetadata={handleLoadedMetadata}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
            />

            <div className="voice-player">
                <button className="voice-play-button" onClick={togglePlay}>
                    {isPlaying ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="6" y="4" width="4" height="16"></rect>
                            <rect x="14" y="4" width="4" height="16"></rect>
                        </svg>
                    ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="5 3 19 12 5 21 5 3"></polygon>
                        </svg>
                    )}
                </button>

                <div className="voice-waveform-container">
                    <div className="voice-waveform">
                        {bars.map((height, index) => (
                            <div
                                key={index}
                                className={`waveform-bar ${index < activeBarsCount ? 'active' : ''}`}
                                style={{ height: `${height}%` }}
                            />
                        ))}
                    </div>
                    <div className="voice-meta">
                        <span>{formattedTime}</span>
                    </div>
                </div>

                <button
                    className={`voice-stt-button ${text ? 'active' : ''}`}
                    onClick={handleTranscribe}
                    disabled={isTranscribing || !!text}
                    title={text ? "Transcribed" : "Transcribe to text"}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                    </svg>
                    {/* Alternatively use a Text icon like 'T' */}
                </button>
            </div>

            {isTranscribing && (
                <div className="voice-transcription-loading">
                    <div className="loading-dots">
                        <div className="loading-dot"></div>
                        <div className="loading-dot"></div>
                        <div className="loading-dot"></div>
                    </div>
                    <span>Transcribing...</span>
                </div>
            )}

            {text && (
                <div className="voice-transcription-container">
                    <div className="voice-transcription">{text}</div>
                </div>
            )}
        </div>
    );
};
