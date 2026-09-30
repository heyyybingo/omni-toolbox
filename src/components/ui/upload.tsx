import React, { useRef, useState, useEffect, type DragEvent, type KeyboardEvent, type ReactNode } from 'react';
import { UploadCloud, Upload, Image as ImageIcon, FileText, Trash2, RefreshCw } from 'lucide-react';
import { cn, formatBytes } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface DropzoneProps {
  onFilesSelected: (files: FileList | File[]) => void;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  title?: string;
  description?: string;
  className?: string;
  minHeight?: string;
  hintChips?: string[];
  children?: ReactNode;
  icon?: ReactNode;
  inputRef?: React.RefObject<HTMLInputElement>;
}

/**
 * Standardized Workbench Dropzone component conforming to DESIGN.md.
 * Linear/Notion-inspired quiet chrome, surface sunken background, dashed borders.
 */
export function Dropzone({
  onFilesSelected,
  accept,
  multiple = true,
  disabled = false,
  title = '点击选择或拖拽文件到此处',
  description,
  className,
  minHeight = 'min-h-[180px]',
  hintChips,
  children,
  icon,
  inputRef: externalInputRef,
}: DropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const internalInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = externalInputRef || internalInputRef;

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (disabled) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFilesSelected(e.dataTransfer.files);
    }
  };

  const handleClick = () => {
    if (disabled) return;
    fileInputRef.current?.click();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInputRef.current?.click();
    }
  };

  const descText = description ?? (accept ? `支持 ${accept}` : '支持常见格式');

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        'group relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-all duration-150',
        minHeight,
        isDragging
          ? 'border-primary bg-primary/5 ring-4 ring-primary/10 shadow-sm'
          : 'border-border/80 bg-muted/20 hover:border-primary/50 hover:bg-muted/40',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        className
      )}
    >
      {!externalInputRef ? (
        <input
          ref={internalInputRef}
          type="file"
          multiple={multiple}
          accept={accept}
          disabled={disabled}
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              onFilesSelected(e.target.files);
            }
            e.target.value = '';
          }}
        />
      ) : null}

      {children ? (
        children
      ) : (
        <>
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
            {icon || <UploadCloud className="h-6 w-6" />}
          </div>
          <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{descText}</p>
          {hintChips && hintChips.length > 0 ? (
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {hintChips.map((chip) => (
                <span
                  key={chip}
                  className="rounded bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
                >
                  {chip}
                </span>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

export interface FileInputProps {
  value?: File | null;
  onChange: (file: File | null) => void;
  accept?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  id?: string;
  showPreview?: boolean;
}

/**
 * Standardized single file selector component for parameter inputs (stamps, watermarks, secondary files).
 * Replaces unstyled raw `<input type="file">`.
 */
export function FileInput({
  value,
  onChange,
  accept,
  disabled = false,
  placeholder = '选择文件…',
  className,
  id,
  showPreview = true,
}: FileInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!value || !showPreview || !value.type.startsWith('image/')) {
      setThumbUrl(null);
      return;
    }
    const url = URL.createObjectURL(value);
    setThumbUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [value, showPreview]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    onChange(file);
    e.target.value = '';
  };

  return (
    <div className={cn('relative w-full', className)}>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        disabled={disabled}
        className="hidden"
        onChange={handleFileChange}
      />

      {!value ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className={cn(
            'flex h-9 w-full items-center justify-between rounded-md border border-dashed border-border bg-card px-3 text-xs text-muted-foreground transition-colors',
            'hover:border-primary/50 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50'
          )}
        >
          <span className="flex items-center gap-2 truncate">
            <Upload className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{placeholder}</span>
          </span>
          {accept ? (
            <span className="shrink-0 font-mono text-[10px] text-muted-foreground/80">
              {accept.replace(/image\//g, '').replace(/application\//g, '')}
            </span>
          ) : null}
        </button>
      ) : (
        <div className="flex items-center justify-between gap-2.5 rounded-md border border-border bg-card p-1.5 pl-2.5 shadow-sm">
          <div className="flex min-w-0 items-center gap-2">
            {thumbUrl ? (
              <img
                src={thumbUrl}
                alt="预览"
                className="h-7 w-7 shrink-0 rounded object-cover border border-border"
              />
            ) : value.type.startsWith('image/') ? (
              <ImageIcon className="h-4 w-4 shrink-0 text-primary" />
            ) : (
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0 truncate">
              <p className="truncate text-xs font-medium text-foreground">{value.name}</p>
              <p className="font-mono text-[10px] text-muted-foreground">{formatBytes(value.size)}</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => inputRef.current?.click()}
              title="更换文件"
            >
              <RefreshCw className="mr-1 h-3 w-3" />
              更换
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
              onClick={() => onChange(null)}
              title="移除文件"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export const UploadComponent = Object.assign(Dropzone, {
  Dropzone,
  FileInput,
});
