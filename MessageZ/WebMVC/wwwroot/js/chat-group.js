/**
 * chat-group.js
 * Modal management: Direct Chat, Create New Group, View Group Info, Add/Remove Members, Rename Group, Leave Group.
 */

var selectedGroupUsers = []; // [{ id, displayName, username, avatarUrl }]
var allUsersCache = [];
var selectedAddMemberIds = [];
var currentGroupMembers = [];

function initGroupEvents() {
    // Direct chat modal open button
    document.getElementById('btnNewChat')?.addEventListener('click', () => {
        const modal = new bootstrap.Modal(document.getElementById('newChatModal'));
        modal.show();
        loadUsersForDirectChat();
    });

    // Search users for direct chat
    document.getElementById('searchUserObj')?.addEventListener('input', function(e) {
        clearTimeout(window.searchTimeout);
        window.searchTimeout = setTimeout(() => {
            loadUsersForDirectChat(e.target.value);
        }, 400);
    });

    // Create group modal open button
    document.getElementById('btnNewGroup')?.addEventListener('click', () => {
        openNewGroupModal();
    });

    // Submit create group button
    document.getElementById('btnSubmitNewGroup')?.addEventListener('click', () => {
        submitCreateGroup();
    });

    // Search users in Create Group modal
    document.getElementById('searchGroupUser')?.addEventListener('input', function(e) {
        clearTimeout(window.searchGroupTimeout);
        window.searchGroupTimeout = setTimeout(() => {
            filterGroupUsers(e.target.value);
        }, 300);
    });

    // Group info button in chat header
    document.getElementById('btnGroupInfo')?.addEventListener('click', () => {
        openGroupInfoModal();
    });

    // Edit group name button in Group Info modal
    document.getElementById('btnEditGroupName')?.addEventListener('click', () => {
        editGroupName();
    });

    // Open Add Members modal button
    document.getElementById('btnOpenAddMembersModal')?.addEventListener('click', () => {
        openAddMembersModal();
    });

    // Submit Add Members button
    document.getElementById('btnSubmitAddMembers')?.addEventListener('click', () => {
        submitAddMembers();
    });

    // Leave group button
    document.getElementById('btnLeaveCurrentGroup')?.addEventListener('click', () => {
        leaveCurrentGroup();
    });
}

// ==========================================
// 1. MODAL: DIRECT CHAT (1-1)
// ==========================================

async function loadUsersForDirectChat(query = '') {
    const userList = document.getElementById('userList');
    if (!userList) return;
    userList.innerHTML = '<div class="p-3 text-center text-muted small">Loading...</div>';
    try {
        let url = `${API_BASE_URL}/user`;
        if (query) {
            url += `?query=${encodeURIComponent(query)}`;
        }
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
            const users = await response.json();
            userList.innerHTML = '';
            
            const filteredUsers = users.filter(u => u.id.toLowerCase() !== currentUserId.toLowerCase());

            if (filteredUsers.length === 0) {
                userList.innerHTML = '<div class="p-3 text-center text-muted small">No users found</div>';
                return;
            }
            
            filteredUsers.forEach(u => {
                const btn = document.createElement('button');
                btn.className = 'list-group-item list-group-item-action bg-dark text-white border-secondary d-flex align-items-center gap-3 p-2';
                let initial = u.displayName ? u.displayName.charAt(0).toUpperCase() : '?';
                let avatarHtml = u.avatarUrl 
                    ? `<div style="width: 34px; height: 34px; border-radius: 50%; overflow: hidden; flex-shrink: 0;"><img src="${escapeHtml(u.avatarUrl)}" alt="${escapeHtml(u.displayName || u.username)}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.onerror=null; this.parentElement.innerHTML='<div style=\\'width: 34px; height: 34px; border-radius: 50%; background: var(--primary); display: flex; align-items: center; justify-content: center; font-weight: bold;\\'>${escapeHtml(initial)}</div>';" /></div>`
                    : `<div style="width: 34px; height: 34px; border-radius: 50%; background: var(--primary); display: flex; align-items: center; justify-content: center; font-weight: bold; flex-shrink: 0;">${initial}</div>`;
                btn.innerHTML = `
                    ${avatarHtml}
                    <div>
                        <div class="fw-bold" style="font-size: 0.9rem;">${escapeHtml(u.displayName || u.username)}</div>
                        <small class="text-muted" style="font-size: 0.75rem;">@${escapeHtml(u.username)}</small>
                    </div>
                `;
                btn.onclick = () => createChat(u.id);
                userList.appendChild(btn);
            });
        }
    } catch (e) {
        console.error("loadUsersForDirectChat Error:", e);
    }
}

async function createChat(targetUserId) {
    try {
        const response = await fetch(`${API_BASE_URL}/conversation/one-on-one`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ targetUserId: targetUserId })
        });
        
        if (response.ok) {
            const data = await response.json();
            bootstrap.Modal.getInstance(document.getElementById('newChatModal'))?.hide();
            await loadConversations();
            selectConversation(data);
        }
    } catch (e) {
        console.error("createChat Error:", e);
    }
}

// ==========================================
// 2. MODAL: CREATE NEW GROUP
// ==========================================

function openNewGroupModal() {
    selectedGroupUsers = [];
    const nameInput = document.getElementById('groupNameInput');
    const searchInput = document.getElementById('searchGroupUser');
    if (nameInput) nameInput.value = '';
    if (searchInput) searchInput.value = '';
    updateSelectedGroupChips();
    
    const modalEl = document.getElementById('newGroupModal');
    if (modalEl) {
        const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
        modal.show();
    }
    loadUsersForGroup();
}

async function loadUsersForGroup() {
    const list = document.getElementById('groupUserList');
    if (!list) return;
    list.innerHTML = '<div class="p-3 text-center text-muted small">Loading users...</div>';

    try {
        const response = await fetch(`${API_BASE_URL}/user`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
            const users = await response.json();
            allUsersCache = users.filter(u => u.id.toLowerCase() !== currentUserId.toLowerCase());
            renderGroupUserChecklist(allUsersCache);
        }
    } catch (e) {
        console.error("loadUsersForGroup Error:", e);
    }
}

function filterGroupUsers(query) {
    if (!query) {
        renderGroupUserChecklist(allUsersCache);
        return;
    }
    const q = query.toLowerCase().trim();
    const filtered = allUsersCache.filter(u => 
        (u.displayName && u.displayName.toLowerCase().includes(q)) || 
        (u.username && u.username.toLowerCase().includes(q))
    );
    renderGroupUserChecklist(filtered);
}

function renderGroupUserChecklist(users) {
    const list = document.getElementById('groupUserList');
    if (!list) return;
    list.innerHTML = '';

    if (users.length === 0) {
        list.innerHTML = '<div class="p-3 text-center text-muted small">No matching users found</div>';
        return;
    }

    users.forEach(u => {
        const isSelected = selectedGroupUsers.some(s => s.id === u.id);
        const item = document.createElement('div');
        item.className = 'list-group-item list-group-item-action bg-dark text-white border-secondary d-flex align-items-center justify-content-between p-2';
        item.style.cursor = 'pointer';

        let initial = u.displayName ? u.displayName.charAt(0).toUpperCase() : '?';
        let avatarHtml = u.avatarUrl 
            ? `<div style="width: 32px; height: 32px; border-radius: 50%; overflow: hidden; flex-shrink: 0;"><img src="${escapeHtml(u.avatarUrl)}" alt="${escapeHtml(u.displayName || u.username)}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.onerror=null; this.parentElement.innerHTML='<div style=\\'width: 32px; height: 32px; border-radius: 50%; background: var(--primary); display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.85rem;\\'>${escapeHtml(initial)}</div>';" /></div>`
            : `<div style="width: 32px; height: 32px; border-radius: 50%; background: var(--primary); display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.85rem; flex-shrink: 0;">${initial}</div>`;

        item.innerHTML = `
            <div class="d-flex align-items-center gap-2">
                ${avatarHtml}
                <div>
                    <div class="fw-bold" style="font-size: 0.9rem;">${escapeHtml(u.displayName || u.username)}</div>
                    <small class="text-muted" style="font-size: 0.75rem;">@${escapeHtml(u.username)}</small>
                </div>
            </div>
            <div class="form-check m-0">
                <input class="form-check-input" type="checkbox" value="${u.id}" ${isSelected ? 'checked' : ''} style="cursor: pointer; pointer-events: none;" />
            </div>
        `;

        item.onclick = () => {
            toggleSelectGroupUser(u);
            const chk = item.querySelector('input[type="checkbox"]');
            if (chk) chk.checked = !chk.checked;
        };

        list.appendChild(item);
    });
}

function toggleSelectGroupUser(user) {
    const idx = selectedGroupUsers.findIndex(u => u.id === user.id);
    if (idx >= 0) {
        selectedGroupUsers.splice(idx, 1);
    } else {
        selectedGroupUsers.push(user);
    }
    updateSelectedGroupChips();
}

function removeSelectedGroupUser(userId) {
    selectedGroupUsers = selectedGroupUsers.filter(u => u.id !== userId);
    updateSelectedGroupChips();
    renderGroupUserChecklist(allUsersCache);
}

function updateSelectedGroupChips() {
    const container = document.getElementById('selectedGroupUsersChips');
    const countEl = document.getElementById('selectedCountText');
    if (countEl) countEl.innerText = selectedGroupUsers.length;
    if (!container) return;

    if (selectedGroupUsers.length === 0) {
        container.innerHTML = '<span class="text-muted small align-self-center fst-italic">No members selected yet</span>';
        return;
    }

    container.innerHTML = '';
    selectedGroupUsers.forEach(u => {
        const chip = document.createElement('span');
        chip.className = 'badge bg-primary d-inline-flex align-items-center gap-1 px-2 py-1';
        chip.style.fontSize = '0.8rem';
        chip.innerHTML = `
            <span>${escapeHtml(u.displayName || u.username)}</span>
            <button type="button" class="btn-close btn-close-white" style="font-size: 0.55rem;" aria-label="Remove"></button>
        `;
        chip.querySelector('button').onclick = (e) => {
            e.stopPropagation();
            removeSelectedGroupUser(u.id);
        };
        container.appendChild(chip);
    });
}

async function submitCreateGroup() {
    const nameInput = document.getElementById('groupNameInput');
    const groupName = nameInput ? nameInput.value.trim() : '';

    if (!groupName) {
        if (typeof showToast === 'function') {
            showToast('Please enter a group name.', 'warning');
        } else {
            alert('Please enter a group name.');
        }
        if (nameInput) nameInput.focus();
        return;
    }

    if (selectedGroupUsers.length === 0) {
        if (typeof showToast === 'function') {
            showToast('Please select at least 1 member for the group.', 'warning');
        } else {
            alert('Please select at least 1 member for the group.');
        }
        return;
    }

    const btn = document.getElementById('btnSubmitNewGroup');
    const btnText = document.getElementById('btnSubmitNewGroupText');
    const spinner = document.getElementById('btnSubmitNewGroupSpinner');

    if (btn) btn.disabled = true;
    if (btnText) btnText.innerText = 'Creating...';
    if (spinner) spinner.classList.remove('d-none');

    try {
        const memberIds = selectedGroupUsers.map(u => u.id);
        const response = await fetch(`${API_BASE_URL}/conversation/group`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                name: groupName,
                memberIds: memberIds
            })
        });

        if (response.ok) {
            const data = await response.json();
            bootstrap.Modal.getInstance(document.getElementById('newGroupModal'))?.hide();
            
            if (typeof showToast === 'function') {
                showToast(`Group <b>${escapeHtml(groupName)}</b> created successfully!`, 'success');
            }

            await loadConversations();
            selectConversation(data);
        } else {
            const err = await response.json();
            if (typeof showToast === 'function') {
                showToast(err.message || 'Error creating group.', 'error');
            } else {
                alert(err.message || 'Error creating group.');
            }
        }
    } catch (e) {
        console.error("submitCreateGroup Error:", e);
        if (typeof showToast === 'function') {
            showToast('Unable to connect to server.', 'error');
        }
    } finally {
        if (btn) btn.disabled = false;
        if (btnText) btnText.innerText = 'Create Group';
        if (spinner) spinner.classList.add('d-none');
    }
}

// ==========================================
// 3. MODAL: GROUP INFO & MANAGEMENT
// ==========================================

async function openGroupInfoModal() {
    if (!currentConversationId || !currentConversation || currentConversation.type !== 2) return;

    const titleEl = document.getElementById('groupInfoModalTitle');
    const nameEl = document.getElementById('infoGroupNameText');
    if (titleEl) titleEl.innerText = 'Group Info';
    if (nameEl) nameEl.innerText = currentConversation.name || 'Group Chat';

    const modalEl = document.getElementById('groupInfoModal');
    if (modalEl) {
        const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
        modal.show();
    }

    await loadGroupMembers();
}

async function loadGroupMembers() {
    const list = document.getElementById('groupMembersList');
    if (!list) return;
    list.innerHTML = '<div class="p-3 text-center text-muted small">Loading member list...</div>';

    try {
        const response = await fetch(`${API_BASE_URL}/conversation/${currentConversationId}/members`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            currentGroupMembers = await response.json();
            const countEl = document.getElementById('infoMemberCountText');
            if (countEl) countEl.innerText = currentGroupMembers.length;
            renderGroupMembersList(currentGroupMembers);
        } else {
            list.innerHTML = '<div class="p-3 text-center text-danger small">Unable to load members</div>';
        }
    } catch (e) {
        console.error("loadGroupMembers Error:", e);
    }
}

function renderGroupMembersList(members) {
    const list = document.getElementById('groupMembersList');
    if (!list) return;
    list.innerHTML = '';

    const currentMemberObj = members.find(m => m.userId.toLowerCase() === currentUserId.toLowerCase());
    const isCurrentUserAdmin = currentMemberObj?.isAdmin === true;

    members.forEach(m => {
        const item = document.createElement('div');
        item.className = 'list-group-item bg-dark text-white border-secondary d-flex align-items-center justify-content-between p-2';

        let initial = m.displayName ? m.displayName.charAt(0).toUpperCase() : '?';
        let avatarHtml = m.avatarUrl 
            ? `<div style="width: 32px; height: 32px; border-radius: 50%; overflow: hidden; flex-shrink: 0;"><img src="${escapeHtml(m.avatarUrl)}" alt="${escapeHtml(m.displayName)}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.onerror=null; this.parentElement.innerHTML='<div style=\\'width: 32px; height: 32px; border-radius: 50%; background: #6366f1; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.85rem;\\'>${escapeHtml(initial)}</div>';" /></div>`
            : `<div style="width: 32px; height: 32px; border-radius: 50%; background: #6366f1; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.85rem; flex-shrink: 0;">${initial}</div>`;
        let roleBadge = m.isAdmin 
            ? `<span class="badge bg-warning text-dark" style="font-size: 0.7rem;">Admin</span>` 
            : `<span class="badge bg-secondary" style="font-size: 0.7rem;">Member</span>`;

        let isSelf = m.userId.toLowerCase() === currentUserId.toLowerCase();
        let actionBtn = '';

        if (isCurrentUserAdmin && !isSelf) {
            actionBtn = `
                <button class="btn btn-sm btn-outline-danger p-1" title="Remove from group" onclick="kickMember('${m.userId}', '${escapeHtml(m.displayName)}')">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
                        <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
                        <path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
                    </svg>
                </button>
            `;
        }

        item.innerHTML = `
            <div class="d-flex align-items-center gap-2">
                ${avatarHtml}
                <div>
                    <div class="fw-bold" style="font-size: 0.85rem;">
                        ${escapeHtml(m.displayName)} ${isSelf ? '<small class="text-muted">(You)</small>' : ''}
                    </div>
                    <small class="text-muted" style="font-size: 0.7rem;">@${escapeHtml(m.username)}</small>
                </div>
            </div>
            <div class="d-flex align-items-center gap-2">
                ${roleBadge}
                ${actionBtn}
            </div>
        `;

        list.appendChild(item);
    });
}

async function kickMember(targetUserId, targetName) {
    if (!confirm(`Are you sure you want to remove "${targetName}" from the group?`)) return;

    try {
        const response = await fetch(`${API_BASE_URL}/conversation/${currentConversationId}/members/${targetUserId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            if (typeof showToast === 'function') {
                showToast(`Removed <b>${targetName}</b> from the group.`, 'success');
            }
            await loadGroupMembers();
        } else {
            const err = await response.json();
            if (typeof showToast === 'function') {
                showToast(err.message || 'Unable to remove member.', 'error');
            } else {
                alert(err.message || 'Unable to remove member.');
            }
        }
    } catch (e) {
        console.error("kickMember Error:", e);
    }
}

async function editGroupName() {
    const currentName = currentConversation?.name || '';
    const newName = prompt('Enter new group name:', currentName);
    if (!newName || newName.trim() === '' || newName.trim() === currentName) return;

    try {
        const response = await fetch(`${API_BASE_URL}/conversation/${currentConversationId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ name: newName.trim() })
        });

        if (response.ok) {
            const infoText = document.getElementById('infoGroupNameText');
            const chatName = document.getElementById('currentChatName');
            if (infoText) infoText.innerText = newName.trim();
            if (chatName) chatName.innerText = newName.trim();
            if (currentConversation) currentConversation.name = newName.trim();
            if (typeof showToast === 'function') {
                showToast('Group name updated successfully!', 'success');
            }
            loadConversations();
        } else {
            const err = await response.json();
            if (typeof showToast === 'function') {
                showToast(err.message || 'Unable to rename group.', 'error');
            } else {
                alert(err.message || 'Unable to rename group.');
            }
        }
    } catch (e) {
        console.error("editGroupName Error:", e);
    }
}

async function leaveCurrentGroup() {
    if (!confirm('Are you sure you want to leave this group?')) return;

    try {
        const response = await fetch(`${API_BASE_URL}/conversation/${currentConversationId}/leave`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            bootstrap.Modal.getInstance(document.getElementById('groupInfoModal'))?.hide();
            if (typeof showToast === 'function') {
                showToast('You have left the group.', 'info');
            }
            const chatMain = document.getElementById('chatMainArea');
            const noChat = document.getElementById('noChatSelected');
            if (chatMain) {
                chatMain.classList.add('d-none');
                chatMain.style.display = 'none';
            }
            if (noChat) noChat.classList.remove('d-none');
            currentConversationId = null;
            currentConversation = null;
            loadConversations();
        } else {
            const err = await response.json();
            if (typeof showToast === 'function') {
                showToast(err.message || 'Unable to leave group.', 'error');
            } else {
                alert(err.message || 'Unable to leave group.');
            }
        }
    } catch (e) {
        console.error("leaveCurrentGroup Error:", e);
    }
}

// ==========================================
// 4. MODAL: ADD MEMBERS TO GROUP
// ==========================================

function openAddMembersModal() {
    selectedAddMemberIds = [];
    const searchInput = document.getElementById('searchAddMemberUser');
    if (searchInput) searchInput.value = '';
    
    bootstrap.Modal.getInstance(document.getElementById('groupInfoModal'))?.hide();

    const modalEl = document.getElementById('addMembersModal');
    if (modalEl) {
        const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
        modal.show();
    }

    loadUsersToAdd();
}

async function loadUsersToAdd() {
    const list = document.getElementById('addMemberList');
    if (!list) return;
    list.innerHTML = '<div class="p-3 text-center text-muted small">Loading list...</div>';

    try {
        const response = await fetch(`${API_BASE_URL}/user`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const allUsers = await response.json();
            const existingUserIds = currentGroupMembers.map(m => m.userId.toLowerCase());
            const availableUsers = allUsers.filter(u => 
                !existingUserIds.includes(u.id.toLowerCase()) && 
                u.id.toLowerCase() !== currentUserId.toLowerCase()
            );

            renderAddMembersChecklist(availableUsers);
        }
    } catch (e) {
        console.error("loadUsersToAdd Error:", e);
    }
}

function renderAddMembersChecklist(users) {
    const list = document.getElementById('addMemberList');
    if (!list) return;
    list.innerHTML = '';

    if (users.length === 0) {
        list.innerHTML = '<div class="p-3 text-center text-muted small">All users are already in this group</div>';
        return;
    }

    users.forEach(u => {
        const item = document.createElement('div');
        item.className = 'list-group-item list-group-item-action bg-dark text-white border-secondary d-flex align-items-center justify-content-between p-2';
        item.style.cursor = 'pointer';

        let initial = u.displayName ? u.displayName.charAt(0).toUpperCase() : '?';
        let avatarHtml = u.avatarUrl 
            ? `<div style="width: 32px; height: 32px; border-radius: 50%; overflow: hidden; flex-shrink: 0;"><img src="${escapeHtml(u.avatarUrl)}" alt="${escapeHtml(u.displayName || u.username)}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.onerror=null; this.parentElement.innerHTML='<div style=\\'width: 32px; height: 32px; border-radius: 50%; background: #10b981; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.85rem;\\'>${escapeHtml(initial)}</div>';" /></div>`
            : `<div style="width: 32px; height: 32px; border-radius: 50%; background: #10b981; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.85rem; flex-shrink: 0;">${initial}</div>`;

        item.innerHTML = `
            <div class="d-flex align-items-center gap-2">
                ${avatarHtml}
                <div>
                    <div class="fw-bold" style="font-size: 0.85rem;">${escapeHtml(u.displayName || u.username)}</div>
                    <small class="text-muted" style="font-size: 0.7rem;">@${escapeHtml(u.username)}</small>
                </div>
            </div>
            <div class="form-check m-0">
                <input class="form-check-input" type="checkbox" value="${u.id}" style="cursor: pointer; pointer-events: none;" />
            </div>
        `;

        item.onclick = () => {
            const chk = item.querySelector('input[type="checkbox"]');
            if (chk) chk.checked = !chk.checked;
            if (chk && chk.checked) {
                selectedAddMemberIds.push(u.id);
            } else {
                selectedAddMemberIds = selectedAddMemberIds.filter(id => id !== u.id);
            }
        };

        list.appendChild(item);
    });
}

async function submitAddMembers() {
    if (selectedAddMemberIds.length === 0) {
        if (typeof showToast === 'function') {
            showToast('Please select at least 1 user to add.', 'warning');
        } else {
            alert('Please select at least 1 user to add.');
        }
        return;
    }

    const btn = document.getElementById('btnSubmitAddMembers');
    if (btn) {
        btn.disabled = true;
        btn.innerText = 'Adding...';
    }

    try {
        const response = await fetch(`${API_BASE_URL}/conversation/${currentConversationId}/members`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ memberIds: selectedAddMemberIds })
        });

        if (response.ok) {
            bootstrap.Modal.getInstance(document.getElementById('addMembersModal'))?.hide();
            if (typeof showToast === 'function') {
                showToast('Members added to group successfully!', 'success');
            }
            await loadConversations();
        } else {
            const err = await response.json();
            if (typeof showToast === 'function') {
                showToast(err.message || 'Error adding members.', 'error');
            } else {
                alert(err.message || 'Error adding members.');
            }
        }
    } catch (e) {
        console.error("submitAddMembers Error:", e);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerText = 'Add Members';
        }
    }
}
