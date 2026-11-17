<script lang="ts">
  import { goto, afterNavigate } from '$app/navigation';
  import { page } from '$app/state';
  import { onMount, tick, untrack } from 'svelte';

  let { account, autoStart }: { account: string | null; autoStart: boolean } =
    $props();

  const steps = {
    welcome: {
      number: 1,
      title: 'Why your feedback matters',
      target: '',
      text: 'A constitution is a set of principles that can guide how AI models respond and how future models are trained. Those principles shape what a model helps with, how it handles uncertainty, and where it sets limits. By showing us what worked and what could improve, you can help make those principles better reflect what people want from AI.',
    },
    principles: {
      number: 2,
      title: 'Find the constitution',
      target: '#principles-heading',
      text: 'The 11 principles on Home are sample statements about how AI should behave. They’re already open. Scroll below this heading to read them.',
    },
    chatbot: {
      number: 3,
      title: 'Try the chatbot',
      target: '[data-tour="chat-tab"]',
      text: 'Open the Chatbot tab in the bottom navigation.',
    },
    message: {
      number: 3,
      title: 'Try the chatbot',
      target: '[data-tour="message"]',
      text: 'Type ‘hi’ or any short greeting, then tap Send.',
    },
    attach: {
      number: 4,
      title: 'Choose what to attach',
      target: '[data-tour="attach"]',
      text: 'Select Submit an issue to choose which part of your chat to share.',
    },
    selection: {
      number: 4,
      title: 'Choose what to attach',
      target: '[data-tour="selection"]',
      text: 'Choose the First exchange and Last exchange. The highlighted messages between them will be attached, including both ends.',
    },
    continue: {
      number: 4,
      title: 'Choose what to attach',
      target: '[data-tour="continue"]',
      text: 'Select Continue to issue when the highlighted messages show the behavior you want to report.',
    },
    behavior: {
      number: 5,
      title: 'Behavior',
      target: '[data-tour="behavior"]',
      text: 'Choose wanted behavior if AI should repeat it, or unwanted behavior if AI should avoid it.',
    },
    description: {
      number: 5,
      title: 'Description',
      target: '#description',
      text: 'Describe what the chatbot did and why it matters.',
    },
    improvement: {
      number: 5,
      title: 'Proposed change',
      target: '#improvement',
      text: 'Suggest a specific change and explain why it would help.',
    },
    constitution: {
      number: 5,
      title: 'Principle',
      target: '#constitution',
      text: 'Select the principle your proposed change addresses. Its text appears below the menu.',
    },
    submit: {
      number: 5,
      title: 'Submit issue',
      target: '[data-tour="submit"]',
      text: 'Submit issue publishes a real, public issue with your selected chat. If you were only practicing, choose Skip submission.',
    },
    issues: {
      number: 6,
      title: 'Browse All Issues',
      target: '[data-tour="issues-tab"]',
      text: 'Open the All Issues tab in the bottom navigation.',
    },
    list: {
      number: 6,
      title: 'Browse All Issues',
      target: '[data-tour="issue-list"]',
      text: 'This list is where you can browse, search, and sort submitted issues.',
    },
  };
  type Step = keyof typeof steps;
  const bubbleOrder = Object.keys(steps) as Step[];
  const nextStep: Partial<Record<Step, Step>> = {
    principles: 'chatbot',
    selection: 'continue',
    behavior: 'description',
    description: 'improvement',
    improvement: 'constitution',
    constitution: 'submit',
  };
  let step = $state<Step | null>(null);
  const current = $derived(step ? steps[step] : null);
  const bubbleNumber = $derived(step ? bubbleOrder.indexOf(step) + 1 : 0);
  let bubble = $state<HTMLElement>();
  let title = $state<HTMLElement>();
  let target = $state<HTMLElement | null>(null);
  let position = $state({ left: 12, top: 12, maxHeight: 380 });
  let handled = '';
  let previousAccount: string | null | undefined;
  const storageKey = $derived('tutorial:v1:' + (account ?? 'guest'));
  let tourAccount: string | null = null;
  let returnFocus: HTMLElement | null = null;

  function start() {
    tourAccount = account;
    returnFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    advance('welcome');
  }
  function close(outcome: 'finished' | 'skipped') {
    try {
      localStorage.setItem(storageKey, outcome);
    } catch {
      /* Storage may be disabled. */
    }
    step = null;
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    else
      document
        .querySelector<HTMLElement>('#main')
        ?.focus({ preventScroll: true });
  }
  $effect(() => {
    if (previousAccount !== account) {
      previousAccount = account;
      handled = '';
      if (step && account !== tourAccount) step = null;
    }
    if (account && autoStart && handled !== account) {
      handled = account;
      try {
        if (localStorage.getItem(storageKey)) return;
      } catch {
        /* First verification still starts the tour. */
      }
      start();
    }
  });

  function advance(value: Step) {
    step = value;
    void tick().then(() => title?.focus({ preventScroll: true }));
  }
  async function goToPrinciples() {
    if (page.url.pathname !== '/') await goto('/');
    advance('principles');
  }
  afterNavigate(({ to }) => {
    const path = to?.url.pathname;
    if (step === 'chatbot' && path === '/chatbot') advance('message');
    if (stepsForAttachment.has(step ?? '') && path === '/submit')
      advance('behavior');
    if (step === 'issues' && path === '/issues') advance('list');
  });
  const stepsForAttachment = new Set(['attach', 'selection', 'continue']);

  onMount(() => {
    const replay = () => start();
    const reply = () => {
      if (step === 'message') advance('attach');
    };
    const select = () => {
      if (step === 'attach') advance('selection');
    };
    const saved = () => {
      if (current?.number === 5) advance('issues');
    };
    window.addEventListener('tutorial:replay', replay);
    window.addEventListener('tutorial:reply', reply);
    window.addEventListener('tutorial:select', select);
    window.addEventListener('tutorial:saved', saved);
    return () => {
      window.removeEventListener('tutorial:replay', replay);
      window.removeEventListener('tutorial:reply', reply);
      window.removeEventListener('tutorial:select', select);
      window.removeEventListener('tutorial:saved', saved);
    };
  });

  function findTarget(selector: string) {
    const node = document.querySelector<HTMLElement>(selector);
    // The same field IDs also appear on the edit screen.
    if (current?.number === 5 && page.url.pathname !== '/submit') return null;
    return node?.getClientRects().length ? node : null;
  }

  function place() {
    if (!bubble) return;
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft ?? 0;
    const top = viewport?.offsetTop ?? 0;
    const width = viewport?.width ?? window.innerWidth;
    const height = viewport?.height ?? window.innerHeight;
    const padding = 12;
    const maxHeight = Math.max(100, height - padding * 2);
    const { width: w, height: measuredHeight } = bubble.getBoundingClientRect();
    const h = Math.min(measuredHeight, maxHeight);
    const rect = target?.getBoundingClientRect();
    const bottom = top + height - padding;
    const maxTop = Math.max(top + padding, bottom - h);
    const center = top + (height - h) / 2;
    const below = rect ? rect.bottom + padding : center;
    const above = rect ? rect.top - h - padding : center;
    const y =
      step === 'principles'
        ? above
        : below <= maxTop
          ? below
          : above >= top + padding
            ? above
            : rect && rect.top - top > bottom - rect.bottom
              ? top + padding
              : maxTop;
    position = {
      maxHeight,
      left: Math.max(
        left + padding,
        Math.min(
          left + width - w - padding,
          rect?.left ?? left + (width - w) / 2,
        ),
      ),
      top: Math.max(top + padding, Math.min(maxTop, y)),
    };
  }

  $effect(() => {
    const selector = current?.target;
    const panel = bubble;
    // Rerun when navigation changes even if the stage stays the same.
    page.url.pathname;
    if (!panel || selector === undefined) return;
    const viewport = window.visualViewport;
    const resize = new ResizeObserver(place);
    resize.observe(panel);
    let highlighted: HTMLElement | null = null;
    function locate() {
      const next = selector ? findTarget(selector) : null;
      if (next !== highlighted) {
        highlighted?.classList.remove('tutorial-target');
        if (highlighted) resize.unobserve(highlighted);
        highlighted = next;
        target = next;
        if (highlighted) {
          highlighted.classList.add('tutorial-target');
          resize.observe(highlighted);
          highlighted.scrollIntoView({ block: 'center', inline: 'nearest' });
        }
      }
      place();
    }
    untrack(locate);
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    viewport?.addEventListener('resize', place);
    viewport?.addEventListener('scroll', place);
    return () => {
      highlighted?.classList.remove('tutorial-target');
      target = null;
      observer.disconnect();
      resize.disconnect();
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
      viewport?.removeEventListener('resize', place);
      viewport?.removeEventListener('scroll', place);
    };
  });

  function focusControl() {
    if (!target) return;
    const control = target.matches('a,button,select,textarea,input')
      ? target
      : target.querySelector<HTMLElement>(
          'textarea, select, input:checked, input',
        );
    (control ?? target).focus({ preventScroll: true });
    target.scrollIntoView({ block: 'center', inline: 'nearest' });
  }
</script>

{#if step && current}
  <aside
    class="tutorial-bubble"
    aria-labelledby="tutorial-title"
    bind:this={bubble}
    style:left={position.left + 'px'}
    style:top={position.top + 'px'}
    style:max-height={position.maxHeight + 'px'}
  >
    <div class="tutorial-top">
      <span id="tutorial-progress">Step {current.number} of 6</span>
      <button class="text-button" type="button" onclick={() => close('skipped')}
        >Skip tour</button
      >
    </div>
    <progress
      class="tutorial-progress-bar"
      aria-label="Tutorial progress"
      aria-valuetext={`Bubble ${bubbleNumber} of ${bubbleOrder.length}`}
      value={bubbleNumber}
      max={bubbleOrder.length}
    ></progress>
    <h2
      id="tutorial-title"
      tabindex="-1"
      bind:this={title}
      aria-describedby="tutorial-progress tutorial-instructions"
    >
      {current.title}
    </h2>
    <p id="tutorial-instructions">{current.text}</p>
    {#if current.target && !target}
      <p>The highlighted control is unavailable here.</p>
    {/if}
    <div class="tutorial-actions">
      {#if step === 'welcome'}
        <button class="button" type="button" onclick={goToPrinciples}
          >Start tour</button
        >
      {:else if step === 'list'}
        <button class="button" type="button" onclick={() => close('finished')}
          >Finish</button
        >
      {:else if nextStep[step]}
        {@const next = nextStep[step]}
        <button
          class="button"
          type="button"
          onclick={() => next && advance(next)}>Next</button
        >
      {:else if !target && step === 'message'}
        <a href="/chatbot">Open Chatbot</a>
      {:else if !target && current.number === 4}
        <button class="button" type="button" onclick={() => advance('chatbot')}
          >Return to chatbot step</button
        >
      {/if}
      {#if target && !['principles', 'list'].includes(step)}
        <button
          type="button"
          class="text-button tutorial-focus"
          onclick={focusControl}>Go to highlighted control</button
        >
      {/if}
      {#if current.number === 5}
        <button
          class="text-button"
          type="button"
          onclick={() => advance('issues')}>Skip submission</button
        >
      {/if}
    </div>
  </aside>
{/if}

<style>
  .tutorial-bubble {
    position: fixed;
    overflow: auto;
    overscroll-behavior: contain;
    z-index: 80;
    width: min(22rem, calc(100% - 24px));
    padding: 12px 14px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--surface);
    color: var(--text);
    box-shadow: 0 6px 24px #0004;
    font-size: 0.875rem;
  }
  .tutorial-top,
  .tutorial-actions {
    display: flex;
    gap: 6px 12px;
    align-items: center;
    flex-wrap: wrap;
  }
  .tutorial-top {
    justify-content: space-between;
  }
  .tutorial-progress-bar {
    display: block;
    width: 100%;
    height: 6px;
    margin: 4px 0 12px;
    border: 0;
    border-radius: 999px;
    overflow: hidden;
    appearance: none;
    background: var(--line);
    accent-color: var(--accent);
  }
  .tutorial-progress-bar::-webkit-progress-bar {
    background: var(--line);
  }
  .tutorial-progress-bar::-webkit-progress-value {
    background: var(--accent);
    border-radius: 999px;
  }
  .tutorial-progress-bar::-moz-progress-bar {
    background: var(--accent);
    border-radius: 999px;
  }
  .tutorial-bubble h2 {
    margin: 2px 0 4px;
    font-size: 1rem;
  }
  .tutorial-bubble p {
    margin: 0 0 6px;
    line-height: 1.4;
  }
  .tutorial-bubble button {
    min-height: 36px;
  }
  .tutorial-bubble .button {
    padding: 5px 12px;
  }
  .tutorial-focus:not(:focus-visible) {
    position: absolute;
    clip-path: inset(50%);
    width: 1px;
    height: 1px;
    overflow: hidden;
  }
  :global(.tutorial-target) {
    outline: 3px solid var(--accent) !important;
    outline-offset: 4px;
  }
</style>
