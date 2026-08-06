import React, { useState, useRef, DragEvent, ChangeEvent } from 'react';
import { useConfigure } from '../../../context/ConfigureContext';
import { Input, Button } from '@ury/ui';
import { Plus, Trash2, Upload, FileText, X, Percent, Download } from 'lucide-react';

export function MenuSection() {
  const {
    menuItems,
    addMenuItem,
    updateMenuItem,
    deleteMenuItem,
    menuFile,
    setMenuFile,
    taxConfig,
    updateTaxConfig,
  } = useConfigure();

  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAdd = () => {
    addMenuItem({
      name: '',
      course: 'Main Course',
      price: 0,
    });
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
      setMenuFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setMenuFile(e.target.files[0]);
    }
  };

  return (
    <div className="space-y-8">


      {/* 2. Menu Items List */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-[#111827]">Menu Items</h3>
        
        <div className="space-y-3">
          {/* Header Row */}
          <div className="hidden md:flex gap-3 px-2 text-xs font-medium text-[#4B5563]">
            <div className="flex-1">Item Name</div>
            <div className="flex-1">Course</div>
            <div className="flex-1">Price (₹)</div>
            {menuItems.length > 1 && <div className="w-8"></div>}
          </div>

          {menuItems.map((item, index) => (
            <div
              key={item.id}
              className="py-2 flex flex-col md:flex-row md:items-center gap-3"
            >
              <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Input
                    type="text"
                    value={item.name}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateMenuItem(item.id, { name: e.target.value })}
                    placeholder="e.g. Chicken Biriyani"
                    className="w-full text-sm bg-white"
                  />
                </div>

                <div>
                  <Input
                    type="text"
                    value={item.course}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateMenuItem(item.id, { course: e.target.value })}
                    placeholder="e.g. Main Course"
                    className="w-full text-sm bg-white"
                  />
                </div>

                <div>
                  <Input
                    type="number"
                    min={0}
                    value={item.price}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateMenuItem(item.id, { price: parseFloat(e.target.value) || 0 })}
                    placeholder="0.00"
                    className="w-full text-sm bg-white"
                  />
                </div>
              </div>

              {menuItems.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => deleteMenuItem(item.id)}
                  className="text-red-500 hover:text-red-700 hover:bg-red-50 self-end md:self-center shrink-0 p-2 h-auto"
                  title="Delete Item"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          ))}
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={handleAdd}
          className="w-full py-2.5 border-dashed border-[#2B5CE6] text-[#2B5CE6] hover:bg-[#EFF4FF] flex items-center justify-center gap-2 text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Add Menu Item
        </Button>
      </div>

      {/* 3. Drag-and-Drop Menu File Uploader */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#111827]">Bulk Menu Upload (Optional)</h3>
          <a href="/assets/ury/files/menu_template.csv" download className="text-xs font-medium text-[#2B5CE6] hover:underline flex items-center gap-1">
            <Download className="w-3 h-3" /> Download Template
          </a>
        </div>
        
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileSelect}
          className="hidden"
        />

        {menuFile ? (
          <div className="p-3 border border-[#2B5CE6] bg-[#EFF4FF] rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#2B5CE6]" />
              <div>
                <p className="text-xs font-medium text-[#111827]">{menuFile.name}</p>
                <p className="text-[10px] text-[#6B7280]">{(menuFile.size / 1024).toFixed(1)} KB</p>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setMenuFile(null)}
              className="text-[#6B7280] hover:text-red-600 p-1 h-auto"
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
                ? 'border-[#2B5CE6] bg-[#EFF4FF]'
                : 'border-[#D1D5DB] hover:border-[#2B5CE6] bg-[#F9FAFB]'
            }`}
          >
            <Upload className="w-5 h-5 text-[#6B7280] mx-auto mb-1.5" />
            <p className="text-xs font-medium text-[#374151]">
              Drag & drop CSV template here, or <span className="text-[#2B5CE6]">browse</span>
            </p>
            <p className="text-[10px] text-[#9CA3AF] mt-0.5">Supports CSV files only</p>
          </div>
        )}
      </div>
    </div>
  );
}
