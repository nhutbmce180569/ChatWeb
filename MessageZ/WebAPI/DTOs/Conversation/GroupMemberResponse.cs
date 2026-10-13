namespace WebAPI.DTOs.Conversation;

public class GroupMemberResponse
{
    public Guid UserId { get; set; }
    public string DisplayName { get; set; } = null!;
    public string Username { get; set; } = null!;
    public string? AvatarUrl { get; set; }
    public bool IsAdmin { get; set; }
    public bool IsOnline { get; set; }
    public DateTime JoinedAt { get; set; }
}
