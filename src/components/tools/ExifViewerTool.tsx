import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { parseImageExif, type ParsedExifData } from '@/engine/dev-tools';
import { Camera, MapPin, Sliders, Calendar, Copy, Download, Check, ExternalLink } from 'lucide-react';
import { downloadBlob } from '@/lib/utils';

export function ExifViewerTool({
  file,
  notify,
}: {
  file: File;
  notify: (title: string, desc?: string, type?: 'success' | 'danger') => void;
}) {
  const [data, setData] = useState<ParsedExifData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    parseImageExif(file)
      .then((res) => {
        if (active) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to parse EXIF:', err);
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [file]);

  const handleCopyJson = () => {
    if (!data) return;
    navigator.clipboard.writeText(JSON.stringify(data.allTags, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    notify('已复制所有 EXIF 标签 JSON', undefined, 'success');
  };

  const handleDownloadJson = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data.allTags, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `${file.name.replace(/\.[^/.]+$/, '')}-exif.json`);
  };

  if (loading) {
    return (
      <Card className="p-8 text-center text-xs text-muted-foreground">
        正在解析图像元数据…
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className="p-8 text-center text-xs text-muted-foreground">
        未能从该图像中解析出有效 EXIF 元数据
      </Card>
    );
  }

  const filteredTags = Object.entries(data.allTags).filter(
    ([k, v]) => k.toLowerCase().includes(filter.toLowerCase()) || v.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3 pt-4">
        <div>
          <CardTitle className="text-sm font-semibold">EXIF 元数据检视 · {file.name}</CardTitle>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            共读取到 {Object.keys(data.allTags).length} 个元数据标签
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleCopyJson}>
            {copied ? <Check className="mr-1 h-3.5 w-3.5 text-green-600" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
            {copied ? '已复制' : '复制 JSON'}
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownloadJson}>
            <Download className="mr-1 h-3.5 w-3.5" />
            导出 JSON
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-5">
        {/* Core Metric Cards Grid */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* Device */}
          <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-1 text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-foreground">
              <Camera className="h-3.5 w-3.5 text-primary" />
              <span>相机与镜头</span>
            </div>
            <p className="text-muted-foreground truncate" title={data.device.make || '未知品牌'}>
              品牌: {data.device.make || '—'}
            </p>
            <p className="text-foreground font-medium truncate" title={data.device.model || '未知型号'}>
              型号: {data.device.model || '—'}
            </p>
            {data.device.lens ? (
              <p className="text-[11px] text-muted-foreground truncate" title={data.device.lens}>
                镜头: {data.device.lens}
              </p>
            ) : null}
          </div>

          {/* Exposure */}
          <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-1 text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-foreground">
              <Sliders className="h-3.5 w-3.5 text-primary" />
              <span>曝光参数</span>
            </div>
            <p className="text-foreground font-medium">
              光圈: {data.exposure.fNumber ? `f/${data.exposure.fNumber}` : '—'} · 快门: {data.exposure.exposureTime ? `${data.exposure.exposureTime}s` : '—'}
            </p>
            <p className="text-muted-foreground">
              ISO: {data.exposure.iso || '—'} · 焦距: {data.exposure.focalLength ? `${data.exposure.focalLength}mm` : '—'}
            </p>
            {data.exposure.flash ? (
              <p className="text-[11px] text-muted-foreground truncate">闪光灯: {data.exposure.flash}</p>
            ) : null}
          </div>

          {/* Image & Date */}
          <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-1 text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-foreground">
              <Calendar className="h-3.5 w-3.5 text-primary" />
              <span>尺寸与时间</span>
            </div>
            <p className="text-foreground font-medium">
              分辨率: {data.image.width && data.image.height ? `${data.image.width} × ${data.image.height}` : '—'}
            </p>
            <p className="text-muted-foreground text-[11px] truncate" title={data.image.dateOriginal || '未知拍摄时间'}>
              拍摄: {data.image.dateOriginal || '—'}
            </p>
            {data.image.colorSpace ? (
              <p className="text-[11px] text-muted-foreground">色彩空间: {data.image.colorSpace}</p>
            ) : null}
          </div>

          {/* GPS */}
          <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-1 text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-foreground">
              <MapPin className="h-3.5 w-3.5 text-primary" />
              <span>GPS 地理信息</span>
            </div>
            {data.gps && data.gps.latitude !== undefined && data.gps.longitude !== undefined ? (
              <>
                <p className="font-mono text-[11px] text-foreground">
                  {data.gps.latitude.toFixed(5)}, {data.gps.longitude.toFixed(5)}
                </p>
                {data.gps.altitude ? <p className="text-[11px] text-muted-foreground">海拔: {data.gps.altitude}</p> : null}
                {data.gps.mapUrl ? (
                  <a
                    href={data.gps.mapUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline mt-1"
                  >
                    在 OpenStreetMap 查看
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
              </>
            ) : (
              <p className="text-muted-foreground text-[11px] pt-1">未记录 GPS 经纬度位置</p>
            )}
          </div>
        </div>

        {/* All Tags Search & Table */}
        <div className="space-y-2 pt-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-foreground">完整标签检视</span>
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="搜索标签名称或值…"
              className="h-7 w-48 text-xs"
            />
          </div>

          <div className="max-h-80 overflow-auto rounded-lg border border-border bg-card text-xs shadow-xs">
            <table className="w-full text-left font-mono">
              <thead className="sticky top-0 border-b border-border bg-muted/60 text-[11px] text-muted-foreground">
                <tr>
                  <th className="px-3 py-1.5 font-medium w-1/3">标签名称 (Tag)</th>
                  <th className="px-3 py-1.5 font-medium">标签值 (Value)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {filteredTags.map(([tag, val], idx) => (
                  <tr key={idx} className="hover:bg-muted/30">
                    <td className="px-3 py-1.5 font-semibold text-foreground truncate max-w-[200px]">{tag}</td>
                    <td className="px-3 py-1.5 text-muted-foreground break-all">{val}</td>
                  </tr>
                ))}
                {filteredTags.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-3 py-4 text-center text-muted-foreground">
                      没有匹配的标签
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
