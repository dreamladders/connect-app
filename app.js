// ============================================================
// CONNECTAPP V1
// Main Application
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


// ============================================================
// SHORTCUTS
// ============================================================

const $ = (id) => document.getElementById(id);

function show(element) {
    element.classList.remove("hidden");
}

function hide(element) {
    element.classList.add("hidden");
}

function setMessage(id, text, success = false) {

    const element = $(id);

    element.textContent = text;

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
        .classList
        .toggle(
            "active",
            mode === "login"
        );

    $("registerTab")
        .classList
        .toggle(
            "active",
            mode === "register"
        );


    $("authSubmit").textContent =
        mode === "login"
            ? "Login"
            : "Register";


    $("name")
        .classList
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


        try {

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

            } else {







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
                    "https://ancient-term-0459.dreamladdersservices.workers.dev/"

            }

        });








                








                
                


                if (error) {

                    throw error;

                }


                if (!data.session) {

                    setMessage(
                        "authMessage",
                        "Registration successful. Check your email to confirm your account.",
                        true
                    );

                }

            }

        } catch (error) {

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

            alert(error.message);

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
        `Welcome, ${profileName || currentUser.email}`;

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


        const {
            error
        } =
            await supabaseClient
                .from("profiles")
                .upsert({

                    id: currentUser.id,

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

                    upsert: false

                }
            );


    if (error) {

        throw error;

    }


    // Store the storage path, NOT a public URL.
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

        return null;

    }


    return data.signedUrl;

}


// ============================================================
// LOAD POSTS
// ============================================================

async function loadPosts() {

    if (!currentUser) {

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
                    ascending: false
                }
            )
            .limit(50);


    if (error) {

        $("posts").innerHTML =
            `<p class="error">
                ${escapeHtml(error.message)}
            </p>`;

        return;

    }


    const posts =
        data || [];


    if (!posts.length) {

        $("posts").innerHTML =
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


                    let imageHtml = "";


                    if (post.image_url) {

                        const imageUrl =
                            await getImageUrl(
                                post.image_url
                            );


                        if (imageUrl) {

                            imageHtml =
                                `<img
                                    src="${escapeAttr(imageUrl)}"
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

                                    ${liked
                                        ? "Unlike"
                                        : "Like"}

                                    (${post.likes?.length || 0})

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


    $("posts").innerHTML =
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
                .value
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
// LOAD MESSAGES
// ============================================================

async function loadMessages() {

    if (!currentUser) {

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
                    ascending: false
                }
            )
            .limit(50);


    if (error) {

        $("messages").innerHTML =
            `<p class="error">
                ${escapeHtml(
                    error.message
                )}
            </p>`;

        return;

    }


    $("messages").innerHTML =
        (data || [])
            .map(
                message => {

                    const sender =
                        message.sender_id ===
                        currentUser.id
                            ? "You"
                            : "Other";


                    return `

                        <div class="messageItem">

                            <b>
                                ${sender}:
                            </b>

                            ${escapeHtml(
                                message.content
                            )}

                            <span class="muted small">

                                ${new Date(
                                    message.created_at
                                ).toLocaleString()}

                            </span>

                        </div>

                    `;

                }
            )
            .join("");

}


// ============================================================
// SEND MESSAGE
// ============================================================

$("sendMessageBtn").onclick =
    async function () {

        if (!currentUser) {

            return;

        }


        const receiverId =
            $("recipientId")
                .value
                .trim();


        const content =
            $("messageText")
                .value
                .trim();


        if (!receiverId) {

            setMessage(
                "chatMessage",
                "Recipient UUID is required."
            );

            return;

        }


        if (!content) {

            setMessage(
                "chatMessage",
                "Message cannot be empty."
            );

            return;

        }


        const {
            error
        } =
            await supabaseClient
                .from("messages")
                .insert({

                    sender_id:
                        currentUser.id,

                    receiver_id:
                        receiverId,

                    content

                });


        if (error) {

            setMessage(
                "chatMessage",
                error.message
            );

            return;

        }


        $("messageText").value = "";


        setMessage(
            "chatMessage",
            "Message sent.",
            true
        );


        await loadMessages();

    };


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
                "connectapp-live"
            )


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


            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "messages"
                },
                () => {

                    loadMessages();

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
        session?.user || null;


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

        show($("bottomNav"));

        await loadProfile();

        await loadPosts();

        await loadMessages();

        subscribeRealtime();

    } else {

        show(
            $("authView")
        );


        hide(
            $("homeView")
        );


        hide(
            $("logoutBtn")
        );


        hide($("bottomNav"));

        

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
            !window.SUPABASE_ANON_KEY ||
            window.SUPABASE_URL.includes(
                "YOUR-PROJECT"
            ) ||
            window.SUPABASE_ANON_KEY.includes(
                "YOUR_SUPABASE"
            )
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

        setMessage(
            "authMessage",
            error.message ||
            "Could not initialize application."
        );

    }

})();


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

                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#039;"

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





// ============================================================
// MOBILE NAVIGATION
// ============================================================

const bottomNav = $("bottomNav");

if (bottomNav) {

    bottomNav
        .querySelectorAll(".nav-item")
        .forEach(button => {

            button.addEventListener(
                "click",
                async () => {

                    const page =
                        button.dataset.page;


                    // Active button
                    bottomNav
                        .querySelectorAll(".nav-item")
                        .forEach(item => {

                            item.classList.remove(
                                "active"
                            );

                        });


                    button.classList.add(
                        "active"
                    );


                    // Home
                    if (page === "home") {

                        await loadPosts();

                        window.scrollTo({
                            top: 0,
                            behavior: "smooth"
                        });

                    }


                    // Create
                    else if (
                        page === "create"
                    ) {

                        const postForm =
                            $("postForm");

                        if (postForm) {

                            postForm.scrollIntoView({
                                behavior: "smooth",
                                block: "start"
                            });

                        }

                    }


                    // Messages
                    else if (
                        page === "messages"
                    ) {

                        const messages =
                            $("messages");

                        if (messages) {

                            messages.scrollIntoView({
                                behavior: "smooth",
                                block: "start"
                            });

                            await loadMessages();

                        }

                    }


                    // Profile
                    else if (
                        page === "profile"
                    ) {

                        const profileForm =
                            $("profileForm");

                        if (profileForm) {

                            profileForm.scrollIntoView({
                                behavior: "smooth",
                                block: "start"
                            });

                        }

                    }


                    // Search
                    






                    else if (
    page === "search"
) {

    $("searchView")
        .classList
        .remove("hidden");

    $("searchView")
        .scrollIntoView({
            behavior: "smooth",
            block: "start"
        });

}




                    

                }
            );

        });

}






// ============================================================
// USER SEARCH
// ============================================================

let searchTimer = null;

const userSearch = $("userSearch");

if (userSearch) {

    userSearch.addEventListener(
        "input",
        () => {

            clearTimeout(searchTimer);

            searchTimer = setTimeout(
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
                                    user.bio || ""
                                )}

                            </p>

                        </div>


                        <button
                            type="button"
                            onclick="startChat(
                                '${user.id}'
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

window.startChat =
    function(userId) {

        $("recipientId").value =
            userId;


        $("messageText").focus();


        $("messages")
            .scrollIntoView({
                behavior: "smooth"
            });

    };

