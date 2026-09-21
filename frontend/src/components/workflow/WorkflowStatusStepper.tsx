import React from 'react';
import { Badge, Button } from '@ury/ui';
import { useWorkflowStatus } from '../../hooks/useWorkflowStatus';

export interface WorkflowStatusStepperProps {
  doctype: string;
  name: string | null;
  onTransitioned?: (newStatus: string) => void;
  /** Optional: caller can gate an action beyond what the backend already filters. Return true to show it disabled with a title tooltip. */
  actionRestricted?: (action: string) => boolean;
  actionRestrictedReason?: string;
}

const TERMINAL_PATTERN = /cancel|reject|void/i;

export const WorkflowStatusStepper: React.FC<WorkflowStatusStepperProps> = ({
  doctype,
  name,
  onTransitioned,
  actionRestricted,
  actionRestrictedReason,
}) => {
  const { status, applyAction, applying, error } = useWorkflowStatus(doctype, name);

  // A record that hasn't been saved yet has no workflow instance to show.
  if (!name) return null;
  // The doctype has no active workflow, or status hasn't loaded yet.
  if (!status) return null;

  const activeIndex = status.states.findIndex((s) => s.state === status.current_state);

  const handleAction = async (action: string) => {
    try {
      await applyAction(action);
      onTransitioned?.(status.current_state);
    } catch {
      // error is surfaced via the hook's error state below
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2" aria-label={`${doctype} status`}>
        {status.states.map((state, index) => {
          const isActive = index === activeIndex;
          const isComplete = activeIndex >= 0 && index < activeIndex;
          const isTerminalLike = TERMINAL_PATTERN.test(state.state);
          return (
            <React.Fragment key={state.state}>
              {index > 0 && (
                <div className={`h-px w-6 shrink-0 ${isComplete || isActive ? 'bg-primary' : 'bg-muted'}`} />
              )}
              <Badge
                size="tag"
                variant={
                  isTerminalLike && isActive
                    ? 'tagDestructive'
                    : isActive
                      ? 'tagAccent'
                      : isComplete
                        ? 'tagSuccess'
                        : 'default'
                }
              >
                {state.state}
              </Badge>
            </React.Fragment>
          );
        })}

        {status.actions.map((action) => {
          const restricted = Boolean(actionRestricted?.(action.action));
          return (
            <Button
              key={action.action}
              onClick={() => handleAction(action.action)}
              disabled={applying || restricted}
              title={restricted ? actionRestrictedReason : undefined}
              className="gap-2"
            >
              <span>{applying ? 'Updating...' : action.action}</span>
            </Button>
          );
        })}
      </div>

      {error && (
        <p className="rounded-md border border-destructive-tint-border bg-destructive-tint px-3 py-2 text-sm text-destructive">{error}</p>
      )}
    </div>
  );
};

export default WorkflowStatusStepper;
