using System.ComponentModel.DataAnnotations;

namespace WebAPI.DTOs.Conversation;

public class AddGroupMembersRequest
{
    [Required]
    [MinLength(1, ErrorMessage = "At least one member must be added.")]
    public List<Guid> MemberIds { get; set; } = new List<Guid>();
}
