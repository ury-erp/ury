import * as React from "react"
import { cn } from "../lib/cn"
import { Switch } from "./switch"

export interface SwitchCardProps {
  /** Associates the label with the switch. Generated when omitted. */
  id?: string
  label: React.ReactNode
  description?: React.ReactNode
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  className?: string
}

/**
 * Bordered row with a label, optional description, and a trailing switch.
 * The whole card is a label for the switch, so clicks on the text toggle it.
 */
const SwitchCard = React.forwardRef<HTMLLabelElement, SwitchCardProps>(
  (
    {
      id: idProp,
      label,
      description,
      checked,
      onCheckedChange,
      disabled,
      className,
    },
    ref
  ) => {
    const generatedId = React.useId()
    const id = idProp ?? generatedId

    return (
      <label
        ref={ref}
        htmlFor={id}
        className={cn(
          "flex items-start justify-between gap-4 rounded-lg border border-border p-4",
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
          className
        )}
      >
        <div className="space-y-1">
          <span className="text-sm font-semibold text-foreground">{label}</span>
          {description != null && description !== "" && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        <Switch
          id={id}
          checked={checked}
          onCheckedChange={onCheckedChange}
          disabled={disabled}
        />
      </label>
    )
  }
)
SwitchCard.displayName = "SwitchCard"

export { SwitchCard }
