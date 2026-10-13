namespace WebAPI.DTOs.Conversation;

public class ConversationListResponse
{
    public Guid Id { get; set; }
    public string? Name { get; set; }
    public byte Type { get; set; } // 0 = 1-on-1, 1 = Group
    public string? AvatarUrl { get; set; }
    public DateTime LastUpdatedAt { get; set; }
    public string? PreviewMessage { get; set; } // Can be implemented later
    public int MemberCount { get; set; }
    public int UnreadCount { get; set; }
    public List<MemberInfo> Members { get; set; } = new List<MemberInfo>();
}

public class MemberInfo
{
    public Guid UserId { get; set; }
    public string DisplayName { get; set; } = null!;
    public string? AvatarUrl { get; set; }
    public bool IsOnline { get; set; }
    public DateTime? LastSeenAt { get; set; }
}
