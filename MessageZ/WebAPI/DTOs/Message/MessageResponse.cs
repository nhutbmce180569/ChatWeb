namespace WebAPI.DTOs.Message;

public class MessageResponse
{
    public Guid Id { get; set; }
    public Guid ConversationId { get; set; }
    public Guid SenderId { get; set; }
    public string SenderName { get; set; } = null!;
    public string? SenderAvatarUrl { get; set; }
    public string? Content { get; set; }
    public byte MessageType { get; set; }
    public DateTime SentAt { get; set; }
    public bool IsRecalled { get; set; }
    public DateTime? RecalledAt { get; set; }
}
