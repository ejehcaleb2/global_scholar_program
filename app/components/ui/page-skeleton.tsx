export function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-[8px] bg-surface-alt ${className}`} />;
}

function CardSkeleton({ count = 3, className = "" }: { count?: number; className?: string }) {
  return (
    <div className={`grid gap-5 ${className}`}>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="rounded-[8px] border border-border bg-background p-5">
          <SkeletonBlock className="h-10 w-10" />
          <SkeletonBlock className="mt-5 h-6 w-2/3" />
          <SkeletonBlock className="mt-3 h-4 w-full" />
          <SkeletonBlock className="mt-2 h-4 w-5/6" />
          <SkeletonBlock className="mt-6 h-4 w-1/3" />
        </div>
      ))}
    </div>
  );
}

function ListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="rounded-[8px] border border-border bg-background p-4">
          <SkeletonBlock className="h-5 w-1/3" />
          <SkeletonBlock className="mt-3 h-4 w-full" />
          <SkeletonBlock className="mt-2 h-4 w-4/5" />
        </div>
      ))}
    </div>
  );
}

export function DashboardPageSkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <SkeletonBlock className="h-9 w-72" />
        <SkeletonBlock className="h-4 w-44" />
      </div>

      <div className="rounded-[8px] border border-border bg-background p-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="w-full space-y-3">
            <SkeletonBlock className="h-4 w-28" />
            <SkeletonBlock className="h-8 w-60" />
            <SkeletonBlock className="h-4 w-72" />
          </div>
          <div className="w-full max-w-md space-y-3">
            <SkeletonBlock className="h-4 w-40" />
            <SkeletonBlock className="h-2.5 w-full" />
          </div>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="rounded-[8px] border border-border bg-background p-5">
            <SkeletonBlock className="h-6 w-1/2" />
            <SkeletonBlock className="mt-4 h-4 w-full" />
            <SkeletonBlock className="mt-2 h-4 w-5/6" />
            <SkeletonBlock className="mt-6 h-10 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function CoursePageSkeleton() {
  return (
    <div className="space-y-8">
      <div className="rounded-[8px] border border-border bg-background p-6">
        <SkeletonBlock className="h-4 w-28" />
        <SkeletonBlock className="mt-4 h-9 w-64" />
        <SkeletonBlock className="mt-4 h-4 w-full" />
        <SkeletonBlock className="mt-2 h-4 w-3/4" />
      </div>
      <CardSkeleton count={3} className="md:grid-cols-2 lg:grid-cols-3" />
    </div>
  );
}

export function ResourcePageSkeleton() {
  return (
    <div className="space-y-6">
      <SkeletonBlock className="h-12 w-44" />
      <SkeletonBlock className="h-12 w-full" />
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <SkeletonBlock key={index} className="h-9 w-28" />
        ))}
      </div>
      <ListSkeleton count={4} />
    </div>
  );
}

export function OpportunityPageSkeleton() {
  return (
    <div className="space-y-6">
      <SkeletonBlock className="h-12 w-48" />
      <SkeletonBlock className="h-12 w-full" />
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <SkeletonBlock key={index} className="h-9 w-28" />
        ))}
      </div>
      <CardSkeleton count={3} className="md:grid-cols-2 lg:grid-cols-3" />
    </div>
  );
}

export function MasterclassesPageSkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <SkeletonBlock className="h-4 w-40" />
        <SkeletonBlock className="h-10 w-60" />
        <SkeletonBlock className="h-4 w-full" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="rounded-[8px] border border-border bg-background p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <SkeletonBlock className="h-16 w-20" />
                <div className="space-y-2">
                  <SkeletonBlock className="h-5 w-40" />
                  <SkeletonBlock className="h-4 w-24" />
                </div>
              </div>
              <SkeletonBlock className="h-10 w-32" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ServicesPageSkeleton() {
  return (
    <div className="space-y-8">
      <div className="grid gap-5 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="rounded-[8px] border border-border bg-background p-6">
            <SkeletonBlock className="h-8 w-8" />
            <SkeletonBlock className="mt-5 h-7 w-2/3" />
            <SkeletonBlock className="mt-3 h-4 w-full" />
            <SkeletonBlock className="mt-2 h-4 w-5/6" />
            <SkeletonBlock className="mt-6 h-11 w-full" />
          </div>
        ))}
      </div>
      <div className="rounded-[8px] border border-border bg-background p-5">
        <SkeletonBlock className="h-6 w-40" />
        <ListSkeleton count={3} />
      </div>
    </div>
  );
}

export function CourseDetailPageSkeleton() {
  return (
    <div className="space-y-8">
      <div className="rounded-[8px] border border-border bg-background p-6">
        <SkeletonBlock className="h-4 w-24" />
        <SkeletonBlock className="mt-4 h-10 w-64" />
        <SkeletonBlock className="mt-4 h-4 w-full" />
        <SkeletonBlock className="mt-2 h-4 w-2/3" />
        <SkeletonBlock className="mt-6 h-10 w-44" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="rounded-[8px] border border-border bg-background p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <SkeletonBlock className="h-9 w-9" />
                <SkeletonBlock className="h-5 w-40" />
              </div>
              <SkeletonBlock className="h-5 w-5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LessonPageSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-5 py-10 lg:px-8">
      <SkeletonBlock className="h-4 w-36" />
      <SkeletonBlock className="h-11 w-3/4" />
      <div className="space-y-3 rounded-[8px] border border-border bg-background p-6">
        <SkeletonBlock className="h-4 w-full" />
        <SkeletonBlock className="h-4 w-5/6" />
        <SkeletonBlock className="h-4 w-full" />
        <SkeletonBlock className="h-4 w-4/5" />
      </div>
      <div className="flex justify-between gap-3">
        <SkeletonBlock className="h-11 w-32" />
        <SkeletonBlock className="h-11 w-32" />
      </div>
    </div>
  );
}
