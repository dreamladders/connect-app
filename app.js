// ============================================================
// CONNECTAPP V4
// Supabase + Social Feed + Search + Private Chat
// ============================================================

const { createClient } = window.supabase;

const supabaseClient = createClient(
  window.SUPABASE_URL,
  window.SUPABASE_ANON_KEY
);

// ============================================================
// STATE
// ============================================================

let currentUser = null;
let authMode = "login";

let realtimeChannel = null;

let activeChatUserId = null;
let activeChatUserName = null;

let searchTimer = null;

let unreadMessages = new Map();

// ============================================================
// SHORTCUTS
// ============================================================

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
  element.className = success ? "message ok" : "message error";
}

// ============================================================
// AUTH
// ============================================================

function setAuthMode(mode) {
  authMode = mode;

  $("loginTab")?.classList.toggle("active", mode === "login");
  $("registerTab")?.classList.toggle("active", mode === "register");

  $("authSubmit").textContent = mode === "login" ? "Login" : "Register";

  $("name")?.classList.toggle("hidden", mode === "login");

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

// ============================================================
// LOGOUT
// ============================================================

$("logoutBtn")?.addEventListener("click", async () => {
  const { error } = await supabaseClient.auth.signOut();
  if (error) alert(error.message);
});

// ============================================================
// PROFILE
// ============================================================

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

  $("profileName").value = name;
  $("bio").value = data?.bio || "";
  $("welcome").textContent = `Welcome, ${name || currentUser.email}`;
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
  }
});

// ============================================================
// IMAGE UPLOAD
// ============================================================

async function uploadPostImage(file) {
  if (!currentUser) throw new Error("You must be logged in.");
  if (!file) return null;

  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
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

// ============================================================
// CREATE POST
// ============================================================

$("postForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  if (!currentUser) return;

  try {
    const content = $("postText").value.trim();
    if (!content) throw new Error("Post cannot be empty.");

    const file = $("postImage").files[0];
    let imagePath = null;

    if (file) {
      imagePath = await uploadPostImage(file);
    }

    const { error } = await supabaseClient.from("posts").insert({
      user_id: currentUser.id,
      content,
      image_url: imagePath
    });

    if (error) throw error;

    $("postForm").reset();
    setMessage("postMessage", "Post published successfully.", true);
    await loadPosts();
  } catch (error) {
    setMessage("postMessage", error.message || "Could not publish post.");
  }
});

// ============================================================
// IMAGE URL
// ============================================================

async function getImageUrl(path) {
  if (!path) return null;

  const { data, error } = await supabaseClient.storage
    .from("post-images")
    .createSignedUrl(path, 3600);

  if (error) return null;

  return data?.signedUrl || null;
}

// ============================================================
// LOAD POSTS
// ============================================================

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
      profiles!posts_user_id_fkey(name),
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
    element.innerHTML = `<p class="message error">${escapeHtml(error.message)}</p>`;
    return;
  }

  const posts = data || [];

  if (!posts.length) {
    element.innerHTML = `<p class="muted">No posts yet.</p>`;
    return;
  }

  const html = await Promise.all(
    posts.map(async post => {
      const liked = (post.likes || []).some(
        like => like.user_id === currentUser.id
      );

      const isOwner = post.user_id === currentUser.id;

      let imageHtml = "";
      if (post.image_url) {
        const url = await getImageUrl(post.image_url);
        if (url) {
          imageHtml = `<img src="${escapeAttr(url)}" alt="Post image" loading="lazy">`;
        }
      }

      const comments = (post.comments || [])
        .map(
          comment => `
            <div class="comment">
              <b>${escapeHtml(comment.profiles?.name || "User")}</b>:
              ${escapeHtml(comment.content)}
            </div>
          `
        )
        .join("");

      const actionButtons = isOwner
        ? `
          <div class="post-owner-actions">
            <button
              type="button"
              class="secondary-btn small-btn"
              onclick="editPost('${post.id}')"
            >
              Edit
            </button>
            <button
              type="button"
              class="danger-btn small-btn"
              onclick="deletePost('${post.id}')"
            >
              Delete
            </button>
          </div>
        `
        : "";

      return `
        <article class="post" id="post-${post.id}">

          <div class="post-header">
            <div>
              <b>${escapeHtml(post.profiles?.name || "User")}</b>
              <div class="muted small">${formatTime(post.created_at)}</div>
            </div>
            ${actionButtons}
          </div>

          <p id="post-content-${post.id}">${escapeHtml(post.content)}</p>

          ${imageHtml}

          <div class="row">
            <button
              type="button"
              class="secondary-btn small-btn"
              onclick="toggleLike('${post.id}', ${liked})"
            >
              ${liked ? "Unlike" : "Like"} (${post.likes?.length || 0})
            </button>
          </div>

          <div class="comments">
            ${comments}
          </div>

          <div class="row">
            <input
              id="comment-${post.id}"
              maxlength="500"
              placeholder="Write a comment..."
            >
            <button
              type="button"
              class="primary-btn small-btn"
              onclick="addComment('${post.id}')"
            >
              Comment
            </button>
          </div>

        </article>
      `;
    })
  );

  element.innerHTML = html.join("");
}

// ============================================================
// EDIT POST
// ============================================================

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

// ============================================================
// DELETE POST
// ============================================================

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

// ============================================================
// LIKE
// ============================================================

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

// ============================================================
// COMMENT
// ============================================================

window.addComment = async function(postId) {
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

// ============================================================
// SEARCH
// ============================================================

const userSearch = $("userSearch");

userSearch?.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(searchUsers, 400);
});

async function searchUsers() {
  const query = userSearch?.value.trim();
  const results = $("searchResults");

  if (!results) return;

  if (!query) {
    results.innerHTML = `<p class="muted">Search for people.</p>`;
    return;
  }

  if (!currentUser) return;

  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id,name,bio,avatar_url")
    .ilike("name", `%${query}%`)
    .neq("id", currentUser.id)
    .limit(20);

  if (error) {
    results.innerHTML = `<p class="message error">${escapeHtml(error.message)}</p>`;
    return;
  }

  if (!data?.length) {
    results.innerHTML = `<p class="muted">No users found.</p>`;
    return;
  }

  results.innerHTML = data
    .map(
      user => `
      <div class="search-user">
        <div>
          <strong>${escapeHtml(user.name || "User")}</strong>
          <p class="muted small">${escapeHtml(user.bio || "")}</p>
        </div>
        <button
          type="button"
          class="primary-btn small-btn"
          onclick="startChat(
            '${user.id}',
            '${escapeAttr(user.name || "User")}'
          )"
        >
          Message
        </button>
      </div>
    `
    )
    .join("");
}

// ============================================================
// START CHAT
// ============================================================

window.startChat = async function(userId, userName) {
  if (!currentUser) return;

  activeChatUserId = userId;
  activeChatUserName = userName || "User";

  showChatHeader();
  await loadActiveChat();
  activateNav("messages");

  $("messagesCard")?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
};

// ============================================================
// CHAT HEADER
// ============================================================

function showChatHeader() {
  $("chatTitle").textContent = activeChatUserName || "Messages";
  $("chatSubtitle").textContent = "Private conversation";

  show($("activeChat"));
  hide($("conversationList"));
  show($("backToConversations"));

  $("messageText")?.focus();
}

function showConversationList() {
  hide($("activeChat"));
  show($("conversationList"));
  hide($("backToConversations"));

  $("chatTitle").textContent = "Messages";
  $("chatSubtitle").textContent = "Select a conversation";
  $("chatHeaderAvatar").innerHTML = "👤";
}

// ============================================================
// LOAD CONVERSATIONS
// ============================================================

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
    container.innerHTML = `<p class="message error">${escapeHtml(error.message)}</p>`;
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
      <div class="empty-state">
        <p>No conversations yet.</p>
        <span class="muted small">
          Search for a person to start chatting.
        </span>
      </div>`;
    updateMessageBadge();
    return;
  }

  const { data: profiles } = await supabaseClient
    .from("profiles")
    .select("id,name,avatar_url")
    .in("id", ids);

  const profileMap = new Map((profiles || []).map(p => [p.id, p]));

  container.innerHTML = ids
    .map(userId => {
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
                : "👤"
            }
          </div>
          <div class="conversation-content">
            <strong>${escapeHtml(name)}</strong>
            <p class="muted small">${escapeHtml(last.content)}</p>
          </div>
          <div class="conversation-time muted small">
            ${formatTime(last.created_at)}
            ${
              unread
                ? `<div class="unread-count">${unread}</div>`
                : ""
            }
          </div>
        </button>
      `;
    })
    .join("");

  updateMessageBadge();
}

// ============================================================
// OPEN CONVERSATION
// ============================================================

window.openConversation = async function(userId, userName, avatarUrl) {
  activeChatUserId = userId;
  activeChatUserName = userName || "User";

  unreadMessages.delete(userId);
  updateMessageBadge();
  showChatHeader();

  if (avatarUrl) {
    $("chatHeaderAvatar").innerHTML = `<img src="${escapeAttr(avatarUrl)}" alt="">`;
  } else {
    $("chatHeaderAvatar").innerHTML = "👤";
  }

  await loadActiveChat();
  await loadConversations();
};

// ============================================================
// LOAD ACTIVE CHAT
// ============================================================

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
    element.innerHTML = `<p class="message error">${escapeHtml(error.message)}</p>`;
    return;
  }

  const messages = data || [];

  if (!messages.length) {
    element.innerHTML = `<p class="muted">No messages yet. Say hello 👋</p>`;
    return;
  }

  element.innerHTML = messages
    .map(message => {
      const mine = message.sender_id === currentUser.id;

      return `
        <div class="chat-message ${mine ? "mine" : "theirs"}">
          <div class="sender-label">
            ${mine ? "You" : escapeHtml(activeChatUserName || "User")}
          </div>
          <div class="chat-bubble">
            ${escapeHtml(message.content)}
          </div>
          <div class="chat-time muted small">
            ${formatTime(message.created_at)}
          </div>
        </div>
      `;
    })
    .join("");

  if (wasNearBottom) {
    requestAnimationFrame(() => {
      element.scrollTop = element.scrollHeight;
    });
  }
}

// ============================================================
// SEND MESSAGE
// ============================================================

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
    setMessage("chatMessage", error.message || "Could not send message.");
  } finally {
    if (button) button.disabled = false;
  }
});

// ============================================================
// ENTER TO SEND
// ============================================================

$("messageText")?.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    $("chatForm")?.requestSubmit();
  }
});

// ============================================================
// BACK
// ============================================================

$("backToConversations")?.addEventListener("click", async () => {
  activeChatUserId = null;
  activeChatUserName = null;

  showConversationList();
  setMessage("chatMessage", "");
  await loadConversations();
});

// ============================================================
// REALTIME
// ============================================================

function subscribeRealtime() {
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

        const activeConversation = activeChatUserId === otherUserId;

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

// ============================================================
// MESSAGE BADGE
// ============================================================

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

// ============================================================
// BROWSER NOTIFICATION
// ============================================================

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
    // Notification failure should never break chat.
  }
}

// ============================================================
// NAVIGATION
// ============================================================

function activateNav(page) {
  document.querySelectorAll(".nav-item").forEach(item => {
    item.classList.toggle("active", item.dataset.page === page);
  });
}

function setupNavigationListeners(parentContainer) {
  if (!parentContainer) return;

  parentContainer.querySelectorAll(".nav-item").forEach(button => {
    button.addEventListener("click", async () => {
      const page = button.dataset.page;
      activateNav(page);

      if (page === "home") {
        show($("homeView"));
        hide($("searchView"));
        window.scrollTo({ top: 0, behavior: "smooth" });
        await loadPosts();
      } else if (page === "search") {
        hide($("homeView"));
        show($("searchView"));
        window.scrollTo({ top: 0, behavior: "smooth" });
        $("userSearch")?.focus();
      } else if (page === "create") {
        show($("homeView"));
        hide($("searchView"));
        $("createCard")?.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      } else if (page === "messages") {
        show($("homeView"));
        hide($("searchView"));
        $("messagesCard")?.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
        if (!activeChatUserId) {
          await loadConversations();
        }
      } else if (page === "profile") {
        show($("homeView"));
        hide($("searchView"));
        $("profileCard")?.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      }
    });
  });
}

setupNavigationListeners($("bottomNav"));
setupNavigationListeners($("desktopSidebar"));

// ============================================================
// SESSION
// ============================================================

async function renderSession(session) {
  currentUser = session?.user || null;

  if (currentUser) {
    hide($("authView"));

    show($("appContainer"));
    show($("logoutBtn"));

    await loadProfile();
    await loadPosts();
    await loadConversations();

    subscribeRealtime();
  } else {
    show($("authView"));

    hide($("appContainer"));
    hide($("searchView"));
    hide($("logoutBtn"));

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

// ============================================================
// AUTH STATE
// ============================================================

supabaseClient.auth.onAuthStateChange((_event, session) => {
  renderSession(session);
});

// ============================================================
// INITIALIZATION
// ============================================================

(async function() {
  try {
    if (
      !window.SUPABASE_URL ||
      !window.SUPABASE_ANON_KEY ||
      window.SUPABASE_URL.includes("YOUR_SUPABASE") ||
      window.SUPABASE_ANON_KEY.includes("YOUR_SUPABASE")
    ) {
      setMessage("authMessage", "Please configure Supabase in config.js.");
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

// ============================================================
// HELPERS
// ============================================================

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
