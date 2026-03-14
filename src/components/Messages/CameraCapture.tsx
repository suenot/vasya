import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from '../../i18n';
import './CameraCapture.css';

interface CameraCaptureProps {
  isOpen: boolean;
  onCapture: (file: File) => void;
  onClose: () => void;
}

export const CameraCapture = ({ isOpen, onCapture, onClose }: CameraCaptureProps) => {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    setError(null);
    setCapturedImage(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      setError(t('camera_error'));
    }
  }, [t]);

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
      setCapturedImage(null);
      setError(null);
    }
    return () => stopCamera();
  }, [isOpen, startCamera, stopCamera]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  const takePhoto = useCallback(() => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setCapturedImage(dataUrl);
    stopCamera();
  }, [stopCamera]);

  const retake = useCallback(() => {
    setCapturedImage(null);
    startCamera();
  }, [startCamera]);

  const usePhoto = useCallback(() => {
    if (!capturedImage) return;
    // Convert data URL to File
    fetch(capturedImage)
      .then((res) => res.blob())
      .then((blob) => {
        const file = new File([blob], `camera_${Date.now()}.jpg`, { type: 'image/jpeg' });
        onCapture(file);
        onClose();
      });
  }, [capturedImage, onCapture, onClose]);

  if (!isOpen) return null;

  return (
    <div className="camera-overlay">
      <div className="camera-container">
        <div className="camera-header">
          <button className="camera-close-btn" onClick={onClose} title={t('camera_close')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="camera-viewport">
          {error ? (
            <div className="camera-error">{error}</div>
          ) : capturedImage ? (
            <img src={capturedImage} alt="Captured" className="camera-preview-img" />
          ) : (
            <video ref={videoRef} autoPlay playsInline muted className="camera-video" />
          )}
        </div>
        <div className="camera-controls">
          {capturedImage ? (
            <>
              <button className="camera-btn camera-btn-secondary" onClick={retake}>
                {t('camera_retake')}
              </button>
              <button className="camera-btn camera-btn-primary" onClick={usePhoto}>
                {t('camera_use')}
              </button>
            </>
          ) : !error ? (
            <button className="camera-shutter-btn" onClick={takePhoto} title={t('camera_capture')}>
              <span className="shutter-inner" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
};
