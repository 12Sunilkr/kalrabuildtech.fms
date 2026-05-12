import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, ZoomIn, ZoomOut, Check, RotateCcw } from 'lucide-react';

interface ImageCropModalProps {
  imageSrc: string;
  onCropComplete: (croppedBase64: string) => void;
  onClose: () => void;
}

export const ImageCropModal: React.FC<ImageCropModalProps> = ({ imageSrc, onCropComplete, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const CROP_SIZE = 280; // circle diameter in px
  const CANVAS_SIZE = 400;

  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imgNaturalSize, setImgNaturalSize] = useState({ w: 1, h: 1 });

  // Load image
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      setImgNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
      setImageLoaded(true);
      // Center image
      setOffset({ x: 0, y: 0 });
      setZoom(1);
    };
    img.src = imageSrc;
  }, [imageSrc]);

  // Draw canvas
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img || !imageLoaded) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Draw dimmed background
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Calculate fitted image dimensions
    const scale = Math.max(CROP_SIZE / imgNaturalSize.w, CROP_SIZE / imgNaturalSize.h) * zoom;
    const drawW = imgNaturalSize.w * scale;
    const drawH = imgNaturalSize.h * scale;

    const cx = CANVAS_SIZE / 2;
    const cy = CANVAS_SIZE / 2;

    const drawX = cx - drawW / 2 + offset.x;
    const drawY = cy - drawH / 2 + offset.y;

    // Clip to circle for the image area
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, CROP_SIZE / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, drawX, drawY, drawW, drawH);
    ctx.restore();

    // Dark overlay outside circle
    ctx.save();
    ctx.fillStyle = 'rgba(15,23,42,0.75)';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(cx, cy, CROP_SIZE / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Draw image again inside circle (on top of overlay)
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, CROP_SIZE / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, drawX, drawY, drawW, drawH);
    ctx.restore();

    // Circle border
    ctx.beginPath();
    ctx.arc(cx, cy, CROP_SIZE / 2, 0, Math.PI * 2);
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Crosshair lines
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - CROP_SIZE / 2, cy);
    ctx.lineTo(cx + CROP_SIZE / 2, cy);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy - CROP_SIZE / 2);
    ctx.lineTo(cx, cy + CROP_SIZE / 2);
    ctx.stroke();
  }, [imageLoaded, zoom, offset, imgNaturalSize]);

  useEffect(() => { draw(); }, [draw]);

  // Mouse events
  const handleMouseDown = (e: React.MouseEvent) => {
    setDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };
  const handleMouseUp = () => setDragging(false);

  // Touch events
  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    setDragging(true);
    setDragStart({ x: t.clientX - offset.x, y: t.clientY - offset.y });
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!dragging) return;
    const t = e.touches[0];
    setOffset({ x: t.clientX - dragStart.x, y: t.clientY - dragStart.y });
  };

  const handleCrop = () => {
    const img = imageRef.current;
    if (!img) return;

    // Export cropped circle as square 400×400
    const outputSize = 400;
    const out = document.createElement('canvas');
    out.width = outputSize;
    out.height = outputSize;
    const ctx = out.getContext('2d');
    if (!ctx) return;

    // Clip circle
    ctx.beginPath();
    ctx.arc(outputSize / 2, outputSize / 2, outputSize / 2, 0, Math.PI * 2);
    ctx.clip();

    // Draw scaled image
    const scale = Math.max(CROP_SIZE / imgNaturalSize.w, CROP_SIZE / imgNaturalSize.h) * zoom;
    const drawW = imgNaturalSize.w * scale;
    const drawH = imgNaturalSize.h * scale;
    const cx = CANVAS_SIZE / 2;
    const cy = CANVAS_SIZE / 2;
    const drawX = cx - drawW / 2 + offset.x;
    const drawY = cy - drawH / 2 + offset.y;

    // Scale factor from canvas coords to output coords
    const sf = outputSize / CROP_SIZE;
    const cropLeft = cx - CROP_SIZE / 2;
    const cropTop = cy - CROP_SIZE / 2;

    ctx.drawImage(
      img,
      (drawX - cropLeft) * sf,
      (drawY - cropTop) * sf,
      drawW * sf,
      drawH * sf
    );

    const result = out.toDataURL('image/jpeg', 0.92);
    onCropComplete(result);
  };

  const handleReset = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[200] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-black text-slate-900">Crop Photo</h3>
            <p className="text-xs text-slate-400 font-medium mt-0.5">Drag to reposition · Scroll to zoom</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400 hover:text-slate-700">
            <X size={20} />
          </button>
        </div>

        {/* Canvas */}
        <div className="relative bg-slate-900 flex items-center justify-center" style={{ height: CANVAS_SIZE }}>
          <canvas
            ref={canvasRef}
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
            className="block"
            style={{ cursor: dragging ? 'grabbing' : 'grab', width: '100%', height: '100%', objectFit: 'contain' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={() => setDragging(false)}
            onWheel={e => {
              e.preventDefault();
              setZoom(z => Math.min(4, Math.max(0.5, z - e.deltaY * 0.001)));
            }}
          />
          {!imageLoaded && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Zoom Slider */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <button onClick={() => setZoom(z => Math.max(0.5, z - 0.1))} className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors text-slate-500">
              <ZoomOut size={16} />
            </button>
            <input
              type="range"
              min={0.5}
              max={4}
              step={0.01}
              value={zoom}
              onChange={e => setZoom(parseFloat(e.target.value))}
              className="flex-1 accent-indigo-600"
            />
            <button onClick={() => setZoom(z => Math.min(4, z + 0.1))} className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors text-slate-500">
              <ZoomIn size={16} />
            </button>
            <button onClick={handleReset} className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors text-slate-400" title="Reset">
              <RotateCcw size={14} />
            </button>
          </div>
        </div>

        {/* Buttons */}
        <div className="px-6 py-4 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 border border-slate-200 rounded-2xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCrop}
            disabled={!imageLoaded}
            className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-colors shadow-lg shadow-indigo-500/30 disabled:opacity-50"
          >
            <Check size={16} /> Apply Crop
          </button>
        </div>
      </div>
    </div>
  );
};
