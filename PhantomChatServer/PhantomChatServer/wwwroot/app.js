// Ασφαλής παραγωγή UUID συμβατή με HTTP / LAN IPs (Non-Secure Contexts)
function getSafeUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

let uuid = localStorage.getItem('phantom_uuid');
if (!uuid) {
    uuid = getSafeUUID();
    localStorage.setItem('phantom_uuid', uuid);
}

let nickname = localStorage.getItem('phantom_nickname');
if (!nickname) {
    // Χρήση setTimeout ώστε να μην μπλοκάρεται το prompt από τα Brave Shields / Mobile Popups
    nickname = "Anonymous_" + Math.floor(Math.random() * 1000);
    localStorage.setItem('phantom_nickname', nickname);
    setTimeout(() => {
        const userEntered = prompt("Welcome! Enter your Nickname:", nickname);
        if (userEntered && userEntered.trim() !== "") {
            nickname = userEntered.trim();
            localStorage.setItem('phantom_nickname', nickname);
            document.getElementById('user-status').innerHTML = `${nickname} <span>✎ Edit</span>`;
            if (typeof connection !== 'undefined') connection.invoke("UpdateNickname", uuid, nickname);
        }
    }, 500);
}

let rawGroups = JSON.parse(localStorage.getItem('phantom_groups')) || [];
let savedGroups = rawGroups.map(g => typeof g === 'string' ? { name: g, password: "" } : g);
localStorage.setItem('phantom_groups', JSON.stringify(savedGroups));

let userAliases = JSON.parse(localStorage.getItem('phantom_aliases')) || {};

let activeChannelId = 'Global';
let activeChannelIsDm = false;
let activeChannelTarget = 'Global';
let isCurrentGroupCreator = false;

// Sound profiles mapping
const soundProfiles = ["off", "classic", "ping", "tick", "scifi"];
let channelSounds = JSON.parse(localStorage.getItem('phantom_sounds')) || {};

// Synthesized Multi-Profile Web Audio Engine
function playNotificationSound(profile = "classic") {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const now = ctx.currentTime;

        if (profile === "classic" || profile === true) {
            const osc = ctx.createOscillator(); const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(587.33, now);
            osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.22);
            osc.start(now); osc.stop(now + 0.22);
        }
        else if (profile === "ping") {
            const osc = ctx.createOscillator(); const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(1318.51, now); // E6
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
            osc.start(now); osc.stop(now + 0.35);
        }
        else if (profile === "tick") {
            const osc = ctx.createOscillator(); const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(300, now);
            osc.frequency.exponentialRampToValueAtTime(100, now + 0.04);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.04);
            osc.start(now); osc.stop(now + 0.04);
        }
        else if (profile === "scifi") {
            const freqs = [523.25, 659.25, 783.99]; // C5, E5, G5 Arpeggio
            freqs.forEach((freq, idx) => {
                const osc = ctx.createOscillator(); const gain = ctx.createGain();
                osc.connect(gain); gain.connect(ctx.destination);
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, now + (idx * 0.06));
                gain.gain.setValueAtTime(0.08, now + (idx * 0.06));
                gain.gain.exponentialRampToValueAtTime(0.005, now + (idx * 0.06) + 0.08);
                osc.start(now + (idx * 0.06)); osc.stop(now + (idx * 0.06) + 0.08);
            });
        }
    } catch (e) { console.error("Audio error:", e); }
}

function updateSoundButtonUI(profile) {
    const soundBtn = document.getElementById("sound-btn");
    if (!profile || profile === "off" || profile === false) {
        soundBtn.classList.remove("active");
        soundBtn.innerText = "𔀨 Sound: OFF";
    } else {
        soundBtn.classList.add("active");
        const labels = { "classic": "🔔 Chime", "ping": "📡 Ping", "tick": "⏱️ Tick", "scifi": "✨ Sci-Fi" };
        soundBtn.innerText = labels[profile] || "🔔 Chime";
    }
}

let unreadCounts = {};
let groupMembersData = {};

// 1. Αλλαγή του δικού σου ονόματος
const userStatusEl = document.getElementById('user-status');
userStatusEl.innerHTML = `${nickname} <span style="font-size: 0.8em; opacity: 0.7;">✎</span>`;
userStatusEl.addEventListener('click', () => {
    const newName = prompt("Enter your new Nickname:", nickname);
    if (newName && newName.trim() !== "" && newName !== nickname) {
        nickname = newName.trim();
        localStorage.setItem('phantom_nickname', nickname);
        userStatusEl.innerHTML = `${nickname} <span>✎</span>`;
        connection.invoke("UpdateNickname", uuid, nickname);
    }
});

// Εμφάνιση ολόκληρου του UUID χωρίς περικοπή και χωρίς click-to-copy alert
document.getElementById('uuid-display').innerText = `Session ID: ${uuid}`;

// 2. Εύρεση του "Εμφανιζόμενου Ονόματος" (Alias ή Original)
function getDisplayName(targetUuid, originalName) {
    if (targetUuid === "SYSTEM" || targetUuid === uuid) return originalName;
    return userAliases[targetUuid] ? `${userAliases[targetUuid]} (${originalName})` : originalName;
}

// 3. Η κεντρική συνάρτηση για ορισμό Alias
function setAlias(targetUuid, originalName) {
    if (targetUuid === uuid || targetUuid === "SYSTEM") return;
    const currentAlias = userAliases[targetUuid] || "";
    const newAlias = prompt(`Set a local nickname for ${originalName}\n(Leave blank to reset to original):`, currentAlias);

    if (newAlias !== null) {
        if (newAlias.trim() === "") {
            delete userAliases[targetUuid];
        } else {
            userAliases[targetUuid] = newAlias.trim();
        }

        localStorage.setItem("phantom_aliases", JSON.stringify(userAliases));

        // Άμεση ανανέωση της οθόνης για να εφαρμοστεί παντού
        connection.invoke("RequestHistory", uuid, activeChannelTarget, activeChannelIsDm);
        if (activeChannelId !== "Global" && !activeChannelId.startsWith("DM_")) {
            renderGroupMembers(activeChannelId);
        }
        connection.invoke("UpdateActiveUsers"); // Επαναφόρτωση λίστας online χρηστών
    }
}

function stringToColor(str) {
    if (str === "SYSTEM") return "var(--border-line)";

    // The 10 calibrated Developer-Tier Colors
    const userColors = [
        "#2B6CB0", "#6B46C1", "#B83280",
        "#9C4221", "#285E61", "#0987A0",
        "#4C51BF", "#702459", "#5F6B21", "#975A16"
    ];
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return userColors[Math.abs(hash) % userColors.length];
}

function formatTime(unixMilliseconds) {
    if (!unixMilliseconds) return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const date = new Date(unixMilliseconds);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Ενεργοποίηση αυτόματης επανασύνδεσης (κάνει προσπάθειες στα 0, 2, 10, και 30 δευτερόλεπτα)
const connection = new signalR.HubConnectionBuilder()
    .withUrl("/chatHub")
    .withAutomaticReconnect()
    .build();

const connBanner = document.getElementById("connection-banner");

// Όταν χαθεί η σύνδεση και προσπαθεί να ξαναμπεί
connection.onreconnecting(error => {
    connBanner.innerText = "⚠️ Connection lost. Reconnecting to server...";
    connBanner.style.display = "block";
    connBanner.style.backgroundColor = "#D69E2E"; // Warning Mustard
    connBanner.style.color = "#000000"; // Dark text for contrast against mustard
    userStatusEl.innerText = "Reconnecting...";
});

// Όταν η σύνδεση επανέλθει επιτυχώς
connection.onreconnected(connectionId => {
    connBanner.style.display = "none";
    userStatusEl.innerHTML = `${nickname} <span>✎</span>`;

    // Ξανακάνουμε register τον χρήστη και μπαίνουμε στα groups που ήμασταν
    connection.invoke("RegisterConnection", uuid, nickname);
    savedGroups.forEach(g => attemptJoinGroup(g.name, g.password, false));
    connection.invoke("RequestHistory", uuid, activeChannelTarget, activeChannelIsDm);
});

// Όταν η σύνδεση χαθεί οριστικά (σταματήσουν οι προσπάθειες)
connection.onclose(error => {
    connBanner.innerText = "❌ Server offline. Connection completely lost. Please refresh page when server is back.";
    connBanner.style.display = "block";
    connBanner.style.backgroundColor = "#E53E3E"; // Critical Crimson
    connBanner.style.color = "#FFFFFF"; // White text for contrast against red
    userStatusEl.innerText = "Offline";
});

// Συναρτήσεις Edit / Delete δικών σου μηνυμάτων
function editMsg(msgId, oldContent) {
    const newContent = prompt("Edit your message:", oldContent);
    if (newContent !== null && newContent.trim() !== "" && newContent !== oldContent) {
        connection.invoke("EditMessage", msgId, uuid, newContent.trim(), activeChannelTarget, activeChannelIsDm);
    }
}

function deleteMsg(msgId) {
    if (confirm("Delete this specific message?")) {
        connection.invoke("DeleteSpecificMessage", msgId, uuid, activeChannelTarget, activeChannelIsDm);
    }
}

// --- ΝΕΟ: Ασφαλής μετατροπή κειμένου σε Links ---
function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, tag => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[tag]));
}

function linkify(escapedText) {
    // Upgraded RegEx: Catches http://, https://, AND www.
    const urlRegex = /(\b(?:https?:\/\/|www\.)[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;

    return escapedText.replace(urlRegex, function (url) {
        let href = url;
        // If the user only typed "www...", append "http://" for the actual clickable link
        if (!href.toLowerCase().startsWith('http')) {
            href = 'http://' + href;
        }
        return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="chat-link">${url}</a>`;
    });
}
// ------------------------------------------------

function appendMessage(msgId, senderUuid, senderNickname, content, unixTimestamp) {
    const msgDiv = document.createElement("div");

    if (senderUuid === "SYSTEM") {
        msgDiv.className = "message msg-system";
        msgDiv.innerText = content;
    } else {
        const isSelf = senderUuid === uuid;
        msgDiv.className = `message ${isSelf ? 'msg-self' : 'msg-other'}`;
        msgDiv.dataset.id = msgId;

        if (!isSelf) {
            // Ορισμός του χρώματος φόντου του Bubble μέσω CSS Variable
            const userColor = stringToColor(senderUuid);
            msgDiv.style.setProperty('--user-bg', userColor);

            const dispName = getDisplayName(senderUuid, senderNickname);
            msgDiv.innerHTML = `<div class="msg-sender" title="Click to set Alias" data-uuid="${senderUuid}" data-orig="${senderNickname}">${dispName}</div>`;
        } else {
            const controls = document.createElement("div");
            controls.className = "msg-controls";

            const editBtn = document.createElement("span");
            editBtn.innerText = "✎ Edit";
            editBtn.title = "Edit Message";
            editBtn.onclick = () => editMsg(msgId, content);

            const delBtn = document.createElement("span");
            delBtn.innerText = "🗑 Delete";
            delBtn.title = "Delete Message";
            delBtn.onclick = () => deleteMsg(msgId);

            controls.appendChild(editBtn);
            controls.appendChild(delBtn);
            msgDiv.appendChild(controls);
        }

        // --- ΝΕΟ: Ασφαλές parsing και εισαγωγή Links ---
        const safeText = escapeHTML(content);
        const linkedText = linkify(safeText);

        const contentSpan = document.createElement("span");
        contentSpan.innerHTML = linkedText;
        msgDiv.appendChild(contentSpan);
        // ------------------------------------------------

        const timeDiv = document.createElement("div");
        timeDiv.className = "msg-time";
        timeDiv.innerText = formatTime(unixTimestamp);
        msgDiv.appendChild(timeDiv);
    }

    const messagesContainer = document.getElementById("messages");
    messagesContainer.appendChild(msgDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}
// Αλλαγή Alias κάνοντας κλικ στο όνομα μέσα στο Chat
document.getElementById("messages").addEventListener("click", (e) => {
    if (e.target.classList.contains("msg-sender")) {
        setAlias(e.target.dataset.uuid, e.target.dataset.orig);
    }
});

function getOrCreateSidebarItem(id, name, isDm, target) {
    let li = document.querySelector(`li[data-id="${id}"]`);
    if (!li) {
        li = document.createElement("li");
        li.className = "channel-item";
        li.dataset.id = id;
        li.dataset.target = target;
        li.dataset.isdm = isDm;

        let innerHTML = `<span class="name">${name}</span><span class="badge" style="display: none;">0</span>`;
        if (!isDm && id !== "Global") innerHTML += `<span class="leave-btn" title="Leave Group">✖</span>`;
        li.innerHTML = innerHTML;

        li.addEventListener('click', (e) => {
            if (e.target.className === 'leave-btn') {
                leaveGroup(id, li);
                return;
            }
            switchChannel(id, name, target, isDm);
        });

        document.getElementById(isDm ? "dms-list" : "channels-list").appendChild(li);
    }
    return li;
}

function renderGroupMembers(id) {
    const membersDiv = document.getElementById("group-members");
    if (id === "Global" || id.startsWith("DM_")) {
        membersDiv.innerText = "";
        return;
    }
    const members = groupMembersData[id] || [];
    const names = members.map(m => m.uuid === uuid ? "You" : getDisplayName(m.uuid, m.nickname)).join(", ");
    membersDiv.innerText = members.length > 0 ? `Members: ${names}` : "";
}

function switchChannel(id, name, target, isDm) {
    document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
    const li = document.querySelector(`li[data-id="${id}"]`);
    if (li) {
        li.classList.add('active');
        const badge = li.querySelector('.badge');
        badge.style.display = 'none';
        badge.innerText = '0';
        unreadCounts[id] = 0;
    }

    activeChannelId = id;
    activeChannelTarget = target;
    activeChannelIsDm = isDm === "true" || isDm === true;

    document.getElementById("current-channel-name").innerText = name;
    renderGroupMembers(id);
    connection.invoke("RequestHistory", uuid, target, activeChannelIsDm);

    updateSoundButtonUI(channelSounds[id]);
}

function leaveGroup(groupName, liElement) {
    connection.invoke("LeaveGroup", groupName, uuid, nickname);
    if (liElement) liElement.remove();
    savedGroups = savedGroups.filter(g => g.name !== groupName);
    localStorage.setItem('phantom_groups', JSON.stringify(savedGroups));
    if (activeChannelId === groupName) {
        document.getElementById("group-settings-btn").style.display = "none";
        switchChannel("Global", "# Global", "Global", false);
    }
}

// ΝΕΑ EVENTS CREATOR
connection.on("GroupOwnershipStatus", (groupName, isCreator) => {
    if (activeChannelId === groupName) {
        isCurrentGroupCreator = isCreator;
        document.getElementById("group-settings-btn").style.display = isCreator ? "inline-block" : "none";
    }
});

connection.on("GroupDeleted", (groupName) => {
    const li = document.querySelector(`li[data-id="${groupName}"]`);
    if (li) leaveGroup(groupName, li);
    if (activeChannelId === groupName) {
        alert(`The group #${groupName} was deleted by its creator.`);
        document.getElementById("group-settings-btn").style.display = "none";
        switchChannel("Global", "# Global", "Global", false);
    }
});

document.getElementById("group-settings-btn").addEventListener("click", () => {
    if (!isCurrentGroupCreator) return;
    const action = prompt(`Settings for #${activeChannelTarget}:\n1. Change Password\n2. Delete Group\n\nEnter 1 or 2:`);
    if (action === "1") {
        const newPass = prompt("Enter new password (leave empty to remove password):");
        if (newPass !== null) connection.invoke("ChangeGroupPassword", activeChannelTarget, uuid, newPass);
    } else if (action === "2") {
        if (confirm(`CRITICAL: Are you sure you want to completely DELETE the group #${activeChannelTarget} and all its messages? This cannot be undone.`)) {
            connection.invoke("DeleteGroup", activeChannelTarget, uuid);
        }
    }
});

document.getElementById("wipe-btn").addEventListener("click", () => {
    if (confirm("Are you sure you want to WIPE all messages YOU sent in this channel?")) {
        connection.invoke("WipeMyHistory", uuid, activeChannelTarget, activeChannelIsDm);
    }
});

connection.on("ForceRefresh", (refreshTarget, isDm) => {
    if (activeChannelTarget === refreshTarget && activeChannelIsDm === isDm) {
        connection.invoke("RequestHistory", uuid, activeChannelTarget, activeChannelIsDm);
    }
});

connection.on("ReceiveHistory", (history) => {
    document.getElementById("messages").innerHTML = "";
    history.forEach(msg => {
        appendMessage(msg.id || msg.Id, msg.senderUuid, msg.senderNickname, msg.content, msg.unixTime || msg.UnixTime);
    });
});

connection.on("ReceiveMessage", (msgId, senderUuid, senderNickname, message, channel, dmTargetId, unixTimestamp) => {
    const isDm = channel === "DM";
    const messageContext = isDm ? (senderUuid === uuid ? dmTargetId : senderUuid) : channel;
    const messageContextId = isDm ? `DM_${messageContext}` : messageContext;

    const dispName = getDisplayName(senderUuid, senderNickname);
    const displayName = isDm ? `@ ${dispName}` : `# ${channel}`;

    const li = getOrCreateSidebarItem(messageContextId, displayName, isDm, messageContext);

    if (isDm) li.querySelector('.name').innerText = displayName;

    // Play the room's chosen sound profile when a new message arrives
    const roomProfile = channelSounds[messageContextId];
    if (senderUuid !== uuid && senderUuid !== "SYSTEM" && roomProfile && roomProfile !== "off") {
        playNotificationSound(roomProfile);
    }

    if (messageContextId === activeChannelId) {
        appendMessage(msgId, senderUuid, senderNickname, message, unixTimestamp);
    } else {
        if (senderUuid !== "SYSTEM") {
            unreadCounts[messageContextId] = (unreadCounts[messageContextId] || 0) + 1;
            const badge = li.querySelector('.badge');
            badge.innerText = unreadCounts[messageContextId];
            badge.style.display = 'inline';
        }
    }
});

connection.on("UpdateGroupMembers", (groupName, members) => {
    groupMembersData[groupName] = members;
    if (activeChannelId === groupName) renderGroupMembers(groupName);
});

// 4. Εδώ προσθέσαμε το κουμπί 🏷️ στους Online Χρήστες
connection.on("UpdateActiveUsers", (users) => {
    const userList = document.getElementById('online-users-list');
    userList.innerHTML = '';
    users.forEach(u => {
        if (u.uuid !== uuid) {
            const li = document.createElement("li");
            li.className = "channel-item";
            li.style.display = "flex";
            li.style.justifyContent = "space-between";
            li.style.alignItems = "center";

            const nameSpan = document.createElement("span");
            nameSpan.className = "name";
            nameSpan.style.flex = "1";
            nameSpan.innerHTML = getDisplayName(u.uuid, u.nickname);
            nameSpan.onclick = () => {
                const dmId = `DM_${u.uuid}`;
                const dispName = getDisplayName(u.uuid, u.nickname);
                getOrCreateSidebarItem(dmId, `@ ${dispName}`, true, u.uuid);
                switchChannel(dmId, `@ ${dispName}`, u.uuid, true);
            };

            const aliasBtn = document.createElement("span");
            aliasBtn.className = "alias-btn";
            aliasBtn.innerText = "✎ Alias";
            aliasBtn.title = "Set Nickname for this user";
            aliasBtn.style.cursor = "pointer";
            aliasBtn.onclick = (e) => {
                e.stopPropagation();
                setAlias(u.uuid, u.nickname);
            };

            li.appendChild(nameSpan);
            li.appendChild(aliasBtn);
            userList.appendChild(li);
        }
    });
});

async function attemptJoinGroup(groupName, password, isNew) {
    try {
        await connection.invoke("JoinGroupSecure", groupName, uuid, nickname, password, isNew);
        if (!savedGroups.find(g => g.name === groupName)) {
            savedGroups.push({ name: groupName, password: password });
            localStorage.setItem('phantom_groups', JSON.stringify(savedGroups));
        }
        getOrCreateSidebarItem(groupName, `# ${groupName}`, false, groupName);
        if (isNew) switchChannel(groupName, `# ${groupName}`, groupName, false);
    } catch (err) {
        if (err.toString().includes("INVALID_PASSWORD")) {
            const newPass = prompt(`Incorrect password for group #${groupName}. Please enter password:`);
            if (newPass !== null) attemptJoinGroup(groupName, newPass, isNew);
            else {
                savedGroups = savedGroups.filter(g => g.name !== groupName);
                localStorage.setItem('phantom_groups', JSON.stringify(savedGroups));
            }
        } else console.error(err);
    }
}

connection.start().then(() => {
    connection.invoke("RegisterConnection", uuid, nickname);
    savedGroups.forEach(g => attemptJoinGroup(g.name, g.password, false));

    document.querySelector('li[data-id="Global"]').addEventListener('click', () => {
        document.getElementById("group-settings-btn").style.display = "none";
        switchChannel("Global", "# Global", "Global", false);
    });

    connection.invoke("RequestHistory", uuid, "Global", false);
}).catch(err => console.error(err.toString()));

document.getElementById('sound-btn').addEventListener('click', () => {
    let current = channelSounds[activeChannelId] || "off";
    if (current === true) current = "classic"; // Backward compatibility

    let nextIdx = (soundProfiles.indexOf(current) + 1) % soundProfiles.length;
    let nextProfile = soundProfiles[nextIdx];

    channelSounds[activeChannelId] = nextProfile;
    localStorage.setItem('phantom_sounds', JSON.stringify(channelSounds));

    updateSoundButtonUI(nextProfile);
    if (nextProfile !== "off") playNotificationSound(nextProfile);
});

document.getElementById('add-group-btn').addEventListener('click', () => {
    const groupName = prompt("Enter Group Name to Create or Join (no spaces):");

    // Έλεγχος αν ο χρήστης πάτησε Cancel ή άφησε κενό
    if (groupName === null || groupName.trim() === "") return;

    const sanitizedName = groupName.trim().replace(/\s+/g, '');
    if (sanitizedName === "Global") {
        alert("You cannot join/create the Global channel this way.");
        return;
    }

    const password = prompt(`Enter password for #${sanitizedName}\n(Leave empty for public group):`);

    // Αν ο χρήστης πατήσει Cancel στο password, το θεωρούμε κενό (public)
    const finalPassword = password === null ? "" : password;

    attemptJoinGroup(sanitizedName, finalPassword, true);
});

function sendMessage() {
    const input = document.getElementById("message-input");
    const text = input.value.trim();
    if (text) {
        connection.invoke("SendMessage", uuid, nickname, activeChannelTarget, text, activeChannelIsDm).catch(err => console.error(err));
        input.value = "";
    }
}

document.getElementById("send-btn").addEventListener("click", sendMessage);
document.getElementById("message-input").addEventListener("keypress", (e) => {
    if (e.key === 'Enter') sendMessage();
});
// --- Mobile Menu Toggle Logic ---
const mobileMenuBtn = document.getElementById("mobile-menu-btn");
const mobileSidebar = document.getElementById("sidebar");
const mobileOverlay = document.getElementById("mobile-overlay");

function closeMobileMenu() {
    mobileSidebar.classList.remove("open");
    mobileOverlay.style.display = "none";
}

mobileMenuBtn.addEventListener("click", () => {
    mobileSidebar.classList.add("open");
    mobileOverlay.classList.add("open"); // Χρησιμοποιούμε κλάση
});

mobileOverlay.addEventListener("click", closeMobileMenu);

// Automatically close the sidebar on mobile when a channel is selected
document.getElementById("channels-list").addEventListener("click", (e) => {
    if (e.target.closest(".channel-item") && window.innerWidth <= 768) closeMobileMenu();
});
document.getElementById("dms-list").addEventListener("click", (e) => {
    if (e.target.closest(".channel-item") && window.innerWidth <= 768) closeMobileMenu();
});
document.getElementById("online-users-list").addEventListener("click", (e) => {
    if (e.target.closest(".channel-item") && window.innerWidth <= 768) closeMobileMenu();
});

// --- Emoji Picker Logic ---
const emojiBtn = document.getElementById("emoji-btn");
const emojiPicker = document.getElementById("emoji-picker");
const messageInput = document.getElementById("message-input");

// Η πλήρης συλλογή Emojis χωρισμένη σε blocks
const emojiBlocks = [
    "😀😃😄😁😆😅😂🤣🥲🥹☺️😊😇🙂🙃😉😌😍🥰😘😗😙😚😋😛😝😜🤪🤨🧐🤓😎🥸🤩🥳🙂‍↕️😏😒🙂‍↔️😞😔😟😕🙁☹️😣😖😫😩🥺😢😭😮‍💨😤😠😡🤬🤯😳🥵🥶😱😨😰😥😓🫣🫡🤔🫢🤭🤫🤥😶😶‍🌫️😐😑😬🫨🫠🙄😯😦😧😮😲🥱😴🫩🤤😪😵😵‍💫🫥🤐🥴🤢🤮🤧😷🤒🤕🤑🤠😈👿👹👺🤡💩👻💀☠️👽👾🤖🎃",
    "👋🤚🖐✋🖖👌🤌🤏✌️🤞🫰🤟🤘🤙🫵🫱🫲🫸🫷🫳🫴👈👉👆🖕👇☝️👍👎✊👊🤛🤜👏🫶🙌👐🤲🤝🙏✍️💅🤳💪🦾🦵🦿🦶👣🫆👂🦻👃🫀🫁🧠🦷🦴👀👁👅👄🫦💋🩸",
    "🐶🐱🐭🐹🐰🦊🐻🐼🐻‍❄️🐨🐯🦁🐮🐷🐽🐸🐵🙈🙉🙊🐒🐔🐧🐦🐦‍⬛🐤🐣🐥🦆🦅🦉🦇🐺🐗🐴🦄🐝🪱🐛🦋🐌🐞🐜🪰🪲🪳🦟🦗🕷🕸🦂🐢🐍🦎🦖🦕🐙🦑🦐🦞🦀🪼🪸🐡🐠🐟🐬🐳🐋🦈🐊🐅🐆🦓🫏🦍🦧🦣🐘🦛🦏🐪🐫🦒🦘🦬🐃🐂🐄🐎🐖🐏🐑🦙🐐🦌🫎🐕🐩🦮🐕‍🦺🐈🐈‍⬛🪽🪶🐓🦃🦤🦚🦜🦢🪿🦩🕊🐇🦝🦨🦡🦫🦦🦥🐁🐀🐿🦔🐾🐉🐲🐦‍🔥🌵🎄🌲🌳🪾🌴🪹🪺🪵🌱🌿☘️🍀🎍🪴🎋🍃🍂🍁🍄🍄‍🟫🐚🪨🌾💐🌷🪷🌹🥀🌺🌸🪻🌼🌻🌞🌝🌛🌜🌚🌕🌖🌗🌘🌑🌒🌓🌔🌙🌎🌍🌏🪐💫⭐️🌟✨⚡️☄️💥🔥🌪🌈☀️🌤⛅️🌥☁️🌦🌧⛈🌩🌨❄️☃️⛄️🌬💨💧💦🫧☔️☂️🌊",
    "🍏🍎🍐🍊🍋🍋‍🟩🍌🍉🍇🍓🫐🍈🍒🍑🥭🍍🥥🥝🍅🍆🥑🥦🫛🥬🫜🥒🌶🫑🌽🥕🫒🧄🧅🫚🥔🍠🫘🥐🥯🍞🥖🥨🧀🥚🍳🧈🥞🧇🥓🥩🍗🍖🦴🌭🍔🍟🍕🫓🥪🥙🧆🌮🌯🫔🥗🥘🫕🥫🍝🍜🍲🍛🍣🍱🥟🦪🍤🍙🍚🍘🍥🥠🥮🍢🍡🍧🍨🍦🥧🧁🍰🎂🍮🍭🍬🍫🍿🍩🍪🌰🥜🍯🥛🍼🫖☕️🍵🧃🥤🧋🫙🍶🍺🍻🥂🍷🫗🥃🍸🍹🧉🍾🧊🥄🍴🍽🥣🥡🥢🧂"
];

// Ασφαλής διαχωρισμός των emojis χρησιμοποιώντας το Intl.Segmenter
const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
const commonEmojis = emojiBlocks.flatMap(block =>
    Array.from(segmenter.segment(block)).map(s => s.segment)
);

// Populate the picker
commonEmojis.forEach(emoji => {
    const span = document.createElement("span");
    span.className = "emoji-item";
    span.innerText = emoji;
    span.onclick = () => {
        // Insert emoji at the end of the text
        messageInput.value += emoji;
        messageInput.focus();
    };
    emojiPicker.appendChild(span);
});

// Toggle Picker
emojiBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    emojiPicker.classList.toggle("hidden");
});

// Close picker when clicking anywhere else on the screen
document.addEventListener("click", (e) => {
    if (!emojiPicker.contains(e.target) && e.target !== emojiBtn) {
        emojiPicker.classList.add("hidden");
    }
});