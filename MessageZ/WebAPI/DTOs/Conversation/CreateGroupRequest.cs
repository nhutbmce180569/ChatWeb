using System.ComponentModel.DataAnnotations;

namespace WebAPI.DTOs.Conversation;

public class CreateGroupRequest
{
    [Required]
    public string Name { get; set; } = null!;

    [Required]
    public List<Guid> MemberIds { get; set; } = new List<Guid>();
}
