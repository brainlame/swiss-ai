<script lang="ts">
  let { data } = $props();
</script>

<svelte:head>
  <title>Constitutions · AI Constitutions</title>
  <meta
    name="description"
    content="Read the sample AI constitutions and contribute chatbot examples with proposed improvements."
  />
</svelte:head>

<section class="hero">
  <div class="hero-content">
    <h1>Help shape the<br />principles behind AI.</h1>
    <p class="hero-copy">
      Read the proposed constitutions, share a real chatbot interaction, and
      suggest what should change.
    </p>
    <div class="hero-actions">
      <a class="button" href="/submit">Submit a Case</a>
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
        <a href={'/submit?constitution=' + c.number}>Propose an improvement</a>
      </article>
    {/each}
  </div>
</section>

<p class="project-note">
  This version collects cases and proposed changes. Community review and model
  training are planned for later.
</p>
