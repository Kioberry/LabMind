import Image from 'next/image';
import { ImageUrls } from '@/lib/types';

const BASE = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';

function Frame({
  src,
  label,
  labelColor,
}: {
  src: string | null;
  label: string;
  labelColor: string;
}) {
  return (
    <div className="flex-1 border border-surface-border bg-surface rounded-[4px] overflow-hidden">
      <div className="relative w-full aspect-video bg-[#111110]">
        {src ? (
          <Image
            src={`${BASE}${src}`}
            alt={label}
            fill
            className="object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <p className="text-muted text-sm animate-pulse">Analyzing…</p>
          </div>
        )}
      </div>
      <div className="px-4 py-2">
        <p
          className="text-label tracking-label uppercase"
          style={{ color: labelColor }}
        >
          {label}
        </p>
      </div>
    </div>
  );
}

export default function ImageComparison({
  imageUrls,
}: {
  imageUrls: ImageUrls | null;
}) {
  return (
    <div className="flex gap-4">
      <Frame
        src={imageUrls?.optimal ?? null}
        label="Optimal Condition"
        labelColor="#c8a96e"
      />
      <Frame
        src={imageUrls?.baseline ?? null}
        label="Baseline"
        labelColor="rgba(255,255,255,0.45)"
      />
    </div>
  );
}
