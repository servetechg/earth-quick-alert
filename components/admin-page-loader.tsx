import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

export type AdminPageLoaderLayout = 'fullscreen' | 'page' | 'inline' | 'fill'

export function AdminPageLoader({
  message = 'Loading...',
  layout = 'page',
  containerClassName,
  className,
}: {
  message?: string
  layout?: AdminPageLoaderLayout
  /** Extra classes on the outer wrapper (e.g. h-[calc(100vh-64px)] or h-[80vh]) */
  containerClassName?: string
  className?: string
}) {
  const outer =
    layout === 'fullscreen'
      ? 'flex h-screen w-full items-center justify-center bg-background'
      : layout === 'page'
        ? 'flex min-h-screen w-full flex-1 items-center justify-center bg-slate-50'
        : layout === 'fill'
          ? 'flex h-full w-full items-center justify-center bg-slate-50'
          : 'flex w-full justify-center py-20'

  return (
    <div className={cn(outer, containerClassName)}>
      <div className={cn('flex flex-col items-center gap-4 px-4', className)}>
        <Spinner className="size-12 shrink-0" />
        <p className="text-center text-sm font-medium text-muted-foreground">{message}</p>
      </div>
    </div>
  )
}
