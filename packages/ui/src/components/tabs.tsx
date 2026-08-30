import * as React from "react"
import { cn } from "../lib/cn"

interface TabsContextValue {
  value: string
  setValue: (value: string) => void
}

const TabsContext = React.createContext<TabsContextValue | null>(null)

function useTabsContext(component: string) {
  const ctx = React.useContext(TabsContext)
  if (!ctx) {
    throw new Error(`<${component} /> must be used within a <Tabs />`)
  }
  return ctx
}

export interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Controlled active tab id. */
  value?: string
  /** Uncontrolled initial active tab id. */
  defaultValue?: string
  onValueChange?: (value: string) => void
}

/**
 * Compound `Tabs` / `TabsList` / `TabsTrigger` / `TabsContent`, matching the
 * pill-style tabs `PosProfilePage.tsx` currently hand-rolls: a rounded-lg
 * gray track holding rounded-lg buttons, with the active trigger flipping to
 * `bg-white text-primary shadow-xs`. Supports both controlled (`value` +
 * `onValueChange`) and uncontrolled (`defaultValue`) usage.
 */
const Tabs = React.forwardRef<HTMLDivElement, TabsProps>(
  ({ className, value, defaultValue, onValueChange, children, ...props }, ref) => {
    const [internalValue, setInternalValue] = React.useState(defaultValue ?? "")
    const isControlled = value !== undefined
    const activeValue = isControlled ? value : internalValue

    const setValue = React.useCallback(
      (next: string) => {
        if (!isControlled) setInternalValue(next)
        onValueChange?.(next)
      },
      [isControlled, onValueChange]
    )

    return (
      <TabsContext.Provider value={{ value: activeValue, setValue }}>
        <div ref={ref} className={cn(className)} {...props}>
          {children}
        </div>
      </TabsContext.Provider>
    )
  }
)
Tabs.displayName = "Tabs"

export type TabsListProps = React.HTMLAttributes<HTMLDivElement>

const TabsList = React.forwardRef<HTMLDivElement, TabsListProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      role="tablist"
      className={cn(
        "inline-flex items-center gap-1 rounded-lg bg-muted p-1 w-fit",
        className
      )}
      {...props}
    />
  )
)
TabsList.displayName = "TabsList"

export interface TabsTriggerProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string
}

const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ className, value, onClick, ...props }, ref) => {
    const { value: activeValue, setValue } = useTabsContext("TabsTrigger")
    const isActive = activeValue === value

    return (
      <button
        ref={ref}
        type="button"
        role="tab"
        aria-selected={isActive}
        data-state={isActive ? "active" : "inactive"}
        onClick={(event) => {
          setValue(value)
          onClick?.(event)
        }}
        className={cn(
          "flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-all",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
          isActive
            ? "bg-card text-primary shadow-xs"
            : "text-gray-600 hover:bg-muted hover:text-gray-700",
          className
        )}
        {...props}
      />
    )
  }
)
TabsTrigger.displayName = "TabsTrigger"

export interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string
}

const TabsContent = React.forwardRef<HTMLDivElement, TabsContentProps>(
  ({ className, value, ...props }, ref) => {
    const { value: activeValue } = useTabsContext("TabsContent")
    if (activeValue !== value) return null

    return (
      <div
        ref={ref}
        role="tabpanel"
        data-state="active"
        className={cn(className)}
        {...props}
      />
    )
  }
)
TabsContent.displayName = "TabsContent"

export { Tabs, TabsList, TabsTrigger, TabsContent }
