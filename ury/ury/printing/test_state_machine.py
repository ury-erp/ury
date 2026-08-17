from ury.ury.printing.state_machine import (
    ALL_STATES,
    CANCELED,
    COMPLETED,
    CREATED,
    FAILED,
    IPP_JOB_ABORTED,
    IPP_JOB_CANCELED,
    IPP_JOB_COMPLETED,
    IPP_JOB_HELD,
    IPP_JOB_PENDING,
    IPP_JOB_PROCESSING,
    IPP_JOB_STOPPED,
    PENDING,
    PROCESSING,
    SUBMITTED,
    SUBMITTING,
    UNKNOWN,
    can_transition,
    is_terminal,
    map_cups_state,
)
from frappe.tests.utils import FrappeTestCase


class TestPrintStateMachine(FrappeTestCase):
    def test_cups_state_mappings(self):
        """All CUPS/IPP integer codes and common names map to the expected URY state."""
        cases = [
            (IPP_JOB_PENDING, PENDING),
            (IPP_JOB_HELD, PENDING),
            (IPP_JOB_PROCESSING, PROCESSING),
            (IPP_JOB_STOPPED, FAILED),
            (IPP_JOB_CANCELED, CANCELED),
            (IPP_JOB_ABORTED, FAILED),
            (IPP_JOB_COMPLETED, COMPLETED),
            ("IPP_JOB_PENDING", PENDING),
            ("IPP_JOB_HELD", PENDING),
            ("IPP_JOB_PROCESSING", PROCESSING),
            ("IPP_JOB_STOPPED", FAILED),
            ("IPP_JOB_CANCELED", CANCELED),
            ("IPP_JOB_ABORTED", FAILED),
            ("IPP_JOB_COMPLETED", COMPLETED),
            ("pending", PENDING),
            ("held", PENDING),
            ("processing", PROCESSING),
            ("stopped", FAILED),
            ("canceled", CANCELED),
            ("aborted", FAILED),
            ("completed", COMPLETED),
        ]
        for cups_state, expected in cases:
            with self.subTest(cups_state=cups_state):
                self.assertEqual(map_cups_state(cups_state), expected)

    def test_unmapped_or_invalid_cups_states_are_unknown(self):
        """Unmapped codes, None, and garbage values resolve to UNKNOWN."""
        invalid = [None, 0, 1, 2, 10, "", "NOT_A_STATE", object()]
        for value in invalid:
            with self.subTest(value=value):
                self.assertEqual(map_cups_state(value), UNKNOWN)

    def test_unknown_is_not_successful(self):
        """UNKNOWN must not be treated as terminal or successful."""
        self.assertFalse(is_terminal(UNKNOWN))
        self.assertNotIn(UNKNOWN, {COMPLETED, FAILED, CANCELED})

    def test_is_terminal_for_all_states(self):
        """Only COMPLETED, FAILED, and CANCELED are terminal."""
        terminal = {COMPLETED, FAILED, CANCELED}
        for state in ALL_STATES:
            with self.subTest(state=state):
                self.assertEqual(is_terminal(state), state in terminal)

    def test_valid_linear_transitions(self):
        """Forward progression along the CREATED -> ... -> PROCESSING chain is allowed."""
        valid = [
            (CREATED, SUBMITTING),
            (SUBMITTING, SUBMITTED),
            (SUBMITTED, PENDING),
            (PENDING, PROCESSING),
            (CREATED, SUBMITTED),
            (SUBMITTED, PROCESSING),
        ]
        for current, new in valid:
            with self.subTest(current=current, new=new):
                self.assertTrue(can_transition(current, new))

    def test_terminal_transitions_allowed_only_to_self(self):
        """Terminal states are idempotent to themselves and immutable otherwise."""
        for terminal in (COMPLETED, FAILED, CANCELED):
            for state in ALL_STATES:
                with self.subTest(terminal=terminal, state=state):
                    if state == terminal:
                        self.assertTrue(can_transition(terminal, state))
                    else:
                        self.assertFalse(can_transition(terminal, state))

    def test_invalid_transitions(self):
        """Backward moves and transitions out of terminal states are rejected."""
        invalid = [
            (SUBMITTING, CREATED),
            (SUBMITTED, CREATED),
            (PROCESSING, PENDING),
            (COMPLETED, FAILED),
            (FAILED, UNKNOWN),
            (UNKNOWN, CREATED),
            (UNKNOWN, SUBMITTING),
        ]
        for current, new in invalid:
            with self.subTest(current=current, new=new):
                self.assertFalse(can_transition(current, new))

    def test_any_non_terminal_may_finish_or_become_unknown(self):
        """Every non-terminal state may move to a terminal outcome or UNKNOWN."""
        non_terminal = ALL_STATES - {COMPLETED, FAILED, CANCELED}
        finish_states = {COMPLETED, FAILED, CANCELED, UNKNOWN}
        for current in non_terminal:
            for new in finish_states:
                with self.subTest(current=current, new=new):
                    self.assertTrue(can_transition(current, new))

    def test_unknown_states_rejected(self):
        """States outside the defined set are not valid for transition checks."""
        self.assertFalse(can_transition("NOT_A_STATE", CREATED))
        self.assertFalse(can_transition(CREATED, "NOT_A_STATE"))
