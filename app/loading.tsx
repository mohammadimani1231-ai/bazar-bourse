function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse motion-reduce:animate-none rounded-lg border border-border bg-surface shadow-card ${className}`}
    />
  );
}

export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <SkeletonBlock className="h-20" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <SkeletonBlock className="h-96" />
        </div>
        <div className="flex flex-col gap-4">
          <SkeletonBlock className="h-40" />
          <SkeletonBlock className="h-40" />
        </div>
      </div>
    </div>
  );
}
