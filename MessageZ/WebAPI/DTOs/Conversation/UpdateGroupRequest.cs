using System.ComponentModel.DataAnnotations;

namespace WebAPI.DTOs.Conversation;

public class UpdateGroupRequest
{
    [Required]
    [MaxLength(100)]
    public string Name { get; set; } = null!;
}
