using Microsoft.AspNetCore.Http;
using WebAPI.DTOs.Conversation;
using WebAPI.DTOs.Message;

namespace WebAPI.Services;

public interface IConversationService
{
    Task<(bool Success, string? ErrorMessage, ConversationResponse? Data)> CreateOneOnOneChatAsync(Guid currentUserId, CreateOneOnOneRequest request);
    Task<(bool Success, string? ErrorMessage, ConversationResponse? Data)> CreateGroupChatAsync(Guid currentUserId, CreateGroupRequest request);
    Task<IEnumerable<ConversationListResponse>> GetConversationsAsync(Guid userId);
    Task<IEnumerable<MessageResponse>> GetMessagesAsync(Guid conversationId, Guid currentUserId);
    Task<(bool Success, string? ErrorMessage, IEnumerable<GroupMemberResponse>? Data)> GetGroupMembersAsync(Guid conversationId, Guid currentUserId);
    Task<(bool Success, string? ErrorMessage)> AddMembersToGroupAsync(Guid conversationId, Guid currentUserId, AddGroupMembersRequest request);
    Task<(bool Success, string? ErrorMessage)> LeaveGroupAsync(Guid conversationId, Guid currentUserId);
    Task<(bool Success, string? ErrorMessage)> RemoveMemberFromGroupAsync(Guid conversationId, Guid currentUserId, Guid targetUserId);
    Task<(bool Success, string? ErrorMessage)> UpdateGroupNameAsync(Guid conversationId, Guid currentUserId, UpdateGroupRequest request);
    Task MarkAsReadAsync(Guid conversationId, Guid currentUserId);
    Task<(bool Success, string? ErrorMessage, MessageResponse? Data)> SendImageAsync(Guid conversationId, Guid currentUserId, IFormFile file);
    Task<(bool Success, string? ErrorMessage, MessageResponse? Data)> SendFileAsync(Guid conversationId, Guid currentUserId, IFormFile file);
    Task<(bool Success, string? ErrorMessage, MessageResponse? Data)> SendVoiceAsync(Guid conversationId, Guid currentUserId, IFormFile file, double? duration = null);
    Task<(bool Success, string? ErrorMessage, MessageResponse? Data)> SendVideoAsync(Guid conversationId, Guid currentUserId, IFormFile file, double? duration = null);
    Task<(bool Success, string? ErrorMessage, MessageResponse? Data)> RecallMessageAsync(Guid conversationId, Guid messageId, Guid currentUserId);
}
