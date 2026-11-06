import { useState, useRef, DragEvent, ChangeEvent } from 'react';
import { Button } from '@ury/ui';
import { Upload, FileText, X, Download } from 'lucide-react';
import { parseMenuCsv, ParsedMenuRow } from '../../utils/csvParser';

interface MenuBulkUploadProps {
  onItemsParsed: (items: ParsedMenuRow[]) => void;
  title?: string;
  subtitle?: string;
  file?: File | null;
  onFileChange?: (file: File | null) => void;
}

export function MenuBulkUpload({
  onItemsParsed,
  title = "Bulk Upload (Optional)",
  subtitle = "Import items from a CSV file",
  file = null,
  onFileChange,
}: MenuBulkUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [localFile, setLocalFile] = useState<File | null>(null);
  
  const currentFile = onFileChange ? file : localFile;
  const setFile = (f: File | null) => {
    if (onFileChange) {
      onFileChange(f);
    } else {
      setLocalFile(f);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const importFile = async (selectedFile: File) => {
    if (messageTimeoutRef.current) clearTimeout(messageTimeoutRef.current);
    setImportMessage(null);
    setImportError(null);
    setFile(selectedFile);

    try {
      const text = await selectedFile.text();
      const rows = parseMenuCsv(text);

      if (rows.length === 0) {
        setImportError("Couldn't read that file, make sure it matches the template format.");
        setFile(null);
        return;
      }

      onItemsParsed(rows);
      setImportMessage(`Imported ${rows.length} item${rows.length === 1 ? '' : 's'} from ${selectedFile.name}, review and edit below.`);
      messageTimeoutRef.current = setTimeout(() => setImportMessage(null), 5000);
    } catch {
      setImportError("Couldn't read that file, make sure it matches the template format.");
      setFile(null);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      importFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      importFile(e.target.files[0]);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        <a 
          href="/assets/ury/files/menu_template.csv" 
          download 
          className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
        >
          <Download className="w-3.5 h-3.5" /> Download Template
        </a>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        onChange={handleFileSelect}
        className="hidden"
      />

      {currentFile ? (
        <div className="p-3 border border-primary bg-primary/10 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            <div>
              <p className="text-xs font-medium text-foreground">{currentFile.name}</p>
              <p className="text-[10px] text-muted-foreground">{(currentFile.size / 1024).toFixed(1)} KB</p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setFile(null);
              setImportMessage(null);
              setImportError(null);
            }}
            className="text-muted-foreground hover:text-red-600 p-1 h-auto"
            title="Remove File"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      ) : (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`p-4 border border-dashed rounded-lg text-center cursor-pointer transition-colors ${
            isDragging
              ? 'border-primary bg-primary/10'
              : 'border-gray-200 hover:border-primary bg-gray-50'
          }`}
        >
          <Upload className="w-5 h-5 text-gray-400 mx-auto mb-1.5" />
          <p className="text-xs font-medium text-gray-700">
            Drag &amp; drop CSV file here, or <span className="text-primary hover:underline font-semibold">browse</span>
          </p>
          <p className="text-[10px] text-gray-500 mt-0.5">Supports CSV files only</p>
        </div>
      )}

      {importMessage && (
        <p className="text-xs font-medium text-primary">{importMessage}</p>
      )}
      {importError && (
        <p className="text-xs font-medium text-red-600">{importError}</p>
      )}
    </div>
  );
}
