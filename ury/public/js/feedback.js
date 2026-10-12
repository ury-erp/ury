/**
 * The guest feedback form.
 *
 * Plain DOM on purpose: this page is opened once, on a phone, often on a
 * restaurant's slow guest wifi, by someone who is already standing up to
 * leave. A framework here would cost more than the entire page it renders.
 */
(function () {
  'use strict';

  var boot = {};
  try {
    boot = JSON.parse(document.getElementById('feedback-boot').textContent);
  } catch (error) {
    return;
  }

  var form = document.getElementById('feedback-form');
  if (!form) return;

  var text = boot.labels || {};
  var answers = {};
  var sending = false;

  /** Light every star up to the chosen one, in either writing direction. */
  function paintStars(group, value) {
    var stars = group.querySelectorAll('.star');
    Array.prototype.forEach.call(stars, function (star) {
      var starValue = Number(star.getAttribute('data-value'));
      star.setAttribute('data-on', starValue <= value ? '1' : '0');
      star.setAttribute('aria-checked', starValue === value ? 'true' : 'false');
    });
  }

  function paintScores(group, value) {
    var scores = group.querySelectorAll('.score');
    Array.prototype.forEach.call(scores, function (score) {
      var scoreValue = Number(score.getAttribute('data-value'));
      score.setAttribute('aria-checked', scoreValue === value ? 'true' : 'false');
    });
  }

  Array.prototype.forEach.call(form.querySelectorAll('fieldset[data-field]'), function (group) {
    var field = group.getAttribute('data-field');

    group.addEventListener('click', function (event) {
      var button = event.target.closest('.star, .score');
      if (!button) return;

      var value = Number(button.getAttribute('data-value'));
      // Tapping the same star again clears it: a guest who meant three and
      // hit four should not have to reload the page to fix it.
      answers[field] = answers[field] === value ? null : value;

      if (button.classList.contains('star')) {
        paintStars(group, answers[field] || 0);
      } else {
        paintScores(group, answers[field] === null ? -1 : answers[field]);
      }

      if (field === 'overall') revealContact();
      setStatus('');
    });

    // Arrow keys move through a rating the way a radio group should.
    group.addEventListener('keydown', function (event) {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      var buttons = Array.prototype.slice.call(group.querySelectorAll('.star, .score'));
      var index = buttons.indexOf(document.activeElement);
      if (index < 0) return;
      var forward = event.key === 'ArrowRight';
      var next = buttons[index + (forward ? 1 : -1)];
      if (next) {
        next.focus();
        event.preventDefault();
      }
    });
  });

  /**
   * The contact field appears only for a guest who had a poor visit.
   *
   * Asking everyone for a phone number turns a rating into a form; asking
   * the one person who is unhappy is how a restaurant gets to fix it.
   */
  function revealContact() {
    var field = document.getElementById('contact-field');
    if (!field) return;
    field.hidden = !(answers.overall && answers.overall <= 2);
  }

  function setStatus(message, isError) {
    var status = document.getElementById('status');
    if (!status) return;
    status.textContent = message || '';
    status.className = isError ? 'status error' : 'status';
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (sending) return;

    if (!answers.overall) {
      setStatus(text.required, true);
      return;
    }

    sending = true;
    var button = document.getElementById('submit');
    button.disabled = true;
    setStatus(text.sending);

    var payload = {
      token: boot.token,
      overall: answers.overall,
      food: answers.food || '',
      service: answers.service || '',
      cleanliness: answers.cleanliness || '',
      recommend_score: answers.recommend_score === null || answers.recommend_score === undefined
        ? '' : answers.recommend_score,
      comment: (document.getElementById('comment') || {}).value || '',
      contact_number: (document.getElementById('contact') || {}).value || ''
    };

    fetch('/api/method/ury.ury.api.feedback.submit_feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Frappe-CSRF-Token': boot.csrfToken || ''
      },
      credentials: 'same-origin',
      body: JSON.stringify(payload)
    })
      .then(function (response) {
        if (!response.ok) throw new Error('rejected');
        return response.json();
      })
      .then(function (data) {
        var result = (data && data.message) || {};
        form.hidden = true;
        var done = document.getElementById('done');
        done.hidden = false;

        var note = document.getElementById('done-note');
        if (note) {
          // A guest who just told us the visit was poor should not be
          // thanked as though nothing happened.
          note.textContent = result.detractor ? text.sorry
            : (result.status === 'already_submitted' ? text.already : text.thanks_note);
        }
      })
      .catch(function () {
        setStatus(text.error, true);
        sending = false;
        button.disabled = false;
      });
  });
})();
