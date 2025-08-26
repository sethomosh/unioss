import { useState } from 'react';
import { Modal } from './Modal';

interface ExportOptions {
  includeHeaders: boolean;
  fileName: string;
}

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (format: 'csv' | 'pdf', options: ExportOptions) => void;
  dataCount: number;
}

export function ExportModal({ isOpen, onClose, onExport, dataCount }: ExportModalProps) {
  const [format, setFormat] = useState<'csv' | 'pdf'>('csv');
  const [includeHeaders, setIncludeHeaders] = useState(true);
  const [fileName, setFileName] = useState(`export_${new Date().toISOString().slice(0, 10)}`);

  const handleSubmit = () => {
    onExport(format, {
      includeHeaders,
      fileName
    });
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Export Data"
      size="md"
      actions={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted/50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Export
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="text-sm text-muted-foreground mb-4">
            Exporting {dataCount} records
          </p>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Format</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setFormat('csv')}
                  className={`px-4 py-2 rounded-md text-sm ${
                    format === 'csv' 
                      ? 'bg-primary text-primary-foreground' 
                      : 'bg-muted hover:bg-muted/80'
                  }`}
                >
                  CSV
                </button>
                <button
                  onClick={() => setFormat('pdf')}
                  className={`px-4 py-2 rounded-md text-sm ${
                    format === 'pdf' 
                      ? 'bg-primary text-primary-foreground' 
                      : 'bg-muted hover:bg-muted/80'
                  }`}
                >
                  PDF
                </button>
              </div>
            </div>
            
            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={includeHeaders}
                  onChange={(e) => setIncludeHeaders(e.target.checked)}
                  className="rounded border-border text-primary focus:ring-primary"
                />
                <span className="text-sm font-medium">Include headers</span>
              </label>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">File name</label>
              <input
                type="text"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}