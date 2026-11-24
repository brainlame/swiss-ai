<script lang="ts">
  import { onMount } from 'svelte';
  import { enhance } from '$app/forms';
  import Avatar from '#lib/components/Avatar.svelte';
  let { data, form } = $props();
  let pictureInput: HTMLInputElement;
  let ready = $state(false);
  onMount(() => {
    ready = true;
  });
  let saving = $state(false),
    deleting = $state(false),
    confirm = $state(false),
    dismissed = $state(false);
</script>

<svelte:head><title>Settings · AI Constitution</title></svelte:head>
<div class="settings-page">
  <h1>Settings</h1>
  <section class="settings-card">
    <h2>Your profile</h2>
    <p class="muted">
      Your name and picture appear on your issues and comments. Your email stays
      private.
    </p>
    <form
      method="POST"
      action="?/save"
      enctype="multipart/form-data"
      use:enhance={() => {
        saving = true;
        return async ({ update, result }) => {
          await update({ reset: false });
          if (result.type === 'success' && result.data?.success)
            pictureInput.value = '';
          saving = false;
        };
      }}
    >
      <div class="profile-identity">
        <Avatar src={data.profile.avatar_url} size={64} /><span
          >Profile picture</span
        >
      </div>
      <label for="first-name">First name</label><input
        id="first-name"
        name="first_name"
        autocomplete="given-name"
        required
        maxlength="80"
        value={form?.first_name ?? data.profile.first_name}
      />
      <label for="last-name">Last name</label><input
        id="last-name"
        name="last_name"
        autocomplete="family-name"
        required
        maxlength="80"
        value={form?.last_name ?? data.profile.last_name}
      />
      <label for="picture">Profile picture</label><input
        bind:this={pictureInput}
        id="picture"
        type="file"
        name="picture"
        accept="image/png,image/jpeg,image/webp"
      />
      <p class="helper">PNG, JPEG, or WebP. Up to 2 MB.</p>
      {#if data.profile.avatar_path}<label class="profile-remove"
          ><input type="checkbox" name="remove_picture" /> Use the default picture</label
        >{/if}
      {#if form?.message}<p
          class:success={form.success}
          class="notice"
          role="status"
        >
          {form.message}
        </p>{/if}
      <button class="button" disabled={!ready || saving || deleting}
        >{saving ? 'Saving…' : 'Save changes'}</button
      >
    </form>
  </section>
  <section class="settings-card danger-zone">
    <h2>Danger zone</h2>
    <p>
      Deleting your account is permanent. Your issues, comments, and attached
      evidence will remain, labeled “Deleted user” with the default picture.
      Your votes will be removed.
    </p>
    {#if !confirm}<button
        disabled={!ready}
        class="button danger"
        onclick={() => {
          confirm = true;
          dismissed = false;
        }}>Delete account</button
      >{/if}
    {#if confirm || (!dismissed && form?.deleteError)}<form
        method="POST"
        action="?/delete"
        use:enhance={() => {
          deleting = true;
          dismissed = false;
          return async ({ update }) => {
            await update();
            deleting = false;
          };
        }}
      >
        <p>
          <strong
            >This permanently deletes your account, profile, and profile
            pictures. You cannot sign in to this account again or manage its
            contributions.</strong
          >
        </p>
        <label for="confirm-delete">Type DELETE to confirm</label><input
          id="confirm-delete"
          name="confirmation"
          required
          pattern="DELETE"
          autocomplete="off"
        />
        {#if form?.deleteError}<p class="notice error" role="alert">
            {form.deleteError}
          </p>{/if}
        <div class="dialog-actions">
          <button
            class="button secondary"
            type="button"
            disabled={deleting}
            onclick={() => {
              confirm = false;
              dismissed = true;
            }}>Cancel</button
          ><button class="button danger" disabled={deleting || saving}
            >{deleting ? 'Deleting…' : 'Permanently delete account'}</button
          >
        </div>
      </form>{/if}
  </section>
</div>
