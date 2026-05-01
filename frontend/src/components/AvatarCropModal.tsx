import { useRef, useState, useCallback, useEffect } from 'react';

interface Props {
  file: File;
  onConfirm: (blob: Blob) => void;
  onClose: () => void;
}

const OUTPUT_SIZE = 400;

export default function AvatarCropModal({ file, onConfirm, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragOrigin = useRef({ mx: 0, my: 0, ox: 0, oy: 0 });

  // Touch pinch state
  const lastDist = useRef<number | null>(null);
  const lastMid = useRef<{ x: number; y: number } | null>(null);

  const draw = useCallback((img: HTMLImageElement, s: number, off: { x: number; y: number }) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

    // dark overlay outside circle
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

    // clip to circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2);
    ctx.clip();

    const w = img.width * s;
    const h = img.height * s;
    const x = (OUTPUT_SIZE - w) / 2 + off.x;
    const y = (OUTPUT_SIZE - h) / 2 + off.y;
    ctx.drawImage(img, x, y, w, h);
    ctx.restore();

    // circle border
    ctx.beginPath();
    ctx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2 - 1, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(124, 58, 237, 0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }, []);

  useEffect(() => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      imgRef.current = img;
      // fit image so the shorter side fills the circle
      const initialScale = Math.max(OUTPUT_SIZE / img.width, OUTPUT_SIZE / img.height);
      setScale(initialScale);
      setOffset({ x: 0, y: 0 });
      draw(img, initialScale, { x: 0, y: 0 });
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file, draw]);

  useEffect(() => {
    if (imgRef.current) draw(imgRef.current, scale, offset);
  }, [scale, offset, draw]);

  // ── Mouse handlers ──────────────────────────────────────────────
  function onMouseDown(e: React.MouseEvent) {
    setDragging(true);
    dragOrigin.current = { mx: e.clientX, my: e.clientY, ox: offset.x, oy: offset.y };
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!dragging) return;
    const { mx, my, ox, oy } = dragOrigin.current;
    setOffset({ x: ox + (e.clientX - mx), y: oy + (e.clientY - my) });
  }

  function onMouseUp() { setDragging(false); }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    setScale(s => clampScale(s - e.deltaY * 0.001, imgRef.current));
  }

  // ── Touch handlers ──────────────────────────────────────────────
  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 1) {
      dragOrigin.current = { mx: e.touches[0].clientX, my: e.touches[0].clientY, ox: offset.x, oy: offset.y };
      lastDist.current = null;
    } else if (e.touches.length === 2) {
      lastDist.current = getTouchDist(e);
      lastMid.current = getTouchMid(e);
    }
  }

  function onTouchMove(e: React.TouchEvent) {
    e.preventDefault();
    if (e.touches.length === 1 && lastDist.current === null) {
      const { mx, my, ox, oy } = dragOrigin.current;
      setOffset({ x: ox + (e.touches[0].clientX - mx), y: oy + (e.touches[0].clientY - my) });
    } else if (e.touches.length === 2 && lastDist.current !== null) {
      const dist = getTouchDist(e);
      const ratio = dist / lastDist.current;
      setScale(s => clampScale(s * ratio, imgRef.current));
      lastDist.current = dist;
    }
  }

  function onTouchEnd() {
    lastDist.current = null;
    lastMid.current = null;
  }

  function handleConfirm() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Re-draw without the overlay for the final output
    const out = document.createElement('canvas');
    out.width = OUTPUT_SIZE;
    out.height = OUTPUT_SIZE;
    const ctx = out.getContext('2d')!;
    const img = imgRef.current!;
    ctx.beginPath();
    ctx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2);
    ctx.clip();
    const w = img.width * scale;
    const h = img.height * scale;
    const x = (OUTPUT_SIZE - w) / 2 + offset.x;
    const y = (OUTPUT_SIZE - h) / 2 + offset.y;
    ctx.drawImage(img, x, y, w, h);
    out.toBlob((blob) => { if (blob) onConfirm(blob); }, 'image/jpeg', 0.92);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal avatar-crop-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h2 className="modal__title">Настроить фото</h2>
          <button className="modal__close" onClick={onClose}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-lg)' }}>
          {/* Canvas preview */}
          <div
            style={{
              borderRadius: '50%',
              overflow: 'hidden',
              cursor: dragging ? 'grabbing' : 'grab',
              boxShadow: '0 0 0 3px rgba(124,58,237,0.4)',
              width: '100%',
              maxWidth: 280,
              aspectRatio: '1 / 1'
            }}
          >
            <canvas
              ref={canvasRef}
              width={OUTPUT_SIZE}
              height={OUTPUT_SIZE}
              style={{ display: 'block', width: '100%', height: '100%', touchAction: 'none' }}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
              onWheel={onWheel}
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
            />
          </div>

          {/* Zoom slider */}
          <div style={{ width: '100%' }}>
            <label style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span>Масштаб</span>
              <span>{Math.round((scale / (imgRef.current ? Math.max(OUTPUT_SIZE / imgRef.current.width, OUTPUT_SIZE / imgRef.current.height) : 1)) * 100)}%</span>
            </label>
            <input
              type="range"
              className="crop-range"
              min={imgRef.current ? Math.max(OUTPUT_SIZE / imgRef.current.width, OUTPUT_SIZE / imgRef.current.height) : 0.1}
              max={imgRef.current ? Math.max(OUTPUT_SIZE / imgRef.current.width, OUTPUT_SIZE / imgRef.current.height) * 4 : 4}
              step={0.01}
              value={scale}
              onChange={(e) => setScale(parseFloat(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>

          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', textAlign: 'center' }}>
            Перетащите для перемещения · Прокрутите или используйте слайдер для масштабирования
          </p>
        </div>

        <div className="modal__footer">
          <button className="btn btn-ghost" onClick={onClose}>Отмена</button>
          <button className="btn btn-primary" onClick={handleConfirm}>Применить</button>
        </div>
      </div>
    </div>
  );
}

function getTouchDist(e: React.TouchEvent) {
  return Math.hypot(
    e.touches[0].clientX - e.touches[1].clientX,
    e.touches[0].clientY - e.touches[1].clientY
  );
}

function getTouchMid(e: React.TouchEvent) {
  return {
    x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
    y: (e.touches[0].clientY + e.touches[1].clientY) / 2
  };
}

function clampScale(s: number, img: HTMLImageElement | null) {
  const min = img ? Math.max(OUTPUT_SIZE / img.width, OUTPUT_SIZE / img.height) : 0.1;
  return Math.max(min, Math.min(s, min * 6));
}
