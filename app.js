const { createClient } = window.supabase;
const supabaseClient = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

let currentUser = null;
let authMode = "login";
let realtimeChannel = null;
let activeChatUserId = null;
let activeChatUserName = null;
let activeChatAvatar = "";
let searchTimer = null;
let unreadMessages = new Map();
let chatLoading = false;
let chatRequestSerial = 0;

const $ = id => document.getElementById(id);
const isMobile = () => window.matchMedia("(max-width: 768px)").matches;
function show(el){ if(el) el.classList.remove("hidden"); }
function hide(el){ if(el) el.classList.add("hidden"); }
function setMessage(id,text,success=false){const e=$(id);if(!e)return;e.textContent=text||"";e.className=`message ${success?"ok":"error"}`;}
function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]));}
function escapeAttr(v){return escapeHtml(v);}
function formatTime(value){if(!value)return "";const d=new Date(value),n=new Date();if(d.toDateString()===n.toDateString())return d.toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});return d.toLocaleDateString([],{month:"short",day:"numeric"});}
function avatarHtml(url,cls="avatar"){return url?`<img class="${cls}-image" src="${escapeAttr(url)}" alt="" loading="lazy">`:`<span>○</span>`;}

function activateNav(page){
  document.querySelectorAll("[data-page]").forEach(b=>b.classList.toggle("active",b.dataset.page===page));
}
function closeCreate(){hide($("createModal"));$("createModal")?.setAttribute("aria-hidden","true");}
function openCreate(){show($("createModal"));$("createModal")?.setAttribute("aria-hidden","false");setTimeout(()=>$("postText")?.focus(),80);}

function showView(page){
  ["homeView","searchView","profileView","messagesView"].forEach(id=>hide($(id)));
  if(page==="home"||page==="create") show($("homeView"));
  if(page==="search") show($("searchView"));
  if(page==="profile") show($("profileView"));
  if(page==="messages") show($("messagesView"));
  activateNav(page);
  if(page==="home") loadPosts();
  if(page==="search") setTimeout(()=>$("userSearch")?.focus(),80);
  if(page==="profile") loadProfile();
  if(page==="messages") loadConversations();
}

function navigate(page){
  if(page==="create"){openCreate();return;}
  if(page!=="messages" && isMobile() && activeChatUserId){activeChatUserId=null;activeChatUserName=null;activeChatAvatar="";}
  if(page!=="messages") showView(page); else showView("messages");
}
document.querySelectorAll("[data-page]").forEach(b=>b.addEventListener("click",()=>navigate(b.dataset.page)));
$("mobileSearchBtn")?.addEventListener("click",()=>navigate("search"));
$("messageSearchBtn")?.addEventListener("click",()=>navigate("search"));
$("desktopCreateBtn")?.addEventListener("click",openCreate);
$("composerOpenBtn")?.addEventListener("click",openCreate);
$("composerImageBtn")?.addEventListener("click",()=>{openCreate();setTimeout(()=>$("postImage")?.click(),100)});
$("closeCreateBtn")?.addEventListener("click",closeCreate);
document.querySelector("[data-close-create='true']")?.addEventListener("click",closeCreate);

$("loginTab")?.addEventListener("click",()=>setAuthMode("login"));
$("registerTab")?.addEventListener("click",()=>setAuthMode("register"));
function setAuthMode(mode){authMode=mode;$("loginTab")?.classList.toggle("active",mode==="login");$("registerTab")?.classList.toggle("active",mode==="register");$("authSubmit").textContent=mode==="login"?"Login":"Register";$("name")?.classList.toggle("hidden",mode==="login");setMessage("authMessage","");}
$("authForm")?.addEventListener("submit",async e=>{e.preventDefault();const email=$("email").value.trim(),password=$("password").value,name=$("name").value.trim();setMessage("authMessage","");try{if(authMode==="login"){const {error}=await supabaseClient.auth.signInWithPassword({email,password});if(error)throw error;}else{const {data,error}=await supabaseClient.auth.signUp({email,password,options:{data:{name},emailRedirectTo:window.location.origin+"/"}});if(error)throw error;if(!data.session)setMessage("authMessage","Registration successful. Check your email and confirm your account.",true);}}catch(err){setMessage("authMessage",err.message||"Authentication failed.");}});
async function logout(){const {error}=await supabaseClient.auth.signOut();if(error)alert(error.message)}
$("desktopLogoutBtn")?.addEventListener("click",logout);$("mobileLogoutBtn")?.addEventListener("click",logout);

async function loadProfile(){if(!currentUser)return;const {data,error}=await supabaseClient.from("profiles").select("name,bio,avatar_url").eq("id",currentUser.id).maybeSingle();if(error){setMessage("profileMessage",error.message);return}const name=data?.name||currentUser.user_metadata?.name||"";$("profileName").value=name;$("bio").value=data?.bio||"";$("welcome").textContent=`Welcome, ${name||currentUser.email}`;$("profileDisplayName").textContent=name||"Your name";$("profileEmail").textContent=currentUser.email||"";$("profileAvatar").innerHTML=avatarHtml(data?.avatar_url,"profile");$("composerAvatar").innerHTML=avatarHtml(data?.avatar_url,"composer");}
$("profileForm")?.addEventListener("submit",async e=>{e.preventDefault();if(!currentUser)return;const name=$("profileName").value.trim(),bio=$("bio").value.trim();if(!name){setMessage("profileMessage","Name is required.");return}const {error}=await supabaseClient.from("profiles").upsert({id:currentUser.id,name,bio});if(error)setMessage("profileMessage",error.message);else{setMessage("profileMessage","Profile saved successfully.",true);await loadProfile();}});

async function uploadPostImage(file){if(!currentUser)throw new Error("You must be logged in.");if(!file)return null;const allowed=["image/jpeg","image/png","image/webp","image/gif"];if(!allowed.includes(file.type))throw new Error("Only JPG, PNG, WEBP or GIF images are allowed.");if(file.size>5*1024*1024)throw new Error("Image must be 5 MB or smaller.");const ext=file.name.split(".").pop().toLowerCase(),path=`${currentUser.id}/${crypto.randomUUID()}.${ext}`;const {error}=await supabaseClient.storage.from("post-images").upload(path,file,{contentType:file.type,upsert:false});if(error)throw error;return path;}
async function getImageUrl(path){if(!path)return null;const {data,error}=await supabaseClient.storage.from("post-images").createSignedUrl(path,3600);return error?null:data?.signedUrl||null;}

$("postImage")?.addEventListener("change",()=>{const file=$("postImage").files[0],box=$("imagePreview");if(!file){hide(box);box.innerHTML="";return}const url=URL.createObjectURL(file);box.innerHTML=`<img src="${url}" alt="Preview">`;show(box);});
$("postForm")?.addEventListener("submit",async e=>{e.preventDefault();if(!currentUser)return;try{const content=$("postText").value.trim();if(!content)throw new Error("Post cannot be empty.");const file=$("postImage").files[0];const imagePath=file?await uploadPostImage(file):null;const {error}=await supabaseClient.from("posts").insert({user_id:currentUser.id,content,image_url:imagePath});if(error)throw error;$("postForm").reset();hide($("imagePreview"));$("imagePreview").innerHTML="";setMessage("postMessage","Post published successfully.",true);await loadPosts();setTimeout(closeCreate,500);}catch(err){setMessage("postMessage",err.message||"Could not publish post.");}});

async function loadPosts(){if(!currentUser)return;const el=$("posts");if(!el)return;const {data,error}=await supabaseClient.from("posts").select(`id,user_id,content,image_url,created_at,profiles!posts_user_id_fkey(name,avatar_url),likes(user_id),comments(id,user_id,content,created_at,profiles(name))`).order("created_at",{ascending:false}).limit(50);if(error){el.innerHTML=`<div class="message error">${escapeHtml(error.message)}</div>`;return}const posts=data||[];if(!posts.length){el.innerHTML='<div class="empty-state">No posts yet. Be the first to share something.</div>';return}const html=await Promise.all(posts.map(async post=>{const liked=(post.likes||[]).some(x=>x.user_id===currentUser.id),owner=post.user_id===currentUser.id;let image="";if(post.image_url){const u=await getImageUrl(post.image_url);if(u)image=`<img class="post-image" src="${escapeAttr(u)}" alt="Post image" loading="lazy">`;}const comments=(post.comments||[]).sort((a,b)=>new Date(a.created_at)-new Date(b.created_at)).slice(-4).map(c=>`<div class="comment"><strong>${escapeHtml(c.profiles?.name||"User")}</strong>${escapeHtml(c.content)}</div>`).join("");return `<article class="post-card" id="post-${post.id}"><header class="post-head"><div class="post-avatar">${avatarHtml(post.profiles?.avatar_url,"post")}</div><div class="post-meta"><strong>${escapeHtml(post.profiles?.name||"User")}</strong><span class="muted small">${formatTime(post.created_at)}</span></div>${owner?`<div class="post-owner-actions"><button class="mini-btn" onclick="editPost('${post.id}')">Edit</button><button class="mini-btn danger" onclick="deletePost('${post.id}')">Delete</button></div>`:""}</header><div class="post-body"><p id="post-content-${post.id}">${escapeHtml(post.content)}</p></div>${image}<div class="post-actions"><button class="action-btn ${liked?"liked":""}" onclick="toggleLike('${post.id}',${liked})">${liked?"♥":"♡"} ${post.likes?.length||0}</button><button class="action-btn" onclick="document.getElementById('comment-${post.id}')?.focus()">◯ ${post.comments?.length||0}</button><button class="action-btn" onclick="sharePost('${post.id}')">↗ Share</button></div>${comments?`<div class="post-comments">${comments}</div>`:""}<form class="comment-form" onsubmit="addComment('${post.id}');return false"><input id="comment-${post.id}" maxlength="500" placeholder="Add a comment..."><button type="submit">Send</button></form></article>`;}));el.innerHTML=html.join("");}
window.editPost=async id=>{const e=$(`post-content-${id}`);if(!e)return;const v=prompt("Edit your post:",e.textContent.trim());if(v===null)return;const content=v.trim();if(!content)return alert("Post content cannot be empty.");const {error}=await supabaseClient.from("posts").update({content}).eq("id",id).eq("user_id",currentUser.id);if(error)alert(error.message);else loadPosts()};
window.deletePost=async id=>{if(!confirm("Are you sure you want to delete this post?"))return;const {error}=await supabaseClient.from("posts").delete().eq("id",id).eq("user_id",currentUser.id);if(error)alert(error.message);else loadPosts()};
window.toggleLike=async(id,liked)=>{const result=liked?await supabaseClient.from("likes").delete().eq("post_id",id).eq("user_id",currentUser.id):await supabaseClient.from("likes").insert({post_id:id,user_id:currentUser.id});if(result.error)alert(result.error.message);else loadPosts()};
window.addComment=async id=>{const input=$(`comment-${id}`),content=input?.value.trim();if(!content)return;const {error}=await supabaseClient.from("comments").insert({post_id:id,user_id:currentUser.id,content});if(error)alert(error.message);else{input.value="";loadPosts()}};
window.sharePost=async id=>{const url=location.href.split("#")[0]+`#post-${id}`;try{if(navigator.share)await navigator.share({title:"ConnectApp post",url});else{await navigator.clipboard.writeText(url);alert("Post link copied.")}}catch{} };

const userSearch=$("userSearch");userSearch?.addEventListener("input",()=>{clearTimeout(searchTimer);searchTimer=setTimeout(searchUsers,350)});
async function searchUsers(){const q=userSearch?.value.trim(),results=$("searchResults");if(!results)return;if(!q){results.innerHTML='<div class="empty-state">Search for people.</div>';return}const {data,error}=await supabaseClient.from("profiles").select("id,name,bio,avatar_url").ilike("name",`%${q}%`).neq("id",currentUser.id).limit(20);if(error){results.innerHTML=`<div class="message error">${escapeHtml(error.message)}</div>`;return}if(!data?.length){results.innerHTML='<div class="empty-state">No people found.</div>';return}results.innerHTML=data.map(u=>`<div class="search-user"><div class="search-avatar">${avatarHtml(u.avatar_url,"search")}</div><div class="search-user-info"><strong>${escapeHtml(u.name||"User")}</strong><p class="muted small">${escapeHtml(u.bio||"")}</p></div><button class="primary-btn" type="button" onclick="startChat('${u.id}','${escapeAttr(u.name||"User")}','${escapeAttr(u.avatar_url||"")}')">Message</button></div>`).join("");}

window.startChat=async(userId,userName,avatarUrl="")=>{activeChatUserId=userId;activeChatUserName=userName||"User";activeChatAvatar=avatarUrl||"";showView("messages");await openConversation(userId,userName,avatarUrl);};
function renderChatHeader(){const a=$("chatHeaderAvatar");a.innerHTML=activeChatAvatar?`<img src="${escapeAttr(activeChatAvatar)}" alt="">`:"○";$("chatTitle").textContent=activeChatUserName||"Conversation";$("chatSubtitle").textContent="Private conversation";}
function showConversationList(){hide($("chatPanel"));show($("conversationPanel"));activeChatUserId=null;activeChatUserName=null;activeChatAvatar="";}
function showChatPanel(){hide($("conversationPanel"));show($("chatPanel"));renderChatHeader();}

async function loadConversations(){if(!currentUser)return;const c=$("conversationList");if(!c)return;const {data,error}=await supabaseClient.from("messages").select("id,sender_id,receiver_id,content,created_at").or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`).order("created_at",{ascending:false}).limit(200);if(error){c.innerHTML=`<div class="message error">${escapeHtml(error.message)}</div>`;return}const map=new Map();for(const m of data||[]){const other=m.sender_id===currentUser.id?m.receiver_id:m.sender_id;if(other&&!map.has(other))map.set(other,m)}const ids=[...map.keys()];if(!ids.length){c.innerHTML='<div class="empty-state"><strong>No conversations yet</strong><br><span class="small">Search for a person to start chatting.</span></div>';updateMessageBadge();return}const {data:profiles}=await supabaseClient.from("profiles").select("id,name,avatar_url").in("id",ids);const pm=new Map((profiles||[]).map(p=>[p.id,p]));c.innerHTML=ids.map(id=>{const last=map.get(id),p=pm.get(id),name=p?.name||"User",unread=unreadMessages.get(id)||0;return `<button class="conversation-item ${activeChatUserId===id?"active":""}" onclick="openConversation('${id}','${escapeAttr(name)}','${escapeAttr(p?.avatar_url||"")}')"><div class="conversation-avatar">${avatarHtml(p?.avatar_url,"conversation")}</div><div class="conversation-content"><strong>${escapeHtml(name)}</strong><p class="muted small">${escapeHtml(last.content)}</p></div><div class="conversation-time muted small">${formatTime(last.created_at)}${unread?`<div class="badge">${unread>99?"99+":unread}</div>`:""}</div></button>`}).join("");updateMessageBadge();}

window.openConversation=async(userId,userName,avatarUrl="")=>{activeChatUserId=userId;activeChatUserName=userName||"User";activeChatAvatar=avatarUrl||"";unreadMessages.delete(userId);updateMessageBadge();showChatPanel();await loadActiveChat(true);await loadConversations();};
function nearBottom(el){return el.scrollHeight-el.scrollTop-el.clientHeight<90}
async function loadActiveChat(forceBottom=false){if(!currentUser||!activeChatUserId||chatLoading)return;const serial=++chatRequestSerial,el=$("chatMessages");if(!el)return;const shouldStick=forceBottom||nearBottom(el);chatLoading=true;const {data,error}=await supabaseClient.from("messages").select("id,sender_id,receiver_id,content,created_at").or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${activeChatUserId}),and(sender_id.eq.${activeChatUserId},receiver_id.eq.${currentUser.id})`).order("created_at",{ascending:true});chatLoading=false;if(serial!==chatRequestSerial||activeChatUserId===null)return;if(error){el.innerHTML=`<div class="message error">${escapeHtml(error.message)}</div>`;return}const messages=data||[];if(!messages.length){el.innerHTML='<div class="empty-state">No messages yet.<br>Say hello 👋</div>';return}const previousScroll=el.scrollTop,previousHeight=el.scrollHeight;el.innerHTML=messages.map(m=>{const mine=m.sender_id===currentUser.id;return `<div class="chat-message ${mine?"mine":"theirs"}"><span class="sender-label">${mine?"You":escapeHtml(activeChatUserName||"User")}</span><div class="chat-bubble">${escapeHtml(m.content)}</div><span class="chat-time">${formatTime(m.created_at)}</span></div>`}).join("");requestAnimationFrame(()=>{if(shouldStick){el.scrollTop=el.scrollHeight}else{el.scrollTop=previousScroll+(el.scrollHeight-previousHeight)}});hide($("newMessageNotice"));}
$("chatMessages")?.addEventListener("scroll",()=>{if(nearBottom($("chatMessages")))hide($("newMessageNotice"))});$("newMessageNotice")?.addEventListener("click",()=>{$("chatMessages").scrollTo({top:$("chatMessages").scrollHeight,behavior:"smooth"});hide($("newMessageNotice"))});
$("chatForm")?.addEventListener("submit",async e=>{e.preventDefault();if(!currentUser||!activeChatUserId)return;const input=$("messageText"),content=input.value.trim();if(!content)return;const btn=e.currentTarget.querySelector("button");btn.disabled=true;try{const {error}=await supabaseClient.from("messages").insert({sender_id:currentUser.id,receiver_id:activeChatUserId,content});if(error)throw error;input.value="";await loadActiveChat(true);await loadConversations();input.focus()}catch(err){setMessage("chatMessage",err.message||"Could not send message.")}finally{btn.disabled=false}});
$("messageText")?.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();$("chatForm")?.requestSubmit()}});
$("backToConversations")?.addEventListener("click",()=>{showConversationList();loadConversations()});

function updateMessageBadge(){const total=[...unreadMessages.values()].reduce((a,b)=>a+b,0);["messageBadge","desktopMessageBadge"].forEach(id=>{const e=$(id);if(!e)return;if(total){show(e);e.textContent=total>99?"99+":String(total)}else hide(e)})}
async function notifyNewMessage(userId){if(!("Notification"in window))return;if(Notification.permission==="default"){try{await Notification.requestPermission()}catch{return}}if(Notification.permission!=="granted")return;try{const {data}=await supabaseClient.from("profiles").select("name").eq("id",userId).maybeSingle();new Notification("New message",{body:`New message from ${data?.name||"Someone"}`,tag:`connectapp-message-${userId}`})}catch{}}
function subscribeRealtime(){if(realtimeChannel)supabaseClient.removeChannel(realtimeChannel);realtimeChannel=supabaseClient.channel(`connectapp-${currentUser.id}`).on("postgres_changes",{event:"*",schema:"public",table:"posts"},()=>loadPosts()).on("postgres_changes",{event:"*",schema:"public",table:"likes"},()=>loadPosts()).on("postgres_changes",{event:"*",schema:"public",table:"comments"},()=>loadPosts()).on("postgres_changes",{event:"INSERT",schema:"public",table:"messages"},async payload=>{const m=payload.new;if(!m)return;const mine=m.sender_id===currentUser.id,involves=mine||m.receiver_id===currentUser.id;if(!involves)return;const other=mine?m.receiver_id:m.sender_id;if(activeChatUserId===other){const wasAtBottom=nearBottom($("chatMessages"));await loadActiveChat(wasAtBottom);if(!wasAtBottom&&!mine)show($("newMessageNotice"));}else if(!mine){unreadMessages.set(other,(unreadMessages.get(other)||0)+1);updateMessageBadge();notifyNewMessage(other)}loadConversations()}).subscribe();}

async function renderSession(session){currentUser=session?.user||null;if(currentUser){hide($("authView"));show($("appShell"));await loadProfile();showView("home");showConversationList();await loadConversations();subscribeRealtime()}else{show($("authView"));hide($("appShell"));closeCreate();activeChatUserId=null;unreadMessages.clear();if(realtimeChannel){await supabaseClient.removeChannel(realtimeChannel);realtimeChannel=null}}}
supabaseClient.auth.onAuthStateChange((_event,session)=>renderSession(session));
(async()=>{try{if(!window.SUPABASE_URL||!window.SUPABASE_ANON_KEY||window.SUPABASE_URL.includes("YOUR_SUPABASE")||window.SUPABASE_ANON_KEY.includes("YOUR_SUPABASE")){setMessage("authMessage","Please configure Supabase in config.js.");return}const {data,error}=await supabaseClient.auth.getSession();if(error)throw error;await renderSession(data.session)}catch(err){console.error(err);setMessage("authMessage",err.message||"Could not initialize application.")}})();
