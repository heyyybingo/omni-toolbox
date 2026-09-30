import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Search, X, Sun, Moon, Download, Trash2,
  PanelLeftClose, PanelLeftOpen, Settings, Maximize2,
  FileText, Check, AlertCircle, Wrench, Layers, Image,
  Music, Video, Database, Code, FileSearch, Repeat,
  Minimize2, ShieldCheck, FileUp, Scaling, Stamp,
  RotateCw, Crop, Columns, BadgeCheck, Combine,
  Split, FileMinus, Hash, Images, ArrowUpDown,
  Grid2X2, Lock, Unlock, Heading, Bookmark,
  CheckSquare, ScanText, Film, AudioWaveform, Camera,
  CreditCard, Braces, FileSpreadsheet, Binary, Fingerprint,
  Key, Clock, Palette, Shield, QrCode, Star, Eye, MoreHorizontal
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, Badge } from '@/components/ui/card';
import { Input, Label, Select, Slider, Switch, Textarea, FieldLabel } from '@/components/ui/input';
import { Dropzone, FileInput } from '@/components/ui/upload';
import {
  cn, downloadBlob, extOf, formatBytes, formatJson, minifyJson, parseJsonSafe,
  toolSearchScore, baseName, jsonToCsv, computeTabSlices
} from '@/lib/utils';
import {
  downloadAll, processAudio, processAudioTrim, processImageJob, processImageResize,
  processImageToPdf, processImageTransform, processImageWatermark, processImageTargetSize,
  processImageCrop, processImageStitch, processImageStamp, processOcr, processIdOcr,
  processPdfDeletePages, processPdfEach, processPdfExtractText, processPdfMerge,
  processPdfNup, processPdfCrop, processPdfReorder, processPdfImageWatermark,
  processPdfEncrypt, processPdfDecrypt, processPdfPageNumbers, processPdfToImages,
  processPdfHeaderFooter, processPdfFillForm, processPdfOutlines, processSearchablePdf,
  processVideoCover, processVideoToGif, processVideoExtractAudio, processVideoTrim,
  pushUnique, type JobResult,
} from '@/engine/jobs';
import { TOOLS, groupTools, layoutLabel, type ToolDef } from '@/tools/registry';
import { createSession, type ToolSession } from '@/types/session';
import { JsonTreePanel } from '@/components/JsonTree';
import { CropEditor } from '@/components/CropEditor';
import { NupPreview, PageOrderPreview, PdfCropEditor } from '@/components/pdf-visual';
import { FormFieldsEditor } from '@/components/FormFieldsEditor';
import { WaveformTrim, TimelineTrim } from '@/components/WaveformTrim';
import { MotionPanel, MotionOverlay } from '@/components/ui/Motion';
import { PresetSelect, type PresetItem } from '@/components/PresetSelect';
import { FullscreenLayer } from '@/components/Fullscreen';
import { listArtifacts, putArtifacts, clearArtifacts, deleteArtifacts, type StoredArtifact } from '@/engine/artifact-store';
import { LivePreviewPanel } from '@/components/LivePreviewPanel';
import { generateFaviconPackage, parseImageExif } from '@/engine/dev-tools';
import { JsonYamlTool } from '@/components/tools/JsonYamlTool';
import { JsonCsvTool } from '@/components/tools/JsonCsvTool';
import { JsonToTsTool } from '@/components/tools/JsonToTsTool';
import { TextDiffTool } from '@/components/tools/TextDiffTool';
import { RegexTesterTool } from '@/components/tools/RegexTesterTool';
import { ExifViewerTool } from '@/components/tools/ExifViewerTool';
import { generateLivePreview, isVisualTool } from '@/engine/live-preview';
import QRCode from 'qrcode';

type Toast = { id: number; title: string; body?: string; type?: string; leaving?: boolean };

function getGroupIcon(group: string) {
  switch (group) {
    case '图片': return Image;
    case 'PDF': return FileText;
    case '音频': return Music;
    case '视频': return Video;
    case '数据': return Database;
    case '开发': return Code;
    case '文档': return FileSearch;
    default: return Layers;
  }
}

function getToolIcon(id: string) {
  switch (id) {
    case 'image-convert': return Repeat;
    case 'image-compress': return Minimize2;
    case 'image-exif': return ShieldCheck;
    case 'image-to-pdf': return FileUp;
    case 'image-resize': return Scaling;
    case 'image-watermark': return Stamp;
    case 'image-transform': return RotateCw;
    case 'image-crop': return Crop;
    case 'image-stitch': return Columns;
    case 'image-stamp': return BadgeCheck;

    case 'pdf-merge': return Combine;
    case 'pdf-split': return Split;
    case 'pdf-rotate': return RotateCw;
    case 'pdf-watermark': return Stamp;
    case 'pdf-delete': return FileMinus;
    case 'pdf-numbers': return Hash;
    case 'pdf-to-images': return Images;
    case 'pdf-text': return FileText;
    case 'pdf-reorder': return ArrowUpDown;
    case 'pdf-nup': return Grid2X2;
    case 'pdf-crop': return Crop;
    case 'pdf-img-wm': return Stamp;
    case 'pdf-encrypt': return Lock;
    case 'pdf-decrypt': return Unlock;
    case 'pdf-hf': return Heading;
    case 'pdf-outlines': return Bookmark;
    case 'pdf-form': return CheckSquare;
    case 'pdf-searchable': return FileSearch;

    case 'audio-convert': return Music;
    case 'audio-trim': return AudioWaveform;

    case 'video-cover': return Camera;
    case 'video-gif': return Film;
    case 'video-audio': return Music;
    case 'video-trim': return Video;

    case 'ocr': return ScanText;
    case 'ocr-id': return CreditCard;

    case 'json-format': return Braces;
    case 'json-csv': return FileSpreadsheet;
    case 'base64': return Binary;
    case 'hash': return Fingerprint;
    case 'uuid': return Key;
    case 'timestamp': return Clock;
    case 'color': return Palette;
    case 'jwt': return Shield;
    case 'qr': return QrCode;
    case 'json-yaml': return Repeat;
    case 'json-to-ts': return Code;
    case 'text-diff': return Columns;
    case 'regex-tester': return Search;
    case 'favicon-gen': return Images;
    case 'image-exif-view': return Camera;

    default: return FileText;
  }
}

export default function App() {
  const [sessions, setSessions] = useState<Record<string, ToolSession>>(() => ({
    'image-convert': createSession('image-convert'),
  }));
  const [tabOrder, setTabOrder] = useState<string[]>(['image-convert']);
  const [activeId, setActiveId] = useState('image-convert');
  const [running, setRunning] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [commandOpen, setCommandOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [inspector, setInspector] = useState<{ title: string; content: React.ReactNode } | null>(null);
  const lastInspectorRef = useRef<{ title: string; content: React.ReactNode } | null>(null);
  if (inspector) {
    lastInspectorRef.current = inspector;
  }
  const displayInspector = inspector || lastInspectorRef.current;
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saveArtifacts, setSaveArtifacts] = useState(true);
  const [renamePattern, setRenamePattern] = useState('{name}');
  const [favorites, setFavorites] = useState<string[]>([]);
  const [artifacts, setArtifacts] = useState<StoredArtifact[]>([]);
  const [presets, setPresets] = useState<PresetItem[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [tabsVisible, setTabsVisible] = useState(true);
  const [previewSampleIndex, setPreviewSampleIndex] = useState(0);

  // Tab overflow and measurement
  const tabBarRef = useRef<HTMLDivElement>(null);
  const tabContainerRef = useRef<HTMLDivElement>(null);
  const measureContainerRef = useRef<HTMLDivElement>(null);
  const tabPopoverRef = useRef<HTMLDivElement>(null);
  const tabPopoverTimerRef = useRef<number | null>(null);
  const [visibleCount, setVisibleCount] = useState<number>(tabOrder.length);
  const [tabPopoverOpen, setTabPopoverOpen] = useState(false);
  const [popoverAlignRight, setPopoverAlignRight] = useState(false);

  // L4 local utility states
  const [l4UuidCount, setL4UuidCount] = useState(5);
  const [l4Uuids, setL4Uuids] = useState<string[]>([]);
  const [l4Hashes, setL4Hashes] = useState<{ sha1: string; sha256: string; sha512: string }>({ sha1: '', sha256: '', sha512: '' });
  const [l4TimestampNow, setL4TimestampNow] = useState(Math.floor(Date.now() / 1000));
  const [l4TsInput, setL4TsInput] = useState('');
  const [l4TsOutput, setL4TsOutput] = useState('');
  const [l4QrDataUrl, setL4QrDataUrl] = useState('');

  const lastScrollTop = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);

  const updateVisibleTabs = useCallback(() => {
    if (!tabBarRef.current || !measureContainerRef.current) return;
    const barWidth = tabBarRef.current.clientWidth;
    if (barWidth <= 0) return;

    const children = Array.from(measureContainerRef.current.children) as HTMLElement[];
    if (children.length === 0) {
      setVisibleCount(tabOrder.length);
      return;
    }

    const GAP = 4;
    const MORE_BTN_ESTIMATE = 54;
    const CLOSE_ALL_ESTIMATE = tabOrder.length > 1 ? 75 : 0;
    const OUTER_PADDING = 32; // px-4 = 16px * 2
    const BUFFER = 8;

    const availableWidth = Math.max(0, barWidth - OUTER_PADDING - CLOSE_ALL_ESTIMATE - BUFFER);

    const widths = children.map((el) => el.offsetWidth);
    let totalWidth = 0;
    for (let i = 0; i < widths.length; i++) {
      totalWidth += widths[i] + (i > 0 ? GAP : 0);
    }

    if (totalWidth <= availableWidth) {
      setVisibleCount((prev) => (prev !== tabOrder.length ? tabOrder.length : prev));
      return;
    }

    const availableForTabs = Math.max(0, availableWidth - MORE_BTN_ESTIMATE - GAP);
    let current = 0;
    let count = 0;
    for (let i = 0; i < widths.length; i++) {
      const needed = current + widths[i] + (count > 0 ? GAP : 0);
      if (needed <= availableForTabs) {
        current = needed;
        count++;
      } else {
        break;
      }
    }
    const target = Math.max(1, count);
    setVisibleCount((prev) => (prev !== target ? target : prev));
  }, [tabOrder]);

  useLayoutEffect(() => {
    updateVisibleTabs();

    const el = tabBarRef.current;
    if (!el) return;

    const observer = new ResizeObserver(() => {
      updateVisibleTabs();
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
    };
  }, [updateVisibleTabs]);

  const handleTabPopoverEnter = () => {
    if (tabPopoverTimerRef.current) {
      window.clearTimeout(tabPopoverTimerRef.current);
      tabPopoverTimerRef.current = null;
    }
    if (tabPopoverRef.current) {
      const rect = tabPopoverRef.current.getBoundingClientRect();
      setPopoverAlignRight(rect.right + 250 > window.innerWidth);
    }
    setTabPopoverOpen(true);
  };

  const handleTabPopoverLeave = () => {
    if (tabPopoverTimerRef.current) {
      window.clearTimeout(tabPopoverTimerRef.current);
    }
    tabPopoverTimerRef.current = window.setTimeout(() => {
      setTabPopoverOpen(false);
    }, 180);
  };

  useEffect(() => {
    if (!tabPopoverOpen) return;
    const onDown = (e: MouseEvent) => {
      if (tabPopoverRef.current && !tabPopoverRef.current.contains(e.target as Node)) {
        setTabPopoverOpen(false);
      }
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [tabPopoverOpen]);

  const { visibleTabs, overflowTabs } = useMemo(() => {
    return computeTabSlices(tabOrder, visibleCount, activeId);
  }, [tabOrder, visibleCount, activeId]);

  const hasOverflowData = useMemo(() => {
    return overflowTabs.some((tid) => {
      const tdef = TOOLS[tid];
      if (!tdef) return false;
      const s = sessions[tid];
      return s && (s.files.length > 0 || s.results.length > 0 || (tdef.layout === 'l4' && s.jsonText));
    });
  }, [overflowTabs, sessions]);

  const session = sessions[activeId] ?? createSession(activeId);
  const tool = useMemo(() => TOOLS[activeId] as ToolDef, [activeId]);
  const groups = useMemo(() => groupTools(), []);

  const patch = useCallback((toolId: string, partial: Partial<ToolSession>) => {
    setSessions((prev) => {
      const base = prev[toolId] ?? createSession(toolId);
      return { ...prev, [toolId]: { ...base, ...partial } };
    });
  }, []);

  const setJobStatus = useCallback((
    toolId: string,
    idx: number,
    status: 'pending' | 'running' | 'done' | 'failed',
    error?: string
  ) => {
    setSessions((prev) => {
      const cur = prev[toolId] ?? createSession(toolId);
      return {
        ...prev,
        [toolId]: {
          ...cur,
          jobStatus: { ...cur.jobStatus, [idx]: status },
          jobErrors: error ? { ...cur.jobErrors, [idx]: error } : cur.jobErrors,
        },
      };
    });
  }, []);

  const notify = useCallback((title: string, body?: string, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, title, body, type }]);
    setTimeout(() => {
      setToasts((t) => t.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
      setTimeout(() => {
        setToasts((t) => t.filter((x) => x.id !== id));
      }, 200);
    }, 2800);
  }, []);

  // Theme & local storage persistence
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('lt-theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('lt-sidebar', sidebarCollapsed ? 'collapsed' : 'open');
  }, [sidebarCollapsed]);

  useEffect(() => {
    try {
      setTheme((localStorage.getItem('lt-theme') as 'light') || 'light');
      setSidebarCollapsed(localStorage.getItem('lt-sidebar') === 'collapsed');
      setSaveArtifacts(localStorage.getItem('lt-save-artifacts') !== '0');
      setFavorites(JSON.parse(localStorage.getItem('lt-favs') || '[]'));
      const storedPresets = localStorage.getItem('lt-presets');
      if (storedPresets) setPresets(JSON.parse(storedPresets));
    } catch {
      // ignore
    }
    void listArtifacts().then(setArtifacts).catch(() => undefined);
  }, []);

  // Keyboard shortcut ⌘K / Esc
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandOpen((v) => !v);
      }
      if (e.key === 'Escape') {
        setCommandOpen(false);
        setInspector(null);
        setSettingsOpen(false);
        setHistoryOpen(false);
        setIsFullscreen(false);
        setTabPopoverOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Close settings popover on click outside
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    };
    if (settingsOpen) {
      document.addEventListener('mousedown', onDoc);
    }
    return () => document.removeEventListener('mousedown', onDoc);
  }, [settingsOpen]);

  // Timestamp ticker for L4 timestamp tool
  useEffect(() => {
    if (tool.kind !== 'timestamp') return;
    const timer = setInterval(() => setL4TimestampNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(timer);
  }, [tool.kind]);

  // Generate QR code when qrText changes in L4
  useEffect(() => {
    if (tool.kind !== 'qr' || !session.qrText) return;
    let cancelled = false;
    QRCode.toDataURL(session.qrText, { width: 256, margin: 2 })
      .then((url) => {
        if (!cancelled) setL4QrDataUrl(url);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [tool.kind, session.qrText]);

  // Tabs scroll behavior: scroll down -> collapse tabs; scroll up / top -> show tabs
  const handleContentScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const st = e.currentTarget.scrollTop;
    if (st <= 10) {
      setTabsVisible(true);
    } else if (st > lastScrollTop.current + 8) {
      setTabsVisible(false);
    } else if (st < lastScrollTop.current - 8) {
      setTabsVisible(true);
    }
    lastScrollTop.current = st;
  };

  const openTool = (toolId: string) => {
    if (!TOOLS[toolId]) return;
    setSessions((prev) => (prev[toolId] ? prev : { ...prev, [toolId]: createSession(toolId) }));
    setTabOrder((prev) => (prev.includes(toolId) ? prev : [...prev, toolId]));
    setActiveId(toolId);
    setSelectedPresetId(null);
    setInspector(null);
    setCommandOpen(false);
  };

  const closeTab = (toolId: string) => {
    setTabOrder((prev) => {
      const next = prev.filter((id) => id !== toolId);
      if (next.length === 0) {
        next.push('image-convert');
      }
      if (activeId === toolId) {
        setActiveId(next[next.length - 1]);
        setSelectedPresetId(null);
      }
      return next;
    });
  };

  const closeAllTabs = () => {
    setTabOrder(['image-convert']);
    setActiveId('image-convert');
    setSelectedPresetId(null);
    clearSession('image-convert');
    setTabPopoverOpen(false);
  };

  const toggleFavorite = (toolId: string) => {
    setFavorites((prev) => {
      const next = prev.includes(toolId) ? prev.filter((id) => id !== toolId) : [...prev, toolId];
      localStorage.setItem('lt-favs', JSON.stringify(next));
      return next;
    });
  };

  const addFiles = (list: FileList | File[]) => {
    const newFiles = Array.from(list);
    if (!newFiles.length) return;
    setSessions((prev) => {
      const cur = prev[tool.id] ?? createSession(tool.id);
      return {
        ...prev,
        [tool.id]: {
          ...cur,
          files: [...cur.files, ...newFiles],
          jobStatus: {},
          jobErrors: {},
          failedJobs: [],
        },
      };
    });
    notify('已添加', `${newFiles.length} 个文件`, 'success');
  };

  const removeFile = (index: number) => {
    setSessions((prev) => {
      const cur = prev[tool.id] ?? createSession(tool.id);
      return {
        ...prev,
        [tool.id]: {
          ...cur,
          files: cur.files.filter((_, i) => i !== index),
          jobStatus: {},
          jobErrors: {},
          failedJobs: [],
        },
      };
    });
  };

  const clearSession = (toolId: string) => {
    setSessions((prev) => ({ ...prev, [toolId]: createSession(toolId) }));
    setSelectedPresetId(null);
    setInspector(null);
    notify('已清空', '文件、参数与结果已重置', 'success');
  };

  // Presets management
  const handleSelectPreset = (id: string | null) => {
    setSelectedPresetId(id);
    if (!id) return;
    const p = presets.find((x) => x.id === id);
    if (p) {
      patch(tool.id, p.data as Partial<ToolSession>);
      notify('已应用预设', p.name, 'info');
    }
  };

  const handleQuickAddPreset = (name: string) => {
    const { files: _f, results: _r, jobStatus: _js, jobErrors: _je, failedJobs: _fj, ...data } = session;
    const newPreset: PresetItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      toolId: tool.id,
      name,
      data,
    };
    const next = [...presets, newPreset];
    setPresets(next);
    setSelectedPresetId(newPreset.id);
    localStorage.setItem('lt-presets', JSON.stringify(next));
    notify('已保存预设', name, 'success');
  };

  const handleUpdatePreset = (id: string) => {
    const { files: _f, results: _r, jobStatus: _js, jobErrors: _je, failedJobs: _fj, ...data } = session;
    const next = presets.map((p) => (p.id === id ? { ...p, data } : p));
    setPresets(next);
    localStorage.setItem('lt-presets', JSON.stringify(next));
    notify('已更新预设', '当前参数已保存至预设', 'success');
  };

  // Task execution pipeline
  const run = async (onlyIndices?: number[]) => {
    if (running || !session.files.length || tool.layout === 'l4') return;
    const indexMap = onlyIndices ?? session.files.map((_, i) => i);
    const filesToRun = indexMap.map((i) => session.files[i]);
    setRunning(true);

    if (!onlyIndices) {
      patch(tool.id, { results: [], failedJobs: [], jobStatus: {}, jobErrors: {} });
    } else {
      patch(tool.id, {
        failedJobs: session.failedJobs.filter((f) => !indexMap.includes(f.index)),
      });
    }

    for (const idx of indexMap) {
      setJobStatus(tool.id, idx, 'running');
    }

    const failed: { index: number; name: string; error: string }[] = [];
    const success: JobResult[] = [];

    // Batch whole-document aggregators
    if (tool.kind === 'image-to-pdf' && !onlyIndices) {
      try {
        const r = await processImageToPdf(filesToRun);
        success.push(...r);
        for (const idx of indexMap) setJobStatus(tool.id, idx, 'done');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        for (const idx of indexMap) {
          failed.push({ index: idx, name: session.files[idx].name, error: msg });
          setJobStatus(tool.id, idx, 'failed', msg);
        }
      }
    } else if (tool.kind === 'pdf-merge' && !onlyIndices) {
      try {
        const r = await processPdfMerge(filesToRun, session.outName || 'merged.pdf');
        success.push(...r);
        for (const idx of indexMap) setJobStatus(tool.id, idx, 'done');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        for (const idx of indexMap) {
          failed.push({ index: idx, name: session.files[idx].name, error: msg });
          setJobStatus(tool.id, idx, 'failed', msg);
        }
      }
    } else if (tool.kind === 'image-stitch' && !onlyIndices) {
      try {
        const r = await processImageStitch(filesToRun, { direction: session.stitchDir, gap: session.stitchGap });
        success.push(r);
        for (const idx of indexMap) setJobStatus(tool.id, idx, 'done');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        for (const idx of indexMap) {
          failed.push({ index: idx, name: session.files[idx].name, error: msg });
          setJobStatus(tool.id, idx, 'failed', msg);
        }
      }
    } else {
      // Per-file worker dispatch (concurrency limit = 4)
      const runOne = async (file: File, idx: number) => {
        try {
          let r: JobResult[] = [];
          if (tool.kind === 'image') {
            const mime =
              tool.id === 'image-convert'
                ? session.format
                : file.type.includes('png')
                ? 'image/png'
                : file.type.includes('webp')
                ? 'image/webp'
                : 'image/jpeg';
            if (tool.id === 'image-compress' && session.targetKb > 0) {
              r = [
                await processImageTargetSize(file, {
                  targetBytes: session.targetKb * 1024,
                  mime: session.format || undefined,
                  maxEdge: session.maxEdge,
                }),
              ];
            } else {
              r = [
                await processImageJob(file, {
                  type: tool.id === 'image-compress' ? 'compress' : tool.id === 'image-exif' ? 'exif' : 'convert',
                  mime,
                  quality: session.quality / 100,
                  maxEdge: session.maxEdge,
                }),
              ];
            }
          } else if (tool.kind === 'image-resize') {
            r = [
              await processImageResize(file, {
                width: session.resizeW || undefined,
                height: session.resizeH || undefined,
                keepAspect: session.resizeKeepAspect,
                mime: session.format,
                quality: session.quality / 100,
              }),
            ];
          } else if (tool.kind === 'image-watermark') {
            r = [
              await processImageWatermark(file, {
                text: session.wmText,
                opacity: session.wmOpacity / 100,
                angle: session.wmAngle,
                size: session.wmSize,
                mode: session.wmMode,
                gapX: session.wmGapX,
                gapY: session.wmGapY,
                color: session.wmColor,
                bold: session.wmBold,
              }),
            ];
          } else if (tool.kind === 'image-transform') {
            r = [
              await processImageTransform(file, {
                rotate: session.rot as 0 | 90 | 180 | 270,
                flipH: session.flipH,
                flipV: session.flipV,
              }),
            ];
          } else if (tool.kind === 'image-crop') {
            r = [
              await processImageCrop(file, {
                x: session.crop.x,
                y: session.crop.y,
                w: session.crop.w,
                h: session.crop.h,
              }),
            ];
          } else if (tool.kind === 'image-stamp') {
            if (!session.stampFile) throw new Error('请先选择 Logo 图片');
            r = [
              await processImageStamp(file, session.stampFile, {
                opacity: session.wmOpacity / 100,
                angle: session.wmAngle,
                mode: session.wmMode,
                scale: session.stampScale,
              }),
            ];
          } else if (tool.kind === 'ocr') {
            r = [await processOcr(file, { lang: session.ocrLang })];
          } else if (tool.kind === 'ocr-id') {
            r = [await processIdOcr(file, { lang: session.ocrLang })];
          } else if (tool.kind === 'pdf-searchable') {
            r = [await processSearchablePdf(file, { lang: session.ocrLang })];
          } else if (tool.kind === 'pdf-split') {
            r = [await processPdfEach(file, 'split', { range: session.pageRange })];
          } else if (tool.kind === 'pdf-delete') {
            r = [await processPdfDeletePages(file, session.deleteRange)];
          } else if (tool.kind === 'pdf-reorder') {
            r = [await processPdfReorder(file, session.pageOrder)];
          } else if (tool.kind === 'pdf-nup') {
            r = [await processPdfNup(file, session.nup)];
          } else if (tool.kind === 'pdf-crop') {
            r = [
              await processPdfCrop(file, {
                x: session.crop.x,
                y: session.crop.y,
                w: session.crop.w,
                h: session.crop.h,
              }),
            ];
          } else if (tool.kind === 'pdf-numbers') {
            r = [
              await processPdfPageNumbers(file, {
                format: session.pageNumFormat,
                start: session.pageNumStart,
                position: session.pageNumPos,
              }),
            ];
          } else if (tool.kind === 'pdf-to-images') {
            r = await processPdfToImages(file, session.pdfImageScale);
          } else if (tool.kind === 'pdf-text') {
            r = [await processPdfExtractText(file)];
          } else if (tool.kind === 'pdf-img-wm') {
            if (!session.stampFile) throw new Error('请先选择水印图片');
            r = [
              await processPdfImageWatermark(file, session.stampFile, {
                opacity: session.wmOpacity / 100,
                angle: session.wmAngle,
                mode: session.wmMode,
                gapX: session.wmGapX,
                gapY: session.wmGapY,
                scale: session.stampScale,
              }),
            ];
          } else if (tool.kind === 'pdf-encrypt') {
            r = [
              await processPdfEncrypt(file, {
                userPassword: session.userPassword,
                ownerPassword: session.ownerPassword,
                permissions: session.encryptPerms,
              }),
            ];
          } else if (tool.kind === 'pdf-decrypt') {
            r = [await processPdfDecrypt(file, session.decryptPassword)];
          } else if (tool.kind === 'pdf-hf') {
            r = [await processPdfHeaderFooter(file, { header: session.headerText, footer: session.footerText })];
          } else if (tool.kind === 'pdf-outlines') {
            r = [await processPdfOutlines(file, session.tocLines.split('\n').map((x) => x.trim()).filter(Boolean))];
          } else if (tool.kind === 'pdf-form') {
            r = [await processPdfFillForm(file, JSON.parse(session.formJson || '{}'))];
          } else if (tool.kind === 'pdf') {
            const payload =
              tool.id === 'pdf-rotate'
                ? { angle: session.angle }
                : {
                    text: session.wmText,
                    size: session.wmSize,
                    opacity: session.wmOpacity / 100,
                    angle: session.wmAngle,
                    color: session.wmColor,
                    bold: session.wmBold,
                    mode: session.wmMode,
                    gapX: session.wmGapX,
                    gapY: session.wmGapY,
                  };
            r = [await processPdfEach(file, tool.id === 'pdf-rotate' ? 'rotate' : 'watermark', payload)];
          } else if (tool.kind === 'audio') {
            r = [
              await processAudio(file, {
                format: session.audioFormat,
                sampleRate: session.audioSampleRate || undefined,
                channels: session.audioChannels,
                bitDepth: session.audioBitDepth,
                mp3Kbps: session.audioMp3Kbps,
              }),
            ];
          } else if (tool.kind === 'audio-trim') {
            r = [
              await processAudioTrim(file, {
                startSec: session.trimStart,
                endSec: session.trimEnd > session.trimStart ? session.trimEnd : undefined,
                format: session.audioFormat,
                mp3Kbps: session.audioMp3Kbps,
              }),
            ];
          } else if (tool.kind === 'video-cover') {
            r = [await processVideoCover(file, session.videoTime)];
          } else if (tool.kind === 'video-gif') {
            r = [
              await processVideoToGif(file, {
                startSec: session.gifStart,
                endSec: session.gifEnd,
                width: session.gifWidth,
              }),
            ];
          } else if (tool.kind === 'video-audio') {
            r = [await processVideoExtractAudio(file)];
          } else if (tool.kind === 'video-trim') {
            r = [await processVideoTrim(file, { startSec: session.gifStart, endSec: session.gifEnd })];
          } else if (tool.kind === 'favicon-gen') {
            r = await generateFaviconPackage(file);
          } else if (tool.kind === 'image-exif-view') {
            const exif = await parseImageExif(file);
            const jsonBlob = new Blob([JSON.stringify(exif.allTags, null, 2)], { type: 'application/json' });
            r = [{
              blob: jsonBlob,
              name: `${file.name.replace(/\.[^/.]+$/, '')}-exif.json`,
              size: jsonBlob.size,
              inputSize: file.size,
            }];
          }
          success.push(...r);
          setJobStatus(tool.id, idx, 'done');
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          failed.push({ index: idx, name: file.name, error: msg });
          setJobStatus(tool.id, idx, 'failed', msg);
        }
      };

      const limit = 4;
      let cursor = 0;
      await Promise.all(
        Array.from({ length: Math.min(limit, filesToRun.length) }, async () => {
          while (cursor < filesToRun.length) {
            const i = cursor++;
            await runOne(filesToRun[i], indexMap[i]);
          }
        })
      );
    }

    // Apply output renaming pattern
    const pattern = renamePattern || '{name}';
    const renamed = success.map((r, i) => {
      const ext = r.name.includes('.') ? r.name.slice(r.name.lastIndexOf('.')) : '';
      const stem = pattern
        .replaceAll('{name}', baseName(r.name))
        .replaceAll('{n}', String(i + 1))
        .replaceAll('{date}', new Date().toISOString().slice(0, 10))
        .replaceAll('{tool}', tool.id);
      return { ...r, name: stem + ext };
    });

    const mergedResults = pushUnique([...(onlyIndices ? session.results : []), ...renamed]);
    const newFailedJobs = [
      ...(onlyIndices ? session.failedJobs.filter((f) => !indexMap.includes(f.index)) : []),
      ...failed.map((f) => ({ index: f.index, name: f.name })),
    ];

    patch(tool.id, {
      results: mergedResults,
      failedJobs: newFailedJobs,
    });

    if (failed.length) {
      notify('部分失败', `${failed.length} 个出错，可重试`, 'warning');
    } else if (success.length) {
      notify('处理完成', `${success.length} 个输出`, 'success');
    }

    // Save to IndexedDB if allowed
    if (saveArtifacts && success.length) {
      try {
        await putArtifacts(
          renamed.map((r) => ({
            name: r.name,
            type: r.blob.type,
            size: r.size,
            inputSize: r.inputSize,
            note: r.note,
            toolId: tool.id,
            toolTitle: tool.title,
            time: new Date().toLocaleString('zh-CN', { hour12: false }),
            count: success.length,
            blob: r.blob,
          }))
        );
        setArtifacts(await listArtifacts());
      } catch {
        // ignore
      }
    }

    setRunning(false);
  };

  // Preview result inspector
  // Preview result inspector modal
  const previewResult = async (r: JobResult) => {
    const url = URL.createObjectURL(r.blob);
    const type = r.blob.type || '';
    let content: React.ReactNode = (
      <pre className="code-pane overflow-auto rounded-lg border border-border bg-card p-4 font-mono text-xs w-full max-h-[74vh] leading-relaxed">
        {(await r.blob.text()).slice(0, 12000)}
      </pre>
    );
    if (type.includes('pdf') || /\.pdf$/i.test(r.name)) {
      content = <embed src={url} type="application/pdf" className="h-[76vh] w-full rounded-lg border border-border" />;
    } else if (type.startsWith('image/')) {
      content = (
        <div className="relative flex items-center justify-center w-full max-h-[78vh] overflow-hidden rounded-lg border border-border bg-[radial-gradient(#8882_1px,transparent_1px)] [background-size:14px_14px] bg-muted/20 p-2">
          <img src={url} alt={r.name} className="max-h-[74vh] max-w-full rounded object-contain shadow-xs" />
        </div>
      );
    } else if (type.startsWith('audio/')) {
      content = <audio controls src={url} className="w-full max-w-md my-8" />;
    } else if (type.startsWith('video/')) {
      content = <video controls src={url} className="max-h-[74vh] max-w-full my-4 rounded-lg border border-border" />;
    }
    setInspector({ title: `产物预览 · ${r.name}`, content });
  };

  // Show preview in modal popup for input files
  const showPreview = async (file: File) => {
    if (isVisualTool(tool.id)) {
      try {
        const res = await generateLivePreview(file, tool.id, session);
        setInspector({
          title: `效果校准 · ${file.name}`,
          content: (
            <div className="flex flex-col items-center gap-3 w-full">
              <div className="relative flex items-center justify-center w-full max-h-[72vh] overflow-hidden rounded-lg border border-border bg-[radial-gradient(#8882_1px,transparent_1px)] [background-size:14px_14px] bg-muted/20 p-2">
                <img
                  src={res.previewUrl}
                  alt={file.name}
                  className="max-h-[68vh] max-w-full rounded object-contain shadow-xs"
                />
              </div>
              <div className="flex flex-wrap items-center justify-between text-xs text-muted-foreground gap-3 rounded-lg border border-border bg-card px-4 py-2 w-full">
                <span>原图: {formatBytes(res.originalSize)}</span>
                {res.estimatedSize ? (
                  <span className="font-semibold text-foreground">
                    预估产物: {formatBytes(res.estimatedSize)}
                  </span>
                ) : null}
                {res.width ? <span>尺寸: {res.width} × {res.height}</span> : null}
                {res.info ? <span>{res.info}</span> : null}
              </div>
            </div>
          ),
        });
        return;
      } catch (err) {
        console.error('Failed to generate live preview for modal:', err);
      }
    }
    const url = URL.createObjectURL(file);
    if (tool.id === 'pdf-watermark') {
      const { renderPdfWatermarkPreviewPages } = await import('@/engine/pdf-preview');
      const pages = await renderPdfWatermarkPreviewPages(file, {
        text: session.wmText,
        size: session.wmSize,
        opacity: session.wmOpacity / 100,
        angle: session.wmAngle,
        mode: session.wmMode,
        color: session.wmColor,
        bold: session.wmBold,
      });
      setInspector({
        title: `水印效果预览 · ${file.name}`,
        content: (
          <div className="flex flex-col items-center gap-4 w-full max-h-[75vh] overflow-y-auto pr-1">
            {pages.map((src, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5 w-full">
                <span className="text-[11px] text-muted-foreground font-medium">第 {i + 1} 页</span>
                <img key={i} src={src} alt="" className="max-h-[70vh] max-w-full rounded-md border border-border object-contain shadow-xs" />
              </div>
            ))}
          </div>
        ),
      });
      return;
    }
    if (tool.id === 'pdf-img-wm' && session.stampFile) {
      const { renderPdfImageStampPreview } = await import('@/engine/pdf-preview');
      const pages = await renderPdfImageStampPreview(file, session.stampFile, {
        opacity: session.wmOpacity / 100,
        angle: session.wmAngle,
        mode: session.wmMode,
        scale: session.stampScale,
      });
      setInspector({
        title: `图片水印预览 · ${file.name}`,
        content: (
          <div className="flex flex-col items-center gap-4 w-full max-h-[75vh] overflow-y-auto pr-1">
            {pages.map((src, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5 w-full">
                <span className="text-[11px] text-muted-foreground font-medium">第 {i + 1} 页</span>
                <img key={i} src={src} alt="" className="max-h-[70vh] max-w-full rounded-md border border-border object-contain shadow-xs" />
              </div>
            ))}
          </div>
        ),
      });
      return;
    }
    if (file.type.startsWith('image/')) {
      setInspector({
        title: `图片预览 · ${file.name}`,
        content: (
          <div className="relative flex items-center justify-center w-full max-h-[76vh] overflow-hidden rounded-lg border border-border bg-[radial-gradient(#8882_1px,transparent_1px)] [background-size:14px_14px] bg-muted/20 p-2">
            <img src={url} alt={file.name} className="max-h-[72vh] max-w-full rounded object-contain shadow-xs" />
          </div>
        ),
      });
      return;
    }
    setInspector({
      title: `PDF 预览 · ${file.name}`,
      content: <embed src={url} type="application/pdf" className="h-[76vh] w-full rounded-lg border border-border" />,
    });
  };

  // Parameters rendering
  const renderImageParams = () => {
    const P = session;
    const set = (p: Partial<ToolSession>) => patch(tool.id, p);

    if (tool.id === 'image-convert') {
      return (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <FieldLabel htmlFor="optFormat" hint="目标图片格式">输出格式</FieldLabel>
            <Select id="optFormat" value={P.format} onChange={(e) => set({ format: e.target.value })}>
              <option value="image/jpeg">JPG</option>
              <option value="image/png">PNG</option>
              <option value="image/webp">WebP</option>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>质量 {P.quality}%</Label>
              <Slider value={P.quality} onValueChange={(v) => set({ quality: v })} min={10} max={100} />
            </div>
            <div className="space-y-1.5">
              <Label>最大边长 (0=不限)</Label>
              <Input type="number" value={P.maxEdge} onChange={(e) => set({ maxEdge: Number(e.target.value) || 0 })} />
            </div>
          </div>
        </div>
      );
    }

    if (tool.kind === 'image') {
      return (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>质量 {P.quality}%</Label>
              <Slider value={P.quality} onValueChange={(v) => set({ quality: v })} min={10} max={100} />
            </div>
            <div className="space-y-1.5">
              <Label>最大边长 (0=不限)</Label>
              <Input type="number" value={P.maxEdge} onChange={(e) => set({ maxEdge: Number(e.target.value) || 0 })} />
            </div>
          </div>
          {tool.id === 'image-compress' ? (
            <div className="space-y-1.5">
              <FieldLabel hint="大于 0 时按目标体积自动试算质量">目标体积 KB (0 为关闭)</FieldLabel>
              <Input type="number" value={P.targetKb} onChange={(e) => set({ targetKb: Number(e.target.value) || 0 })} />
            </div>
          ) : null}
        </div>
      );
    }

    if (tool.kind === 'image-resize') {
      return (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>宽度 (px)</Label>
            <Input type="number" value={P.resizeW} onChange={(e) => set({ resizeW: Number(e.target.value) || 0 })} />
          </div>
          <div className="space-y-1.5">
            <Label>高度 (px)</Label>
            <Input type="number" value={P.resizeH} onChange={(e) => set({ resizeH: Number(e.target.value) || 0 })} />
          </div>
          <div className="space-y-1.5">
            <Label>保持比例</Label>
            <Select value={P.resizeKeepAspect ? '1' : '0'} onChange={(e) => set({ resizeKeepAspect: e.target.value === '1' })}>
              <option value="1">是</option>
              <option value="0">否</option>
            </Select>
          </div>
        </div>
      );
    }

    if (tool.kind === 'image-transform') {
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>旋转角度</Label>
            <Select value={String(P.rot)} onChange={(e) => set({ rot: Number(e.target.value) })}>
              <option value="0">不旋转</option>
              <option value="90">顺时针 90°</option>
              <option value="180">180°</option>
              <option value="270">顺时针 270°</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>镜像翻转</Label>
            <div className="flex gap-4 pt-1.5 text-sm">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={P.flipH} onChange={(e) => set({ flipH: e.target.checked })} />
                水平翻转
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={P.flipV} onChange={(e) => set({ flipV: e.target.checked })} />
                垂直翻转
              </label>
            </div>
          </div>
        </div>
      );
    }

    if (tool.kind === 'image-crop') {
      return (
        <div className="space-y-3">
          {session.files[0] ? (
            <CropEditor
              file={session.files[0]}
              value={{ x: P.crop.x, y: P.crop.y, w: P.crop.w, h: P.crop.h }}
              onChange={(rect) => set({ crop: { ...P.crop, ...rect } })}
            />
          ) : (
            <div className="rounded-md border border-border p-4 text-center text-xs text-muted-foreground">
              请先添加图片以启用可视化裁剪
            </div>
          )}
        </div>
      );
    }

    if (tool.kind === 'image-watermark' || tool.kind === 'image-stamp') {
      return (
        <div className="space-y-4">
          {tool.kind === 'image-stamp' ? (
            <div className="space-y-1.5">
              <FieldLabel hint="选择 PNG/JPEG 水印图片">水印图片</FieldLabel>
              <FileInput
                id="stampFile"
                accept="image/png,image/jpeg"
                value={session.stampFile as File | null}
                onChange={(file) => set({ stampFile: file })}
                placeholder="点击选择水印图片 (PNG/JPEG)"
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>水印文字</Label>
              <Input value={P.wmText} onChange={(e) => set({ wmText: e.target.value })} />
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>布局位置</Label>
              <Select
                value={P.wmMode === 'tile' ? 'tile' : P.wmPos}
                onChange={(e) => {
                  const v = e.target.value;
                  set(v === 'tile' ? { wmMode: 'tile' } : { wmMode: 'single', wmPos: v as 'center' });
                }}
              >
                <option value="center">居中</option>
                <option value="tl">左上</option>
                <option value="tr">右上</option>
                <option value="bl">左下</option>
                <option value="br">右下</option>
                <option value="tile">平铺重复</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>旋转角度 {P.wmAngle}°</Label>
              <Slider value={P.wmAngle} onValueChange={(v) => set({ wmAngle: v })} min={0} max={90} />
            </div>
            <div className="space-y-1.5">
              <Label>透明度 {P.wmOpacity}%</Label>
              <Slider value={P.wmOpacity} onValueChange={(v) => set({ wmOpacity: v })} min={5} max={80} />
            </div>
            {tool.kind === 'image-stamp' ? (
              <div className="space-y-1.5">
                <Label>缩放 {Math.round(P.stampScale * 100)}%</Label>
                <Slider value={P.stampScale * 100} onValueChange={(v) => set({ stampScale: v / 100 })} min={5} max={80} />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>字号 {P.wmSize}</Label>
                <Slider value={P.wmSize} onValueChange={(v) => set({ wmSize: v })} min={12} max={96} />
              </div>
            )}
          </div>
        </div>
      );
    }

    if (tool.kind === 'image-stitch') {
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>拼接方向</Label>
            <Select value={P.stitchDir} onChange={(e) => set({ stitchDir: e.target.value as 'v' | 'h' })}>
              <option value="v">纵向拼接</option>
              <option value="h">横向拼接</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>图片间距 (px)</Label>
            <Input type="number" value={P.stitchGap} onChange={(e) => set({ stitchGap: Number(e.target.value) || 0 })} />
          </div>
        </div>
      );
    }

    return null;
  };

  const renderPdfParams = () => {
    const P = session;
    const set = (p: Partial<ToolSession>) => patch(tool.id, p);

    if (tool.kind === 'pdf-merge') {
      return (
        <div className="space-y-1.5">
          <FieldLabel hint="最终合并生成的 PDF 文件名">输出文件名</FieldLabel>
          <Input value={P.outName} onChange={(e) => set({ outName: e.target.value })} />
        </div>
      );
    }

    if (tool.kind === 'pdf-split') {
      return (
        <div className="space-y-1.5">
          <FieldLabel hint="如 1-3,5 表示提取第 1 至 3 页与第 5 页">提取页码范围</FieldLabel>
          <Input value={P.pageRange} placeholder="1-3,5" onChange={(e) => set({ pageRange: e.target.value })} />
        </div>
      );
    }

    if (tool.kind === 'pdf-delete') {
      return (
        <div className="space-y-1.5">
          <FieldLabel hint="如 2,4-5 表示删除第 2 页与第 4 至 5 页">删除页码范围</FieldLabel>
          <Input value={P.deleteRange} placeholder="2,4-5" onChange={(e) => set({ deleteRange: e.target.value })} />
        </div>
      );
    }

    if (tool.kind === 'pdf-reorder') {
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <FieldLabel hint="如 3,1,2 或 2,1,3-5 重置页序">新页面顺序</FieldLabel>
            <Input value={P.pageOrder} placeholder="3,1,2" onChange={(e) => set({ pageOrder: e.target.value })} />
          </div>
          {session.files[0] ? (
            <PageOrderPreview file={session.files[0]} order={P.pageOrder} />
          ) : null}
        </div>
      );
    }

    if (tool.kind === 'pdf-nup') {
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>拼版规格</Label>
            <Select value={String(P.nup)} onChange={(e) => set({ nup: Number(e.target.value) as 2 | 4 })}>
              <option value="2">2 合 1（左右排列）</option>
              <option value="4">4 合 1（2×2 排列）</option>
            </Select>
          </div>
          {session.files[0] ? (
            <NupPreview file={session.files[0]} n={P.nup} />
          ) : null}
        </div>
      );
    }

    if (tool.kind === 'pdf-crop') {
      return (
        <div className="space-y-3">
          {session.files[0] ? (
            <PdfCropEditor
              file={session.files[0]}
              value={{ x: P.crop.x, y: P.crop.y, w: P.crop.w, h: P.crop.h }}
              onChange={(rect) => set({ crop: { ...P.crop, ...rect } })}
            />
          ) : (
            <div className="rounded-md border border-border p-4 text-center text-xs text-muted-foreground">
              添加 PDF 文件后在页面上进行可视化裁剪
            </div>
          )}
        </div>
      );
    }

    if (tool.kind === 'pdf-numbers') {
      return (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <FieldLabel hint="格式模版，可用 {n} 与 {total}">页码格式</FieldLabel>
            <Input value={P.pageNumFormat} onChange={(e) => set({ pageNumFormat: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>起始序号</Label>
            <Input type="number" value={P.pageNumStart} onChange={(e) => set({ pageNumStart: Number(e.target.value) || 1 })} />
          </div>
          <div className="space-y-1.5">
            <Label>位置</Label>
            <Select value={P.pageNumPos} onChange={(e) => set({ pageNumPos: e.target.value as 'footer' | 'header' })}>
              <option value="footer">页脚居中</option>
              <option value="header">页眉居中</option>
            </Select>
          </div>
        </div>
      );
    }

    if (tool.kind === 'pdf-to-images') {
      return (
        <div className="space-y-1.5">
          <FieldLabel hint="倍率越高图片越清晰，文件也会相应增大">渲染清晰度</FieldLabel>
          <Select value={String(P.pdfImageScale)} onChange={(e) => set({ pdfImageScale: Number(e.target.value) })}>
            <option value="1">标准 (1.0x)</option>
            <option value="1.5">清晰 (1.5x)</option>
            <option value="2">超清 (2.0x)</option>
          </Select>
        </div>
      );
    }

    if (tool.kind === 'pdf-img-wm') {
      return (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <FieldLabel hint="选择作为印章/水印的图片 (PNG/JPEG)">水印图片</FieldLabel>
            <FileInput
              id="pdfStampFile"
              accept="image/png,image/jpeg"
              value={session.stampFile as File | null}
              onChange={(file) => set({ stampFile: file })}
              placeholder="点击选择水印图片 (PNG/JPEG)"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>缩放 {Math.round(P.stampScale * 100)}%</Label>
              <Slider value={P.stampScale * 100} onValueChange={(v) => set({ stampScale: v / 100 })} min={5} max={80} />
            </div>
            <div className="space-y-1.5">
              <Label>透明度 {P.wmOpacity}%</Label>
              <Slider value={P.wmOpacity} onValueChange={(v) => set({ wmOpacity: v })} min={5} max={80} />
            </div>
            <div className="space-y-1.5">
              <Label>角度 {P.wmAngle}°</Label>
              <Slider value={P.wmAngle} onValueChange={(v) => set({ wmAngle: v })} min={0} max={90} />
            </div>
          </div>
        </div>
      );
    }

    if (tool.kind === 'pdf-encrypt') {
      return (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <FieldLabel hint="双击打开 PDF 时必须输入的密码">打开密码</FieldLabel>
              <Input type="password" placeholder="打开文档密码" value={P.userPassword} onChange={(e) => set({ userPassword: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <FieldLabel hint="修改权限限制时使用的管理密码（留空则同打开密码）">权限管理密码 (可选)</FieldLabel>
              <Input type="password" placeholder="权限修改密码" value={P.ownerPassword} onChange={(e) => set({ ownerPassword: e.target.value })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>操作权限授权 (勾选表示允许此操作)</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={P.encryptPerms.printing} onChange={(e) => set({ encryptPerms: { ...P.encryptPerms, printing: e.target.checked } })} />
                打印内容
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={P.encryptPerms.copying} onChange={(e) => set({ encryptPerms: { ...P.encryptPerms, copying: e.target.checked } })} />
                复制文本与图像
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={P.encryptPerms.modifying} onChange={(e) => set({ encryptPerms: { ...P.encryptPerms, modifying: e.target.checked } })} />
                修改文档
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={P.encryptPerms.annotating} onChange={(e) => set({ encryptPerms: { ...P.encryptPerms, annotating: e.target.checked } })} />
                添加批注
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={P.encryptPerms.fillingForms} onChange={(e) => set({ encryptPerms: { ...P.encryptPerms, fillingForms: e.target.checked } })} />
                填写表单
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={P.encryptPerms.accessibility} onChange={(e) => set({ encryptPerms: { ...P.encryptPerms, accessibility: e.target.checked } })} />
                屏幕阅读辅助
              </label>
            </div>
          </div>
        </div>
      );
    }

    if (tool.kind === 'pdf-decrypt') {
      return (
        <div className="space-y-1.5">
          <FieldLabel hint="输入已知的打开密码以解锁并保存无密版本">文档密码</FieldLabel>
          <Input type="password" placeholder="输入密码" value={P.decryptPassword} onChange={(e) => set({ decryptPassword: e.target.value })} />
        </div>
      );
    }

    if (tool.kind === 'pdf-hf') {
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <FieldLabel hint="支持占位符 {n} 当前页，{total} 总页数">页眉文字</FieldLabel>
            <Input value={P.headerText} placeholder="内部资料 {n}/{total}" onChange={(e) => set({ headerText: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <FieldLabel hint="支持占位符 {n} 当前页，{total} 总页数">页脚文字</FieldLabel>
            <Input value={P.footerText} placeholder="第 {n} 页 / 共 {total} 页" onChange={(e) => set({ footerText: e.target.value })} />
          </div>
        </div>
      );
    }

    if (tool.kind === 'pdf-outlines') {
      return (
        <div className="space-y-1.5">
          <FieldLabel hint="每行格式：章节名称:页码（如：产品说明:1）">书签目录条目</FieldLabel>
          <Textarea
            className="code-pane min-h-[120px]"
            placeholder="第一章 概览:1&#10;第二章 安装说明:5&#10;第三章 使用指南:12"
            value={P.tocLines}
            onChange={(e) => set({ tocLines: e.target.value })}
          />
        </div>
      );
    }

    if (tool.kind === 'pdf-form') {
      return (
        <div className="space-y-2">
          <FieldLabel hint="配置 PDF 表单字段名称与其要填充的值">表单字段映射</FieldLabel>
          <FormFieldsEditor value={P.formJson} onChange={(v) => set({ formJson: v })} />
        </div>
      );
    }

    if (tool.id === 'pdf-rotate') {
      return (
        <div className="space-y-1.5">
          <Label>旋转角度</Label>
          <Select value={String(P.angle)} onChange={(e) => set({ angle: Number(e.target.value) })}>
            <option value="90">顺时针 90°</option>
            <option value="180">180°</option>
            <option value="270">顺时针 270°</option>
          </Select>
        </div>
      );
    }

    if (tool.id === 'pdf-watermark') {
      return (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>水印文字</Label>
            <Input value={P.wmText} onChange={(e) => set({ wmText: e.target.value })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>排列模式</Label>
              <Select value={P.wmMode} onChange={(e) => set({ wmMode: e.target.value as 'single' | 'tile' })}>
                <option value="single">单处居中</option>
                <option value="tile">平铺重复</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>文字字号 {P.wmSize}</Label>
              <Slider value={P.wmSize} onValueChange={(v) => set({ wmSize: v })} min={12} max={96} />
            </div>
            <div className="space-y-1.5">
              <Label>透明度 {P.wmOpacity}%</Label>
              <Slider value={P.wmOpacity} onValueChange={(v) => set({ wmOpacity: v })} min={5} max={80} />
            </div>
            <div className="space-y-1.5">
              <Label>旋转角度 {P.wmAngle}°</Label>
              <Slider value={P.wmAngle} onValueChange={(v) => set({ wmAngle: v })} min={0} max={90} />
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  const renderMediaParams = () => {
    const P = session;
    const set = (p: Partial<ToolSession>) => patch(tool.id, p);

    if (tool.kind === 'audio') {
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <FieldLabel hint="支持 WAV / MP3 / FLAC 格式">导出格式</FieldLabel>
            <Select value={P.audioFormat} onChange={(e) => set({ audioFormat: e.target.value as 'wav' | 'mp3' | 'flac' })}>
              <option value="wav">WAV</option>
              <option value="mp3">MP3</option>
              <option value="flac">FLAC</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>采样率</Label>
            <Select value={String(P.audioSampleRate)} onChange={(e) => set({ audioSampleRate: Number(e.target.value) })}>
              <option value="0">保持原音频</option>
              <option value="44100">44100 Hz (CD)</option>
              <option value="48000">48000 Hz (广播)</option>
            </Select>
          </div>
        </div>
      );
    }

    if (tool.kind === 'audio-trim') {
      return (
        <div className="space-y-3">
          {session.files[0] ? (
            <WaveformTrim
              file={session.files[0]}
              start={P.trimStart}
              end={P.trimEnd}
              onChange={(s, e) => set({ trimStart: s, trimEnd: e })}
            />
          ) : (
            <div className="rounded-md border border-border p-4 text-center text-xs text-muted-foreground">
              请先添加音频文件以在波形上拖动选段
            </div>
          )}
          <div className="space-y-1.5">
            <Label>导出格式</Label>
            <Select value={P.audioFormat} onChange={(e) => set({ audioFormat: e.target.value as 'wav' | 'mp3' | 'flac' })}>
              <option value="wav">WAV</option>
              <option value="mp3">MP3</option>
              <option value="flac">FLAC</option>
            </Select>
          </div>
        </div>
      );
    }

    if (tool.kind === 'ocr' || tool.kind === 'ocr-id' || tool.kind === 'pdf-searchable') {
      return (
        <div className="space-y-1.5">
          <FieldLabel hint="选择文本识别的对应语言包">识别语言</FieldLabel>
          <Select value={P.ocrLang} onChange={(e) => set({ ocrLang: e.target.value })}>
            <option value="eng">English</option>
            <option value="chi_sim">简体中文</option>
            <option value="eng+chi_sim">中英文混排</option>
          </Select>
        </div>
      );
    }

    if (tool.kind === 'video-cover') {
      return (
        <div className="space-y-1.5">
          <Label>截取时间点 {P.videoTime} 秒</Label>
          <Slider value={P.videoTime} onValueChange={(v) => set({ videoTime: v })} min={0} max={60} />
        </div>
      );
    }

    if (tool.kind === 'video-gif' || tool.kind === 'video-trim') {
      return (
        <div className="space-y-3">
          <TimelineTrim
            duration={Math.max(P.gifEnd, 30)}
            start={P.gifStart}
            end={P.gifEnd}
            onChange={(s, e) => set({ gifStart: s, gifEnd: e })}
          />
          {tool.kind === 'video-gif' ? (
            <div className="space-y-1.5">
              <Label>GIF 输出宽度 (px)</Label>
              <Input type="number" value={P.gifWidth} onChange={(e) => set({ gifWidth: Number(e.target.value) || 480 })} />
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">在时间轴上拖选区间后导出 WebM</div>
          )}
        </div>
      );
    }

    return null;
  };

  const renderParams = () => {
    if (tool.kind === 'favicon-gen') {
      return (
        <div className="space-y-3">
          <p className="text-xs font-medium text-foreground">
            将为上传的图像一键生成 Web 与移动端全套标准尺寸图标：
          </p>
          <div className="flex flex-wrap gap-2 text-xs">
            {[
              '16×16 PNG',
              '32×32 PNG',
              '48×48 PNG',
              '180×180 Apple Touch',
              '192×192 Android',
              '512×512 PWA',
              'favicon.ico (Multi-res)',
              'site.webmanifest',
              'html_tags.html',
            ].map((t) => (
              <span key={t} className="rounded bg-muted px-2 py-1 font-mono text-[11px] text-foreground">
                {t}
              </span>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            推荐使用 512×512 以上正方形高清图。处理完成后支持单个下载或一键导出 ZIP 压缩包。
          </p>
        </div>
      );
    }
    if (tool.kind === 'image-exif-view') {
      const activeFile = session.files[previewSampleIndex] || session.files[0];
      if (!activeFile) {
        return <div className="text-xs text-muted-foreground">请先在上方拖入或选择包含拍摄信息的图片</div>;
      }
      return <ExifViewerTool file={activeFile} notify={notify} />;
    }
    const p1 = renderImageParams();
    if (p1) return p1;
    const p2 = renderPdfParams();
    if (p2) return p2;
    const p3 = renderMediaParams();
    if (p3) return p3;
    return <div className="text-xs text-muted-foreground">该工具无需额外参数配置</div>;
  };

  // Dedicated L4 Text/Data Workbench
  const renderL4Workbench = () => {
    if (tool.kind === 'json') {
      const parsed = parseJsonSafe(session.jsonText);
      return (
        <Card className="flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between pb-3 pt-4">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-semibold">JSON 工作台</CardTitle>
              <div className="flex rounded-md border border-border bg-muted p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => patch(tool.id, { jsonView: 'tree' })}
                  className={cn(
                    'rounded px-2.5 py-1 font-medium transition-colors',
                    session.jsonView === 'tree' ? 'bg-background shadow-xs text-foreground' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  树形
                </button>
                <button
                  type="button"
                  onClick={() => patch(tool.id, { jsonView: 'text' })}
                  className={cn(
                    'rounded px-2.5 py-1 font-medium transition-colors',
                    session.jsonView === 'text' ? 'bg-background shadow-xs text-foreground' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  文本
                </button>
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  const res = formatJson(session.jsonText, 2);
                  if (res.ok) {
                    patch(tool.id, { jsonOut: res.value, jsonOk: true, jsonParsed: parseJsonSafe(session.jsonText) });
                    notify('格式化成功', undefined, 'success');
                  } else {
                    notify('格式化失败', res.error, 'danger');
                  }
                }}
              >
                格式化
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  const res = minifyJson(session.jsonText);
                  if (res.ok) {
                    patch(tool.id, { jsonOut: res.value, jsonOk: true });
                    notify('压缩成功', undefined, 'success');
                  } else {
                    notify('压缩失败', res.error, 'danger');
                  }
                }}
              >
                压缩
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  const res = parseJsonSafe(session.jsonText);
                  if (res.ok) {
                    notify('校验通过', '有效 JSON 数据', 'success');
                  } else {
                    notify('校验失败', res.error, 'danger');
                  }
                }}
              >
                校验
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  try {
                    const obj = JSON.parse(session.jsonText);
                    const csv = jsonToCsv(obj);
                    patch(tool.id, { jsonOut: csv, jsonOk: true });
                    notify('已转为 CSV', undefined, 'success');
                  } catch (err) {
                    notify('转 CSV 失败', String(err), 'danger');
                  }
                }}
              >
                转 CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  navigator.clipboard.writeText(session.jsonOut || session.jsonText);
                  notify('已复制', '已复制到剪贴板', 'success');
                }}
              >
                复制
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  const sample = JSON.stringify(
                    {
                      name: 'Toolbox',
                      version: '1.0.0',
                      modules: ['image', 'pdf', 'audio', 'data'],
                      config: { workers: 4, autoSave: true },
                    },
                    null,
                    2
                  );
                  patch(tool.id, { jsonText: sample, jsonOut: sample, jsonParsed: parseJsonSafe(sample) });
                }}
              >
                示例
              </Button>
            </div>
          </CardHeader>

          <CardContent className="p-5 pt-4">
            {session.jsonView === 'tree' ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>输入源码</Label>
                  <Textarea
                    id="jsonInput"
                    placeholder="输入或粘贴 JSON…"
                    className="code-pane h-[420px]"
                    value={session.jsonText}
                    onChange={(e) => {
                      const text = e.target.value;
                      patch(tool.id, { jsonText: text, jsonParsed: parseJsonSafe(text) });
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>树形视图</Label>
                  <JsonTreePanel
                    data={parsed.ok ? parsed.value : { 提示: '请输入合法 JSON 以展示树形结构' }}
                    className="h-[420px]"
                  />
                </div>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>输入</Label>
                  <Textarea
                    id="jsonInput"
                    placeholder="输入或粘贴 JSON…"
                    className="code-pane h-[420px]"
                    value={session.jsonText}
                    onChange={(e) => patch(tool.id, { jsonText: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>输出</Label>
                  <Textarea
                    id="jsonOutput"
                    readOnly
                    placeholder="格式化 / 转换结果…"
                    className="code-pane h-[420px] bg-muted/20"
                    value={session.jsonOut}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      );
    }

    if (tool.kind === 'json-csv') {
      return <JsonCsvTool notify={notify} />;
    }

    if (tool.kind === 'base64') {
      return (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3 pt-4">
            <CardTitle className="text-sm font-semibold">Base64 编码 / 解码</CardTitle>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  try {
                    const encoded = btoa(unescape(encodeURIComponent(session.jsonText)));
                    patch(tool.id, { jsonOut: encoded });
                    notify('编码完成', undefined, 'success');
                  } catch (err) {
                    notify('编码失败', String(err), 'danger');
                  }
                }}
              >
                Base64 编码
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  try {
                    const decoded = decodeURIComponent(escape(atob(session.jsonText)));
                    patch(tool.id, { jsonOut: decoded });
                    notify('解码完成', undefined, 'success');
                  } catch (err) {
                    notify('解码失败', String(err), 'danger');
                  }
                }}
              >
                Base64 解码
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  navigator.clipboard.writeText(session.jsonOut || '');
                  notify('已复制', '已复制到剪贴板', 'success');
                }}
              >
                复制
              </Button>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 p-5 pt-4">
            <div className="space-y-1.5">
              <Label>输入文本</Label>
              <Textarea
                placeholder="输入文本或 Base64 字符串…"
                className="code-pane h-[320px]"
                value={session.jsonText}
                onChange={(e) => patch(tool.id, { jsonText: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>输出结果</Label>
              <Textarea
                readOnly
                placeholder="编码或解码结果…"
                className="code-pane h-[320px] bg-muted/20"
                value={session.jsonOut}
              />
            </div>
          </CardContent>
        </Card>
      );
    }

    if (tool.kind === 'hash') {
      const calcHashes = async (text: string) => {
        patch(tool.id, { jsonText: text });
        if (!text) {
          setL4Hashes({ sha1: '', sha256: '', sha512: '' });
          return;
        }
        const data = new TextEncoder().encode(text);
        const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join('');
        const [h1, h256, h512] = await Promise.all([
          crypto.subtle.digest('SHA-1', data),
          crypto.subtle.digest('SHA-256', data),
          crypto.subtle.digest('SHA-512', data),
        ]);
        setL4Hashes({ sha1: hex(h1), sha256: hex(h256), sha512: hex(h512) });
      };

      return (
        <Card className="space-y-4 p-4">
          <CardTitle className="text-sm font-semibold">哈希散列计算</CardTitle>
          <div className="space-y-1.5">
            <Label>输入文本</Label>
            <Textarea
              placeholder="输入要计算哈希的文本…"
              className="h-28"
              value={session.jsonText}
              onChange={(e) => void calcHashes(e.target.value)}
            />
          </div>
          <div className="space-y-3">
            {[
              { label: 'SHA-256', value: l4Hashes.sha256 },
              { label: 'SHA-1', value: l4Hashes.sha1 },
              { label: 'SHA-512', value: l4Hashes.sha512 },
            ].map((item) => (
              <div key={item.label} className="space-y-1 rounded-md border border-border p-3 bg-muted/10">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">{item.label}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[11px]"
                    disabled={!item.value}
                    onClick={() => {
                      navigator.clipboard.writeText(item.value);
                      notify('已复制', `${item.label} 结果已复制`, 'success');
                    }}
                  >
                    复制
                  </Button>
                </div>
                <p className="font-mono text-xs break-all text-muted-foreground select-all">
                  {item.value || '—'}
                </p>
              </div>
            ))}
          </div>
        </Card>
      );
    }

    if (tool.kind === 'uuid') {
      const genUuids = () => {
        const count = Math.max(1, Math.min(l4UuidCount, 50));
        const list = Array.from({ length: count }, () => crypto.randomUUID());
        setL4Uuids(list);
      };

      return (
        <Card className="space-y-4 p-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">UUID 生成器</CardTitle>
            <div className="flex items-center gap-2">
              <Label>生成数量</Label>
              <Input
                type="number"
                min={1}
                max={50}
                value={l4UuidCount}
                onChange={(e) => setL4UuidCount(Number(e.target.value) || 1)}
                className="h-8 w-20 text-xs"
              />
              <Button size="sm" onClick={genUuids} className="h-8 text-xs">
                生成 UUID
              </Button>
              {l4Uuids.length ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(l4Uuids.join('\n'));
                    notify('已复制', `已复制 ${l4Uuids.length} 个 UUID`, 'success');
                  }}
                  className="h-8 text-xs"
                >
                  全部复制
                </Button>
              ) : null}
            </div>
          </div>
          <div className="max-h-[360px] overflow-auto rounded-md border border-border bg-muted/10 p-3 font-mono text-xs space-y-1">
            {l4Uuids.length ? (
              l4Uuids.map((id, i) => (
                <div key={i} className="flex justify-between items-center py-0.5">
                  <span className="select-all">{id}</span>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground text-[10px]"
                    onClick={() => {
                      navigator.clipboard.writeText(id);
                      notify('已复制', id, 'info');
                    }}
                  >
                    复制
                  </button>
                </div>
              ))
            ) : (
              <div className="text-muted-foreground text-center py-6">点击右上角「生成 UUID」</div>
            )}
          </div>
        </Card>
      );
    }

    if (tool.kind === 'timestamp') {
      return (
        <Card className="space-y-4 p-4">
          <CardTitle className="text-sm font-semibold">时间戳转换</CardTitle>
          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">当前 Unix 时间戳 (秒)</p>
                <p className="font-mono text-2xl font-bold">{l4TimestampNow}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  本地时间: {new Date(l4TimestampNow * 1000).toLocaleString('zh-CN', { hour12: false })}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(String(l4TimestampNow));
                  notify('已复制', String(l4TimestampNow), 'success');
                }}
              >
                复制当前秒
              </Button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 rounded-lg border border-border p-3">
              <Label>时间戳 → 日期</Label>
              <Input
                placeholder="输入秒或毫秒 (如 1727673600)"
                value={l4TsInput}
                onChange={(e) => {
                  const val = e.target.value.trim();
                  setL4TsInput(val);
                  const num = Number(val);
                  if (num > 0) {
                    const ms = val.length === 10 ? num * 1000 : num;
                    setL4TsOutput(new Date(ms).toLocaleString('zh-CN', { hour12: false }));
                  } else {
                    setL4TsOutput('');
                  }
                }}
              />
              <p className="font-mono text-xs text-foreground bg-muted p-2 rounded">
                转换结果: {l4TsOutput || '—'}
              </p>
            </div>

            <div className="space-y-2 rounded-lg border border-border p-3">
              <Label>选择日期时间 → 时间戳</Label>
              <Input
                type="datetime-local"
                onChange={(e) => {
                  if (e.target.value) {
                    const sec = Math.floor(new Date(e.target.value).getTime() / 1000);
                    patch(tool.id, { tsValue: String(sec) });
                  }
                }}
              />
              <p className="font-mono text-xs text-foreground bg-muted p-2 rounded">
                对应秒数: {session.tsValue || '—'}
              </p>
            </div>
          </div>
        </Card>
      );
    }

    if (tool.kind === 'color') {
      return (
        <Card className="space-y-4 p-4">
          <CardTitle className="text-sm font-semibold">颜色提取与格式转换</CardTitle>
          <div className="flex items-center gap-4">
            <input
              type="color"
              value={session.colorText || '#0C66E4'}
              onChange={(e) => patch(tool.id, { colorText: e.target.value })}
              className="h-14 w-20 cursor-pointer rounded border border-border bg-card p-1"
            />
            <div className="space-y-1 flex-1">
              <Label>HEX 颜色值</Label>
              <Input
                value={session.colorText}
                onChange={(e) => patch(tool.id, { colorText: e.target.value })}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {(() => {
              const hex = session.colorText || '#0C66E4';
              const r = parseInt(hex.slice(1, 3) || '0', 16);
              const g = parseInt(hex.slice(3, 5) || '0', 16);
              const b = parseInt(hex.slice(5, 7) || '0', 16);
              const rgbStr = `rgb(${r}, ${g}, ${b})`;
              return [
                { label: 'HEX', val: hex },
                { label: 'RGB', val: rgbStr },
                { label: 'CSS', val: `${hex};` },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border border-border p-3 bg-muted/10 space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold">{item.label}</span>
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline"
                      onClick={() => {
                        navigator.clipboard.writeText(item.val);
                        notify('已复制', item.val, 'success');
                      }}
                    >
                      复制
                    </button>
                  </div>
                  <p className="font-mono text-xs">{item.val}</p>
                </div>
              ));
            })()}
          </div>
        </Card>
      );
    }

    if (tool.kind === 'jwt') {
      const parseJwt = (token: string) => {
        try {
          const parts = token.trim().split('.');
          if (parts.length < 2) return null;
          const decode = (str: string) => JSON.parse(decodeURIComponent(escape(atob(str.replace(/-/g, '+').replace(/_/g, '/')))));
          return {
            header: decode(parts[0]),
            payload: decode(parts[1]),
          };
        } catch {
          return null;
        }
      };

      const parsed = parseJwt(session.jwtText);

      return (
        <Card className="space-y-4 p-4">
          <CardTitle className="text-sm font-semibold">JWT 解码器</CardTitle>
          <div className="space-y-1.5">
            <Label>输入 JWT 令牌</Label>
            <Textarea
              placeholder="粘贴 JWT 字符串（三段式，以 . 分隔）…"
              className="h-24"
              value={session.jwtText}
              onChange={(e) => patch(tool.id, { jwtText: e.target.value })}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Header 头部信息</Label>
              <pre className="code-pane h-56 overflow-auto rounded-md border border-border bg-muted/20 p-3 font-mono text-xs">
                {parsed?.header ? JSON.stringify(parsed.header, null, 2) : '—'}
              </pre>
            </div>
            <div className="space-y-1.5">
              <Label>Payload 载荷数据</Label>
              <pre className="code-pane h-56 overflow-auto rounded-md border border-border bg-muted/20 p-3 font-mono text-xs">
                {parsed?.payload ? JSON.stringify(parsed.payload, null, 2) : '—'}
              </pre>
            </div>
          </div>
        </Card>
      );
    }

    if (tool.kind === 'qr') {
      return (
        <Card className="space-y-4 p-4">
          <CardTitle className="text-sm font-semibold">二维码生成</CardTitle>
          <div className="space-y-1.5">
            <Label>文本或 URL</Label>
            <Input
              value={session.qrText}
              placeholder="输入网址或任意文字…"
              onChange={(e) => patch(tool.id, { qrText: e.target.value })}
            />
          </div>
          {l4QrDataUrl ? (
            <div className="flex flex-col items-center gap-3 pt-2">
              <img src={l4QrDataUrl} alt="QR Code" className="h-56 w-56 rounded-lg border border-border bg-white p-2 shadow-sm" />
              <Button
                size="sm"
                onClick={() => {
                  const a = document.createElement('a');
                  a.href = l4QrDataUrl;
                  a.download = 'qrcode.png';
                  a.click();
                }}
                className="gap-1 text-xs"
              >
                <Download className="h-3.5 w-3.5" />
                下载二维码
              </Button>
            </div>
          ) : null}
        </Card>
      );
    }

    if (tool.kind === 'json-yaml') {
      return <JsonYamlTool notify={notify} />;
    }
    if (tool.kind === 'json-to-ts') {
      return <JsonToTsTool notify={notify} />;
    }
    if (tool.kind === 'text-diff') {
      return <TextDiffTool notify={notify} />;
    }
    if (tool.kind === 'regex-tester') {
      return <RegexTesterTool notify={notify} />;
    }

    return null;
  };

  // Progress calculations
  const completedCount = useMemo(() => {
    return Object.values(session.jobStatus).filter((s) => s === 'done' || s === 'failed').length;
  }, [session.jobStatus]);

  const progressPercent = useMemo(() => {
    if (!session.files.length) return 0;
    return Math.round((completedCount / session.files.length) * 100);
  }, [completedCount, session.files.length]);

  // Command palette search items
  const searchResults = useMemo(() => {
    if (!query.trim()) return Object.values(TOOLS);
    return Object.values(TOOLS)
      .map((t) => ({
        tool: t,
        score: toolSearchScore(query, [t.title, t.desc, t.group, t.keywords || '']),
      }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.tool);
  }, [query]);

  const renderStandardWorkbench = () => (
    <>
      {/* 1. File Upload / Queue Stage */}
      {session.files.length === 0 ? (
        <Dropzone
          accept={tool.accept}
          multiple
          onFilesSelected={addFiles}
        />
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3 pt-4">
            <CardTitle className="text-sm font-semibold">
              文件列表 ({session.files.length})
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="h-7 text-xs"
            >
              继续添加
            </Button>
          </CardHeader>
          <CardContent className="space-y-2 p-5 pt-4">
            {session.files.map((file, idx) => {
              const status = session.jobStatus[idx];
              const err = session.jobErrors[idx];
              return (
                <div
                  key={`${file.name}-${idx}`}
                  className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0 pr-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-muted font-mono text-[10px] font-bold text-muted-foreground">
                      {extOf(file.name)}
                    </span>
                    <div className="truncate">
                      <p className="font-medium text-foreground truncate">{file.name}</p>
                      <p className="text-[11px] text-muted-foreground">{formatBytes(file.size)}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {status === 'running' ? (
                      <Badge variant="outline" className="text-primary text-[10px]">处理中…</Badge>
                    ) : status === 'done' ? (
                      <Badge variant="outline" className="text-green-600 text-[10px]">完成</Badge>
                    ) : status === 'failed' ? (
                      <Badge variant="destructive" className="text-[10px]" title={err}>失败</Badge>
                    ) : null}

                    {isVisualTool(tool.id) ? (
                      <button
                        type="button"
                        onClick={() => setPreviewSampleIndex(idx)}
                        className={cn(
                          'rounded px-2 py-0.5 text-[10px] font-medium transition-colors cursor-pointer',
                          previewSampleIndex === idx
                            ? 'bg-primary/10 text-primary border border-primary/30 font-semibold'
                            : 'border border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                        )}
                      >
                        {previewSampleIndex === idx ? '校准样本' : '设为样本'}
                      </button>
                    ) : null}

                    {tool.hasInspector || file.type.startsWith('image/') || file.type.includes('pdf') ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => showPreview(file)}
                        className="h-7 px-2 text-xs"
                      >
                        预览
                      </Button>
                    ) : null}

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeFile(idx)}
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* 2. Parameter Settings Card (STRICTLY BELOW File Stage) */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3 pt-4">
          <CardTitle className="text-sm font-semibold">
            {isVisualTool(tool.id) && session.files.length > 0 ? '参数设置与实时效果校准' : '参数设置'}
          </CardTitle>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <FieldLabel hint="支持占位符：{name} 原名 · {n} 序号 · {date} 日期 · {tool} 工具">输出命名</FieldLabel>
              <Input
                className="h-7 w-32 text-xs"
                placeholder="{name}"
                value={renamePattern}
                onChange={(e) => setRenamePattern(e.target.value)}
              />
            </div>
            <PresetSelect
              presets={presets.filter((p) => p.toolId === tool.id)}
              value={selectedPresetId}
              onChange={handleSelectPreset}
              onQuickAdd={handleQuickAddPreset}
              onUpdatePreset={handleUpdatePreset}
            />
          </div>
        </CardHeader>
        <CardContent className="p-5 pt-4">
          {isVisualTool(tool.id) && session.files.length > 0 ? (
            <div className="grid gap-6 lg:grid-cols-12 items-start">
              <div className="lg:col-span-7">
                <LivePreviewPanel
                  files={session.files}
                  activeSampleIndex={Math.min(previewSampleIndex, session.files.length - 1)}
                  onSelectSampleIndex={setPreviewSampleIndex}
                  toolId={tool.id}
                  session={session}
                  onInspect={(title, url) => {
                    setInspector({
                      title: `效果校准大图 · ${title}`,
                      content: (
                        <div className="relative flex items-center justify-center w-full max-h-[78vh] overflow-hidden rounded-lg border border-border bg-[radial-gradient(#8882_1px,transparent_1px)] [background-size:14px_14px] bg-muted/20 p-2">
                          <img src={url} alt={title} className="max-h-[74vh] max-w-full rounded object-contain shadow-xs" />
                        </div>
                      ),
                    });
                  }}
                />
              </div>
              <div className="lg:col-span-5 space-y-4">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  参数配置
                </div>
                {renderParams()}
              </div>
            </div>
          ) : (
            renderParams()
          )}
        </CardContent>
      </Card>

      {/* 3. Action Bar / Main CTA */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              onClick={() => run()}
              disabled={running || session.files.length === 0}
              className="min-w-[120px]"
            >
              {running
                ? '处理中…'
                : session.files.length > 0
                ? `开始处理 (${session.files.length})`
                : '开始处理'}
            </Button>
            {session.failedJobs.length > 0 ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => run(session.failedJobs.map((f) => f.index))}
              >
                重试失败 ({session.failedJobs.length})
              </Button>
            ) : null}
          </div>

          <span className="text-xs text-muted-foreground">
            已添加 {session.files.length} 个文件
          </span>
        </div>

        {/* Progress bar when running or completed */}
        {running || Object.keys(session.jobStatus).length > 0 ? (
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>进度: {completedCount} / {session.files.length}</span>
              <span>{progressPercent}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all duration-200"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        ) : null}
      </div>

      {/* 4. Results Rail */}
      {session.results.length > 0 ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3 pt-4">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-semibold">处理结果</CardTitle>
              <Badge variant="secondary" className="text-[10px]">{session.results.length}</Badge>
            </div>
            <div className="flex items-center gap-2">
              {session.results.length >= 2 ? (
                <Button
                  size="sm"
                  onClick={() => downloadAll(session.results, tool.id)}
                  className="h-7 gap-1 text-xs"
                >
                  <Download className="h-3.5 w-3.5" />
                  打包 ZIP ({session.results.length})
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-2 p-5 pt-4">
            {session.results.map((res, i) => {
              const isCompressionTool = tool.id === 'image-compress' || tool.id === 'image-convert';
              const saved =
                isCompressionTool && res.inputSize > 0 && res.size < res.inputSize
                  ? Math.round(((res.inputSize - res.size) / res.inputSize) * 100)
                  : null;
              return (
                <div
                  key={`${res.name}-${i}`}
                  className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-xs"
                >
                  <div className="truncate min-w-0 pr-3">
                    <p className="font-medium text-foreground truncate">{res.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatBytes(res.size)}
                      {saved !== null ? ` (节省 ${saved}%)` : ''}
                      {res.note ? ` · ${res.note}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => previewResult(res)}
                      className="h-7 px-2.5 text-xs"
                    >
                      查看
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => downloadBlob(res.blob, res.name)}
                      className="h-7 px-2.5 text-xs gap-1"
                    >
                      <Download className="h-3 w-3" />
                      下载
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}
    </>
  );

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground select-none">
      {/* 1. Left Sidebar: Full Height with Brand & Search at Top, Categorized Navigation with Icons */}
      <aside
        className={cn(
          'relative shrink-0 border-r border-border bg-card transition-all duration-200 ease-in-out flex flex-col',
          sidebarCollapsed ? 'w-0 opacity-0 overflow-hidden' : 'w-64 opacity-100'
        )}
      >
        {/* Sidebar Header: Brand Title & Global Search */}
        <div className="flex flex-col gap-2.5 p-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5 px-1">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs">
              <Wrench className="h-3.5 w-3.5" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold tracking-tight text-xs leading-none">Toolbox</span>
              <span className="text-[10px] text-muted-foreground leading-none mt-1">文件工具箱</span>
            </div>
          </div>

          <Button
            variant="outline"
            onClick={() => setCommandOpen(true)}
            className="h-8 w-full justify-between text-xs text-muted-foreground bg-muted/40 hover:bg-muted/80 px-2.5"
          >
            <span className="flex items-center gap-2">
              <Search className="h-3.5 w-3.5" />
              搜索工具…
            </span>
            <kbd className="rounded border border-border bg-card px-1 py-0.5 text-[10px] font-mono">⌘K</kbd>
          </Button>
        </div>

        {/* Sidebar Scrollable Menu with Tool Icons */}
        <div className="flex-1 overflow-y-auto pb-16 pt-2 px-2 space-y-3">
          {/* Favorites Group if any */}
          {favorites.length > 0 ? (
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
                <span>常用工具</span>
              </div>
              {favorites.map((fid) => {
                const ftool = TOOLS[fid];
                if (!ftool) return null;
                const isActive = fid === activeId;
                const ToolIcon = getToolIcon(ftool.id);
                return (
                  <button
                    key={fid}
                    type="button"
                    onClick={() => openTool(fid)}
                    className={cn(
                      'group flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs font-medium transition-colors text-left',
                      isActive ? 'bg-accent text-accent-foreground font-semibold' : 'text-foreground hover:bg-muted'
                    )}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <ToolIcon className={cn('h-3.5 w-3.5 shrink-0', isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} />
                      <span className="truncate">{ftool.title}</span>
                    </span>
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(fid);
                      }}
                      className="text-amber-500 hover:scale-110 transition-transform p-0.5 shrink-0"
                      title="取消常用"
                    >
                      ★
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {/* Grouped Tools with Icons */}
          {Object.entries(groups).map(([groupName, toolList]) => {
            const GroupIcon = getGroupIcon(groupName);
            return (
              <div key={groupName} className="space-y-0.5">
                <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  <GroupIcon className="h-3 w-3" />
                  <span>{groupName}</span>
                </div>
                {toolList.map((t) => {
                  const isActive = t.id === activeId;
                  const isFav = favorites.includes(t.id);
                  const ToolIcon = getToolIcon(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => openTool(t.id)}
                      className={cn(
                        'group flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs font-medium transition-colors text-left',
                        isActive ? 'bg-accent text-accent-foreground font-semibold' : 'text-foreground hover:bg-muted'
                      )}
                    >
                      <span className="flex items-center gap-2 truncate">
                        <ToolIcon className={cn('h-3.5 w-3.5 shrink-0', isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} />
                        <span className="truncate">{t.title}</span>
                      </span>
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(t.id);
                        }}
                        className={cn(
                          'transition-all p-0.5 shrink-0',
                          isFav ? 'text-amber-500' : 'text-muted-foreground/30 opacity-0 group-hover:opacity-100 hover:text-amber-500'
                        )}
                        title={isFav ? '取消常用' : '设为常用'}
                      >
                        {isFav ? '★' : '☆'}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </aside>

      {/* Sidebar Grip Handle Button */}
      <button
        type="button"
        onClick={() => setSidebarCollapsed((v) => !v)}
        title={sidebarCollapsed ? '展开侧栏' : '收起侧栏'}
        aria-label={sidebarCollapsed ? '展开侧栏' : '收起侧栏'}
        className={cn(
          'fixed bottom-6 z-30 flex h-10 w-6 items-center justify-center rounded-r-full border border-l-0 border-border bg-card text-muted-foreground shadow-sm transition-all duration-200 hover:text-foreground hover:bg-muted cursor-pointer',
          sidebarCollapsed ? 'left-0' : 'left-64'
        )}
      >
        {sidebarCollapsed ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
      </button>

      {/* 2. Main Workbench Column */}
      <div className="relative flex flex-1 flex-col overflow-hidden">
        {/* Topbar Header */}
        <header className="flex h-13 shrink-0 items-center justify-between border-b border-border bg-card px-4">
          <div className="flex items-center gap-2.5">
            {sidebarCollapsed ? (
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold">
                  <Wrench className="h-3 w-3" />
                </div>
                <span className="font-bold tracking-tight text-xs">Toolbox</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>{tool.group}</span>
                <span>/</span>
                <span className="font-semibold text-foreground">{tool.title}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setHistoryOpen(true)}
              className="h-8 text-xs text-muted-foreground hover:text-foreground gap-1.5"
              title="已完成的任务记录（本次会话）"
            >
              <FileText className="h-3.5 w-3.5" />
              <span>任务记录</span>
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
              title={theme === 'light' ? '切换暗色模式' : '切换浅色模式'}
            >
              {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </Button>

            {/* Settings Button with Popover */}
            <div className="relative" ref={settingsRef}>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={() => setSettingsOpen((v) => !v)}
                title="设置"
              >
                <Settings className="h-4 w-4" />
              </Button>

              {settingsOpen ? (
                <div className="absolute right-0 top-full mt-2 w-64 rounded-lg border border-border bg-card p-3 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-100">
                  <div className="text-xs font-bold mb-2 pb-1 border-b border-border">快捷设置</div>
                  <div className="flex items-center justify-between py-1 text-xs">
                    <span>允许保存任务记录</span>
                    <Switch
                      checked={saveArtifacts}
                      onChange={(v) => {
                        setSaveArtifacts(v);
                        localStorage.setItem('lt-save-artifacts', v ? '1' : '0');
                      }}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        {/* Invisible Tab Measuring Node */}
        <div
          ref={measureContainerRef}
          aria-hidden="true"
          className="pointer-events-none fixed -left-[9999px] -top-[9999px] flex gap-1 opacity-0 z-[-1]"
        >
          {tabOrder.map((tid) => {
            const tdef = TOOLS[tid];
            if (!tdef) return null;
            const ToolIcon = getToolIcon(tdef.id);
            return (
              <div
                key={tid}
                className="flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium whitespace-nowrap"
              >
                <ToolIcon className="h-3 w-3 shrink-0" />
                <span className="max-w-[150px]">{tdef.title}</span>
                <span className="h-1.5 w-1.5 rounded-full" />
                {tabOrder.length > 1 ? (
                  <span className="p-0.5"><X className="h-3 w-3" /></span>
                ) : null}
              </div>
            );
          })}
        </div>

        {/* Tabs Bar (Scroll collapsible, NOT covered by fullscreen) */}
        <div
          ref={tabBarRef}
          className={cn(
            'flex items-center justify-between border-b border-border bg-card/70 px-4 backdrop-blur-sm transition-all duration-300 ease-in-out z-10 shrink-0 gap-2',
            tabsVisible ? 'h-9 opacity-100' : 'h-0 -translate-y-2 opacity-0 overflow-hidden border-b-0'
          )}
        >
          {/* Left: Visible tabs and immediately following overflow button */}
          <div
            ref={tabContainerRef}
            className="flex items-center gap-1 min-w-0 py-0.5"
          >
            {visibleTabs.map((tid) => {
              const tdef = TOOLS[tid];
              if (!tdef) return null;
              const s = sessions[tid];
              const hasData = s && (s.files.length > 0 || s.results.length > 0 || (tdef.layout === 'l4' && s.jsonText));
              const isActive = tid === activeId;
              const ToolIcon = getToolIcon(tdef.id);
              return (
                <div
                  key={tid}
                  onClick={() => openTool(tid)}
                  className={cn(
                    'group flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors select-none whitespace-nowrap',
                    isActive
                      ? 'bg-accent text-accent-foreground shadow-xs font-semibold'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <ToolIcon className="h-3 w-3 shrink-0" />
                  <span className="truncate max-w-[150px]">{tdef.title}</span>
                  {hasData ? <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" title="有未保存的文件或结果" /> : null}
                  {tabOrder.length > 1 ? (
                    <button
                      type="button"
                      title="关闭页签"
                      onClick={(e) => {
                        e.stopPropagation();
                        closeTab(tid);
                      }}
                      className="rounded p-0.5 opacity-50 hover:opacity-100 hover:bg-muted-foreground/20 shrink-0"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  ) : null}
                </div>
              );
            })}

            {/* Overflow Ellipsis Popover (Attached right after the last visible tab!) */}
            {overflowTabs.length > 0 ? (
              <div
                ref={tabPopoverRef}
                className="relative shrink-0"
                onMouseEnter={handleTabPopoverEnter}
                onMouseLeave={handleTabPopoverLeave}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (!tabPopoverOpen && tabPopoverRef.current) {
                      const rect = tabPopoverRef.current.getBoundingClientRect();
                      setPopoverAlignRight(rect.right + 250 > window.innerWidth);
                    }
                    setTabPopoverOpen((v) => !v);
                  }}
                  onMouseEnter={handleTabPopoverEnter}
                  title={`剩余 ${overflowTabs.length} 个页签`}
                  aria-haspopup="true"
                  aria-expanded={tabPopoverOpen}
                  className={cn(
                    'relative flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium transition-colors select-none cursor-pointer',
                    tabPopoverOpen
                      ? 'bg-accent text-accent-foreground shadow-xs'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <MoreHorizontal className="h-3.5 w-3.5 shrink-0" />
                  <span className="text-[11px] font-semibold text-muted-foreground">+{overflowTabs.length}</span>
                  {hasOverflowData ? (
                    <span
                      className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary ring-2 ring-card"
                      title="隐藏页签中有未保存的文件或结果"
                    />
                  ) : null}
                </button>

                {tabPopoverOpen ? (
                  <div
                    role="menu"
                    aria-label="其余页签"
                    onMouseEnter={handleTabPopoverEnter}
                    onMouseLeave={handleTabPopoverLeave}
                    className={cn(
                      'absolute top-full pt-1.5 z-50 animate-in fade-in-0 zoom-in-95',
                      popoverAlignRight ? 'right-0' : 'left-0'
                    )}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="min-w-[220px] max-w-[300px] rounded-lg border border-border bg-card p-1.5 shadow-2xl backdrop-blur-md">
                      <div className="flex items-center justify-between px-2 py-1 text-[11px] font-semibold text-muted-foreground border-b border-border/50 mb-1">
                        <span>剩余页签</span>
                        <span className="font-mono text-[10px] text-muted-foreground/80">{overflowTabs.length}</span>
                      </div>
                      <div className="max-h-[260px] overflow-y-auto space-y-0.5 overscroll-contain">
                        {overflowTabs.map((tid) => {
                          const tdef = TOOLS[tid];
                          if (!tdef) return null;
                          const s = sessions[tid];
                          const hasData = s && (s.files.length > 0 || s.results.length > 0 || (tdef.layout === 'l4' && s.jsonText));
                          const isActive = tid === activeId;
                          const ToolIcon = getToolIcon(tdef.id);
                          return (
                            <div
                              key={tid}
                              role="menuitem"
                              onClick={() => {
                                openTool(tid);
                                setTabPopoverOpen(false);
                              }}
                              className={cn(
                                'group flex h-8 items-center justify-between gap-2 rounded-md px-2 text-xs transition-colors cursor-pointer select-none',
                                isActive
                                  ? 'bg-accent text-accent-foreground font-semibold'
                                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                              )}
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <ToolIcon className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">{tdef.title}</span>
                                {hasData ? (
                                  <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" title="有未保存的文件或结果" />
                                ) : null}
                              </div>
                              {tabOrder.length > 1 ? (
                                <button
                                  type="button"
                                  title="关闭页签"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    closeTab(tid);
                                  }}
                                  className="rounded p-1 opacity-50 hover:opacity-100 hover:bg-destructive/15 hover:text-destructive shrink-0 text-muted-foreground transition-all"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* Right: Close All Tabs button */}
          {tabOrder.length > 1 ? (
            <button
              type="button"
              onClick={closeAllTabs}
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors shrink-0 ml-auto pl-2.5 whitespace-nowrap"
            >
              全部关闭
            </button>
          ) : null}
        </div>

        {/* Content Viewport Container (Relative parent for FullscreenLayer - Tabs stay on top) */}
        <div className="relative flex-1 overflow-hidden">
          {/* Scrollable Content */}
          <main
            onScroll={handleContentScroll}
            className="h-full overflow-y-auto overscroll-contain p-6"
          >
            <div className="mx-auto max-w-4xl space-y-6">
              {/* Tool Title & Header Actions */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-xl font-bold tracking-tight">{tool.title}</h1>
                    <Badge variant="outline" className="text-[11px] font-normal">
                      {layoutLabel(tool.layout)}
                    </Badge>
                    <button
                      type="button"
                      onClick={() => toggleFavorite(tool.id)}
                      title={favorites.includes(tool.id) ? '取消常用' : '设为常用'}
                      className="text-amber-500 hover:scale-110 transition-transform cursor-pointer"
                    >
                      {favorites.includes(tool.id) ? '★' : '☆'}
                    </button>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{tool.desc}</p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => clearSession(tool.id)}
                    title="清空并重置当前工具"
                    aria-label="清空并重置当前工具"
                    className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    清空
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsFullscreen(true)}
                    title="放大工作区"
                    aria-label="放大工作区"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  >
                    <Maximize2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Layout Specific View */}
              {tool.layout === 'l4' ? (
                renderL4Workbench()
              ) : (
                renderStandardWorkbench()
              )}
            </div>
          </main>

          {/* FullscreenLayer (Covers ONLY content viewport below tabs bar!) */}
          {isFullscreen ? (
            <FullscreenLayer
              title={tool.title}
              onExit={() => setIsFullscreen(false)}
              actions={
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[11px] font-normal">
                    {layoutLabel(tool.layout)}
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => clearSession(tool.id)}
                    title="清空并重置当前工具"
                    aria-label="清空并重置当前工具"
                    className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    清空
                  </Button>
                </div>
              }
            >
              <div className="w-full px-4 sm:px-6 md:px-8 py-6">
                <div className="w-full space-y-6">
                  {tool.layout === 'l4' ? (
                    renderL4Workbench()
                  ) : (
                    renderStandardWorkbench()
                  )}
                </div>
              </div>
            </FullscreenLayer>
          ) : null}
        </div>
      </div>

      {/* Hidden Global File Input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        accept={tool.accept}
        onChange={(e) => {
          if (e.target.files?.length) addFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {/* 预览弹出层 (Inspector Modal Overlay) */}
      <MotionOverlay
        open={!!inspector}
        onClose={() => setInspector(null)}
        className="pt-0 items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={displayInspector?.title || '预览'}
          className="relative flex flex-col w-full max-w-4xl max-h-[90vh] rounded-xl border border-border bg-card shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4 sm:px-5 bg-card">
            <div className="flex items-center gap-2 min-w-0 pr-3">
              <Eye className="h-4 w-4 text-primary shrink-0" />
              <span className="font-semibold text-xs sm:text-sm truncate text-foreground">
                {displayInspector?.title || '预览'}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={() => setInspector(null)}
              title="关闭预览 (Esc)"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Modal Content */}
          <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 flex items-center justify-center bg-muted/10 min-h-[280px]">
            {displayInspector?.content}
          </div>
        </div>
      </MotionOverlay>

      {/* Task History Drawer */}
      <MotionPanel
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        kind="drawer"
        className="fixed right-0 top-0 z-50 flex h-full w-84 flex-col border-l border-border bg-card shadow-2xl"
      >
        <div className="flex h-13 shrink-0 items-center justify-between border-b border-border px-4">
          <span className="font-semibold text-xs">任务记录</span>
          <div className="flex items-center gap-1">
            {artifacts.length > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground hover:text-foreground"
                onClick={async () => {
                  await clearArtifacts();
                  setArtifacts([]);
                  notify('已清空', '历史任务记录已清除', 'info');
                }}
              >
                清空记录
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setHistoryOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain p-3 space-y-2">
          {artifacts.length > 0 ? (
            artifacts.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-border bg-muted/20 p-2.5 text-xs space-y-1.5"
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="truncate">
                    <p className="font-medium text-foreground truncate">{item.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {item.toolTitle} · {formatBytes(item.size)} · {item.time}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={async () => {
                      await deleteArtifacts([item.id]);
                      setArtifacts((prev) => prev.filter((a) => a.id !== item.id));
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
                <div className="flex justify-end gap-1.5 pt-1 border-t border-border/50">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[11px]"
                    onClick={() => {
                      previewResult({
                        name: item.name,
                        blob: item.blob,
                        size: item.size,
                        inputSize: item.inputSize,
                      });
                    }}
                  >
                    查看
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-[11px] gap-1"
                    onClick={() => downloadBlob(item.blob, item.name)}
                  >
                    <Download className="h-3 w-3" />
                    下载
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <div className="py-12 text-center text-xs text-muted-foreground">
              暂无已完成的任务记录
            </div>
          )}
        </div>
      </MotionPanel>

      {/* Command Palette Modal (⌘K) */}
      <MotionOverlay open={commandOpen} onClose={() => setCommandOpen(false)}>
        <div
          role="dialog"
          aria-label="搜索工具"
          className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-card shadow-2xl flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center border-b border-border px-3 shrink-0">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              className="flex h-11 w-full bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground"
              placeholder="搜索工具…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && searchResults.length > 0) {
                  openTool(searchResults[0].id);
                }
              }}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground"
              onClick={() => setCommandOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div id="commandList" className="max-h-[60vh] overflow-y-auto p-2">
            {searchResults.length > 0 ? (
              searchResults.map((t) => {
                const ToolIcon = getToolIcon(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => openTool(t.id)}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-medium hover:bg-muted text-left transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <ToolIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div>
                        <p className="font-semibold text-foreground">{t.title}</p>
                        <p className="text-[11px] text-muted-foreground">{t.desc}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                      {t.group}
                    </Badge>
                  </button>
                );
              })
            ) : (
              <div className="p-6 text-center text-xs text-muted-foreground">未找到匹配的工具</div>
            )}
          </div>
        </div>
      </MotionOverlay>

      {/* Toast Host Container */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              'toast-item pointer-events-auto flex items-start gap-2.5 rounded-lg border bg-card p-3 shadow-lg transition-all max-w-sm',
              toast.leaving && 'toast-leaving',
              toast.type === 'success' && 'border-green-500/30 text-green-700 dark:text-green-400',
              toast.type === 'danger' && 'border-destructive/40 text-destructive',
              toast.type === 'warning' && 'border-amber-500/30 text-amber-600 dark:text-amber-400',
              toast.type === 'info' && 'border-border text-foreground'
            )}
          >
            {toast.type === 'success' ? (
              <Check className="h-4 w-4 shrink-0 mt-0.5" />
            ) : toast.type === 'danger' || toast.type === 'warning' ? (
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            ) : (
              <FileText className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
            )}
            <div className="text-xs">
              <p className="font-semibold">{toast.title}</p>
              {toast.body ? <p className="text-muted-foreground mt-0.5">{toast.body}</p> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
