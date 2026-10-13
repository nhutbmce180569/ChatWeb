using WebAPI.Models;

namespace WebAPI.Repositories;

public interface IConversationRepository
{
    Task AddAsync(Conversation conversation);
    Task<Conversation?> GetByIdAsync(Guid id);
    Task<Conversation?> GetByIdWithMembersAsync(Guid id);
    Task<Conversation?> GetOneOnOneConversationAsync(Guid userId1, Guid userId2);
    Task<IEnumerable<Conversation>> GetConversationsByUserIdAsync(Guid userId);
    Task<IEnumerable<Message>> GetMessagesByConversationIdAsync(Guid conversationId);
    Task<ConversationMember?> GetMemberAsync(Guid conversationId, Guid userId);
    Task<IEnumerable<ConversationMember>> GetActiveMembersAsync(Guid conversationId);
    Task AddMemberAsync(ConversationMember member);
    Task AddMembersAsync(IEnumerable<ConversationMember> members);
    Task AddMessageAsync(Message message);
    Task<Message?> GetMessageByIdAsync(Guid messageId);
    void Update(Conversation conversation);
    void UpdateMember(ConversationMember member);
    void UpdateMessage(Message message);
    Task MarkAsReadAsync(Guid conversationId, Guid userId);
}
