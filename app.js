// ============================================================
// CONNECTAPP — MODERN UI
// Preserves the existing Supabase data model and core features.
// ============================================================

const { createClient } = window.supabase;

const supabaseClient = createClient(
  window.SUPABASE_URL,
  window.SUPABASE_ANON_KEY
);

// ========================= STATE =========================

let currentUser = null;
let authMode = "login";
let realtimeChannel = null;

let activeChatUserId = null;
let activeChatUserName = null;

let searchTimer = null;
let unreadMessages = new Map();

let currentPage = "home";

// ========================= SHORTCUTS =========================

const $ = id => document.getElementById(id);

function show(element) {
  if (element) element.classList.remove("hidden");
}

function hide(element) {
  if (element) element.classList.add("hidden");
}

function setMessage(id, text, success = false) {
  const element = $(id);
  if (!element) return;

  element.textContent = text || "";
  element.className = text
    ? `message ${success ? "ok" : "error"}`
    : "message";
}

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    character =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      })[character]
  );
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function formatTime(value) {
  if (!value) return "";

  const date = new Date(value);
  const now = new Date();

  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit"
    });
  }

  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric"
  });
}

function initials(name) {
  const clean = String(name || "C").trim();
  if (!clean) return "C";

  return clean
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0])
    .join("")
    .toUpperCase();
}

// ========================= AUTH =========================

function setAuthMode(mode) {
  authMode = mode;

  $("loginTab")?.classList.toggle("active", mode === "login");
  $("registerTab")?.classList.toggle("active", mode === "register");

  $("authSubmit").textContent = mode === "login" ? "Login" : "Register";

  $("nameField")?.classList.toggle("hidden", mode === "login");
  $("name").required = mode === "register";

  setMessage("authMessage", "");
}

$("loginTab")?.addEventListener("click", () => setAuthMode("login"));
$("registerTab")?.addEventListener("click", () => setAuthMode("register"));

$("authForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  const email = $("email").value.trim();
  const password = $("password").value;
  const name = $("name").value.trim();

  setMessage("authMessage", "");

  try {
    if (authMode === "login") {
      const { error } = await supabaseClient.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;
    } else {
      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          data: { name },
          emailRedirectTo: window.location.origin + "/"
        }
      });

      if (error) throw error;

      if (!data.session) {
        setMessage(
          "authMessage",
          "Registration successful. Check your email and confirm your account.",
          true
        );
      } else {
        setMessage("authMessage", "Registration successful.", true);
      }
    }
  } catch (error) {
    console.error(error);
    setMessage("authMessage", error.message || "Authentication failed.");
  }
});

$("logoutBtn")?.addEventListener("click", async () => {
  const { error } = await supabaseClient.auth.signOut();
  if (error) alert(error.message);
});

// ========================= NAVIGATION =========================

const pageViews = {
  home: "homeView",
  search: "searchView",
  profile: "profileView",
  messages: "messagesView"
};

function activateNav(page) {
  document.querySelectorAll(".nav-item").forEach(item => {
    item.classList.toggle("active", item.dataset.page === page);
  });
}

function showPage(page) {
  currentPage = page;

  Object.entries(pageViews).forEach(([name, id]) => {
    const view = $(id);
    if (!view) return;
    view.classList.toggle("hidden", name !== page);
  });

  activateNav(page);

  if (page !== "messages") {
    activeChatUserId = null;
    activeChatUserName = null;
    resetChatLayout();
  }

  if (page === "home") {
    loadPosts();
  }

  if (page === "messages") {
    resetChatLayout();
    loadConversations();
  }

  if (page === "profile") {
    loadProfile();
  }

  if (page === "search") {
    setTimeout(() => $("userSearch")?.focus(), 80);
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openCreateModal() {
  if (!currentUser) return;

  $("createAuthorName").textContent =
    $("profileName")?.value.trim() ||
    currentUser.user_metadata?.name ||
    currentUser.email?.split("@")[0] ||
    "You";

  show($("createModal"));
  document.body.classList.add("modal-open");

  setMessage("postMessage", "");
  setTimeout(() => $("postText")?.focus(), 80);
}

function closeCreateModal() {
  hide($("createModal"));
  document.body.classList.remove("modal-open");
}

function setupNavigationListeners() {
  document.querySelectorAll(".nav-item[data-page]").forEach(button => {
    button.addEventListener("click", () => {
      const page = button.dataset.page;

      if (page === "create") {
        openCreateModal();
        return;
      }

      showPage(page);
    });
  });

  document.querySelectorAll("[data-page]:not(.nav-item)").forEach(button => {
    button.addEventListener("click", () => {
      const page = button.dataset.page;

      if (page === "create") {
        openCreateModal();
        return;
      }

      showPage(page);
    });
  });
}

setupNavigationListeners();

$("mobileBrandButton")?.addEventListener("click", () => showPage("home"));
$("mobileSearchButton")?.addEventListener("click", () => showPage("search"));
$("homeCreateButton")?.addEventListener("click", openCreateModal);
$("composerCard")?.addEventListener("click", openCreateModal);
$("closeCreateModal")?.addEventListener("click", closeCreateModal);

document.querySelectorAll("[data-close-create]").forEach(element => {
  element.addEventListener("click", closeCreateModal);
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !$("createModal")?.classList.contains("hidden")) {
    closeCreateModal();
  }
});

// ========================= PROFILE =========================

async function loadProfile() {
  if (!currentUser) return;

  const { data, error } = await supabaseClient
    .from("profiles")
    .select("name,bio,avatar_url")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (error) {
    setMessage("profileMessage", error.message);
    return;
  }

  const name = data?.name || currentUser.user_metadata?.name || "";
  const bio = data?.bio || "";

  if ($("profileName")) $("profileName").value = name;
  if ($("bio")) $("bio").value = bio;

  $("welcome").textContent = `Welcome, ${name || currentUser.email || "there"}`;
  $("profileDisplayName").textContent = name || "Your profile";
  $("profileDisplayBio").textContent =
    bio || "Tell people something about yourself.";
  $("profileAvatar").textContent = initials(name);
  $("createAuthorName").textContent = name || currentUser.email?.split("@")[0] || "You";
}

$("profileForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  if (!currentUser) return;

  const name = $("profileName").value.trim();
  const bio = $("bio").value.trim();

  if (!name) {
    setMessage("profileMessage", "Name is required.");
    return;
  }

  const { error } = await supabaseClient.from("profiles").upsert({
    id: currentUser.id,
    name,
    bio
  });

  if (error) {
    setMessage("profileMessage", error.message);
  } else {
    setMessage("profileMessage", "Profile saved successfully.", true);
    await loadProfile();
    await loadPosts();
  }
});

// ========================= IMAGE UPLOAD =========================

async function uploadPostImage(file) {
  if (!currentUser) throw new Error("You must be logged in.");
  if (!file) return null;

  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif"
  ];

  if (!allowedTypes.includes(file.type)) {
    throw new Error("Only JPG, PNG, WEBP or GIF images are allowed.");
  }

  const maxSize = 5 * 1024 * 1024;

  if (file.size > maxSize) {
    throw new Error("Image must be 5 MB or smaller.");
  }

  const extension = file.name.split(".").pop().toLowerCase();
  const path = `${currentUser.id}/${crypto.randomUUID()}.${extension}`;

  const { error } = await supabaseClient.storage
    .from("post-images")
    .upload(path, file, {
      contentType: file.type,
      upsert: false
    });

  if (error) throw error;

  return path;
}

$("postImage")?.addEventListener("change", () => {
  const file = $("postImage").files?.[0];
  const wrap = $("imagePreviewWrap");
  const image = $("imagePreview");

  if (!file) {
    hide(wrap);
    image.removeAttribute("src");
    return;
  }

  const url = URL.createObjectURL(file);
  image.src = url;
  show(wrap);
});

$("removeImagePreview")?.addEventListener("click", () => {
  $("postImage").value = "";
  $("imagePreview").removeAttribute("src");
  hide($("imagePreviewWrap"));
});

// ========================= CREATE POST =========================

$("postForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  if (!currentUser) return;

  const button = $("postForm").querySelector("button[type='submit']");

  try {
    const content = $("postText").value.trim();

    if (!content) {
      throw new Error("Post cannot be empty.");
    }

    const file = $("postImage").files?.[0];
    let imagePath = null;

    if (file) {
      imagePath = await uploadPostImage(file);
    }

    if (button) button.disabled = true;

    const { error } = await supabaseClient.from("posts").insert({
      user_id: currentUser.id,
      content,
      image_url: imagePath
    });

    if (error) throw error;

    $("postForm").reset();
    $("imagePreview").removeAttribute("src");
    hide($("imagePreviewWrap"));

    setMessage("postMessage", "Post published successfully.", true);

    closeCreateModal();
    showPage("home");
    await loadPosts();
  } catch (error) {
    console.error(error);
    setMessage("postMessage", error.message || "Could not publish post.");
  } finally {
    if (button) button.disabled = false;
  }
});

// ========================= IMAGE URL =========================

async function getImageUrl(path) {
  if (!path) return null;

  const { data, error } = await supabaseClient.storage
    .from("post-images")
    .createSignedUrl(path, 3600);

  if (error) return null;

  return data?.signedUrl || null;
}

// ========================= POSTS =========================

async function loadPosts() {
  if (!currentUser) return;

  const element = $("posts");
  if (!element) return;

  const { data, error } = await supabaseClient
    .from("posts")
    .select(`
      id,
      user_id,
      content,
      image_url,
      created_at,
      profiles!posts_user_id_fkey(name,avatar_url),
      likes(user_id),
      comments(
        id,
        user_id,
        content,
        created_at,
        profiles(name)
      )
    `)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    element.innerHTML =
      `<div class="empty-state"><strong>Could not load posts</strong><span class="message error">${escapeHtml(error.message)}</span></div>`;
    return;
  }

  const posts = data || [];

  if (!posts.length) {
    element.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">＋</div>
        <strong>No posts yet</strong>
        <span class="muted">Be the first person to share something.</span>
        <button type="button" class="primary-btn small-btn" onclick="openCreateModal()">Create a post</button>
      </div>
    `;
    return;
  }

  const html = await Promise.all(
    posts.map(async post => {
      const liked = (post.likes || []).some(
        like => like.user_id === currentUser.id
      );

      const isOwner = post.user_id === currentUser.id;
      const authorName = post.profiles?.name || "User";
      const authorAvatar = post.profiles?.avatar_url || "";

      let imageHtml = "";

      if (post.image_url) {
        const url = await getImageUrl(post.image_url);

        if (url) {
          imageHtml = `
            <img
              class="post-image"
              src="${escapeAttr(url)}"
              alt="Post image"
              loading="lazy"
            >
          `;
        }
      }

      const comments = (post.comments || [])
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
        .map(comment => `
          <div class="comment">
            <b>${escapeHtml(comment.profiles?.name || "User")}</b>
            ${escapeHtml(comment.content)}
          </div>
        `)
        .join("");

      const actionButtons = isOwner
        ? `
          <div class="post-owner-actions">
            <button
              type="button"
              class="secondary-btn small-btn"
              onclick="editPost('${post.id}')"
            >Edit</button>

            <button
              type="button"
              class="danger-btn small-btn"
              onclick="deletePost('${post.id}')"
            >Delete</button>
          </div>
        `
        : "";

      return `
        <article class="post" id="post-${post.id}">
          <div class="post-header">
            <div class="post-user">
              <div class="avatar">
                ${
                  authorAvatar
                    ? `<img src="${escapeAttr(authorAvatar)}" alt="">`
                    : escapeHtml(initials(authorName))
                }
              </div>

              <div class="post-user-info">
                <strong>${escapeHtml(authorName)}</strong>
                <span class="muted small">${formatTime(post.created_at)}</span>
              </div>
            </div>

            ${actionButtons}
          </div>

          <p class="post-content" id="post-content-${post.id}">
            ${escapeHtml(post.content)}
          </p>

          ${imageHtml}

          <div class="post-actions">
            <button
              type="button"
              class="action-btn ${liked ? "liked" : ""}"
              onclick="toggleLike('${post.id}', ${liked})"
              aria-label="${liked ? "Unlike" : "Like"} post"
            >
              <span>${liked ? "♥" : "♡"}</span>
              <span>${post.likes?.length || 0}</span>
            </button>

            <button
              type="button"
              class="action-btn"
              onclick="focusComment('${post.id}')"
            >
              <span>◌</span>
              <span>${post.comments?.length || 0}</span>
            </button>
          </div>

          ${
            post.likes?.length
              ? `<div class="post-likes">${post.likes.length} ${post.likes.length === 1 ? "like" : "likes"}</div>`
              : ""
          }

          ${
            comments
              ? `<div class="comments">${comments}</div>`
              : ""
          }

          <form class="comment-form" onsubmit="addComment(event, '${post.id}')">
            <input
              id="comment-${post.id}"
              maxlength="500"
              placeholder="Add a comment..."
              autocomplete="off"
            >
            <button type="submit" class="primary-btn small-btn">Send</button>
          </form>
        </article>
      `;
    })
  );

  element.innerHTML = html.join("");
}

window.openCreateModal = openCreateModal;

window.focusComment = function(postId) {
  const input = $(`comment-${postId}`);
  input?.focus();
};

window.editPost = async function(postId) {
  if (!currentUser) return;

  const contentElement = $(`post-content-${postId}`);
  if (!contentElement) return;

  const currentContent = contentElement.textContent.trim();
  const newContent = prompt("Edit your post:", currentContent);

  if (newContent === null) return;

  const trimmed = newContent.trim();

  if (!trimmed) {
    alert("Post content cannot be empty.");
    return;
  }

  const { error } = await supabaseClient
    .from("posts")
    .update({ content: trimmed })
    .eq("id", postId)
    .eq("user_id", currentUser.id);

  if (error) {
    alert(error.message);
    return;
  }

  await loadPosts();
};

window.deletePost = async function(postId) {
  if (!currentUser) return;

  if (!confirm("Are you sure you want to delete this post?")) return;

  const { error } = await supabaseClient
    .from("posts")
    .delete()
    .eq("id", postId)
    .eq("user_id", currentUser.id);

  if (error) {
    alert(error.message);
    return;
  }

  await loadPosts();
};

window.toggleLike = async function(postId, liked) {
  if (!currentUser) return;

  let result;

  if (liked) {
    result = await supabaseClient
      .from("likes")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", currentUser.id);
  } else {
    result = await supabaseClient
      .from("likes")
      .insert({
        post_id: postId,
        user_id: currentUser.id
      });
  }

  if (result.error) {
    alert(result.error.message);
    return;
  }

  await loadPosts();
};

window.addComment = async function(event, postId) {
  event.preventDefault();

  if (!currentUser) return;

  const input = $(`comment-${postId}`);
  const content = input?.value.trim();

  if (!content) return;

  const { error } = await supabaseClient.from("comments").insert({
    post_id: postId,
    user_id: currentUser.id,
    content
  });

  if (error) {
    alert(error.message);
    return;
  }

  input.value = "";
  await loadPosts();
};

// ========================= SEARCH =========================

$("userSearch")?.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(searchUsers, 350);
});

async function searchUsers() {
  const query = $("userSearch")?.value.trim();
  const results = $("searchResults");

  if (!results) return;

  if (!query) {
    results.innerHTML = `
      <div class="empty-state compact">
        <div class="empty-icon">⌕</div>
        <strong>Find someone</strong>
        <span class="muted">Start typing a name to search.</span>
      </div>
    `;
    return;
  }

  if (!currentUser) return;

  results.innerHTML = `
    <div class="loading-state compact">
      <div class="spinner"></div>
      <span>Searching...</span>
    </div>
  `;

  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id,name,bio,avatar_url")
    .ilike("name", `%${query}%`)
    .neq("id", currentUser.id)
    .limit(20);

  if (error) {
    results.innerHTML =
      `<div class="empty-state compact"><span class="message error">${escapeHtml(error.message)}</span></div>`;
    return;
  }

  if (!data?.length) {
    results.innerHTML = `
      <div class="empty-state compact">
        <div class="empty-icon">⌕</div>
        <strong>No people found</strong>
        <span class="muted">Try another name.</span>
      </div>
    `;
    return;
  }

  results.innerHTML = data.map(user => `
    <div class="search-user">
      <div class="search-user-main">
        <div class="avatar">
          ${
            user.avatar_url
              ? `<img src="${escapeAttr(user.avatar_url)}" alt="">`
              : escapeHtml(initials(user.name))
          }
        </div>

        <div class="search-user-copy">
          <strong>${escapeHtml(user.name || "User")}</strong>
          <p class="muted small">${escapeHtml(user.bio || "Connect on ConnectApp.")}</p>
        </div>
      </div>

      <button
        type="button"
        class="primary-btn small-btn"
        onclick="startChat('${user.id}', '${escapeAttr(user.name || "User")}')"
      >
        Message
      </button>
    </div>
  `).join("");
}

window.startChat = async function(userId, userName) {
  if (!currentUser) return;

  activeChatUserId = userId;
  activeChatUserName = userName || "User";

  showPage("messages");

  await loadConversations();
  await openConversation(userId, activeChatUserName, "");
};

// ========================= CHAT LAYOUT =========================

function resetChatLayout() {
  const layout = $("messagesLayout");
  if (!layout) return;

  layout.classList.remove("chat-active");

  show($("chatEmptyState"));
  hide($("activeChat"));

  $("chatTitle").textContent = "Messages";
  $("chatSubtitle").textContent = "Select a conversation";
  $("chatHeaderAvatar").textContent = "C";

  hide($("backToConversations"));
}

function showActiveChatLayout() {
  const layout = $("messagesLayout");
  if (!layout) return;

  layout.classList.add("chat-active");

  hide($("chatEmptyState"));
  show($("activeChat"));
  show($("backToConversations"));
}

function showConversationList() {
  activeChatUserId = null;
  activeChatUserName = null;
  resetChatLayout();
}

// ========================= CONVERSATIONS =========================

async function loadConversations() {
  if (!currentUser) return;

  const container = $("conversationList");
  if (!container) return;

  const { data, error } = await supabaseClient
    .from("messages")
    .select(`
      id,
      sender_id,
      receiver_id,
      content,
      created_at
    `)
    .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    container.innerHTML =
      `<div class="empty-state compact"><span class="message error">${escapeHtml(error.message)}</span></div>`;
    return;
  }

  const messages = data || [];
  const map = new Map();

  for (const message of messages) {
    const other =
      message.sender_id === currentUser.id
        ? message.receiver_id
        : message.sender_id;

    if (!other) continue;

    if (!map.has(other)) {
      map.set(other, message);
    }
  }

  const ids = [...map.keys()];

  if (!ids.length) {
    container.innerHTML = `
      <div class="empty-state compact">
        <div class="empty-icon">◌</div>
        <strong>No conversations yet</strong>
        <span class="muted">Search for someone to start chatting.</span>
      </div>
    `;
    updateMessageBadge();
    return;
  }

  const { data: profiles } = await supabaseClient
    .from("profiles")
    .select("id,name,avatar_url")
    .in("id", ids);

  const profileMap = new Map(
    (profiles || []).map(profile => [profile.id, profile])
  );

  container.innerHTML = ids.map(userId => {
    const last = map.get(userId);
    const profile = profileMap.get(userId);
    const name = profile?.name || "User";
    const unread = unreadMessages.get(userId) || 0;

    return `
      <button
        type="button"
        class="conversation-item ${unread ? "unread" : ""}"
        onclick="openConversation(
          '${userId}',
          '${escapeAttr(name)}',
          '${escapeAttr(profile?.avatar_url || "")}'
        )"
      >
        <div class="conversation-avatar">
          ${
            profile?.avatar_url
              ? `<img src="${escapeAttr(profile.avatar_url)}" alt="">`
              : escapeHtml(initials(name))
          }
        </div>

        <div class="conversation-content">
          <strong>${escapeHtml(name)}</strong>
          <p class="muted small">${escapeHtml(last.content || "")}</p>
        </div>

        <div class="conversation-time muted small">
          ${formatTime(last.created_at)}
          ${
            unread
              ? `<div class="unread-count">${unread > 99 ? "99+" : unread}</div>`
              : ""
          }
        </div>
      </button>
    `;
  }).join("");

  updateMessageBadge();
}

window.openConversation = async function(userId, userName, avatarUrl) {
  if (!currentUser) return;

  activeChatUserId = userId;
  activeChatUserName = userName || "User";

  unreadMessages.delete(userId);
  updateMessageBadge();

  $("chatTitle").textContent = activeChatUserName;
  $("chatSubtitle").textContent = "Private conversation";

  if (avatarUrl) {
    $("chatHeaderAvatar").innerHTML =
      `<img src="${escapeAttr(avatarUrl)}" alt="">`;
  } else {
    $("chatHeaderAvatar").textContent = initials(activeChatUserName);
  }

  showActiveChatLayout();

  await loadActiveChat();
  await loadConversations();

  requestAnimationFrame(() => {
    $("messageText")?.focus();
  });
};

// ========================= ACTIVE CHAT =========================

async function loadActiveChat() {
  if (!currentUser || !activeChatUserId) return;

  const element = $("chatMessages");
  if (!element) return;

  const wasNearBottom =
    element.scrollHeight - element.scrollTop - element.clientHeight < 100;

  const { data, error } = await supabaseClient
    .from("messages")
    .select(`
      id,
      sender_id,
      receiver_id,
      content,
      created_at
    `)
    .or(
      `and(sender_id.eq.${currentUser.id},receiver_id.eq.${activeChatUserId}),and(sender_id.eq.${activeChatUserId},receiver_id.eq.${currentUser.id})`
    )
    .order("created_at", { ascending: true });

  if (error) {
    element.innerHTML =
      `<div class="empty-state compact"><span class="message error">${escapeHtml(error.message)}</span></div>`;
    return;
  }

  const messages = data || [];

  if (!messages.length) {
    element.innerHTML = `
      <div class="empty-state compact">
        <div class="empty-icon">＋</div>
        <strong>Say hello 👋</strong>
        <span class="muted">No messages in this conversation yet.</span>
      </div>
    `;
    return;
  }

  element.innerHTML = messages.map(message => {
    const mine = message.sender_id === currentUser.id;

    return `
      <div class="chat-message ${mine ? "mine" : "theirs"}">
        <div class="sender-label">
          ${mine ? "You" : escapeHtml(activeChatUserName || "User")}
        </div>

        <div class="chat-bubble">
          ${escapeHtml(message.content)}
        </div>

        <div class="chat-time muted">
          ${formatTime(message.created_at)}
        </div>
      </div>
    `;
  }).join("");

  if (wasNearBottom || messages.length <= 2) {
    requestAnimationFrame(() => {
      element.scrollTop = element.scrollHeight;
    });
  }
}

// ========================= SEND MESSAGE =========================

$("chatForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  if (!currentUser) return;

  if (!activeChatUserId) {
    setMessage("chatMessage", "Select a person first.");
    return;
  }

  const input = $("messageText");
  const content = input.value.trim();

  if (!content) return;

  const button = $("chatForm").querySelector("button");

  if (button) button.disabled = true;

  try {
    const { error } = await supabaseClient.from("messages").insert({
      sender_id: currentUser.id,
      receiver_id: activeChatUserId,
      content
    });

    if (error) throw error;

    input.value = "";
    setMessage("chatMessage", "");

    await loadActiveChat();
    await loadConversations();

    input.focus();
  } catch (error) {
    setMessage(
      "chatMessage",
      error.message || "Could not send message."
    );
  } finally {
    if (button) button.disabled = false;
  }
});

$("messageText")?.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    $("chatForm")?.requestSubmit();
  }
});

$("backToConversations")?.addEventListener("click", async () => {
  showConversationList();
  setMessage("chatMessage", "");
  await loadConversations();
});

// ========================= REALTIME =========================

function subscribeRealtime() {
  if (!currentUser) return;

  if (realtimeChannel) {
    supabaseClient.removeChannel(realtimeChannel);
  }

  realtimeChannel = supabaseClient
    .channel(`connectapp-${currentUser.id}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "posts" },
      () => loadPosts()
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "likes" },
      () => loadPosts()
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "comments" },
      () => loadPosts()
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages" },
      payload => {
        const message = payload.new;
        if (!message) return;

        const isMine = message.sender_id === currentUser.id;
        const involvesMe =
          isMine || message.receiver_id === currentUser.id;

        if (!involvesMe) return;

        const otherUserId = isMine
          ? message.receiver_id
          : message.sender_id;

        const activeConversation =
          activeChatUserId === otherUserId;

        if (!isMine && !activeConversation) {
          unreadMessages.set(
            otherUserId,
            (unreadMessages.get(otherUserId) || 0) + 1
          );

          updateMessageBadge();
          notifyNewMessage(otherUserId);
        }

        if (activeConversation) {
          loadActiveChat();
        }

        loadConversations();
      }
    )
    .subscribe();
}

// ========================= MESSAGE BADGE =========================

function updateMessageBadge() {
  const badge = $("messageBadge");
  const desktopBadge = $("desktopMessageBadge");

  const total = [...unreadMessages.values()].reduce(
    (sum, value) => sum + value,
    0
  );

  const applyBadge = element => {
    if (!element) return;

    if (total <= 0) {
      hide(element);
      element.textContent = "0";
    } else {
      show(element);
      element.textContent = total > 99 ? "99+" : String(total);
    }
  };

  applyBadge(badge);
  applyBadge(desktopBadge);
}

// ========================= NOTIFICATIONS =========================

async function notifyNewMessage(userId) {
  if (!("Notification" in window)) return;

  if (Notification.permission === "default") {
    try {
      await Notification.requestPermission();
    } catch {
      return;
    }
  }

  if (Notification.permission !== "granted") return;

  try {
    const { data } = await supabaseClient
      .from("profiles")
      .select("name")
      .eq("id", userId)
      .maybeSingle();

    const name = data?.name || "Someone";

    new Notification("New message", {
      body: `New message from ${name}`,
      tag: `connectapp-message-${userId}`
    });
  } catch {
    // Notification failure must never break chat.
  }
}

// ========================= SESSION =========================

async function renderSession(session) {
  currentUser = session?.user || null;

  if (currentUser) {
    hide($("authView"));
    show($("appContainer"));
    show($("bottomNav"));
    show($("logoutBtn"));

    await loadProfile();
    await loadPosts();
    await loadConversations();

    showPage("home");
    subscribeRealtime();
  } else {
    show($("authView"));
    hide($("appContainer"));
    hide($("bottomNav"));
    hide($("logoutBtn"));

    closeCreateModal();

    activeChatUserId = null;
    activeChatUserName = null;

    unreadMessages.clear();
    updateMessageBadge();

    if (realtimeChannel) {
      await supabaseClient.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
  }
}

// ========================= AUTH STATE =========================

supabaseClient.auth.onAuthStateChange((_event, session) => {
  renderSession(session);
});

// ========================= INITIALIZATION =========================

(async function() {
  try {
    if (
      !window.SUPABASE_URL ||
      !window.SUPABASE_ANON_KEY ||
      window.SUPABASE_URL.includes("YOUR_SUPABASE") ||
      window.SUPABASE_ANON_KEY.includes("YOUR_SUPABASE")
    ) {
      setMessage(
        "authMessage",
        "Please configure Supabase in config.js."
      );
      return;
    }

    const { data, error } = await supabaseClient.auth.getSession();

    if (error) throw error;

    await renderSession(data.session);
  } catch (error) {
    console.error("Initialization error:", error);

    setMessage(
      "authMessage",
      error.message || "Could not initialize application."
    );
  }
})();
