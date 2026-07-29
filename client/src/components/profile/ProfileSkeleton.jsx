// Loading placeholder shaped like the real page, so the layout does not jump
// when data arrives. The pulse is suppressed under prefers-reduced-motion by
// `motion-reduce:animate-none`.

function Block({ className = '' }) {
  return <div className={`bg-dark-700 rounded-lg animate-pulse motion-reduce:animate-none ${className}`} />;
}

export default function ProfileSkeleton({ label }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-3">
      <span className="sr-only">{label}</span>
      <Block className="h-7 w-2/3 mb-1" />
      <div className="card p-4 flex flex-col gap-2.5">
        <Block className="h-3 w-24" />
        <Block className="h-5 w-3/4" />
        <Block className="h-3 w-1/2" />
      </div>
      <div className="card p-4 flex flex-wrap gap-2">
        <Block className="h-8 w-24 rounded-full" />
        <Block className="h-8 w-20 rounded-full" />
        <Block className="h-8 w-28 rounded-full" />
      </div>
      <div className="card p-4 flex flex-col gap-3">
        <Block className="h-3 w-40" />
        <Block className="h-10 w-full" />
        <Block className="h-10 w-full" />
        <Block className="h-10 w-full" />
      </div>
      <div className="card p-4 flex flex-col gap-2.5">
        <Block className="h-3 w-32" />
        <Block className="h-12 w-full" />
      </div>
    </div>
  );
}
