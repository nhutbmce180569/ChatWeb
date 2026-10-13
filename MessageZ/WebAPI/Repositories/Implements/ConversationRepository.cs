using Microsoft.EntityFrameworkCore;
using WebAPI.Models;

namespace WebAPI.Repositories.Implements;

public class ConversationRepository : IConversationRepository
{
    private readonly RealtimeChatDbContext _context;

    public ConversationRepository(RealtimeChatDbContext context)
    {
        _context = context;
    }

    public async Task AddAsync(Conversation conversation)
    {
        await _context.Conversations.AddAsync(conversation);
    }

    public async Task<Conversation?> GetByIdAsync(Guid id)
    {
        return await _context.Conversations
            .Include(c => c.ConversationMembers)
            .FirstOrDefaultAsync(c => c.Id == id);
    }

    public async Task<Conversation?> GetByIdWithMembersAsync(Guid id)
    {
        return await _context.Conversations
            .Include(c => c.ConversationMembers)
                .ThenInclude(cm => cm.User)
            .FirstOrDefaultAsync(c => c.Id == id);
    }

    public async Task<Conversation?> GetOneOnOneConversationAsync(Guid userId1, Guid userId2)
    {
        // Type = 1 represents 1-on-1 chat
        return await _context.Conversations
            .Where(c => c.Type == 1)
            .Where(c => c.ConversationMembers.Any(m => m.UserId == userId1 && m.LeftAt == null) &&
                        c.ConversationMembers.Any(m => m.UserId == userId2 && m.LeftAt == null))
            .FirstOrDefaultAsync();
    }

    public async Task<IEnumerable<Conversation>> GetConversationsByUserIdAsync(Guid userId)
    {
        return await _context.Conversations
            .Include(c => c.ConversationMembers)
                .ThenInclude(cm => cm.User) // Include user details for names/avatars
            .Include(c => c.Messages)
                .ThenInclude(m => m.Sender)
            .Where(c => c.ConversationMembers.Any(cm => cm.UserId == userId && cm.LeftAt == null))
            .OrderByDescending(c => c.UpdatedAt ?? c.CreatedAt)
            .ToListAsync();
    }

    public async Task<IEnumerable<Message>> GetMessagesByConversationIdAsync(Guid conversationId)
    {
        return await _context.Messages
            .Include(m => m.Sender)
            .Where(m => m.ConversationId == conversationId)
            .OrderBy(m => m.SentAt)
            .ToListAsync();
    }

    public async Task<ConversationMember?> GetMemberAsync(Guid conversationId, Guid userId)
    {
        return await _context.ConversationMembers
            .Include(cm => cm.User)
            .FirstOrDefaultAsync(cm => cm.ConversationId == conversationId && cm.UserId == userId);
    }

    public async Task<IEnumerable<ConversationMember>> GetActiveMembersAsync(Guid conversationId)
    {
        return await _context.ConversationMembers
            .Include(cm => cm.User)
            .Where(cm => cm.ConversationId == conversationId && cm.LeftAt == null)
            .ToListAsync();
    }

    public async Task AddMemberAsync(ConversationMember member)
    {
        await _context.ConversationMembers.AddAsync(member);
    }

    public async Task AddMembersAsync(IEnumerable<ConversationMember> members)
    {
        await _context.ConversationMembers.AddRangeAsync(members);
    }

    public async Task AddMessageAsync(Message message)
    {
        await _context.Messages.AddAsync(message);
    }

    public async Task<Message?> GetMessageByIdAsync(Guid messageId)
    {
        return await _context.Messages
            .Include(m => m.Sender)
            .FirstOrDefaultAsync(m => m.Id == messageId);
    }

    public void Update(Conversation conversation)
    {
        _context.Conversations.Update(conversation);
    }

    public void UpdateMember(ConversationMember member)
    {
        _context.ConversationMembers.Update(member);
    }

    public void UpdateMessage(Message message)
    {
        _context.Messages.Update(message);
    }

    public async Task MarkAsReadAsync(Guid conversationId, Guid userId)
    {
        var member = await _context.ConversationMembers
            .FirstOrDefaultAsync(cm => cm.ConversationId == conversationId && cm.UserId == userId);

        if (member == null) return;

        var latestMessage = await _context.Messages
            .Where(m => m.ConversationId == conversationId)
            .OrderByDescending(m => m.SentAt)
            .FirstOrDefaultAsync();

        if (latestMessage != null)
        {
            member.LastReadMessageId = latestMessage.Id;
            await _context.SaveChangesAsync();
        }
    }
}
