// ============================================================
// CONNECTAPP V2
// Main Application
// Supabase + Social Feed + Search + Chat
// ============================================================


const { createClient } = window.supabase;


const supabaseClient = createClient(
    window.SUPABASE_URL,
    window.SUPABASE_ANON_KEY
);


// ============================================================
// GLOBAL STATE
// ============================================================

let currentUser = null;

let authMode = "login";

let realtimeChannel = null;

let activeChatUserId = null;

let activeChatUserName = null;


// ============================================================
// SHORTCUT
// ============================================================

const $ = (id) =>
    document.getElementById(id);


function show(element) {

    if (element) {

        element.classList.remove("hidden");

    }

}


function hide(element) {

    if (element) {

        element.classList.add("hidden");

    }

}


function setMessage(
    id,
    text,
    success = false
) {

    const element = $(id);

    if (!element) {

        return;

    }


    element.textContent =
        text || "";


    element.className =
        success
            ? "message ok"
            : "message error";

}


// ============================================================
// AUTH MODE
// ============================================================

function setAuthMode(mode) {

    authMode = mode;


    $("loginTab")
        ?.classList
        .toggle(
            "active",
            mode === "login"
        );


    $("registerTab")
        ?.classList
        .toggle(
            "active",
            mode === "register"
        );


    $("authSubmit").textContent =
        mode === "login"
            ? "Login"
            : "Register";


    $("name")
        ?.classList
        .toggle(
            "hidden",
            mode === "login"
        );


    $("authMessage").textContent = "";

}


$("loginTab").onclick = () => {

    setAuthMode("login");

};


$("registerTab").onclick = () => {

    setAuthMode("register");

};


// ============================================================
// REGISTER / LOGIN
// ============================================================

$("authForm").addEventListener(
    "submit",
    async (event) => {

        event.preventDefault();


        const email =
            $("email")
                .value
                .trim();


        const password =
            $("password")
                .value;


        const name =
            $("name")
                .value
                .trim();


        setMessage(
            "authMessage",
            ""
        );


        try {

            // ==================================================
            // LOGIN
            // ==================================================

            if (authMode === "login") {

                const {
                    error
                } =
                    await supabaseClient
                        .auth
                        .signInWithPassword({

                            email,

                            password

                        });


                if (error) {

                    throw error;

                }

            }


            // ==================================================
            // REGISTER
            // ==================================================

            else {

                const {
                    data,
                    error
                } =
                    await supabaseClient
                        .auth
                        .signUp({

                            email,

                            password,

                            options: {

                                data: {

                                    name

                                },

                                emailRedirectTo:
                                    window.location.origin + "/"

                            }

                        });


                if (error) {

                    throw error;

                }


                if (!data.session) {

                    setMessage(
                        "authMessage",
                        "Registration successful. Check your email and confirm your account.",
                        true
                    );

                } else {

                    setMessage(
                        "authMessage",
                        "Registration successful.",
                        true
                    );

                }

            }


        } catch (error) {

            console.error(
                "Authentication error:",
                error
            );


            setMessage(
                "authMessage",
                error.message ||
                "Authentication failed."
            );

        }

    }
);


// ============================================================
// LOGOUT
// ============================================================

$("logoutBtn").onclick =
    async () => {

        const {
            error
        } =
            await supabaseClient
                .auth
                .signOut();


        if (error) {

            alert(
                error.message
            );

        }

    };


// ============================================================
// PROFILE
// ============================================================

async function loadProfile() {

    if (!currentUser) {

        return;

    }


    const {
        data,
        error
    } =
        await supabaseClient
            .from("profiles")
            .select(
                "name,bio,avatar_url"
            )
            .eq(
                "id",
                currentUser.id
            )
            .maybeSingle();


    if (error) {

        setMessage(
            "profileMessage",
            error.message
        );

        return;

    }


    const profileName =
        data?.name ||
        currentUser.user_metadata?.name ||
        "";


    $("profileName").value =
        profileName;


    $("bio").value =
        data?.bio || "";


    $("welcome").textContent =
        `Welcome, ${
            profileName ||
            currentUser.email
        }`;

}


// ============================================================
// SAVE PROFILE
// ============================================================

$("profileForm").addEventListener(
    "submit",
    async (event) => {

        event.preventDefault();


        if (!currentUser) {

            return;

        }


        const name =
            $("profileName")
                .value
                .trim();


        const bio =
            $("bio")
                .value
                .trim();


        if (!name) {

            setMessage(
                "profileMessage",
                "Name is required."
            );

            return;

        }


        const {
            error
        } =
            await supabaseClient
                .from("profiles")
                .upsert({

                    id:
                        currentUser.id,

                    name,

                    bio

                });


        if (error) {

            setMessage(
                "profileMessage",
                error.message
            );

        } else {

            setMessage(
                "profileMessage",
                "Profile saved successfully.",
                true
            );


            await loadProfile();

        }

    }
);


// ============================================================
// IMAGE UPLOAD
// ============================================================

async function uploadPostImage(file) {

    if (!currentUser) {

        throw new Error(
            "You must be logged in."
        );

    }


    if (!file) {

        return null;

    }


    const allowedTypes = [

        "image/jpeg",

        "image/png",

        "image/webp",

        "image/gif"

    ];


    if (
        !allowedTypes
            .includes(file.type)
    ) {

        throw new Error(
            "Only JPG, PNG, WEBP or GIF images are allowed."
        );

    }


    const maxSize =
        5 * 1024 * 1024;


    if (file.size > maxSize) {

        throw new Error(
            "Image must be 5 MB or smaller."
        );

    }


    const extension =
        file.name
            .split(".")
            .pop()
            .toLowerCase();


    const path =
        `${currentUser.id}/${crypto.randomUUID()}.${extension}`;


    const {
        error
    } =
        await supabaseClient
            .storage
            .from("post-images")
            .upload(
                path,
                file,
                {

                    contentType:
                        file.type,

                    upsert:
                        false

                }
            );


    if (error) {

        throw error;

    }


    return path;

}


// ============================================================
// CREATE POST
// ============================================================

$("postForm").addEventListener(
    "submit",
    async (event) => {

        event.preventDefault();


        if (!currentUser) {

            return;

        }


        try {

            const content =
                $("postText")
                    .value
                    .trim();


            if (!content) {

                throw new Error(
                    "Post cannot be empty."
                );

            }


            const file =
                $("postImage")
                    .files[0];


            let imagePath = null;


            if (file) {

                imagePath =
                    await uploadPostImage(
                        file
                    );

            }


            const {
                error
            } =
                await supabaseClient
                    .from("posts")
                    .insert({

                        user_id:
                            currentUser.id,

                        content,

                        image_url:
                            imagePath

                    });


            if (error) {

                throw error;

            }


            $("postForm").reset();


            setMessage(
                "postMessage",
                "Post published successfully.",
                true
            );


            await loadPosts();


        } catch (error) {

            setMessage(
                "postMessage",
                error.message ||
                "Could not publish post."
            );

        }

    }
);


// ============================================================
// SIGNED IMAGE URL
// ============================================================

async function getImageUrl(path) {

    if (!path) {

        return null;

    }


    const {
        data,
        error
    } =
        await supabaseClient
            .storage
            .from("post-images")
            .createSignedUrl(
                path,
                3600
            );


    if (error) {

        console.error(
            "Image URL error:",
            error
        );

        return null;

    }


    return data?.signedUrl || null;

}


// ============================================================
// LOAD POSTS
// ============================================================

async function loadPosts() {

    if (!currentUser) {

        return;

    }


    const postsElement =
        $("posts");


    if (!postsElement) {

        return;

    }


    const {
        data,
        error
    } =
        await supabaseClient
            .from("posts")
            .select(`
                id,
                user_id,
                content,
                image_url,
                created_at,
                profiles!posts_user_id_fkey(
                    name
                ),
                likes(
                    user_id
                ),
                comments(
                    id,
                    user_id,
                    content,
                    created_at,
                    profiles(
                        name
                    )
                )
            `)
            .order(
                "created_at",
                {
                    ascending:
                        false
                }
            )
            .limit(50);


    if (error) {

        postsElement.innerHTML =
            `<p class="error">
                ${escapeHtml(
                    error.message
                )}
            </p>`;

        return;

    }


    const posts =
        data || [];


    if (!posts.length) {

        postsElement.innerHTML =
            `<p class="muted">
                No posts yet.
            </p>`;

        return;

    }


    const postHtml =
        await Promise.all(

            posts.map(
                async (post) => {

                    const liked =
                        (post.likes || [])
                            .some(
                                like =>
                                    like.user_id ===
                                    currentUser.id
                            );


                    let imageHtml =
                        "";


                    if (
                        post.image_url
                    ) {

                        const imageUrl =
                            await getImageUrl(
                                post.image_url
                            );


                        if (imageUrl) {

                            imageHtml =
                                `<img
                                    src="${escapeAttr(
                                        imageUrl
                                    )}"
                                    alt="Post image"
                                    loading="lazy"
                                >`;

                        }

                    }


                    const comments =
                        (post.comments || [])
                            .map(
                                comment => {

                                    return `

                                        <div class="comment">

                                            <b>
                                                ${escapeHtml(
                                                    comment.profiles?.name ||
                                                    "User"
                                                )}
                                            </b>

                                            :
                                            ${escapeHtml(
                                                comment.content
                                            )}

                                        </div>

                                    `;

                                }
                            )
                            .join("");


                    return `

                        <article class="post">

                            <div>

                                <b>
                                    ${escapeHtml(
                                        post.profiles?.name ||
                                        "User"
                                    )}
                                </b>

                            </div>


                            <div class="muted small">

                                ${new Date(
                                    post.created_at
                                ).toLocaleString()}

                            </div>


                            <p>

                                ${escapeHtml(
                                    post.content
                                )}

                            </p>


                            ${imageHtml}


                            <div class="row">

                                <button
                                    type="button"
                                    onclick="toggleLike(
                                        '${post.id}',
                                        ${liked}
                                    )"
                                >

                                    ${
                                        liked
                                            ? "Unlike"
                                            : "Like"
                                    }

                                    (
                                    ${
                                        post.likes?.length ||
                                        0
                                    }
                                    )

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
                                    onclick="addComment(
                                        '${post.id}'
                                    )"
                                >

                                    Comment

                                </button>

                            </div>

                        </article>

                    `;

                }
            )

        );


    postsElement.innerHTML =
        postHtml.join("");

}


// ============================================================
// LIKE / UNLIKE
// ============================================================

window.toggleLike =
    async function (
        postId,
        liked
    ) {

        if (!currentUser) {

            return;

        }


        if (liked) {

            const {
                error
            } =
                await supabaseClient
                    .from("likes")
                    .delete()
                    .eq(
                        "post_id",
                        postId
                    )
                    .eq(
                        "user_id",
                        currentUser.id
                    );


            if (error) {

                alert(
                    error.message
                );

                return;

            }

        } else {

            const {
                error
            } =
                await supabaseClient
                    .from("likes")
                    .insert({

                        post_id:
                            postId,

                        user_id:
                            currentUser.id

                    });


            if (error) {

                alert(
                    error.message
                );

                return;

            }

        }


        await loadPosts();

    };


// ============================================================
// ADD COMMENT
// ============================================================

window.addComment =
    async function (
        postId
    ) {

        if (!currentUser) {

            return;

        }


        const input =
            $(`comment-${postId}`);


        const content =
            input
                ?.value
                .trim();


        if (!content) {

            return;

        }


        const {
            error
        } =
            await supabaseClient
                .from("comments")
                .insert({

                    post_id:
                        postId,

                    user_id:
                        currentUser.id,

                    content

                });


        if (error) {

            alert(
                error.message
            );

            return;

        }


        input.value = "";


        await loadPosts();

    };


// ============================================================
// USER SEARCH
// ============================================================

let searchTimer = null;


const userSearch =
    $("userSearch");


if (userSearch) {

    userSearch.addEventListener(
        "input",
        () => {

            clearTimeout(
                searchTimer
            );


            searchTimer =
                setTimeout(
                    searchUsers,
                    400
                );

        }
    );

}


async function searchUsers() {

    const query =
        userSearch
            ?.value
            .trim();


    const results =
        $("searchResults");


    if (!results) {

        return;

    }


    if (!query) {

        results.innerHTML =
            `<p class="muted">
                Search for people.
            </p>`;

        return;

    }


    if (!currentUser) {

        return;

    }


    const {
        data,
        error
    } =
        await supabaseClient
            .from("profiles")
            .select(
                "id,name,bio,avatar_url"
            )
            .ilike(
                "name",
                `%${query}%`
            )
            .neq(
                "id",
                currentUser.id
            )
            .limit(20);


    if (error) {

        results.innerHTML =
            `<p class="error">
                ${escapeHtml(
                    error.message
                )}
            </p>`;

        return;

    }


    if (!data?.length) {

        results.innerHTML =
            `<p class="muted">
                No users found.
            </p>`;

        return;

    }


    results.innerHTML =
        data
            .map(
                user => `

                    <div class="search-user">

                        <div>

                            <strong>
                                ${escapeHtml(
                                    user.name ||
                                    "User"
                                )}
                            </strong>


                            <p class="muted small">

                                ${escapeHtml(
                                    user.bio ||
                                    ""
                                )}

                            </p>

                        </div>


                        <button
                            type="button"
                            onclick="startChat(
                                '${user.id}',
                                '${escapeAttr(
                                    user.name ||
                                    "User"
                                )}'
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
// START CHAT FROM SEARCH
// ============================================================

window.startChat =
    async function (
        userId,
        userName
    ) {

        if (!currentUser) {

            return;

        }


        activeChatUserId =
            userId;


        activeChatUserName =
            userName ||
            "User";


        $("chatTitle").textContent =
            activeChatUserName;


        $("chatSubtitle").textContent =
            "Conversation";


        show(
            $("activeChat")
        );


        hide(
            $("conversationList")
        );


        await loadActiveChat();


        const messagesNav =
            document.querySelector(
                '[data-page="messages"]'
            );


        document
            .querySelectorAll(
                ".nav-item"
            )
            .forEach(
                item =>
                    item.classList.remove(
                        "active"
                    )
            );


        messagesNav
            ?.classList
            .add("active");


        $("activeChat")
            .scrollIntoView({
                behavior:
                    "smooth"
            });

    };


// ============================================================
// LOAD CONVERSATIONS
// ============================================================

async function loadConversations() {

    if (!currentUser) {

        return;

    }


    const container =
        $("conversationList");


    if (!container) {

        return;

    }


    const {
        data,
        error
    } =
        await supabaseClient
            .from("messages")
            .select(`
                id,
                sender_id,
                receiver_id,
                content,
                created_at
            `)
            .or(
                `sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`
            )
            .order(
                "created_at",
                {
                    ascending:
                        false
                }
            )
            .limit(100);


    if (error) {

        container.innerHTML =
            `<p class="error">
                ${escapeHtml(
                    error.message
                )}
            </p>`;

        return;

    }


    const messages =
        data || [];


    if (!messages.length) {

        container.innerHTML =
            `<p class="muted">
                No conversations yet.
                Search for a person to start chatting.
            </p>`;

        return;

    }


    // ========================================================
    // BUILD UNIQUE CONVERSATIONS
    // ========================================================

    const conversationMap =
        new Map();


    for (
        const message of messages
    ) {

        const otherUserId =
            message.sender_id ===
            currentUser.id
                ? message.receiver_id
                : message.sender_id;


        if (
            !otherUserId ||
            otherUserId ===
            currentUser.id
        ) {

            continue;

        }


        if (
            !conversationMap.has(
                otherUserId
            )
        ) {

            conversationMap.set(
                otherUserId,
                message
            );

        }

    }


    const otherUserIds =
        Array.from(
            conversationMap.keys()
        );


    if (!otherUserIds.length) {

        container.innerHTML =
            `<p class="muted">
                No conversations yet.
            </p>`;

        return;

    }


    // ========================================================
    // LOAD USER PROFILES
    // ========================================================

    const {
        data: profiles,
        error: profileError
    } =
        await supabaseClient
            .from("profiles")
            .select(
                "id,name,avatar_url"
            )
            .in(
                "id",
                otherUserIds
            );


    if (profileError) {

        container.innerHTML =
            `<p class="error">
                ${escapeHtml(
                    profileError.message
                )}
            </p>`;

        return;

    }


    const profileMap =
        new Map(
            (profiles || [])
                .map(
                    profile =>
                        [
                            profile.id,
                            profile
                        ]
                )
        );


    container.innerHTML =
        otherUserIds
            .map(
                userId => {

                    const lastMessage =
                        conversationMap.get(
                            userId
                        );


                    const profile =
                        profileMap.get(
                            userId
                        );


                    const name =
                        profile?.name ||
                        "User";


                    return `

                        <button
                            type="button"
                            class="conversation-item"
                            onclick="openConversation(
                                '${userId}',
                                '${escapeAttr(name)}'
                            )"
                        >

                            <div class="conversation-avatar">

                                ${
                                    profile?.avatar_url
                                        ? `
                                            <img
                                                src="${escapeAttr(
                                                    profile.avatar_url
                                                )}"
                                                alt=""
                                            >
                                        `
                                        : "👤"
                                }

                            </div>


                            <div class="conversation-content">

                                <strong>

                                    ${escapeHtml(
                                        name
                                    )}

                                </strong>


                                <p class="muted small">

                                    ${escapeHtml(
                                        lastMessage.content
                                    )}

                                </p>

                            </div>


                            <div class="conversation-time muted small">

                                ${formatTime(
                                    lastMessage.created_at
                                )}

                            </div>

                        </button>

                    `;

                }
            )
            .join("");

}


// ============================================================
// OPEN CONVERSATION
// ============================================================

window.openConversation =
    async function (
        userId,
        userName
    ) {

        activeChatUserId =
            userId;


        activeChatUserName =
            userName ||
            "User";


        $("chatTitle").textContent =
            activeChatUserName;


        $("chatSubtitle").textContent =
            "Conversation";


        hide(
            $("conversationList")
        );


        show(
            $("activeChat")
        );


        await loadActiveChat();

    };


// ============================================================
// LOAD ACTIVE CHAT
// ============================================================

async function loadActiveChat() {

    if (
        !currentUser ||
        !activeChatUserId
    ) {

        return;

    }


    const messagesElement =
        $("chatMessages");


    if (!messagesElement) {

        return;

    }


    messagesElement.innerHTML =
        `<p class="muted">
            Loading messages...
        </p>`;


    const {
        data,
        error
    } =
        await supabaseClient
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
            .order(
                "created_at",
                {
                    ascending:
                        true
                }
            );


    if (error) {

        messagesElement.innerHTML =
            `<p class="error">
                ${escapeHtml(
                    error.message
                )}
            </p>`;

        return;

    }


    const messages =
        data || [];


    if (!messages.length) {

        messagesElement.innerHTML =
            `<p class="muted">
                No messages yet. Say hello 👋
            </p>`;

        return;

    }


    messagesElement.innerHTML =
        messages
            .map(
                message => {

                    const mine =
                        message.sender_id ===
                        currentUser.id;


                    return `

                        <div
                            class="chat-message ${
                                mine
                                    ? "mine"
                                    : "theirs"
                            }"
                        >

                            <div class="chat-bubble">

                                ${escapeHtml(
                                    message.content
                                )}

                            </div>


                            <div class="muted small">

                                ${formatTime(
                                    message.created_at
                                )}

                            </div>

                        </div>

                    `;

                }
            )
            .join("");


    messagesElement.scrollTop =
        messagesElement.scrollHeight;

}


// ============================================================
// SEND MESSAGE
// ============================================================

$("chatForm").addEventListener(
    "submit",
    async (event) => {

        event.preventDefault();


        if (!currentUser) {

            return;

        }


        if (!activeChatUserId) {

            setMessage(
                "chatMessage",
                "Select a person first."
            );

            return;

        }


        const input =
            $("messageText");


        const content =
            input
                .value
                .trim();


        if (!content) {

            return;

        }


        const sendButton =
            $("chatForm")
                .querySelector(
                    "button"
                );


        if (sendButton) {

            sendButton.disabled =
                true;

        }


        try {

            const {
                error
            } =
                await supabaseClient
                    .from("messages")
                    .insert({

                        sender_id:
                            currentUser.id,

                        receiver_id:
                            activeChatUserId,

                        content

                    });


            if (error) {

                throw error;

            }


            input.value = "";


            setMessage(
                "chatMessage",
                "Message sent.",
                true
            );


            await loadActiveChat();


        } catch (error) {

            setMessage(
                "chatMessage",
                error.message ||
                "Could not send message."
            );

        } finally {

            if (sendButton) {

                sendButton.disabled =
                    false;

            }

        }

    }
);


// ============================================================
// BACK TO CONVERSATIONS
// ============================================================

$("backToConversations")
    .addEventListener(
        "click",
        async () => {

            activeChatUserId =
                null;


            activeChatUserName =
                null;


            $("chatTitle")
                .textContent =
                "Messages";


            $("chatSubtitle")
                .textContent =
                "Select a conversation";


            hide(
                $("activeChat")
            );


            show(
                $("conversationList")
            );


            setMessage(
                "chatMessage",
                ""
            );


            await loadConversations();

        }
    );


// ============================================================
// REALTIME
// ============================================================

function subscribeRealtime() {

    if (realtimeChannel) {

        supabaseClient
            .removeChannel(
                realtimeChannel
            );

    }


    realtimeChannel =
        supabaseClient
            .channel(
                `connectapp-live-${currentUser.id}`
            )


            // POSTS
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "posts"
                },
                () => {

                    loadPosts();

                }
            )


            // LIKES
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "likes"
                },
                () => {

                    loadPosts();

                }
            )


            // COMMENTS
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "comments"
                },
                () => {

                    loadPosts();

                }
            )


            // MESSAGES
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "messages"
                },
                payload => {

                    const message =
                        payload.new;


                    if (
                        message?.sender_id ===
                            currentUser.id ||
                        message?.receiver_id ===
                            currentUser.id
                    ) {

                        if (
                            activeChatUserId &&
                            (
                                (
                                    message.sender_id ===
                                    currentUser.id &&
                                    message.receiver_id ===
                                    activeChatUserId
                                )
                                ||
                                (
                                    message.sender_id ===
                                    activeChatUserId &&
                                    message.receiver_id ===
                                    currentUser.id
                                )
                            )
                        ) {

                            loadActiveChat();

                        }


                        loadConversations();

                    }

                }
            )


            .subscribe();

}


// ============================================================
// SESSION RENDER
// ============================================================

async function renderSession(
    session
) {

    currentUser =
        session?.user ||
        null;


    if (currentUser) {

        hide(
            $("authView")
        );


        show(
            $("homeView")
        );


        show(
            $("logoutBtn")
        );


        show(
            $("bottomNav")
        );


        await loadProfile();


        await loadPosts();


        await loadConversations();


        subscribeRealtime();


    } else {

        show(
            $("authView")
        );


        hide(
            $("homeView")
        );


        hide(
            $("searchView")
        );


        hide(
            $("logoutBtn")
        );


        hide(
            $("bottomNav")
        );


        activeChatUserId =
            null;


        activeChatUserName =
            null;


        if (realtimeChannel) {

            await supabaseClient
                .removeChannel(
                    realtimeChannel
                );


            realtimeChannel =
                null;

        }

    }

}


// ============================================================
// AUTH STATE
// ============================================================

supabaseClient
    .auth
    .onAuthStateChange(
        (_event, session) => {

            renderSession(
                session
            );

        }
    );


// ============================================================
// INITIAL SESSION
// ============================================================

(async function () {

    try {

        if (
            !window.SUPABASE_URL ||
            !window.SUPABASE_ANON_KEY
        ) {

            setMessage(
                "authMessage",
                "Please configure Supabase in config.js."
            );

            return;

        }


        const {
            data,
            error
        } =
            await supabaseClient
                .auth
                .getSession();


        if (error) {

            throw error;

        }


        await renderSession(
            data.session
        );


    } catch (error) {

        console.error(
            "Initialization error:",
            error
        );


        setMessage(
            "authMessage",
            error.message ||
            "Could not initialize application."
        );

    }

})();


// ============================================================
// MOBILE NAVIGATION
// ============================================================

const bottomNav =
    $("bottomNav");


if (bottomNav) {

    bottomNav
        .querySelectorAll(
            ".nav-item"
        )
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    async () => {

                        const page =
                            button.dataset.page;


                        bottomNav
                            .querySelectorAll(
                                ".nav-item"
                            )
                            .forEach(
                                item => {

                                    item.classList
                                        .remove(
                                            "active"
                                        );

                                }
                            );


                        button.classList.add(
                            "active"
                        );


                        // ======================================
                        // HOME
                        // ======================================

                        if (
                            page === "home"
                        ) {

                            hide(
                                $("searchView")
                            );


                            show(
                                $("homeView")
                            );


                            await loadPosts();


                            window.scrollTo({
                                top:
                                    0,

                                behavior:
                                    "smooth"

                            });

                        }


                        // ======================================
                        // SEARCH
                        // ======================================

                        else if (
                            page === "search"
                        ) {

                            show(
                                $("searchView")
                            );


                            window.scrollTo({
                                top:
                                    $("searchView")
                                        .offsetTop,

                                behavior:
                                    "smooth"

                            });


                            $("userSearch")
                                ?.focus();

                        }


                        // ======================================
                        // CREATE
                        // ======================================

                        else if (
                            page === "create"
                        ) {

                            show(
                                $("homeView")
                            );


                            hide(
                                $("searchView")
                            );


                            $("postForm")
                                ?.scrollIntoView({

                                    behavior:
                                        "smooth",

                                    block:
                                        "start"

                                });

                        }


                        // ======================================
                        // MESSAGES
                        // ======================================

                        else if (
                            page === "messages"
                        ) {

                            show(
                                $("homeView")
                            );


                            hide(
                                $("searchView")
                            );


                            const chatCard =
                                $("chatForm")
                                    ?.closest(
                                        ".card"
                                    );


                            chatCard
                                ?.scrollIntoView({

                                    behavior:
                                        "smooth",

                                    block:
                                        "start"

                                });


                            if (
                                !activeChatUserId
                            ) {

                                await loadConversations();

                            }

                        }


                        // ======================================
                        // PROFILE
                        // ======================================

                        else if (
                            page === "profile"
                        ) {

                            show(
                                $("homeView")
                            );


                            hide(
                                $("searchView")
                            );


                            $("profileForm")
                                ?.scrollIntoView({

                                    behavior:
                                        "smooth",

                                    block:
                                        "start"

                                });

                        }

                    }
                );

            }
        );

}


// ============================================================
// HELPERS
// ============================================================

function formatTime(
    value
) {

    if (!value) {

        return "";

    }


    return new Date(
        value
    ).toLocaleString();

}


// ============================================================
// HTML ESCAPING
// ============================================================

function escapeHtml(
    value
) {

    return String(
        value ?? ""
    )
        .replace(
            /[&<>"']/g,
            character => ({

                "&":
                    "&amp;",

                "<":
                    "&lt;",

                ">":
                    "&gt;",

                '"':
                    "&quot;",

                "'":
                    "&#039;"

            })[character]
        );

}


function escapeAttr(
    value
) {

    return escapeHtml(
        value
    );

}
