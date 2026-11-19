'use strict';

(() => {
  const stepCount = 4;
  const stepDuration = 820;

  /** @typedef {'idle' | 'playing' | 'paused' | 'complete'} WorkflowState */

  /** @param {Element} scene */
  function setupWorkflow(scene) {
    const buttons = Array.from(scene.querySelectorAll('button'))
      .filter(button => button.hasAttribute('data-workflow-step'));
    const details = Array.from(scene.querySelectorAll('[data-workflow-detail]'));
    const playButton = scene.querySelector('[data-workflow-play]');
    const playLabel = playButton?.querySelector('[data-workflow-play-label]');
    const status = scene.querySelector('[data-workflow-status]');

    if (!(playButton instanceof HTMLButtonElement) || !playLabel || !status) return;
    if (buttons.length !== stepCount || details.length !== stepCount) return;
    if (!buttons.every((button, index) => button.dataset.workflowStep === String(index)
      && details[index].getAttribute('data-workflow-detail') === String(index))) return;

    const play = playButton.dataset.labelPlay || playLabel.textContent?.trim();
    const pause = playButton.dataset.labelPause;
    const replay = playButton.dataset.labelReplay;
    if (!play || !pause || !replay) return;

    const labels = {
      idle: play,
      playing: pause,
      paused: playButton.dataset.labelResume || play,
      complete: replay,
    };
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    /** @type {WorkflowState} */
    let state = 'idle';
    let current = 0;
    /** @type {number | undefined} */
    let timer;

    /** @param {WorkflowState} next */
    function setState(next) {
      state = next;
      scene.setAttribute('data-state', next);
      if (playLabel) playLabel.textContent = labels[next];
    }

    /**
     * @param {number} index
     * @param {boolean} announce
     */
    function showStep(index, announce) {
      current = index;
      scene.setAttribute('data-step', String(index));
      buttons.forEach((button, step) => {
        button.setAttribute('aria-pressed', String(step === index));
        details[step].toggleAttribute('hidden', step !== index);
      });
      if (announce && status) {
        const active = buttons[index];
        status.textContent = active.dataset.announcement || active.textContent?.trim() || '';
      }
    }

    function stopTimer() {
      window.clearTimeout(timer);
      timer = undefined;
    }

    function complete() {
      stopTimer();
      showStep(stepCount - 1, true);
      setState('complete');
    }

    function pausePlayback() {
      if (state !== 'playing') return;
      stopTimer();
      setState('paused');
    }

    function queueNextStep() {
      timer = window.setTimeout(() => {
        if (state !== 'playing') return;
        if (current >= stepCount - 2) {
          complete();
          return;
        }
        showStep(current + 1, false);
        queueNextStep();
      }, stepDuration);
    }

    playButton.addEventListener('click', () => {
      if (state === 'playing') {
        pausePlayback();
        return;
      }
      if (motion.matches) {
        complete();
        return;
      }
      if (state !== 'paused') showStep(0, false);
      status.textContent = '';
      setState('playing');
      queueNextStep();
    });

    buttons.forEach((button, index) => {
      button.addEventListener('click', () => {
        stopTimer();
        setState('idle');
        showStep(index, true);
      });
      button.disabled = false;
    });

    motion.addEventListener('change', event => {
      if (event.matches && state === 'playing') complete();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) pausePlayback();
    });
    window.addEventListener('pagehide', pausePlayback);

    showStep(0, false);
    setState('idle');
    playButton.disabled = false;
  }

  document.querySelectorAll('[data-workflow]').forEach(setupWorkflow);
})();
