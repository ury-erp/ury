"""Central Print Job state machine for URY printing.

This module is intentionally pure: it has no side effects and no external
dependencies. All URY code that needs to reason about print-job states must
use the constants and helpers defined here instead of comparing strings or
CUPS/IPP integers directly.
"""

# URY Print Job lifecycle states
CREATED = "CREATED"
SUBMITTING = "SUBMITTING"
SUBMITTED = "SUBMITTED"
QUEUED = "QUEUED"
PENDING = "QUEUED"
PROCESSING = "PROCESSING"
COMPLETED = "COMPLETED"
FAILED = "FAILED"
CANCELED = "CANCELED"
UNKNOWN = "UNKNOWN"

ALL_STATES = frozenset(
    {
        CREATED,
        SUBMITTING,
        SUBMITTED,
        QUEUED,
        "PENDING",
        PROCESSING,
        COMPLETED,
        FAILED,
        CANCELED,
        UNKNOWN,
    }
)

TERMINAL_STATES = frozenset({COMPLETED, FAILED, CANCELED})

# CUPS/IPP job-state constants (RFC 2911 §4.3.7)
IPP_JOB_PENDING = 3
IPP_JOB_HELD = 4
IPP_JOB_PROCESSING = 5
IPP_JOB_STOPPED = 6
IPP_JOB_CANCELED = 7
IPP_JOB_ABORTED = 8
IPP_JOB_COMPLETED = 9

_CUPS_NAME_TO_CODE = {
    "IPP_JOB_PENDING": IPP_JOB_PENDING,
    "PENDING": IPP_JOB_PENDING,
    "IPP_JOB_HELD": IPP_JOB_HELD,
    "HELD": IPP_JOB_HELD,
    "IPP_JOB_PROCESSING": IPP_JOB_PROCESSING,
    "PROCESSING": IPP_JOB_PROCESSING,
    "IPP_JOB_STOPPED": IPP_JOB_STOPPED,
    "STOPPED": IPP_JOB_STOPPED,
    "IPP_JOB_CANCELED": IPP_JOB_CANCELED,
    "CANCELED": IPP_JOB_CANCELED,
    "IPP_JOB_ABORTED": IPP_JOB_ABORTED,
    "ABORTED": IPP_JOB_ABORTED,
    "IPP_JOB_COMPLETED": IPP_JOB_COMPLETED,
    "COMPLETED": IPP_JOB_COMPLETED,
}

_CUPS_CODE_TO_URY_STATE = {
    IPP_JOB_PENDING: QUEUED,
    IPP_JOB_HELD: QUEUED,
    IPP_JOB_PROCESSING: PROCESSING,
    IPP_JOB_STOPPED: FAILED,
    IPP_JOB_CANCELED: CANCELED,
    IPP_JOB_ABORTED: FAILED,
    IPP_JOB_COMPLETED: COMPLETED,
}

# Linear progression used by can_transition.
_LINEAR_PROGRESSION = [CREATED, SUBMITTING, SUBMITTED, QUEUED, PROCESSING]


def is_terminal(state):
    """Return True if the given URY state is terminal.

    UNKNOWN is intentionally NOT treated as terminal: an unknown state must be
    resolvable into a concrete outcome before the job can be considered done.
    """
    return state in TERMINAL_STATES


def map_cups_state(cups_job_state, state_reasons=None):
    """Map a CUPS/IPP job state to a URY Print Job state.

    Args:
        cups_job_state: An integer CUPS/IPP job-state code (3-9), a string
            name such as "IPP_JOB_PROCESSING", or None.
        state_reasons: Optional sequence of CUPS job-state-reasons strings.
            Reserved for future diagnostic use; not used for state mapping yet.

    Returns:
        One of the URY state constants. Unmapped codes, None, or errors map to
        UNKNOWN.
    """
    # Normalise string names to integer codes.
    code = cups_job_state
    if isinstance(code, str):
        code = _CUPS_NAME_TO_CODE.get(code.upper())

    if code is None or not isinstance(code, int):
        return UNKNOWN

    return _CUPS_CODE_TO_URY_STATE.get(code, UNKNOWN)


def can_transition(current_state, new_state):
    """Return True if transitioning from current_state to new_state is valid.

    Rules:
      - Unknown states are not allowed.
      - Terminal states may only transition to themselves (idempotent).
      - Non-terminal states may move forward along the linear progression
        CREATED -> SUBMITTING -> SUBMITTED -> PENDING -> PROCESSING, or from any
        non-terminal state to one of COMPLETED / FAILED / CANCELED / UNKNOWN.
    """
    if current_state not in ALL_STATES or new_state not in ALL_STATES:
        return False

    if current_state == new_state:
        return True

    if is_terminal(current_state):
        return False

    if new_state in TERMINAL_STATES or new_state == UNKNOWN:
        return True

    if current_state not in _LINEAR_PROGRESSION or new_state not in _LINEAR_PROGRESSION:
        return False

    return _LINEAR_PROGRESSION.index(new_state) > _LINEAR_PROGRESSION.index(current_state)
