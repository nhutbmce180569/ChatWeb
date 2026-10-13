namespace WebAPI.DTOs.Conversation;

public class ConversationResponse
{
    public Guid Id { get; set; }
    public string? Name { get; set; }
    public byte Type { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
    // Can append member list or latest message later
}
