import { useState, useRef } from 'react';

interface ChartWrapperProps {
  title: string;
  children: React.ReactNode;
  onZoom?: (range: { start: Date; end: Date }) => void;
  onPan?: (direction: 'left' | 'right') => void;
  onReset?: () => void;
}

export function ChartWrapper({ title, children, onZoom, onPan, onReset }: ChartWrapperProps) {
  const [isZooming, setIsZooming] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const endX = useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!onZoom) return;
    setIsZooming(true);
    startX.current = e.clientX;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isZooming || !onZoom) return;
    endX.current = e.clientX;
  };

  const handleMouseUp = () => {
    if (!isZooming || !onZoom) return;
    setIsZooming(false);
    
    // Calculate zoom range based on mouse positions
    if (chartRef.current) {
      const rect = chartRef.current.getBoundingClientRect();
      const startTime = new Date();
      const endTime = new Date();
      
      // Calculate time range based on selection (simplified)
      const startPercent = Math.max(0, Math.min(1, (startX.current - rect.left) / rect.width));
      const endPercent = Math.max(0, Math.min(1, (endX.current - rect.left) / rect.width));
      
      // For a 24-hour chart, adjust these calculations as needed
      startTime.setHours(startTime.getHours() - 24 * (1 - Math.min(startPercent, endPercent)));
      endTime.setHours(endTime.getHours() - 24 * (1 - Math.max(startPercent, endPercent)));
      
      onZoom({ start: startTime, end: endTime });
    }
  };

  return (
    <div className="card">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">{title}</h2>
        
        {(onZoom || onPan || onReset) && (
          <div className="flex gap-2">
            {onReset && (
              <button
                onClick={onReset}
                className="px-2 py-1 text-xs rounded-md border border-border hover:bg-muted/50"
              >
                Reset
              </button>
            )}
            
            {onPan && (
              <>
                <button
                  onClick={() => onPan('left')}
                  className="px-2 py-1 text-xs rounded-md border border-border hover:bg-muted/50"
                >
                  &larr;
                </button>
                <button
                  onClick={() => onPan('right')}
                  className="px-2 py-1 text-xs rounded-md border border-border hover:bg-muted/50"
                >
                  &rarr;
                </button>
              </>
            )}
            
            {onZoom && (
              <button
                onClick={() => setIsZooming(!isZooming)}
                className={`px-2 py-1 text-xs rounded-md border ${
                  isZooming 
                    ? 'border-primary bg-primary/10' 
                    : 'border-border hover:bg-muted/50'
                }`}
              >
                Zoom
              </button>
            )}
          </div>
        )}
      </div>
      
      <div 
        ref={chartRef}
        className="relative"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {children}
        
        {isZooming && (
          <div className="absolute inset-0 bg-primary/10 border border-primary rounded pointer-events-none">
            <div 
              className="absolute top-0 bottom-0 bg-primary/20 rounded"
              style={{
                left: Math.min(startX.current, endX.current),
                width: Math.abs(endX.current - startX.current),
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}