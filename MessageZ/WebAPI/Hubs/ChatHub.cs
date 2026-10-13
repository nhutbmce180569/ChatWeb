using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using System.Security.Claims;
using WebAPI.Models;
using WebAPI.Repositories;
using System;
using System.Threading.Tasks;
using System.Linq;
using Microsoft.EntityFrameworkCore;

using WebAPI.Services;

namespace WebAPI.Hubs;

[Authorize]
public class ChatHub : Hub
{
    private readonly RealtimeChatDbContext _context;
    private readonly IUserPresenceTracker _presenceTracker;

    public ChatHub(RealtimeChatDbContext context, IUserPresenceTracker presenceTracker)
    {
        _context = context;
        _presenceTracker = presenceTracker;
    }

    public override async Task OnConnectedAsync()
    {
        await base.OnConnectedAsync();

        var userIdString = Context.UserIdentifier;
        if (string.IsNullOrEmpty(userIdString))
            userIdString = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;

        if (!string.IsNullOrEmpty(userIdString) && Guid.TryParse(userIdString, out Guid userId))
        {
            var isFirstConnection = await _presenceTracker.UserConnectedAsync(userId, Context.ConnectionId);
            if (isFirstConnection)
            {
                var user = await _context.Users.FirstOrDefaultAsync(u => u.Id == userId);
                if (user != null)
                {
                    user.IsOnline = true;
                    await _context.SaveChangesAsync();
                }

                await Clients.Others.SendAsync("UserPresenceChanged", new
                {
                    userId = userId.ToString().ToLower(),
                    isOnline = true,
                    lastSeenAt = (DateTime?)null
                });
            }
        }
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var userIdString = Context.UserIdentifier;
        if (string.IsNullOrEmpty(userIdString))
            userIdString = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;

        if (!string.IsNullOrEmpty(userIdString) && Guid.TryParse(userIdString, out Guid userId))
        {
            var (isOffline, lastSeenAt) = await _presenceTracker.UserDisconnectedAsync(userId, Context.ConnectionId);
            if (isOffline)
            {
                var user = await _context.Users.FirstOrDefaultAsync(u => u.Id == userId);
                if (user != null)
                {
                    user.IsOnline = false;
                    user.LastSeenAt = lastSeenAt;
                    await _context.SaveChangesAsync();
                }

                await Clients.Others.SendAsync("UserPresenceChanged", new
                {
                    userId = userId.ToString().ToLower(),
                    isOnline = false,
                    lastSeenAt = lastSeenAt
                });
            }
        }

        await base.OnDisconnectedAsync(exception);
    }

    public async Task<List<string>> GetOnlineUsers()
    {
        var onlineUsers = await _presenceTracker.GetOnlineUsersAsync();
        return onlineUsers.Select(u => u.ToString().ToLower()).ToList();
    }

    public Task<bool> CheckUserOnline(string targetUserId)
    {
        if (Guid.TryParse(targetUserId, out Guid guid))
        {
            return Task.FromResult(_presenceTracker.IsUserOnline(guid));
        }
        return Task.FromResult(false);
    }

    public async Task JoinChat(string conversationId)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, conversationId);
    }

    public async Task LeaveChat(string conversationId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, conversationId);
    }

    public async Task SendMessage(string conversationId, string content)
    {
        try 
        {
            var userIdString = Context.UserIdentifier;
            if (string.IsNullOrEmpty(userIdString))
                userIdString = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;

            if (string.IsNullOrEmpty(userIdString) || !Guid.TryParse(userIdString, out Guid userId) || !Guid.TryParse(conversationId, out Guid convId))
                throw new HubException("Invalid parameters.");

            // Check if user is an active member of this conversation
            var isMember = await _context.ConversationMembers
                .AnyAsync(cm => cm.ConversationId == convId && cm.UserId == userId && cm.LeftAt == null);

            if (!isMember)
                throw new HubException("You are not a member of this conversation.");

            var message = new Message
            {
                Id = Guid.NewGuid(),
                ConversationId = convId,
                SenderId = userId,
                Content = content,
                MessageType = 1, // 1 = Text
                SentAt = DateTime.UtcNow
            };

            _context.Messages.Add(message);

            // Update Conversation UpdatedAt so it moves to top in sidebar
            var conversation = await _context.Conversations.FirstOrDefaultAsync(c => c.Id == convId);
            if (conversation != null)
            {
                conversation.UpdatedAt = message.SentAt;
            }

            await _context.SaveChangesAsync();

            var sender = await _context.Users.FirstOrDefaultAsync(u => u.Id == userId);
            string senderName = sender?.DisplayName ?? "Unknown";
            string? senderAvatarUrl = sender?.AvatarUrl;

            // Get list of active members (not left the group)
            var memberIds = await _context.ConversationMembers
                .Where(cm => cm.ConversationId == convId && cm.LeftAt == null)
                .Select(cm => cm.UserId.ToString().ToLower())
                .ToListAsync();

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

            await Clients.Users(memberIds).SendAsync("ReceiveMessage", payload);
        }
        catch (Exception ex)
        {
            Console.WriteLine("SendMessage Error: " + ex.Message);
            throw new HubException(ex.Message);
        }
    }

    // --- WebRTC Signaling Methods (For 1-1 Call) ---

    public async Task CallUser(string targetUserId, string callerName, string callType = "video", string? conversationId = null)
    {
        var senderUserId = Context.UserIdentifier;
        if (string.IsNullOrEmpty(senderUserId))
            senderUserId = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;

        if (!string.IsNullOrEmpty(senderUserId))
        {
            var senderGuid = Guid.TryParse(senderUserId, out var g) ? g : Guid.Empty;
            var sender = await _context.Users.FirstOrDefaultAsync(u => u.Id == senderGuid);
            var senderAvatarUrl = sender?.AvatarUrl;
            callerName = sender?.DisplayName ?? callerName;

            await Clients.User(targetUserId.ToLower()).SendAsync("IncomingCall", senderUserId.ToLower(), callerName, callType, senderAvatarUrl, conversationId);
        }
    }

    public async Task AnswerCall(string callerUserId, bool isAccepted)
    {
        var responderUserId = Context.UserIdentifier;
        if (string.IsNullOrEmpty(responderUserId))
            responderUserId = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;

        if (!string.IsNullOrEmpty(responderUserId))
        {
            await Clients.User(callerUserId.ToLower()).SendAsync("CallAnswered", responderUserId.ToLower(), isAccepted);
        }
    }

    public async Task SendSignal(string targetUserId, string signalData)
    {
        var senderUserId = Context.UserIdentifier;
        if (string.IsNullOrEmpty(senderUserId))
            senderUserId = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;

        if (!string.IsNullOrEmpty(senderUserId))
        {
            await Clients.User(targetUserId.ToLower()).SendAsync("ReceiveSignal", senderUserId.ToLower(), signalData);
        }
    }

    public async Task EndCall(string targetUserId)
    {
        var senderUserId = Context.UserIdentifier;
        if (string.IsNullOrEmpty(senderUserId))
            senderUserId = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;

        if (!string.IsNullOrEmpty(senderUserId))
        {
            await Clients.User(targetUserId.ToLower()).SendAsync("CallEnded", senderUserId.ToLower());
        }
    }

    public async Task RecordCall(string conversationIdStr, string targetUserIdStr, string callType, string status, int durationSeconds)
    {
        try
        {
            var userIdString = Context.UserIdentifier;
            if (string.IsNullOrEmpty(userIdString))
                userIdString = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;

            if (string.IsNullOrEmpty(userIdString) || !Guid.TryParse(userIdString, out Guid currentUserId))
            {
                Console.WriteLine($"[RecordCall] Ignored: Invalid caller user ID '{userIdString}'");
                return;
            }

            if (!Guid.TryParse(conversationIdStr, out Guid convId))
            {
                Console.WriteLine($"[RecordCall] Ignored: Invalid conversation ID '{conversationIdStr}'");
                return;
            }

            var now = DateTime.UtcNow;

            var contentObj = new
            {
                callType = string.IsNullOrWhiteSpace(callType) ? "audio" : callType.ToLower(),
                status = string.IsNullOrWhiteSpace(status) ? "completed" : status.ToLower(),
                duration = Math.Max(0, durationSeconds)
            };
            var contentJson = System.Text.Json.JsonSerializer.Serialize(contentObj);

            var message = new Message
            {
                Id = Guid.NewGuid(),
                ConversationId = convId,
                SenderId = currentUserId,
                Content = contentJson,
                MessageType = 7, // 7 = Call Record
                SentAt = now
            };

            await _context.Messages.AddAsync(message);

            var conversation = await _context.Conversations.FirstOrDefaultAsync(c => c.Id == convId);
            if (conversation != null)
            {
                conversation.UpdatedAt = now;
            }

            await _context.SaveChangesAsync();
            Console.WriteLine($"[RecordCall] Successfully saved Call Record message {message.Id} for Conv={convId}, Type={callType}, Status={status}, Duration={durationSeconds}s");

            var sender = await _context.Users.FirstOrDefaultAsync(u => u.Id == currentUserId);
            string senderName = sender?.DisplayName ?? "Unknown";
            string? senderAvatarUrl = sender?.AvatarUrl;

            var memberIds = await _context.ConversationMembers
                .Where(cm => cm.ConversationId == convId && cm.LeftAt == null)
                .Select(cm => cm.UserId.ToString().ToLower())
                .ToListAsync();

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

            await Clients.Users(memberIds).SendAsync("ReceiveMessage", payload);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[RecordCall] Exception saving call record: {ex.Message}\n{ex.StackTrace}");
            throw;
        }
    }
}
