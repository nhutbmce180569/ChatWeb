using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.SignalR;
using WebAPI.DTOs.Conversation;
using WebAPI.DTOs.Message;
using WebAPI.Hubs;
using WebAPI.Models;
using WebAPI.Repositories;

namespace WebAPI.Services.Implements;

public class ConversationService : IConversationService
{
    private readonly IConversationRepository _conversationRepository;
    private readonly IUserRepository _userRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IHubContext<ChatHub> _hubContext;
    private readonly IPhotoService _photoService;
    private readonly IFileService _fileService;
    private readonly IUserPresenceTracker _presenceTracker;
    private static readonly System.Text.Json.JsonSerializerOptions _camelCaseJsonOptions = new()
    {
        PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase
    };

    public ConversationService(
        IConversationRepository conversationRepository,
        IUserRepository userRepository,
        IUnitOfWork unitOfWork,
        IHubContext<ChatHub> hubContext,
        IPhotoService photoService,
        IFileService fileService,
        IUserPresenceTracker presenceTracker)
    {
        _conversationRepository = conversationRepository;
        _userRepository = userRepository;
        _unitOfWork = unitOfWork;
        _hubContext = hubContext;
        _photoService = photoService;
        _fileService = fileService;
        _presenceTracker = presenceTracker;
    }

    public async Task<(bool Success, string? ErrorMessage, ConversationResponse? Data)> CreateOneOnOneChatAsync(Guid currentUserId, CreateOneOnOneRequest request)
    {
        if (currentUserId == request.TargetUserId)
        {
            return (false, "Cannot create a conversation with yourself.", null);
        }

        var existingChat = await _conversationRepository.GetOneOnOneConversationAsync(currentUserId, request.TargetUserId);
        if (existingChat != null)
        {
            return (true, null, new ConversationResponse
            {
                Id = existingChat.Id,
                Name = existingChat.Name,
                Type = existingChat.Type,
                CreatedAt = existingChat.CreatedAt,
                UpdatedAt = existingChat.UpdatedAt
            });
        }

        var now = DateTime.UtcNow;
        var newConversation = new Conversation
        {
            Id = Guid.NewGuid(),
            Type = 1, // 1 for 1-on-1
            CreatedBy = currentUserId,
            CreatedAt = now,
            UpdatedAt = now,
            ConversationMembers = new List<ConversationMember>
            {
                new ConversationMember { UserId = currentUserId, JoinedAt = now, IsAdmin = true },
                new ConversationMember { UserId = request.TargetUserId, JoinedAt = now, IsAdmin = true }
            }
        };

        await _conversationRepository.AddAsync(newConversation);
        await _unitOfWork.SaveChangesAsync();

        return (true, null, new ConversationResponse
        {
            Id = newConversation.Id,
            Type = newConversation.Type,
            CreatedAt = newConversation.CreatedAt,
            UpdatedAt = newConversation.UpdatedAt
        });
    }

    public async Task<(bool Success, string? ErrorMessage, ConversationResponse? Data)> CreateGroupChatAsync(Guid currentUserId, CreateGroupRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return (false, "Group name cannot be empty.", null);
        }

        if (request.MemberIds == null || !request.MemberIds.Any())
        {
            return (false, "Please select at least 1 member for the group.", null);
        }

        var creator = await _userRepository.GetByIdAsync(currentUserId);
        var creatorName = creator?.DisplayName ?? "User";

        var now = DateTime.UtcNow;
        var conversationId = Guid.NewGuid();

        var members = new List<ConversationMember>
        {
            new ConversationMember
            {
                ConversationId = conversationId,
                UserId = currentUserId,
                JoinedAt = now,
                IsAdmin = true
            }
        };

        foreach (var memberId in request.MemberIds.Distinct())
        {
            if (memberId != currentUserId)
            {
                members.Add(new ConversationMember
                {
                    ConversationId = conversationId,
                    UserId = memberId,
                    JoinedAt = now,
                    IsAdmin = false
                });
            }
        }

        var newConversation = new Conversation
        {
            Id = conversationId,
            Name = request.Name.Trim(),
            Type = 2, // 2 for Group
            CreatedBy = currentUserId,
            CreatedAt = now,
            UpdatedAt = now,
            ConversationMembers = members
        };

        await _conversationRepository.AddAsync(newConversation);

        // System message welcoming the group
        var systemMessage = new Message
        {
            Id = Guid.NewGuid(),
            ConversationId = conversationId,
            SenderId = currentUserId,
            Content = $"{creatorName} created group \"{newConversation.Name}\"",
            MessageType = 4, // 4 = System
            SentAt = now
        };

        await _conversationRepository.AddMessageAsync(systemMessage);
        await _unitOfWork.SaveChangesAsync();

        // Send realtime SignalR notification to all group members
        var memberUserIds = members.Select(m => m.UserId.ToString().ToLower()).ToList();

        await _hubContext.Clients.Users(memberUserIds).SendAsync("GroupCreated", new
        {
            id = newConversation.Id,
            name = newConversation.Name,
            type = newConversation.Type,
            memberCount = members.Count,
            lastUpdatedAt = newConversation.UpdatedAt,
            previewMessage = systemMessage.Content
        });

        await _hubContext.Clients.Users(memberUserIds).SendAsync("ReceiveMessage", new
        {
            id = systemMessage.Id,
            conversationId = systemMessage.ConversationId,
            senderId = systemMessage.SenderId,
            senderName = creatorName,
            content = systemMessage.Content,
            messageType = systemMessage.MessageType,
            sentAt = systemMessage.SentAt
        });

        return (true, null, new ConversationResponse
        {
            Id = newConversation.Id,
            Name = newConversation.Name,
            Type = newConversation.Type,
            CreatedAt = newConversation.CreatedAt,
            UpdatedAt = newConversation.UpdatedAt
        });
    }

    public async Task<IEnumerable<ConversationListResponse>> GetConversationsAsync(Guid userId)
    {
        var conversations = await _conversationRepository.GetConversationsByUserIdAsync(userId);
        var result = new List<ConversationListResponse>();

        foreach (var conv in conversations)
        {
            var activeMembers = conv.ConversationMembers.Where(cm => cm.LeftAt == null).ToList();
            var currentMember = activeMembers.FirstOrDefault(cm => cm.UserId == userId);

            int unreadCount = 0;
            if (currentMember != null)
            {
                if (currentMember.LastReadMessageId == null)
                {
                    unreadCount = conv.Messages.Count(m => m.SentAt >= currentMember.JoinedAt && m.SenderId != userId);
                }
                else
                {
                    var lastReadMsg = conv.Messages.FirstOrDefault(m => m.Id == currentMember.LastReadMessageId);
                    if (lastReadMsg != null)
                    {
                        unreadCount = conv.Messages.Count(m => m.SentAt > lastReadMsg.SentAt && m.SenderId != userId);
                    }
                    else
                    {
                        unreadCount = conv.Messages.Count(m => m.SenderId != userId);
                    }
                }
            }

            var response = new ConversationListResponse
            {
                Id = conv.Id,
                Name = conv.Name,
                Type = conv.Type,
                LastUpdatedAt = conv.UpdatedAt ?? conv.CreatedAt,
                MemberCount = activeMembers.Count,
                UnreadCount = unreadCount,
                Members = activeMembers.Select(cm => new MemberInfo
                {
                    UserId = cm.UserId,
                    DisplayName = cm.User?.DisplayName ?? "Unknown",
                    AvatarUrl = cm.User?.AvatarUrl,
                    IsOnline = _presenceTracker.IsUserOnline(cm.UserId),
                    LastSeenAt = cm.User?.LastSeenAt
                }).ToList()
            };

            // Determine the latest preview message
            var latestMessage = conv.Messages.OrderByDescending(m => m.SentAt).FirstOrDefault();
            if (latestMessage != null)
            {
                if (latestMessage.IsRecalled)
                {
                    var senderName = latestMessage.Sender?.DisplayName ?? "User";
                    response.PreviewMessage = conv.Type == 2 
                        ? $"{senderName}: [Message recalled]" 
                        : "[Message recalled]";
                }
                else if (latestMessage.MessageType == 4) // System message
                {
                    response.PreviewMessage = latestMessage.Content;
                }
                else if (latestMessage.MessageType == 2) // Image message
                {
                    var senderName = latestMessage.Sender?.DisplayName ?? "User";
                    response.PreviewMessage = conv.Type == 2 
                        ? $"{senderName}: [Image]" 
                        : "[Image]";
                }
                else if (latestMessage.MessageType == 3) // File message
                {
                    var senderName = latestMessage.Sender?.DisplayName ?? "User";
                    string fileLabel = "[Attachment]";
                    try
                    {
                        if (!string.IsNullOrEmpty(latestMessage.Content))
                        {
                            var fileObj = System.Text.Json.JsonSerializer.Deserialize<FileMessageContent>(latestMessage.Content, new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                            if (!string.IsNullOrEmpty(fileObj?.FileName))
                            {
                                fileLabel = $"[File: {fileObj.FileName}]";
                            }
                        }
                    }
                    catch { }

                    response.PreviewMessage = conv.Type == 2 
                        ? $"{senderName}: {fileLabel}" 
                        : fileLabel;
                }
                else if (latestMessage.MessageType == 5) // Voice message
                {
                    var senderName = latestMessage.Sender?.DisplayName ?? "User";
                    response.PreviewMessage = conv.Type == 2 
                        ? $"{senderName}: [Voice message]" 
                        : "[Voice message]";
                }
                else if (latestMessage.MessageType == 6) // Video message
                {
                    var senderName = latestMessage.Sender?.DisplayName ?? "User";
                    response.PreviewMessage = conv.Type == 2 
                        ? $"{senderName}: [Video]" 
                        : "[Video]";
                }
                else if (latestMessage.MessageType == 7) // Call record message
                {
                    string callLabel = "[Call]";
                    try
                    {
                        using var doc = System.Text.Json.JsonDocument.Parse(latestMessage.Content ?? "{}");
                        var root = doc.RootElement;
                        var callType = root.TryGetProperty("callType", out var ct) ? ct.GetString() : "audio";
                        var status = root.TryGetProperty("status", out var st) ? st.GetString() : "completed";
                        var dur = root.TryGetProperty("duration", out var dt) && dt.TryGetInt32(out var dSec) ? dSec : 0;
                        var typeName = string.Equals(callType, "video", StringComparison.OrdinalIgnoreCase) ? "Video call" : "Audio call";
                        if (status == "missed" || status == "declined")
                        {
                            callLabel = status == "declined" ? $"[{typeName} - Declined]" : $"[Missed {typeName.ToLower()}]";
                        }
                        else
                        {
                            var mins = dur / 60;
                            var secs = dur % 60;
                            callLabel = $"[{typeName} ({mins:D2}:{secs:D2})]";
                        }
                    }
                    catch { }

                    var senderName = latestMessage.Sender?.DisplayName ?? "User";
                    response.PreviewMessage = conv.Type == 2 
                        ? $"{senderName}: {callLabel}" 
                        : callLabel;
                }
                else
                {
                    var senderName = latestMessage.Sender?.DisplayName ?? "User";
                    response.PreviewMessage = conv.Type == 2 
                        ? $"{senderName}: {latestMessage.Content}" 
                        : latestMessage.Content;
                }
            }

            // If 1-on-1, get other member's display name and avatar
            if (conv.Type == 1)
            {
                var otherMember = response.Members.FirstOrDefault(m => m.UserId != userId);
                if (otherMember != null)
                {
                    if (string.IsNullOrEmpty(conv.Name))
                    {
                        response.Name = otherMember.DisplayName;
                    }
                    response.AvatarUrl = otherMember.AvatarUrl;
                }
            }

            result.Add(response);
        }

        return result;
    }

    public async Task<IEnumerable<MessageResponse>> GetMessagesAsync(Guid conversationId, Guid currentUserId)
    {
        // Check if user is in this conversation
        var member = await _conversationRepository.GetMemberAsync(conversationId, currentUserId);
        if (member == null)
        {
            return Enumerable.Empty<MessageResponse>();
        }

        var messages = await _conversationRepository.GetMessagesByConversationIdAsync(conversationId);

        return messages.Select(m => new MessageResponse
        {
            Id = m.Id,
            ConversationId = m.ConversationId,
            SenderId = m.SenderId,
            SenderName = m.Sender?.DisplayName ?? "Unknown",
            SenderAvatarUrl = m.Sender?.AvatarUrl,
            Content = m.IsRecalled ? "This message has been recalled" : m.Content,
            MessageType = m.MessageType,
            SentAt = DateTime.SpecifyKind(m.SentAt, DateTimeKind.Utc),
            IsRecalled = m.IsRecalled,
            RecalledAt = m.RecalledAt.HasValue ? DateTime.SpecifyKind(m.RecalledAt.Value, DateTimeKind.Utc) : null
        }).ToList();
    }

    public async Task<(bool Success, string? ErrorMessage, IEnumerable<GroupMemberResponse>? Data)> GetGroupMembersAsync(Guid conversationId, Guid currentUserId)
    {
        var conversation = await _conversationRepository.GetByIdAsync(conversationId);
        if (conversation == null)
        {
            return (false, "Conversation does not exist.", null);
        }

        // Check if current user is an active member
        var currentMember = await _conversationRepository.GetMemberAsync(conversationId, currentUserId);
        if (currentMember == null || currentMember.LeftAt != null)
        {
            return (false, "You are not a member of this conversation.", null);
        }

        var activeMembers = await _conversationRepository.GetActiveMembersAsync(conversationId);

        var memberDtos = activeMembers.Select(cm => new GroupMemberResponse
        {
            UserId = cm.UserId,
            DisplayName = cm.User?.DisplayName ?? "Unknown",
            Username = cm.User?.Username ?? "Unknown",
            AvatarUrl = cm.User?.AvatarUrl,
            IsAdmin = cm.IsAdmin,
            IsOnline = _presenceTracker.IsUserOnline(cm.UserId),
            JoinedAt = cm.JoinedAt
        })
        .OrderByDescending(m => m.IsAdmin)
        .ThenBy(m => m.DisplayName)
        .ToList();

        return (true, null, memberDtos);
    }

    public async Task<(bool Success, string? ErrorMessage)> AddMembersToGroupAsync(Guid conversationId, Guid currentUserId, AddGroupMembersRequest request)
    {
        var conversation = await _conversationRepository.GetByIdAsync(conversationId);
        if (conversation == null || conversation.Type != 2)
        {
            return (false, "Group chat does not exist.");
        }

        var currentMember = await _conversationRepository.GetMemberAsync(conversationId, currentUserId);
        if (currentMember == null || currentMember.LeftAt != null)
        {
            return (false, "You do not have permission to add members to this group.");
        }

        var now = DateTime.UtcNow;
        var newMemberIdsToAdd = new List<Guid>();

        foreach (var memberId in request.MemberIds.Distinct())
        {
            if (memberId == currentUserId) continue;

            var existingMember = await _conversationRepository.GetMemberAsync(conversationId, memberId);
            if (existingMember != null)
            {
                if (existingMember.LeftAt != null)
                {
                    // Previously left group -> Re-activate
                    existingMember.LeftAt = null;
                    existingMember.JoinedAt = now;
                    _conversationRepository.UpdateMember(existingMember);
                    newMemberIdsToAdd.Add(memberId);
                }
            }
            else
            {
                // Brand new member
                var newMember = new ConversationMember
                {
                    ConversationId = conversationId,
                    UserId = memberId,
                    JoinedAt = now,
                    IsAdmin = false
                };
                await _conversationRepository.AddMemberAsync(newMember);
                newMemberIdsToAdd.Add(memberId);
            }
        }

        if (!newMemberIdsToAdd.Any())
        {
            return (false, "All selected users are already in the group.");
        }

        // Get user info to write system message
        var currentUser = await _userRepository.GetByIdAsync(currentUserId);
        var currentUserName = currentUser?.DisplayName ?? "User";
        var addedUsers = await _userRepository.GetUsersByIdsAsync(newMemberIdsToAdd);
        var addedUserNames = string.Join(", ", addedUsers.Select(u => u.DisplayName));

        var systemMessage = new Message
        {
            Id = Guid.NewGuid(),
            ConversationId = conversationId,
            SenderId = currentUserId,
            Content = $"{currentUserName} added {addedUserNames} to the group",
            MessageType = 4, // System
            SentAt = now
        };

        conversation.UpdatedAt = now;
        _conversationRepository.Update(conversation);
        await _conversationRepository.AddMessageAsync(systemMessage);
        await _unitOfWork.SaveChangesAsync();

        // Send SignalR realtime notification
        var allActiveMembers = await _conversationRepository.GetActiveMembersAsync(conversationId);
        var allMemberUserIds = allActiveMembers.Select(m => m.UserId.ToString().ToLower()).ToList();

        // Broadcast system message
        await _hubContext.Clients.Users(allMemberUserIds).SendAsync("ReceiveMessage", new
        {
            id = systemMessage.Id,
            conversationId = systemMessage.ConversationId,
            senderId = systemMessage.SenderId,
            senderName = currentUserName,
            content = systemMessage.Content,
            messageType = systemMessage.MessageType,
            sentAt = systemMessage.SentAt
        });

        // Broadcast group update to all members
        await _hubContext.Clients.Users(allMemberUserIds).SendAsync("GroupUpdated", new
        {
            id = conversation.Id,
            name = conversation.Name,
            memberCount = allActiveMembers.Count(),
            lastUpdatedAt = conversation.UpdatedAt,
            previewMessage = systemMessage.Content
        });

        return (true, null);
    }

    public async Task<(bool Success, string? ErrorMessage)> LeaveGroupAsync(Guid conversationId, Guid currentUserId)
    {
        var conversation = await _conversationRepository.GetByIdAsync(conversationId);
        if (conversation == null || conversation.Type != 2)
        {
            return (false, "Group chat does not exist.");
        }

        var member = await _conversationRepository.GetMemberAsync(conversationId, currentUserId);
        if (member == null || member.LeftAt != null)
        {
            return (false, "You are not a member of this group.");
        }

        var now = DateTime.UtcNow;
        member.LeftAt = now;
        _conversationRepository.UpdateMember(member);

        // Get remaining active members
        var activeMembers = (await _conversationRepository.GetActiveMembersAsync(conversationId))
            .Where(m => m.UserId != currentUserId)
            .ToList();

        // If departing member was admin and no other admin exists -> promote earliest joined member
        if (member.IsAdmin && activeMembers.Any())
        {
            var hasOtherAdmin = activeMembers.Any(m => m.IsAdmin);
            if (!hasOtherAdmin)
            {
                var nextAdmin = activeMembers.OrderBy(m => m.JoinedAt).First();
                nextAdmin.IsAdmin = true;
                _conversationRepository.UpdateMember(nextAdmin);
            }
        }

        var currentUser = await _userRepository.GetByIdAsync(currentUserId);
        var currentUserName = currentUser?.DisplayName ?? "User";

        var systemMessage = new Message
        {
            Id = Guid.NewGuid(),
            ConversationId = conversationId,
            SenderId = currentUserId,
            Content = $"{currentUserName} left the group",
            MessageType = 4, // System
            SentAt = now
        };

        conversation.UpdatedAt = now;
        _conversationRepository.Update(conversation);
        await _conversationRepository.AddMessageAsync(systemMessage);
        await _unitOfWork.SaveChangesAsync();

        // SignalR realtime: Send notification to remaining members
        var remainingUserIds = activeMembers.Select(m => m.UserId.ToString().ToLower()).ToList();

        await _hubContext.Clients.Users(remainingUserIds).SendAsync("ReceiveMessage", new
        {
            id = systemMessage.Id,
            conversationId = systemMessage.ConversationId,
            senderId = systemMessage.SenderId,
            senderName = currentUserName,
            content = systemMessage.Content,
            messageType = systemMessage.MessageType,
            sentAt = systemMessage.SentAt
        });

        await _hubContext.Clients.Users(remainingUserIds).SendAsync("GroupUpdated", new
        {
            id = conversation.Id,
            name = conversation.Name,
            memberCount = activeMembers.Count,
            lastUpdatedAt = conversation.UpdatedAt,
            previewMessage = systemMessage.Content
        });

        return (true, null);
    }

    public async Task<(bool Success, string? ErrorMessage)> RemoveMemberFromGroupAsync(Guid conversationId, Guid currentUserId, Guid targetUserId)
    {
        var conversation = await _conversationRepository.GetByIdAsync(conversationId);
        if (conversation == null || conversation.Type != 2)
        {
            return (false, "Group chat does not exist.");
        }

        // Removing oneself = Leave group
        if (currentUserId == targetUserId)
        {
            return await LeaveGroupAsync(conversationId, currentUserId);
        }

        var currentMember = await _conversationRepository.GetMemberAsync(conversationId, currentUserId);
        if (currentMember == null || currentMember.LeftAt != null || !currentMember.IsAdmin)
        {
            return (false, "Only group admins can remove members.");
        }

        var targetMember = await _conversationRepository.GetMemberAsync(conversationId, targetUserId);
        if (targetMember == null || targetMember.LeftAt != null)
        {
            return (false, "Member does not exist in this group.");
        }

        var now = DateTime.UtcNow;
        targetMember.LeftAt = now;
        _conversationRepository.UpdateMember(targetMember);

        var currentUser = await _userRepository.GetByIdAsync(currentUserId);
        var targetUser = await _userRepository.GetByIdAsync(targetUserId);

        var adminName = currentUser?.DisplayName ?? "Admin";
        var targetName = targetUser?.DisplayName ?? "Member";

        var systemMessage = new Message
        {
            Id = Guid.NewGuid(),
            ConversationId = conversationId,
            SenderId = currentUserId,
            Content = $"{adminName} removed {targetName} from the group",
            MessageType = 4, // System
            SentAt = now
        };

        conversation.UpdatedAt = now;
        _conversationRepository.Update(conversation);
        await _conversationRepository.AddMessageAsync(systemMessage);
        await _unitOfWork.SaveChangesAsync();

        var activeMembers = (await _conversationRepository.GetActiveMembersAsync(conversationId))
            .Where(m => m.UserId != targetUserId)
            .ToList();

        var remainingUserIds = activeMembers.Select(m => m.UserId.ToString().ToLower()).ToList();

        // Notify kicked user
        await _hubContext.Clients.User(targetUserId.ToString().ToLower()).SendAsync("RemovedFromGroup", new
        {
            conversationId = conversation.Id,
            message = $"You were removed from group \"{conversation.Name}\""
        });

        // Notify remaining members
        await _hubContext.Clients.Users(remainingUserIds).SendAsync("ReceiveMessage", new
        {
            id = systemMessage.Id,
            conversationId = systemMessage.ConversationId,
            senderId = systemMessage.SenderId,
            senderName = adminName,
            content = systemMessage.Content,
            messageType = systemMessage.MessageType,
            sentAt = systemMessage.SentAt
        });

        await _hubContext.Clients.Users(remainingUserIds).SendAsync("GroupUpdated", new
        {
            id = conversation.Id,
            name = conversation.Name,
            memberCount = activeMembers.Count,
            lastUpdatedAt = conversation.UpdatedAt,
            previewMessage = systemMessage.Content
        });

        return (true, null);
    }

    public async Task<(bool Success, string? ErrorMessage)> UpdateGroupNameAsync(Guid conversationId, Guid currentUserId, UpdateGroupRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return (false, "Group name cannot be empty.");
        }

        var conversation = await _conversationRepository.GetByIdAsync(conversationId);
        if (conversation == null || conversation.Type != 2)
        {
            return (false, "Group chat does not exist.");
        }

        var currentMember = await _conversationRepository.GetMemberAsync(conversationId, currentUserId);
        if (currentMember == null || currentMember.LeftAt != null)
        {
            return (false, "You are not a member of this group.");
        }

        var now = DateTime.UtcNow;
        var oldName = conversation.Name;
        conversation.Name = request.Name.Trim();
        conversation.UpdatedAt = now;
        _conversationRepository.Update(conversation);

        var currentUser = await _userRepository.GetByIdAsync(currentUserId);
        var currentUserName = currentUser?.DisplayName ?? "User";

        var systemMessage = new Message
        {
            Id = Guid.NewGuid(),
            ConversationId = conversationId,
            SenderId = currentUserId,
            Content = $"{currentUserName} renamed the group to \"{conversation.Name}\"",
            MessageType = 4, // System
            SentAt = now
        };

        await _conversationRepository.AddMessageAsync(systemMessage);
        await _unitOfWork.SaveChangesAsync();

        var activeMembers = await _conversationRepository.GetActiveMembersAsync(conversationId);
        var memberUserIds = activeMembers.Select(m => m.UserId.ToString().ToLower()).ToList();

        await _hubContext.Clients.Users(memberUserIds).SendAsync("ReceiveMessage", new
        {
            id = systemMessage.Id,
            conversationId = systemMessage.ConversationId,
            senderId = systemMessage.SenderId,
            senderName = currentUserName,
            content = systemMessage.Content,
            messageType = systemMessage.MessageType,
            sentAt = systemMessage.SentAt
        });

        await _hubContext.Clients.Users(memberUserIds).SendAsync("GroupUpdated", new
        {
            id = conversation.Id,
            name = conversation.Name,
            memberCount = activeMembers.Count(),
            lastUpdatedAt = conversation.UpdatedAt,
            previewMessage = systemMessage.Content
        });

        return (true, null);
    }

    public async Task MarkAsReadAsync(Guid conversationId, Guid currentUserId)
    {
        await _conversationRepository.MarkAsReadAsync(conversationId, currentUserId);
    }

    public async Task<(bool Success, string? ErrorMessage, MessageResponse? Data)> SendImageAsync(Guid conversationId, Guid currentUserId, IFormFile file)
    {
        if (file == null || file.Length == 0)
        {
            return (false, "Please select a valid image file.", null);
        }

        var conversation = await _conversationRepository.GetByIdAsync(conversationId);
        if (conversation == null)
        {
            return (false, "Conversation does not exist.", null);
        }

        var member = await _conversationRepository.GetMemberAsync(conversationId, currentUserId);
        if (member == null || member.LeftAt != null)
        {
            return (false, "You are not a member of this conversation.", null);
        }

        var uploadResult = await _photoService.UploadImageAsync(file);
        if (!uploadResult.Success || string.IsNullOrEmpty(uploadResult.Url))
        {
            return (false, uploadResult.ErrorMessage ?? "Image upload failed.", null);
        }

        var now = DateTime.UtcNow;
        var message = new Message
        {
            Id = Guid.NewGuid(),
            ConversationId = conversationId,
            SenderId = currentUserId,
            Content = uploadResult.Url,
            MessageType = 2, // 2 = Image
            SentAt = now
        };

        conversation.UpdatedAt = now;
        _conversationRepository.Update(conversation);
        await _conversationRepository.AddMessageAsync(message);
        await _unitOfWork.SaveChangesAsync();

        var sender = await _userRepository.GetByIdAsync(currentUserId);
        var senderName = sender?.DisplayName ?? "User";
        var senderAvatarUrl = sender?.AvatarUrl;

        var activeMembers = await _conversationRepository.GetActiveMembersAsync(conversationId);
        var memberIds = activeMembers.Select(m => m.UserId.ToString().ToLower()).ToList();

        var payload = new
        {
            id = message.Id,
            conversationId = message.ConversationId,
            senderId = message.SenderId,
            senderName = senderName,
            senderAvatarUrl = senderAvatarUrl,
            content = message.Content,
            messageType = message.MessageType,
            sentAt = message.SentAt
        };

        await _hubContext.Clients.Users(memberIds).SendAsync("ReceiveMessage", payload);

        var response = new MessageResponse
        {
            Id = message.Id,
            ConversationId = message.ConversationId,
            SenderId = message.SenderId,
            SenderName = senderName,
            SenderAvatarUrl = senderAvatarUrl,
            Content = message.Content,
            MessageType = message.MessageType,
            SentAt = message.SentAt
        };

        return (true, null, response);
    }

    public async Task<(bool Success, string? ErrorMessage, MessageResponse? Data)> SendFileAsync(Guid conversationId, Guid currentUserId, IFormFile file)
    {
        if (file == null || file.Length == 0)
        {
            return (false, "Please select a valid file.", null);
        }

        var conversation = await _conversationRepository.GetByIdAsync(conversationId);
        if (conversation == null)
        {
            return (false, "Conversation does not exist.", null);
        }

        var member = await _conversationRepository.GetMemberAsync(conversationId, currentUserId);
        if (member == null || member.LeftAt != null)
        {
            return (false, "You are not a member of this conversation.", null);
        }

        var uploadResult = await _fileService.UploadRawFileAsync(file);
        if (!uploadResult.Success || string.IsNullOrEmpty(uploadResult.Url))
        {
            return (false, uploadResult.ErrorMessage ?? "File upload failed.", null);
        }

        var filePayload = new FileMessageContent
        {
            Url = uploadResult.Url,
            FileName = uploadResult.FileName ?? file.FileName,
            FileSize = uploadResult.FileSize,
            Extension = uploadResult.Extension,
            ContentType = file.ContentType
        };
        var contentJson = System.Text.Json.JsonSerializer.Serialize(filePayload, _camelCaseJsonOptions);

        var now = DateTime.UtcNow;
        var message = new Message
        {
            Id = Guid.NewGuid(),
            ConversationId = conversationId,
            SenderId = currentUserId,
            Content = contentJson,
            MessageType = 3, // 3 = File
            SentAt = now
        };

        conversation.UpdatedAt = now;
        _conversationRepository.Update(conversation);
        await _conversationRepository.AddMessageAsync(message);
        await _unitOfWork.SaveChangesAsync();

        var sender = await _userRepository.GetByIdAsync(currentUserId);
        var senderName = sender?.DisplayName ?? "User";
        var senderAvatarUrl = sender?.AvatarUrl;

        var activeMembers = await _conversationRepository.GetActiveMembersAsync(conversationId);
        var memberIds = activeMembers.Select(m => m.UserId.ToString().ToLower()).ToList();

        var payload = new
        {
            id = message.Id,
            conversationId = message.ConversationId,
            senderId = message.SenderId,
            senderName = senderName,
            senderAvatarUrl = senderAvatarUrl,
            content = message.Content,
            messageType = message.MessageType,
            sentAt = message.SentAt
        };

        await _hubContext.Clients.Users(memberIds).SendAsync("ReceiveMessage", payload);

        var response = new MessageResponse
        {
            Id = message.Id,
            ConversationId = message.ConversationId,
            SenderId = message.SenderId,
            SenderName = senderName,
            SenderAvatarUrl = senderAvatarUrl,
            Content = message.Content,
            MessageType = message.MessageType,
            SentAt = message.SentAt
        };

        return (true, null, response);
    }

    public async Task<(bool Success, string? ErrorMessage, MessageResponse? Data)> SendVoiceAsync(Guid conversationId, Guid currentUserId, IFormFile file, double? duration = null)
    {
        if (file == null || file.Length == 0)
        {
            return (false, "Please select a valid audio file.", null);
        }

        var conversation = await _conversationRepository.GetByIdAsync(conversationId);
        if (conversation == null)
        {
            return (false, "Conversation does not exist.", null);
        }

        var member = await _conversationRepository.GetMemberAsync(conversationId, currentUserId);
        if (member == null || member.LeftAt != null)
        {
            return (false, "You are not a member of this conversation.", null);
        }

        var uploadResult = await _fileService.UploadAudioAsync(file);
        if (!uploadResult.Success || string.IsNullOrEmpty(uploadResult.Url))
        {
            return (false, uploadResult.ErrorMessage ?? "Voice message upload failed.", null);
        }

        var voicePayload = new VoiceMessageContent
        {
            Url = uploadResult.Url,
            Duration = duration ?? uploadResult.Duration ?? 0
        };
        var contentJson = System.Text.Json.JsonSerializer.Serialize(voicePayload, _camelCaseJsonOptions);

        var now = DateTime.UtcNow;
        var message = new Message
        {
            Id = Guid.NewGuid(),
            ConversationId = conversationId,
            SenderId = currentUserId,
            Content = contentJson,
            MessageType = 5, // 5 = Voice
            SentAt = now
        };

        conversation.UpdatedAt = now;
        _conversationRepository.Update(conversation);
        await _conversationRepository.AddMessageAsync(message);
        await _unitOfWork.SaveChangesAsync();

        var sender = await _userRepository.GetByIdAsync(currentUserId);
        var senderName = sender?.DisplayName ?? "User";
        var senderAvatarUrl = sender?.AvatarUrl;

        var activeMembers = await _conversationRepository.GetActiveMembersAsync(conversationId);
        var memberIds = activeMembers.Select(m => m.UserId.ToString().ToLower()).ToList();

        var payload = new
        {
            id = message.Id,
            conversationId = message.ConversationId,
            senderId = message.SenderId,
            senderName = senderName,
            senderAvatarUrl = senderAvatarUrl,
            content = message.Content,
            messageType = message.MessageType,
            sentAt = message.SentAt
        };

        await _hubContext.Clients.Users(memberIds).SendAsync("ReceiveMessage", payload);

        var response = new MessageResponse
        {
            Id = message.Id,
            ConversationId = message.ConversationId,
            SenderId = message.SenderId,
            SenderName = senderName,
            SenderAvatarUrl = senderAvatarUrl,
            Content = message.Content,
            MessageType = message.MessageType,
            SentAt = message.SentAt
        };

        return (true, null, response);
    }

    public async Task<(bool Success, string? ErrorMessage, MessageResponse? Data)> SendVideoAsync(Guid conversationId, Guid currentUserId, IFormFile file, double? duration = null)
    {
        if (file == null || file.Length == 0)
        {
            return (false, "Please select a valid video.", null);
        }

        if (duration.HasValue && duration.Value > 60.5)
        {
            return (false, "Video duration exceeds the maximum limit (max 1 minute).", null);
        }

        var conversation = await _conversationRepository.GetByIdAsync(conversationId);
        if (conversation == null)
        {
            return (false, "Conversation does not exist.", null);
        }

        var member = await _conversationRepository.GetMemberAsync(conversationId, currentUserId);
        if (member == null || member.LeftAt != null)
        {
            return (false, "You are not a member of this conversation.", null);
        }

        var uploadResult = await _fileService.UploadVideoAsync(file);
        if (!uploadResult.Success || string.IsNullOrEmpty(uploadResult.Url))
        {
            return (false, uploadResult.ErrorMessage ?? "Video upload failed.", null);
        }

        var finalDuration = duration ?? uploadResult.Duration ?? 0;
        if (finalDuration > 61.0)
        {
            return (false, "Video duration exceeds the maximum limit (max 1 minute).", null);
        }

        var videoPayload = new VideoMessageContent
        {
            Url = uploadResult.Url,
            Duration = finalDuration,
            ThumbnailUrl = uploadResult.ThumbnailUrl,
            FileName = uploadResult.FileName ?? file.FileName,
            FileSize = uploadResult.FileSize > 0 ? uploadResult.FileSize : file.Length
        };
        var contentJson = System.Text.Json.JsonSerializer.Serialize(videoPayload, _camelCaseJsonOptions);

        var now = DateTime.UtcNow;
        var message = new Message
        {
            Id = Guid.NewGuid(),
            ConversationId = conversationId,
            SenderId = currentUserId,
            Content = contentJson,
            MessageType = 6, // 6 = Video
            SentAt = now
        };

        conversation.UpdatedAt = now;
        _conversationRepository.Update(conversation);
        await _conversationRepository.AddMessageAsync(message);
        await _unitOfWork.SaveChangesAsync();

        var sender = await _userRepository.GetByIdAsync(currentUserId);
        var senderName = sender?.DisplayName ?? "User";
        var senderAvatarUrl = sender?.AvatarUrl;

        var activeMembers = await _conversationRepository.GetActiveMembersAsync(conversationId);
        var memberIds = activeMembers.Select(m => m.UserId.ToString().ToLower()).ToList();

        var payload = new
        {
            id = message.Id,
            conversationId = message.ConversationId,
            senderId = message.SenderId,
            senderName = senderName,
            senderAvatarUrl = senderAvatarUrl,
            content = message.Content,
            messageType = message.MessageType,
            sentAt = message.SentAt
        };

        await _hubContext.Clients.Users(memberIds).SendAsync("ReceiveMessage", payload);

        var response = new MessageResponse
        {
            Id = message.Id,
            ConversationId = message.ConversationId,
            SenderId = message.SenderId,
            SenderName = senderName,
            SenderAvatarUrl = senderAvatarUrl,
            Content = message.Content,
            MessageType = message.MessageType,
            SentAt = message.SentAt
        };

        return (true, null, response);
    }

    public async Task<(bool Success, string? ErrorMessage, MessageResponse? Data)> RecallMessageAsync(Guid conversationId, Guid messageId, Guid currentUserId)
    {
        var conversation = await _conversationRepository.GetByIdAsync(conversationId);
        if (conversation == null)
        {
            return (false, "Conversation does not exist.", null);
        }

        var member = await _conversationRepository.GetMemberAsync(conversationId, currentUserId);
        if (member == null || member.LeftAt != null)
        {
            return (false, "You are not a member of this conversation.", null);
        }

        var message = await _conversationRepository.GetMessageByIdAsync(messageId);
        if (message == null || message.ConversationId != conversationId)
        {
            return (false, "Message does not exist in this conversation.", null);
        }

        // Rule 1: Only sender can recall their own message
        if (message.SenderId != currentUserId)
        {
            return (false, "You can only recall your own messages.", null);
        }

        // Rule 2: System and call record messages cannot be recalled
        if (message.MessageType == 4 || message.MessageType == 7)
        {
            return (false, "System and call record messages cannot be recalled.", null);
        }

        // Rule 3: Cannot recall already recalled message
        if (message.IsRecalled)
        {
            return (false, "This message has already been recalled.", null);
        }

        // Rule 4: Valid within 5 hours from SentAt
        var timeSinceSent = DateTime.UtcNow - message.SentAt;
        if (timeSinceSent > TimeSpan.FromHours(5))
        {
            return (false, "Messages can only be recalled within 5 hours of sending.", null);
        }

        // Rule 5: For Image (2), File (3), Voice (5), Video (6), delete media on Cloudinary
        if (message.MessageType == 2 || message.MessageType == 3 || message.MessageType == 5 || message.MessageType == 6)
        {
            try
            {
                await _fileService.DeleteCloudMediaAsync(message.Content, message.MessageType);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[RecallMessage] Cloud media deletion warning: {ex.Message}");
            }
        }

        // Rule 6: Message record is retained in DB (not deleted from DB), marked as recalled
        var now = DateTime.UtcNow;
        message.IsRecalled = true;
        message.RecalledAt = now;
        message.Content = "This message has been recalled";

        _conversationRepository.UpdateMessage(message);
        await _unitOfWork.SaveChangesAsync();

        var sender = await _userRepository.GetByIdAsync(currentUserId);
        var senderName = sender?.DisplayName ?? "User";
        var senderAvatarUrl = sender?.AvatarUrl;

        var activeMembers = await _conversationRepository.GetActiveMembersAsync(conversationId);
        var memberIds = activeMembers.Select(m => m.UserId.ToString().ToLower()).ToList();

        // Broadcast realtime SignalR MessageRecalled event
        await _hubContext.Clients.Users(memberIds).SendAsync("MessageRecalled", new
        {
            conversationId = message.ConversationId,
            messageId = message.Id,
            senderId = message.SenderId,
            recalledAt = DateTime.SpecifyKind(now, DateTimeKind.Utc),
            content = message.Content,
            isRecalled = true
        });

        // If this recalled message was the latest message, broadcast preview update
        var latestMessage = (await _conversationRepository.GetMessagesByConversationIdAsync(conversationId))
            .OrderByDescending(m => m.SentAt)
            .FirstOrDefault();

        if (latestMessage != null && latestMessage.Id == message.Id)
        {
            var previewText = conversation.Type == 2 
                ? $"{senderName}: [Message recalled]" 
                : "[Message recalled]";

            await _hubContext.Clients.Users(memberIds).SendAsync("GroupUpdated", new
            {
                id = conversation.Id,
                name = conversation.Name,
                memberCount = activeMembers.Count(),
                lastUpdatedAt = conversation.UpdatedAt,
                previewMessage = previewText
            });
        }

        var response = new MessageResponse
        {
            Id = message.Id,
            ConversationId = message.ConversationId,
            SenderId = message.SenderId,
            SenderName = senderName,
            SenderAvatarUrl = senderAvatarUrl,
            Content = message.Content,
            MessageType = message.MessageType,
            SentAt = DateTime.SpecifyKind(message.SentAt, DateTimeKind.Utc),
            IsRecalled = message.IsRecalled,
            RecalledAt = message.RecalledAt.HasValue ? DateTime.SpecifyKind(message.RecalledAt.Value, DateTimeKind.Utc) : null
        };

        return (true, null, response);
    }
}
