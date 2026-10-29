<script lang="ts">
  let { data } = $props();
</script>

<svelte:head>
  <title>Home · AI Constitutions</title>
  <meta
    name="description"
    content="Explore chatbot behavior and propose improvements to sample AI constitutions."
  />
</svelte:head>

<section class="hero">
  <div class="hero-content">
    <h1>Help shape the<br />principles behind AI.</h1>
    <p class="hero-copy">
      Explore a simulated chatbot, document behavior that matters, and suggest
      how AI’s guiding principles could improve.
    </p>
    <div class="hero-actions">
      <a class="button" href="/chatbot">Open Chatbot</a>
      <a class="text-link" href="/cases">Browse cases</a>
    </div>
  </div>
  <div class="hero-art" aria-hidden="true">
    <svg class="hero-draft" viewBox="0 0 360 330" fill="none">
      <path
        class="draft-guide"
        d="M20 59H340M20 109H340M20 159H340M20 209H340M20 259H340M64 20V310M114 20V310M164 20V310M214 20V310M264 20V310M314 20V310"
      />
      <path
        class="draft-orbit"
        d="M30 270C30 135 132 30 276 30M87 305C87 187 180 88 327 88"
      />
      <g transform="rotate(-7 180 165)">
        <rect
          class="draft-shadow"
          x="86"
          y="49"
          width="207"
          height="264"
          rx="9"
        />
        <rect
          class="draft-paper"
          x="76"
          y="38"
          width="207"
          height="264"
          rx="7"
        />
        <path class="draft-margin" d="M108 38V302" />
        <path class="draft-heading" d="M129 76H239M129 89H206" />
        <path
          class="draft-line"
          d="M129 124H251M129 137H234M129 150H244M129 178H246M129 191H218M129 232H248M129 245H229M129 258H240"
        />
        <path
          class="draft-edit"
          d="M123 191L225 189M129 207C156 203 181 210 206 205M122 166C111 166 113 216 122 216"
        />
      </g>
      <path
        class="draft-annotation"
        d="M282 164C310 164 324 154 324 134M310 127H338M310 139H329"
      />
    </svg>
  </div>
</section>

<section class="workflow" aria-labelledby="workflow-heading">
  <div class="section-heading">
    <h2 id="workflow-heading">From conversation to contribution</h2>
  </div>
  <p class="section-intro">
    Good examples and unwanted behavior both help us understand how AI
    principles could be more useful. Here’s how to contribute.
  </p>
  <ol class="workflow-steps">
    <li>
      <h3>Sign in with an email code</h3>
      <p>
        <a href="/signin">Sign in or create an account</a> using a six-digit code
        sent to your inbox. Your email stays private.
      </p>
    </li>
    <li>
      <h3>Start in Chatbot</h3>
      <p>
        Type messages and explore the simulated bot’s predefined replies. Open
        Hints for topics to try. Some responses are intentionally flawed; this
        is a space to investigate them.
      </p>
    </li>
    <li>
      <h3>Capture a case</h3>
      <p>
        When you find behavior worth documenting, choose “Submit a case” in
        Chatbot. Every message so far is attached as a read-only conversation.
        Chats disappear when you leave, so capture the case first.
      </p>
    </li>
    <li>
      <h3>Explain what should change</h3>
      <p>
        Review the conversation, describe what matters, choose good / wanted or
        bad / unwanted behavior, propose a concrete improvement, and select one
        constitution. Submit to publish your case.
      </p>
    </li>
  </ol>
  <div class="tab-guide">
    <article>
      <h3>Home</h3>
      <p>
        Return here for the contribution guide and all 11 sample constitutions.
        Read the statements below to find the principle your example addresses.
      </p>
    </article>
    <article>
      <h3><a href="/chatbot">Chatbot</a></h3>
      <p>
        Explore responses in a temporary conversation and turn the entire
        exchange into a case. An account is required to chat and contribute.
      </p>
    </article>
    <article>
      <h3><a href="/cases">All Cases</a></h3>
      <p>
        Browse everyone’s published cases, including wanted and unwanted
        behavior. Search descriptions and proposals, filter by constitution,
        change the sort order, or load more. Open a case to read its evidence
        and suggested improvement.
      </p>
    </article>
  </div>
  <p class="helper">
    Use Account → My Cases to find, edit, or delete your contributions. Anyone
    can read All Cases without signing in. Public authors are labeled Anonymous.
  </p>
</section>

<section class="principles" aria-labelledby="principles-heading">
  <div class="section-heading">
    <h2 id="principles-heading">The 11 constitutions</h2>
    <span class="pill sample">Sample content</span>
  </div>
  <p class="section-intro">
    These are sample statements pending replacement, not adopted policy.
  </p>
  <div class="constitution-grid">
    {#each data.constitutions as c}
      <article class="constitution-card">
        <h3>Constitution #{c.number}</h3>
        <p>{c.text}</p>
        <a href="/chatbot">Explore in Chatbot</a>
      </article>
    {/each}
  </div>
</section>

<p class="project-note">
  This version collects cases, proposed changes, votes, and anonymous
  discussions. Formal review and model training are planned for later.
</p>
